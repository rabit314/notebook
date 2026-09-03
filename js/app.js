'use strict';
/* ================================================================
   BRIGHTBOARD — SMART WHITEBOARD & NOTEBOOK ENGINE
   Version: 1.2.2
   ================================================================ */

/* ================================================================
   1. CONSTANTS & TINY HELPERS
   ================================================================ */
const APP_VERSION = '1.2.2';
const PAPER = '#FCFAF3';
const ACCENT = '#E4572E';
const STICKY_INK = '#4A423A';
const MARKERS = ['#23282F', '#D93A3A', '#E8722A', '#C99700', '#2F9E44',
                 '#0C8599', '#1F6FEB', '#7048E8', '#D6336C'];
const NOTES = ['#FFE9A8', '#FFD2A8', '#C4E8CE', '#C4DDF0', '#E4CDF2'];
const HIST_MAX = 30;
const TH_W = 144, TH_H = 81;
const SAVE_KEY = 'brightboard.board.v1';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 10);
const cloneObj = o => { const n = JSON.parse(JSON.stringify(o)); n.id = uid(); return n; };
const getTimestamp = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
};

const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

/* ================================================================
   2. APP STATE
   ================================================================ */
const state = {
  tool: 'pen',
  color: MARKERS[0],
  custom: null,          // last custom colour picked
  size: 4,
  fontSize: 28,
  noteColor: NOTES[0],
  fill: false,           // light tint fill for rect / ellipse
  pageIndex: 0,
  selectedIds: new Set(),// multi-selection support
};

const IMG = new Map();   // imgId -> { el, src, w, h }
const pages = [];
const deletedPagesHistory = []; // stack of { page, index } for Ctrl+Z restoration
const page = () => pages[state.pageIndex] || pages[0];

function newPage(bg) {
  return {
    id: uid(),
    objects: [],
    bg: bg || 'grid',
    view: { zoom: 1, panX: 0, panY: 0 },
    undo: [],
    redo: [],
    thumbCanvas: null,
    thumbDirty: true
  };
}
pages.push(newPage());

let action = null;       // current pointer gesture
let editing = null;      // { obj, kind:'text'|'sticky', isNew, original }
let laserPts = [];       // laser trail in SCREEN coordinates
let needsRender = true;
let spaceHeld = false;
let modalOpen = false;
let clipObjects = null;  // clipboard objects array for multi-copy/paste
let lastPtr = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const activePtrs = new Map();   // pointerId -> {x,y}  (for pinch gestures)
let lastTapTime = 0;     // for mobile double-tap detection

const getObject = id => page().objects.find(o => o.id === id);
const getSelectedObjects = () => page().objects.filter(o => state.selectedIds.has(o.id));
const removeObject = id => {
  const p = page().objects;
  const i = p.findIndex(o => o.id === id);
  if (i >= 0) p.splice(i, 1);
};

const CURSORS = {
  select: 'default',
  pen: 'crosshair',
  highlighter: 'crosshair',
  eraser: 'none',
  line: 'crosshair',
  rect: 'crosshair',
  ellipse: 'crosshair',
  arrow: 'crosshair',
  text: 'text',
  sticky: 'crosshair',
  laser: 'none',
  hand: 'grab'
};

const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cg fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 4 A10 10 0 0 1 24 14' stroke='%23ffffff' stroke-width='4'/%3E%3Cpolyline points='20 4 24 4 24 8' stroke='%23ffffff' stroke-width='4'/%3E%3Cpath d='M14 24 A10 10 0 0 1 4 14' stroke='%23ffffff' stroke-width='4'/%3E%3Cpolyline points='8 24 4 24 4 20' stroke='%23ffffff' stroke-width='4'/%3E%3Cpath d='M14 4 A10 10 0 0 1 24 14' stroke='%2318181b' stroke-width='2'/%3E%3Cpolyline points='20 4 24 4 24 8' stroke='%2318181b' stroke-width='2'/%3E%3Cpath d='M14 24 A10 10 0 0 1 4 14' stroke='%2318181b' stroke-width='2'/%3E%3Cpolyline points='8 24 4 24 4 20' stroke='%2318181b' stroke-width='2'/%3E%3C/g%3E%3C/svg%3E") 14 14, crosshair`;

const TOOLKEYS = {
  v: 'select',
  p: 'pen',
  h: 'highlighter',
  e: 'eraser',
  l: 'line',
  r: 'rect',
  o: 'ellipse',
  a: 'arrow',
  t: 'text',
  n: 'sticky',
  k: 'laser'
};

/* ================================================================
   3. CANVAS SETUP, VIEW (ZOOM & PAN)
   ================================================================ */
const canvas = $('board');
const ctx = canvas.getContext('2d');
let VW = 0, VH = 0, dpr = 1;

function resizeCanvas() {
  VW = window.innerWidth;
  VH = window.innerHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(VW * dpr);
  canvas.height = Math.round(VH * dpr);
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
  needsRender = true;
}
window.addEventListener('resize', resizeCanvas);

const worldFromClient = (cx, cy) => {
  const v = page().view;
  return { x: (cx - v.panX) / v.zoom, y: (cy - v.panY) / v.zoom };
};

function setZoom(z, cx = VW / 2, cy = VH / 2) {
  const v = page().view;
  const wx = (cx - v.panX) / v.zoom, wy = (cy - v.panY) / v.zoom;
  v.zoom = clamp(z, 0.2, 5);
  v.panX = cx - wx * v.zoom;
  v.panY = cy - wy * v.zoom;
  updateZoomLabel();
  needsRender = true;
}
const zoomBy = (f, cx, cy) => setZoom(page().view.zoom * f, cx, cy);

function updateZoomLabel() {
  $('zoomLabel').textContent = Math.round(page().view.zoom * 100) + '%';
}

function fitView() {
  const b = contentBounds(page().objects);
  if (!b) { setZoom(1); return; }
  const v = page().view;
  v.zoom = clamp(Math.min((VW - 100) / Math.max(b.w, 1), (VH - 190) / Math.max(b.h, 1)), 0.2, 2);
  v.panX = (VW - b.w * v.zoom) / 2 - b.x * v.zoom;
  v.panY = (VH - b.h * v.zoom) / 2 - b.y * v.zoom;
  updateZoomLabel();
  needsRender = true;
}

/* ================================================================
   4. RENDERING ENGINE
   ================================================================ */
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function paintBoard(c, W, H, view, bg, objects, editingId) {
  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, H);
  const worldRect = [
    -view.panX / view.zoom,
    -view.panY / view.zoom,
    (W - view.panX) / view.zoom,
    (H - view.panY) / view.zoom
  ];
  c.save();
  c.translate(view.panX, view.panY);
  c.scale(view.zoom, view.zoom);
  drawBackgroundPattern(c, view.zoom, bg, worldRect);
  drawObjects(c, objects, editingId);
  c.restore();
}

function drawBackgroundPattern(c, zoom, bg, [wx0, wy0, wx1, wy1]) {
  if (bg === 'blank') return;
  c.save();
  if (bg === 'grid') {
    const s = 40;
    c.strokeStyle = 'rgba(35,40,47,0.075)';
    c.lineWidth = 1 / zoom;
    c.beginPath();
    for (let x = Math.floor(wx0 / s) * s; x <= wx1; x += s) { c.moveTo(x, wy0); c.lineTo(x, wy1); }
    for (let y = Math.floor(wy0 / s) * s; y <= wy1; y += s) { c.moveTo(wx0, y); c.lineTo(wx1, y); }
    c.stroke();
  } else if (bg === 'dots') {
    let s = 40;
    while (((wx1 - wx0) / s) * ((wy1 - wy0) / s) > 3500) s *= 2;
    const r = 2 / zoom;
    c.fillStyle = 'rgba(35,40,47,0.22)';
    c.beginPath();
    for (let x = Math.floor(wx0 / s) * s; x <= wx1; x += s) {
      for (let y = Math.floor(wy0 / s) * s; y <= wy1; y += s) {
        c.moveTo(x + r, y);
        c.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    c.fill();
  } else if (bg === 'ruled') {
    const s = 52;
    c.strokeStyle = 'rgba(35,40,47,0.10)';
    c.lineWidth = 1 / zoom;
    c.beginPath();
    for (let y = Math.floor(wy0 / s) * s; y <= wy1; y += s) { c.moveTo(wx0, y); c.lineTo(wx1, y); }
    c.stroke();
    c.strokeStyle = 'rgba(214,90,60,0.30)';
    c.lineWidth = 1.5 / zoom;
    c.beginPath();
    c.moveTo(64, wy0);
    c.lineTo(64, wy1);
    c.stroke();
  }
  c.restore();
}

function drawObjects(c, objects, editingId) {
  for (const o of objects) {
    if (editingId && o.id === editingId) {
      if (o.type === 'text') continue;                  // live textarea shows it
      if (o.type === 'sticky') { drawSticky(c, o, true); continue; }
    }
    drawObject(c, o);
  }
}

function drawObject(c, o) {
  switch (o.type) {
    case 'stroke':  drawStroke(c, o); break;
    case 'line':
    case 'rect':
    case 'ellipse':
    case 'arrow':   drawShape(c, o); break;
    case 'text':    drawTextObj(c, o); break;
    case 'image':   drawImageObj(c, o); break;
    case 'sticky':  drawSticky(c, o, false); break;
  }
}

function drawStroke(c, o) {
  const pts = o.points;
  if (!pts || !pts.length) return;
  c.lineJoin = 'round';
  c.lineCap = 'round';

  if (o.mode === 'hi') {
    c.save();
    c.globalAlpha = 0.42;
    c.globalCompositeOperation = 'multiply';
    c.strokeStyle = o.color;
    c.fillStyle = o.color;
    c.lineWidth = o.width;
    if (pts.length < 2) {
      c.beginPath();
      c.arc(pts[0].x, pts[0].y, o.width / 2, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        c.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i+1].x) / 2, (pts[i].y + pts[i+1].y) / 2);
      }
      c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      c.stroke();
    }
    c.restore();
    return;
  }

  c.strokeStyle = o.color;
  c.fillStyle = o.color;
  if (pts.length < 2) {
    c.beginPath();
    c.arc(pts[0].x, pts[0].y, Math.max(0.6, (o.width * pts[0].w) / 2), 0, Math.PI * 2);
    c.fill();
    return;
  }
  let px = pts[0].x, py = pts[0].y;
  for (let k = 1; k < pts.length; k++) {
    const last = k === pts.length - 1;
    const nx = last ? pts[k].x : (pts[k].x + pts[k + 1].x) / 2;
    const ny = last ? pts[k].y : (pts[k].y + pts[k + 1].y) / 2;
    c.lineWidth = Math.max(0.5, o.width * (pts[k - 1].w + pts[k].w) / 2);
    c.beginPath();
    c.moveTo(px, py);
    c.quadraticCurveTo(pts[k].x, pts[k].y, nx, ny);
    c.stroke();
    px = nx;
    py = ny;
  }
}

function drawShape(c, o) {
  c.save();
  c.strokeStyle = o.color;
  c.lineWidth = Math.max(1, o.width);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (o.type === 'line') {
    c.beginPath();
    c.moveTo(o.x0, o.y0);
    c.lineTo(o.x1, o.y1);
    c.stroke();
  } else if (o.type === 'rect') {
    const x = Math.min(o.x0, o.x1), y = Math.min(o.y0, o.y1);
    const w = Math.abs(o.x1 - o.x0), h = Math.abs(o.y1 - o.y0);
    if (o.angle) {
      c.save();
      c.translate(x + w / 2, y + h / 2);
      c.rotate(o.angle);
      if (o.fill) {
        c.globalAlpha = 0.15;
        c.fillStyle = o.color;
        c.fillRect(-w / 2, -h / 2, w, h);
        c.globalAlpha = 1;
      }
      c.strokeRect(-w / 2, -h / 2, w, h);
      c.restore();
    } else {
      if (o.fill) {
        c.globalAlpha = 0.15;
        c.fillStyle = o.color;
        c.fillRect(x, y, w, h);
        c.globalAlpha = 1;
      }
      c.strokeRect(x, y, w, h);
    }
  } else if (o.type === 'ellipse') {
    const rx = Math.abs(o.x1 - o.x0) / 2, ry = Math.abs(o.y1 - o.y0) / 2;
    if (rx > 0 && ry > 0) {
      c.beginPath();
      c.ellipse((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, rx, ry, o.angle || 0, 0, Math.PI * 2);
      if (o.fill) {
        c.globalAlpha = 0.15;
        c.fillStyle = o.color;
        c.fill();
        c.globalAlpha = 1;
      }
      c.stroke();
    }
  } else if (o.type === 'arrow') {
    c.beginPath();
    c.moveTo(o.x0, o.y0);
    c.lineTo(o.x1, o.y1);
    c.stroke();
    const ang = Math.atan2(o.y1 - o.y0, o.x1 - o.x0);
    const len = Math.hypot(o.x1 - o.x0, o.y1 - o.y0);
    const hl = Math.min(len * 0.4, 12 + o.width * 3.5), hw = hl * 0.48;
    const bx = o.x1 - Math.cos(ang) * hl, by = o.y1 - Math.sin(ang) * hl;
    c.fillStyle = o.color;
    c.beginPath();
    c.moveTo(o.x1, o.y1);
    c.lineTo(bx - Math.sin(ang) * hw, by + Math.cos(ang) * hw);
    c.lineTo(bx + Math.sin(ang) * hw, by - Math.cos(ang) * hw);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function drawTextObj(c, o) {
  const lines = (o.lines && o.lines.length) ? o.lines : [''];
  const m = textMetrics(o);
  c.save();
  if (o.angle) {
    c.translate(o.x + m.w / 2, o.y + m.h / 2);
    c.rotate(o.angle);
    c.translate(-m.w / 2, -m.h / 2);
  } else {
    c.translate(o.x, o.y);
  }
  c.font = `700 ${o.fontSize}px Nunito, sans-serif`;
  c.fillStyle = o.color;
  c.textBaseline = 'top';
  let y = 0;
  for (const ln of lines) {
    c.fillText(ln, 0, y);
    y += o.fontSize * 1.3;
  }
  c.restore();
}

function drawImageObj(c, o) {
  const rec = IMG.get(o.imgId);
  if (!rec || !rec.el.complete) return;
  c.save();
  if (o.angle) {
    c.translate(o.x + o.w / 2, o.y + o.h / 2);
    c.rotate(o.angle);
    c.translate(-o.w / 2, -o.h / 2);
  } else {
    c.translate(o.x, o.y);
  }
  c.shadowColor = 'rgba(60,45,15,.22)';
  c.shadowBlur = 10;
  c.shadowOffsetY = 4;
  c.drawImage(rec.el, 0, 0, o.w, o.h);
  c.restore();
}

function drawSticky(c, o, paperOnly) {
  c.save();
  if (o.angle) {
    c.translate(o.x + o.w / 2, o.y + o.h / 2);
    c.rotate(o.angle);
    c.translate(-o.w / 2, -o.h / 2);
  } else {
    c.translate(o.x, o.y);
  }
  c.save();
  c.shadowColor = 'rgba(90,70,20,.26)';
  c.shadowBlur = 14;
  c.shadowOffsetY = 6;
  c.fillStyle = o.color;
  rr(c, 0, 0, o.w, o.h, 9);
  c.fill();
  c.restore();
  c.save();
  c.beginPath();
  c.moveTo(o.w - 16, o.h);
  c.lineTo(o.w, o.h - 16);
  c.lineTo(o.w, o.h);
  c.closePath();
  c.fillStyle = 'rgba(0,0,0,.08)';
  c.fill();
  c.restore();
  if (!paperOnly) {
    c.save();
    rr(c, 0, 0, o.w, o.h, 9);
    c.clip();
    c.font = `600 ${o.fontSize}px Caveat, cursive`;
    c.fillStyle = STICKY_INK;
    c.textBaseline = 'top';
    let y = 14;
    for (const ln of stickyLines(c, o)) {
      if (y > o.h + o.fontSize) break;
      c.fillText(ln, 14, y);
      y += o.fontSize * 1.12;
    }
    c.restore();
  }
  c.restore();
}

function stickyLines(c, o) {
  const key = o.w + '|' + o.fontSize + '|' + (o.text || '');
  if (o._wrap && o._wrap.key === key) return o._wrap.lines;
  c.font = `600 ${o.fontSize}px Caveat, cursive`;
  const maxW = o.w - 28, out = [];
  for (const para of (o.text || '').split('\n')) {
    if (para === '') { out.push(''); continue; }
    let cur = '';
    for (const wd of para.split(' ')) {
      const t = cur ? cur + ' ' + wd : wd;
      if (c.measureText(t).width <= maxW || !cur) cur = t;
      else { out.push(cur); cur = wd; }
    }
    out.push(cur);
  }
  o._wrap = { key, lines: out };
  return out;
}

function drawLaser(c) {
  const now = performance.now(), LIFE = 750;
  while (laserPts.length && now - laserPts[0].t > LIFE) laserPts.shift();
  if (!laserPts.length) return;
  c.save();
  c.lineCap = 'round';
  for (let i = 1; i < laserPts.length; i++) {
    const a = 1 - (now - laserPts[i].t) / LIFE;
    c.strokeStyle = `rgba(255,45,32,${(0.85 * a).toFixed(3)})`;
    c.lineWidth = 1 + 7 * a;
    c.shadowColor = 'rgba(255,60,40,.9)';
    c.shadowBlur = 4 + 12 * a;
    c.beginPath();
    c.moveTo(laserPts[i - 1].x, laserPts[i - 1].y);
    c.lineTo(laserPts[i].x, laserPts[i].y);
    c.stroke();
  }
  const h = laserPts[laserPts.length - 1];
  const ha = 1 - (now - h.t) / LIFE;
  if (ha > 0) {
    c.shadowBlur = 16;
    c.beginPath();
    c.arc(h.x, h.y, 4 + 2 * ha, 0, Math.PI * 2);
    c.fillStyle = '#FF4530';
    c.fill();
    c.shadowBlur = 0;
    c.beginPath();
    c.arc(h.x, h.y, 2, 0, Math.PI * 2);
    c.fillStyle = '#FFE9E5';
    c.fill();
  }
  c.restore();
}

function rectsIntersect(b1, b2) {
  if (!b1 || !b2) return false;
  return !(b1.x + b1.w < b2.x || b2.x + b2.w < b1.x || b1.y + b1.h < b2.y || b2.y + b2.h < b1.y);
}

let hoveredHandle = null;

function selHandleScreen(b, v) {
  if (!b) return [];
  const P = 7;
  const x = b.x * v.zoom + v.panX - P, y = b.y * v.zoom + v.panY - P;
  const w = b.w * v.zoom + 2 * P, h = b.h * v.zoom + 2 * P;
  return [
    { h: 'nw', sx: x,          sy: y,          bx: b.x,          by: b.y },
    { h: 'ne', sx: x + w,      sy: y,          bx: b.x + b.w,    by: b.y },
    { h: 'se', sx: x + w,      sy: y + h,      bx: b.x + b.w,    by: b.y + b.h },
    { h: 'sw', sx: x,          sy: y + h,      bx: b.x,          by: b.y + b.h },
    { h: 'rot', sx: x + w / 2, sy: y - 26,     bx: b.x + b.w / 2, by: b.y, topX: x + w / 2, topY: y },
  ];
}

function getSelectionHandleAt(clientX, clientY, v) {
  const selected = getSelectedObjects();
  if (!selected.length || state.tool !== 'select' || editing) return null;
  const b = contentBounds(selected);
  if (!b) return null;
  const hs = selHandleScreen(b, v);
  const rotHd = hs.find(h => h.h === 'rot');
  if (rotHd && Math.hypot(clientX - rotHd.sx, clientY - rotHd.sy) <= 12) {
    return { type: 'rotate', handle: 'rot', hd: rotHd, b, selected };
  }
  for (const hd of hs) {
    if (hd.h === 'rot') continue;
    const d = Math.hypot(clientX - hd.sx, clientY - hd.sy);
    if (d <= 7) return { type: 'resize', handle: hd.h, hd, b, selected };
    if (d <= 26) return { type: 'rotate', handle: hd.h, hd, b, selected };
  }
  return null;
}

function drawSelectionOverlay(v) {
  const selected = getSelectedObjects();
  const bar = $('selActions');
  if (!selected.length || state.tool !== 'select' || editing) { bar.style.display = 'none'; return; }
  const b = contentBounds(selected);
  if (!b) { bar.style.display = 'none'; return; }
  const hs = selHandleScreen(b, v);
  if (!hs.length) { bar.style.display = 'none'; return; }
  const { sx: x, sy: y } = hs[0];
  const w = hs[1].sx - x, h = hs[3].sy - y;
  const rotHd = hs.find(h => h.h === 'rot');

  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;

  // Dashed selection rectangle
  ctx.setLineDash([6, 4]);
  rr(ctx, x, y, w, h, 7);
  ctx.stroke();
  ctx.setLineDash([]);

  // Stem line connecting bounding box top to rotation blob
  if (rotHd) {
    ctx.beginPath();
    ctx.moveTo(rotHd.topX, rotHd.topY);
    ctx.lineTo(rotHd.sx, rotHd.sy);
    ctx.stroke();
  }

  // Corner resize handles
  for (const hd of hs) {
    if (hd.h === 'rot') continue;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.rect(hd.sx - 5, hd.sy - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
  }

  // Dedicated rotation blob handle
  if (rotHd) {
    const isRotHover = (hoveredHandle && hoveredHandle.handle === 'rot') || (action && action.type === 'rotate');
    const r = isRotHover ? 9 : 7.5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(rotHd.sx, rotHd.sy, r, 0, Math.PI * 2);
    ctx.fillStyle = isRotHover ? '#FFF3EC' : '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = isRotHover ? 2.5 : 2;
    ctx.stroke();

    // Inner pivot dot
    ctx.beginPath();
    ctx.arc(rotHd.sx, rotHd.sy, isRotHover ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.restore();
  }

  // Corner rotation hover hint (subtle arc when hovering in outer corner rotate zone)
  if (hoveredHandle && hoveredHandle.type === 'rotate' && hoveredHandle.handle !== 'rot' && !action) {
    const hd = hs.find(h => h.h === hoveredHandle.handle);
    if (hd) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(hd.sx, hd.sy, 14, 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Active rotation guides & HUD badge
  if (action && action.type === 'rotate') {
    const cx = action.center.x * v.zoom + v.panX;
    const cy = action.center.y * v.zoom + v.panY;

    // Center pivot point
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Connecting dashed ray from center to current pointer
    if (lastPtr) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(lastPtr.x, lastPtr.y);
      ctx.strokeStyle = 'rgba(228, 87, 46, 0.7)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      // Floating angle HUD pill badge
      const deg = Math.round(action.deg || 0);
      const sign = deg > 0 ? '+' : '';
      const badgeText = `${sign}${deg}°${action.snappedShift ? ' (15° snap)' : ''}`;
      ctx.font = '700 13px Nunito, sans-serif';
      const tw = ctx.measureText(badgeText).width;
      const bx = clamp(lastPtr.x + 18, 10, VW - tw - 30);
      const by = clamp(lastPtr.y - 14, 28, VH - 20);

      ctx.fillStyle = 'rgba(30, 36, 44, 0.92)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 8;
      rr(ctx, bx - 7, by - 16, tw + 14, 24, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = action.snappedShift ? '#FFD480' : '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx, by - 4);
    }
    ctx.restore();
  }

  ctx.restore();

  // Smart floating toolbar placement
  bar.style.display = 'flex';
  bar.style.left = clamp(x - 2, 10, VW - 140) + 'px';
  const idealTop = (rotHd ? rotHd.sy : y) - 44;
  if (idealTop >= 64) {
    bar.style.top = clamp(idealTop, 64, VH - 150) + 'px';
  } else {
    bar.style.top = clamp(y + h + 16, 64, VH - 150) + 'px';
  }
}

function render() {
  const p = page(), v = p.view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let objs = p.objects;
  if (action) {
    if (action.type === 'draw') objs = objs.concat([action.temp]);
    if (action.type === 'shape') { const t = tempShapeObj(); if (t) objs = objs.concat([t]); }
  }
  paintBoard(ctx, VW, VH, v, p.bg, objs, editing ? editing.obj.id : null);

  // Marquee selection box preview
  if (action && action.type === 'marquee') {
    ctx.save();
    ctx.translate(v.panX, v.panY);
    ctx.scale(v.zoom, v.zoom);
    const mx = Math.min(action.x0, action.x1);
    const my = Math.min(action.y0, action.y1);
    const mw = Math.abs(action.x1 - action.x0);
    const mh = Math.abs(action.y1 - action.y0);
    ctx.fillStyle = 'rgba(228, 87, 46, 0.08)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1 / v.zoom;
    ctx.setLineDash([5 / v.zoom, 4 / v.zoom]);
    ctx.strokeRect(mx, my, mw, mh);
    ctx.restore();
  }

  if (action && action.type === 'sticky' && action.moved) {
    ctx.save();
    ctx.translate(v.panX, v.panY);
    ctx.scale(v.zoom, v.zoom);
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = 'rgba(35,40,47,.5)';
    ctx.lineWidth = 1.5 / v.zoom;
    rr(ctx, Math.min(action.x0, action.x1), Math.min(action.y0, action.y1),
       Math.abs(action.x1 - action.x0), Math.abs(action.y1 - action.y0), 9);
    ctx.stroke();
    ctx.restore();
  }

  drawLaser(ctx);
  drawSelectionOverlay(v);
  positionEditor();
}

function tick() {
  if (needsRender || laserPts.length || action) {
    render();
    needsRender = false;
  }
  requestAnimationFrame(tick);
}

/* ================================================================
   5. GEOMETRY — bounds, hit-testing, distances
   ================================================================ */
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function boundsOf(o) {
  if (!o) return null;
  switch (o.type) {
    case 'stroke': {
      if (!o.points || !o.points.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of o.points) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      const pad = o.width / 2 + 2;
      return { x: x0 - pad, y: y0 - pad, w: Math.max(4, (x1 - x0) + pad * 2), h: Math.max(4, (y1 - y0) + pad * 2) };
    }
    case 'line': case 'arrow': {
      const pad = o.width / 2 + 4;
      const x = Math.min(o.x0, o.x1) - pad, y = Math.min(o.y0, o.y1) - pad;
      return { x, y, w: Math.max(6, Math.abs(o.x1 - o.x0) + pad * 2), h: Math.max(6, Math.abs(o.y1 - o.y0) + pad * 2) };
    }
    case 'rect': case 'ellipse': {
      const pad = o.width / 2 + 3;
      const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
      const w0 = Math.abs(o.x1 - o.x0), h0 = Math.abs(o.y1 - o.y0);
      if (o.angle) {
        const hw = w0 / 2, hh = h0 / 2;
        const cos = Math.abs(Math.cos(o.angle)), sin = Math.abs(Math.sin(o.angle));
        const bbW = (hw * cos + hh * sin) * 2 + pad * 2;
        const bbH = (hw * sin + hh * cos) * 2 + pad * 2;
        return { x: cx - bbW / 2, y: cy - bbH / 2, w: Math.max(6, bbW), h: Math.max(6, bbH) };
      }
      const x = Math.min(o.x0, o.x1) - pad, y = Math.min(o.y0, o.y1) - pad;
      return { x, y, w: Math.max(6, w0 + pad * 2), h: Math.max(6, h0 + pad * 2) };
    }
    case 'text': {
      const m = textMetrics(o);
      if (o.angle) {
        const cx = o.x + m.w / 2, cy = o.y + m.h / 2;
        const hw = m.w / 2, hh = m.h / 2;
        const cos = Math.abs(Math.cos(o.angle)), sin = Math.abs(Math.sin(o.angle));
        const bbW = (hw * cos + hh * sin) * 2;
        const bbH = (hw * sin + hh * cos) * 2;
        return { x: cx - bbW / 2, y: cy - bbH / 2, w: bbW, h: bbH };
      }
      return { x: o.x, y: o.y, w: m.w, h: m.h };
    }
    case 'image': case 'sticky': {
      if (o.angle) {
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        const hw = o.w / 2, hh = o.h / 2;
        const cos = Math.abs(Math.cos(o.angle)), sin = Math.abs(Math.sin(o.angle));
        const bbW = (hw * cos + hh * sin) * 2;
        const bbH = (hw * sin + hh * cos) * 2;
        return { x: cx - bbW / 2, y: cy - bbH / 2, w: Math.max(12, bbW), h: Math.max(12, bbH) };
      }
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    }
  }
  return null;
}

function textMetrics(o) {
  ctx.save();
  ctx.font = `700 ${o.fontSize}px Nunito, sans-serif`;
  const lines = (o.lines && o.lines.length) ? o.lines : [''];
  let w = 0;
  for (const ln of lines) w = Math.max(w, ctx.measureText(ln).width);
  ctx.restore();
  return { w: Math.max(w, o.fontSize * 0.6), h: lines.length * o.fontSize * 1.3 };
}

function contentBounds(objs) {
  let r = null;
  for (const o of objs) {
    const b = boundsOf(o);
    if (!b) continue;
    r = r ? {
      x: Math.min(r.x, b.x),
      y: Math.min(r.y, b.y),
      w: Math.max(r.x + r.w, b.x + b.w) - Math.min(r.x, b.x),
      h: Math.max(r.y + r.h, b.y + b.h) - Math.min(r.y, b.y)
    } : b;
  }
  return r;
}

function objectHit(o, p, tol) {
  const t = tol || 0;
  if (o.type === 'stroke') {
    const th = t + o.width / 2 + 4;
    if (o.points.length === 1)
      return Math.hypot(p.x - o.points[0].x, p.y - o.points[0].y) <= th;
    for (let i = 1; i < o.points.length; i++) {
      if (distSeg(p.x, p.y, o.points[i-1].x, o.points[i-1].y, o.points[i].x, o.points[i].y) <= th) return true;
    }
    return false;
  }
  if (o.type === 'line' || o.type === 'arrow') {
    return distSeg(p.x, p.y, o.x0, o.y0, o.x1, o.y1) <= t + o.width / 2 + 5;
  }

  let tp = p;
  let cx, cy, w, h;
  if (o.x0 !== undefined) {
    cx = (o.x0 + o.x1) / 2;
    cy = (o.y0 + o.y1) / 2;
    w = Math.abs(o.x1 - o.x0);
    h = Math.abs(o.y1 - o.y0);
  } else if (o.type === 'text') {
    const m = textMetrics(o);
    cx = o.x + m.w / 2;
    cy = o.y + m.h / 2;
    w = m.w;
    h = m.h;
  } else {
    cx = o.x + o.w / 2;
    cy = o.y + o.h / 2;
    w = o.w;
    h = o.h;
  }

  if (o.angle) {
    const cos = Math.cos(-o.angle), sin = Math.sin(-o.angle);
    const dx = p.x - cx, dy = p.y - cy;
    tp = {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  }

  const s = 4 + t;
  if (o.type === 'ellipse') {
    const rx = w / 2 + s, ry = h / 2 + s;
    if (rx <= 0 || ry <= 0) return false;
    const nx = (tp.x - cx) / rx, ny = (tp.y - cy) / ry;
    return (nx * nx + ny * ny) <= 1;
  }
  return tp.x >= cx - w / 2 - s && tp.x <= cx + w / 2 + s && tp.y >= cy - h / 2 - s && tp.y <= cy + h / 2 + s;
}

function hitTest(p, tol) {
  const objs = page().objects;
  for (let i = objs.length - 1; i >= 0; i--) {
    if (objectHit(objs[i], p, tol)) return objs[i];
  }
  return null;
}

/* ================================================================
   6. POINTER INPUT & TOOLS
   ================================================================ */
canvas.addEventListener('contextmenu', e => e.preventDefault());

function pinchState() {
  const [a, b] = [...activePtrs.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

canvas.addEventListener('pointerdown', e => {
  hideHint();
  lastPtr = { x: e.clientX, y: e.clientY };
  activePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // Two fingers on touch = pinch zoom + pan
  if (activePtrs.size === 2) {
    commitEditor();
    action = { type: 'pinch', ...pinchState() };
    return;
  }
  if (activePtrs.size > 2) return;

  // Double tap detection for mobile/touch
  const now = performance.now();
  if (e.pointerType === 'touch' && now - lastTapTime < 300) {
    const w = worldFromClient(e.clientX, e.clientY);
    const hit = hitTest(w, 4);
    if (hit && (hit.type === 'text' || hit.type === 'sticky')) {
      state.selectedIds = new Set([hit.id]);
      openEditor(hit, hit.type);
      return;
    }
  }
  lastTapTime = now;

  // Right / middle mouse, or holding Space = pan
  if (e.button === 1 || e.button === 2 || spaceHeld) { startPan(e); return; }
  if (e.button !== 0) return;

  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();

  if (document.activeElement && document.activeElement !== document.body &&
      document.activeElement !== $('textEditor')) document.activeElement.blur();
  commitEditor();

  const w = worldFromClient(e.clientX, e.clientY);
  const t = state.tool;

  if (t === 'pen' || t === 'highlighter') {
    action = {
      type: 'draw',
      lastT: e.timeStamp,
      temp: {
        id: uid(),
        type: 'stroke',
        mode: t === 'pen' ? 'pen' : 'hi',
        color: state.color,
        width: t === 'pen' ? state.size : Math.max(12, state.size * 3.5),
        points: [{ x: w.x, y: w.y, w: 1 }]
      },
    };
  } else if (t === 'eraser') {
    action = { type: 'erase', snapped: false, last: w };
    eraseAt(w, action);
  } else if (['line', 'rect', 'ellipse', 'arrow'].includes(t)) {
    action = { type: 'shape', kind: t, x0: w.x, y0: w.y, x1: w.x, y1: w.y };
  } else if (t === 'text') {
    action = { type: 'place', x: w.x, y: w.y, sx: e.clientX, sy: e.clientY, moved: false };
  } else if (t === 'sticky') {
    action = { type: 'sticky', x0: w.x, y0: w.y, x1: w.x, y1: w.y, moved: false };
  } else if (t === 'laser') {
    action = { type: 'laser' };
    laserPts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  } else if (t === 'select') {
    handleSelectDown(e, w);
  } else if (t === 'hand') {
    startPan(e);
  }
  needsRender = true;
});

canvas.addEventListener('pointermove', e => {
  lastPtr = { x: e.clientX, y: e.clientY };
  if (activePtrs.has(e.pointerId)) activePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  updateCursorOverlays(e);

  if (action && action.type === 'pinch') {
    if (activePtrs.size >= 2) {
      const st = pinchState();
      const v = page().view;
      v.panX += st.mx - action.mx;
      v.panY += st.my - action.my;
      if (action.d > 20) setZoom(v.zoom * st.d / action.d, st.mx, st.my);
      action.mx = st.mx;
      action.my = st.my;
      action.d = st.d;
    }
    return;
  }

  if (state.tool === 'laser' && action && action.type === 'laser') {
    const lp = laserPts[laserPts.length - 1];
    if (!lp || Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 1.5)
      laserPts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  }

  // Hover feedback with the select tool
  if (state.tool === 'select' && !action && !spaceHeld) {
    const handleInfo = getSelectionHandleAt(e.clientX, e.clientY, page().view);
    const prevHandle = hoveredHandle;
    hoveredHandle = handleInfo;
    if (prevHandle?.handle !== handleInfo?.handle || prevHandle?.type !== handleInfo?.type) {
      needsRender = true;
    }

    if (handleInfo) {
      if (handleInfo.type === 'resize') {
        canvas.style.cursor = (handleInfo.handle === 'nw' || handleInfo.handle === 'se') ? 'nwse-resize' : 'nesw-resize';
      } else {
        canvas.style.cursor = ROTATE_CURSOR;
      }
    } else {
      const w0 = worldFromClient(e.clientX, e.clientY);
      canvas.style.cursor = hitTest(w0, 0) ? 'move' : 'default';
    }
  }

  if (!action) return;
  const w = worldFromClient(e.clientX, e.clientY);

  switch (action.type) {
    case 'draw':   addDrawPoint(action, w, e); break;
    case 'erase':  eraseAt(w, action); break;
    case 'shape':  updateShapeDrag(action, w, e); break;
    case 'place':
      if (Math.hypot(e.clientX - action.sx, e.clientY - action.sy) > 6) action.moved = true;
      break;
    case 'sticky':
      action.x1 = w.x; action.y1 = w.y;
      if (Math.hypot(action.x1 - action.x0, action.y1 - action.y0) > 6) action.moved = true;
      needsRender = true;
      break;
    case 'marquee':
      action.x1 = w.x; action.y1 = w.y;
      updateMarqueeSelection(action);
      needsRender = true;
      break;
    case 'pan':
      page().view.panX += e.clientX - action.lx;
      page().view.panY += e.clientY - action.ly;
      action.lx = e.clientX; action.ly = e.clientY;
      needsRender = true;
      break;
    case 'move':   doMove(w, action); break;
    case 'resize': doResize(w, action); break;
    case 'rotate': doRotate(w, e, action); break;
  }
});

canvas.addEventListener('pointerup', e => {
  activePtrs.delete(e.pointerId);
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}

  if (action && action.type === 'pinch') {
    if (activePtrs.size < 2) action = null;
    return;
  }
  if (!action) return;
  const a = action;
  action = null;

  switch (a.type) {
    case 'draw':
      pushUndo();
      page().objects.push(a.temp);
      scheduleThumb();
      break;
    case 'shape':
      commitShape(a);
      break;
    case 'place':
      if (!a.moved) createDraftText(a.x, a.y);
      break;
    case 'sticky':
      createStickyFrom(a);
      break;
    case 'erase':
    case 'move':
    case 'resize':
    case 'rotate':
      if (a.snapped) { scheduleThumb(); scheduleSave(); }
      break;
    case 'pan':
      scheduleSave();
      break;
  }
  canvas.style.cursor = spaceHeld ? 'grab' : (CURSORS[state.tool] || 'default');
  needsRender = true;
});

canvas.addEventListener('pointercancel', e => {
  activePtrs.delete(e.pointerId);
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  action = null;
  needsRender = true;
});

canvas.addEventListener('pointerleave', () => {
  $('eraserRing').style.display = 'none';
  $('laserDot').style.display = 'none';
});

/* Double click: edit text / sticky, or create text box on empty board */
canvas.addEventListener('dblclick', e => {
  if (state.tool !== 'select') return;
  const w = worldFromClient(e.clientX, e.clientY);
  const hit = hitTest(w, 0);
  if (hit && (hit.type === 'text' || hit.type === 'sticky')) {
    state.selectedIds = new Set([hit.id]);
    openEditor(hit, hit.type);
  } else if (!hit) {
    createDraftText(w.x, w.y);
  }
});

/* ================================================================
   WHEEL ZOOM & PAN: Normal = Up/Down, Shift = Left/Right, Ctrl = Zoom
   ================================================================ */
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    // Zoom in/out at cursor
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  } else if (e.shiftKey) {
    // Shift + wheel = scroll left / right
    const v = page().view;
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    v.panX -= delta;
    needsRender = true;
  } else {
    // Normal wheel = scroll up / down (and horizontal if mouse has horiz wheel)
    const v = page().view;
    v.panX -= e.deltaX;
    v.panY -= e.deltaY;
    needsRender = true;
  }
  scheduleSave();
}, { passive: false });

/* ---- freehand point capture with speed-based width taper ---- */
function addDrawPoint(a, w, e) {
  const pts = a.temp.points, last = pts[pts.length - 1];
  const d = Math.hypot(w.x - last.x, w.y - last.y);
  if (d < 1.2 / page().view.zoom) return;
  const dt = Math.max(4, e.timeStamp - a.lastT);
  a.lastT = e.timeStamp;
  const speed = d / dt;
  const target = clamp(1.12 - speed * 0.35, 0.35, 1.25);
  const f = clamp(last.w * 0.65 + target * 0.35, 0.3, 1.3);
  pts.push({ x: w.x, y: w.y, w: f });
  needsRender = true;
}

/* ---- shape drag with Shift constraint ---- */
function updateShapeDrag(a, w, e) {
  a.x1 = w.x; a.y1 = w.y;
  if (e.shiftKey) {
    if (a.kind === 'line' || a.kind === 'arrow') {
      const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
      const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0);
      const snap = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
      a.x1 = a.x0 + Math.cos(snap) * len;
      a.y1 = a.y0 + Math.sin(snap) * len;
    } else {
      const dx = a.x1 - a.x0, dy = a.y1 - a.y0;
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      a.x1 = a.x0 + (dx >= 0 ? 1 : -1) * m;
      a.y1 = a.y0 + (dy >= 0 ? 1 : -1) * m;
    }
  }
  needsRender = true;
}

function tempShapeObj() {
  const a = action;
  if (!a || a.type !== 'shape') return null;
  return {
    id: '__temp',
    type: a.kind,
    x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
    color: state.color,
    width: Math.max(1, state.size),
    fill: state.fill
  };
}

function commitShape(a) {
  if (Math.hypot(a.x1 - a.x0, a.y1 - a.y0) < 4 / page().view.zoom) return;
  pushUndo();
  page().objects.push({
    id: uid(),
    type: a.kind,
    x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
    color: state.color,
    width: Math.max(1, state.size),
    fill: state.fill
  });
  scheduleThumb();
}

/* ---- object eraser ---- */
function eraseAt(w, a) {
  const r = Math.max(6, state.size * 2.5);
  const d = Math.hypot(w.x - a.last.x, w.y - a.last.y);
  const steps = Math.max(1, Math.ceil(d / (r * 0.5)));
  let removed = false;
  for (let i = 1; i <= steps; i++) {
    const p = {
      x: a.last.x + (w.x - a.last.x) * i / steps,
      y: a.last.y + (w.y - a.last.y) * i / steps
    };
    const hit = hitTest(p, r);
    if (hit) {
      if (!a.snapped) { pushUndo(); a.snapped = true; }
      removeObject(hit.id);
      if (state.selectedIds.has(hit.id)) state.selectedIds.delete(hit.id);
      removed = true;
    }
  }
  a.last = w;
  if (removed) needsRender = true;
}

function startPan(e) {
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  action = { type: 'pan', lx: e.clientX, ly: e.clientY };
  canvas.style.cursor = 'grabbing';
}

/* ---- custom pointer previews ---- */
function updateCursorOverlays(e) {
  const ring = $('eraserRing'), dot = $('laserDot');
  if (state.tool === 'eraser' && !spaceHeld) {
    const r = Math.max(6, state.size * 2.5) * page().view.zoom;
    ring.style.display = 'block';
    ring.style.width = ring.style.height = (r * 2) + 'px';
    ring.style.transform = `translate(${e.clientX - r}px,${e.clientY - r}px)`;
  } else {
    ring.style.display = 'none';
  }
  if (state.tool === 'laser') {
    dot.style.display = 'block';
    dot.style.transform = `translate(${e.clientX - 5}px,${e.clientY - 5}px)`;
  } else {
    dot.style.display = 'none';
  }
}

/* ================================================================
   7. SELECTION & MULTI-SELECTION (Marquee, Move, Resize, Duplicate)
   ================================================================ */
function syncToolbarToSelected(o) {
  if (!o) return;
  if (o.color) {
    if (MARKERS.includes(o.color)) setColor(o.color);
    else if (NOTES.includes(o.color)) setNoteColor(o.color);
  }
  if (o.width !== undefined) {
    state.size = o.width;
    $('widthRange').value = o.width;
    $('widthVal').textContent = o.width;
  }
  if (o.fontSize !== undefined) {
    state.fontSize = o.fontSize;
    $('fontVal').textContent = o.fontSize;
  }
  if (o.fill !== undefined) {
    state.fill = !!o.fill;
    $('fillBtn').classList.toggle('on', state.fill);
  }
}

function updateMarqueeSelection(a) {
  const mx = Math.min(a.x0, a.x1);
  const my = Math.min(a.y0, a.y1);
  const mw = Math.abs(a.x1 - a.x0);
  const mh = Math.abs(a.y1 - a.y0);
  const marqueeBox = { x: mx, y: my, w: mw, h: mh };

  const currentSelection = new Set(a.prevSelected);
  for (const o of page().objects) {
    const ob = boundsOf(o);
    if (ob && rectsIntersect(ob, marqueeBox)) {
      currentSelection.add(o.id);
    }
  }
  state.selectedIds = currentSelection;
}

function handleSelectDown(e, w) {
  const handleInfo = getSelectionHandleAt(e.clientX, e.clientY, page().view);
  if (handleInfo) {
    if (handleInfo.type === 'resize') {
      action = {
        type: 'resize',
        objects: handleInfo.selected,
        handle: handleInfo.handle,
        startW: w,
        startBounds: handleInfo.b,
        sos: handleInfo.selected.map(o => JSON.parse(JSON.stringify(o))),
        snapped: false
      };
      return;
    }
    if (handleInfo.type === 'rotate') {
      const cx = handleInfo.b.x + handleInfo.b.w / 2;
      const cy = handleInfo.b.y + handleInfo.b.h / 2;
      action = {
        type: 'rotate',
        objects: handleInfo.selected,
        center: { x: cx, y: cy },
        startAngle: Math.atan2(w.y - cy, w.x - cx),
        deltaAngle: 0,
        deg: 0,
        snappedShift: false,
        startW: w,
        sos: handleInfo.selected.map(o => JSON.parse(JSON.stringify(o))),
        snapped: false
      };
      return;
    }
  }

  const hit = hitTest(w, 0);
  if (hit) {
    if (e.shiftKey) {
      // Toggle selection with Shift
      if (state.selectedIds.has(hit.id)) state.selectedIds.delete(hit.id);
      else state.selectedIds.add(hit.id);
      syncToolbarToSelected(hit);
    } else if (!state.selectedIds.has(hit.id)) {
      // Single click on unselected item selects only this item
      state.selectedIds = new Set([hit.id]);
      syncToolbarToSelected(hit);
    }

    const currentSelected = getSelectedObjects();
    if (e.altKey) {
      // Alt-drag = quick duplicate all selected
      const clones = currentSelected.map(o => {
        const c = cloneObj(o);
        translateObj(c, 16, 16);
        return c;
      });
      pushUndo();
      clones.forEach(c => page().objects.push(c));
      state.selectedIds = new Set(clones.map(c => c.id));
      action = { type: 'move', objects: clones, lastW: w, startW: w, snapped: false };
    } else {
      action = { type: 'move', objects: currentSelected, lastW: w, startW: w, snapped: false };
    }
  } else {
    // Clicked on empty canvas
    if (!e.shiftKey) {
      state.selectedIds.clear();
    }
    // Start marquee drag
    action = {
      type: 'marquee',
      x0: w.x, y0: w.y,
      x1: w.x, y1: w.y,
      sx: e.clientX, sy: e.clientY,
      prevSelected: new Set(state.selectedIds)
    };
  }
}

function translateObj(o, dx, dy) {
  if (o.type === 'stroke') { o.points.forEach(p => { p.x += dx; p.y += dy; }); return; }
  if (o.x0 !== undefined) { o.x0 += dx; o.x1 += dx; o.y0 += dy; o.y1 += dy; return; }
  o.x += dx; o.y += dy;
}

function doMove(w, a) {
  if (!a.snapped) {
    if (Math.hypot(w.x - a.startW.x, w.y - a.startW.y) < 3 / page().view.zoom) return;
    pushUndo();
    a.snapped = true;
  }
  const dx = w.x - a.lastW.x;
  const dy = w.y - a.lastW.y;
  for (const o of a.objects) {
    translateObj(o, dx, dy);
  }
  a.lastW = w;
  needsRender = true;
}

function doResize(w, a) {
  if (!a.snapped) {
    if (Math.hypot(w.x - a.startW.x, w.y - a.startW.y) < 4 / page().view.zoom) return;
    pushUndo();
    a.snapped = true;
  }
  const sb = a.startBounds;
  const ax = a.handle.includes('w') ? sb.x + sb.w : sb.x;
  const ay = a.handle.includes('n') ? sb.y + sb.h : sb.y;
  let s = Math.max(
    (a.handle.includes('w') ? ax - w.x : w.x - ax) / Math.max(sb.w, 1),
    (a.handle.includes('n') ? ay - w.y : w.y - ay) / Math.max(sb.h, 1)
  );
  s = clamp(s, 0.06, 14);

  a.objects.forEach((o, idx) => {
    const so = a.sos[idx];
    if (o.type === 'stroke') {
      o.points = so.points.map(p => ({ x: ax + (p.x - ax) * s, y: ay + (p.y - ay) * s, w: p.w }));
      o.width = Math.max(0.5, so.width * s);
    } else if (o.x0 !== undefined) {
      o.x0 = ax + (so.x0 - ax) * s; o.y0 = ay + (so.y0 - ay) * s;
      o.x1 = ax + (so.x1 - ax) * s; o.y1 = ay + (so.y1 - ay) * s;
      o.width = Math.max(0.5, so.width * s);
    } else if (o.type === 'text') {
      o.fontSize = Math.max(8, so.fontSize * s);
      o.x = ax + (so.x - ax) * s; o.y = ay + (so.y - ay) * s;
    } else {
      o.w = Math.max(12, so.w * s); o.h = Math.max(12, so.h * s);
      if (o.type === 'sticky') o.fontSize = clamp(so.fontSize * s, 10, 72);
      o.x = ax + (so.x - ax) * s; o.y = ay + (so.y - ay) * s;
    }
  });
  needsRender = true;
}

function doRotate(w, e, a) {
  const cx = a.center.x, cy = a.center.y;
  const currentAngle = Math.atan2(w.y - cy, w.x - cx);
  let dAngle = currentAngle - a.startAngle;

  if (e && e.shiftKey) {
    // Snap to 15 degrees (Math.PI / 12)
    const step = Math.PI / 12;
    dAngle = Math.round(dAngle / step) * step;
    a.snappedShift = true;
  } else {
    a.snappedShift = false;
  }

  if (!a.snapped) {
    if (Math.abs(dAngle) < 0.02) return;
    pushUndo();
    a.snapped = true;
  }

  a.deltaAngle = dAngle;
  a.deg = Math.round((dAngle * 180 / Math.PI) % 360);

  const cos = Math.cos(dAngle), sin = Math.sin(dAngle);

  a.objects.forEach((o, idx) => {
    const so = a.sos[idx];
    if (o.type === 'stroke') {
      o.points = so.points.map(p => {
        const dx = p.x - cx, dy = p.y - cy;
        return {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos,
          w: p.w
        };
      });
    } else if (o.type === 'line' || o.type === 'arrow') {
      const dx0 = so.x0 - cx, dy0 = so.y0 - cy;
      const dx1 = so.x1 - cx, dy1 = so.y1 - cy;
      o.x0 = cx + dx0 * cos - dy0 * sin;
      o.y0 = cy + dx0 * sin + dy0 * cos;
      o.x1 = cx + dx1 * cos - dy1 * sin;
      o.y1 = cy + dx1 * sin + dy1 * cos;
    } else if (o.type === 'rect' || o.type === 'ellipse') {
      const scx = (so.x0 + so.x1) / 2, scy = (so.y0 + so.y1) / 2;
      const sw = Math.abs(so.x1 - so.x0), sh = Math.abs(so.y1 - so.y0);
      const dx = scx - cx, dy = scy - cy;
      const ncx = cx + dx * cos - dy * sin;
      const ncy = cy + dx * sin + dy * cos;
      o.x0 = ncx - sw / 2;
      o.x1 = ncx + sw / 2;
      o.y0 = ncy - sh / 2;
      o.y1 = ncy + sh / 2;
      o.angle = (so.angle || 0) + dAngle;
    } else if (o.type === 'text') {
      const m = textMetrics(so);
      const scx = so.x + m.w / 2, scy = so.y + m.h / 2;
      const dx = scx - cx, dy = scy - cy;
      const ncx = cx + dx * cos - dy * sin;
      const ncy = cy + dx * sin + dy * cos;
      o.x = ncx - m.w / 2;
      o.y = ncy - m.h / 2;
      o.angle = (so.angle || 0) + dAngle;
    } else { // image, sticky
      const scx = so.x + so.w / 2, scy = so.y + so.h / 2;
      const dx = scx - cx, dy = scy - cy;
      const ncx = cx + dx * cos - dy * sin;
      const ncy = cy + dx * sin + dy * cos;
      o.x = ncx - so.w / 2;
      o.y = ncy - so.h / 2;
      o.angle = (so.angle || 0) + dAngle;
    }
  });

  needsRender = true;
}

function deleteSelection() {
  if (!state.selectedIds.size) return;
  commitEditor();
  pushUndo();
  for (const id of state.selectedIds) {
    removeObject(id);
  }
  state.selectedIds.clear();
  scheduleThumb();
  needsRender = true;
}

function duplicateSelection() {
  const selected = getSelectedObjects();
  if (!selected.length) return;
  commitEditor();
  const clones = selected.map(o => {
    const c = cloneObj(o);
    translateObj(c, 24, 24);
    return c;
  });
  pushUndo();
  clones.forEach(c => page().objects.push(c));
  state.selectedIds = new Set(clones.map(c => c.id));
  scheduleThumb();
  needsRender = true;
}

function bringSelToFront() {
  const selected = getSelectedObjects();
  if (!selected.length) return;
  const arr = page().objects;
  pushUndo();
  for (const o of selected) {
    const idx = arr.indexOf(o);
    if (idx >= 0) arr.splice(idx, 1);
    arr.push(o);
  }
  scheduleThumb();
  needsRender = true;
}

function sendSelToBack() {
  const selected = getSelectedObjects();
  if (!selected.length) return;
  const arr = page().objects;
  pushUndo();
  for (let i = selected.length - 1; i >= 0; i--) {
    const o = selected[i];
    const idx = arr.indexOf(o);
    if (idx >= 0) arr.splice(idx, 1);
    arr.unshift(o);
  }
  scheduleThumb();
  needsRender = true;
}

let lastNudge = 0;
function nudge(dx, dy) {
  const selected = getSelectedObjects();
  if (!selected.length) return;
  const now = performance.now();
  if (now - lastNudge > 700) pushUndo();
  lastNudge = now;
  for (const o of selected) {
    translateObj(o, dx, dy);
  }
  scheduleThumb();
  needsRender = true;
}

/* ================================================================
   8. TEXT & STICKY EDITING
   ================================================================ */
function createDraftText(x, y) {
  const o = { id: uid(), type: 'text', x, y, color: state.color, fontSize: state.fontSize, lines: [''] };
  openEditor(o, 'text', true);
}

function openEditor(o, kind, isNew = false) {
  commitEditor();
  editing = {
    obj: o,
    kind,
    isNew,
    original: kind === 'text' ? (o.lines || []).join('\n') : (o.text || '')
  };
  const ta = $('textEditor');
  ta.value = isNew && kind === 'text' ? '' : editing.original;
  ta.wrap = kind === 'sticky' ? 'soft' : 'off';
  ta.classList.toggle('sticky-mode', kind === 'sticky');
  if (kind === 'sticky') {
    ta.style.background = o.color;
    ta.style.color = STICKY_INK;
  } else {
    ta.style.background = 'transparent';
    ta.style.color = o.color;
  }
  ta.style.display = 'block';
  positionEditor();
  ta.focus();
  try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (_) {}
  needsRender = true;
}

function positionEditor() {
  if (!editing) return;
  const { obj, kind } = editing;
  const v = page().view;
  const ta = $('textEditor');
  const fs = obj.fontSize * v.zoom;
  ta.style.fontSize = fs + 'px';
  ta.style.transform = obj.angle ? `rotate(${obj.angle}rad)` : 'none';
  ta.style.transformOrigin = (kind === 'sticky') ? 'center center' : 'top left';
  if (kind === 'sticky') {
    ta.style.left   = (obj.x * v.zoom + v.panX) + 'px';
    ta.style.top    = (obj.y * v.zoom + v.panY) + 'px';
    ta.style.width  = (obj.w * v.zoom) + 'px';
    ta.style.height = (obj.h * v.zoom) + 'px';
    ta.style.padding = (14 * v.zoom) + 'px';
    ta.style.lineHeight = '1.12';
  } else {
    ctx.save();
    ctx.font = `700 ${fs}px Nunito, sans-serif`;
    let mw = 0;
    for (const ln of ta.value.split('\n')) mw = Math.max(mw, ctx.measureText(ln).width);
    ctx.restore();
    ta.style.left = (obj.x * v.zoom + v.panX - 4) + 'px';
    ta.style.top  = (obj.y * v.zoom + v.panY - 2) + 'px';
    ta.style.width  = Math.max(60, mw + 16) + 'px';
    ta.style.height = (ta.value.split('\n').length * fs * 1.3 + 6) + 'px';
    ta.style.padding = '0 4px';
    ta.style.lineHeight = '1.3';
  }
}

function commitEditor() {
  if (!editing) return;
  const { obj, kind, isNew, original } = editing;
  const val = $('textEditor').value;
  editing = null;
  $('textEditor').style.display = 'none';
  $('textEditor').style.transform = 'none';

  if (kind === 'text') {
    if (!val.trim()) {
      if (!isNew) { pushUndo(); removeObject(obj.id); state.selectedIds.delete(obj.id); }
    } else {
      const lines = val.split('\n');
      if (isNew) { pushUndo(); obj.lines = lines; page().objects.push(obj); }
      else if (val !== original) { pushUndo(); obj.lines = lines; }
      state.selectedIds = new Set([obj.id]);
    }
  } else {
    obj._wrap = null;
    if (val !== original) { pushUndo(); obj.text = val; }
  }
  scheduleThumb();
  needsRender = true;
}

function createStickyFrom(a) {
  let x = Math.min(a.x0, a.x1), y = Math.min(a.y0, a.y1);
  let w = Math.abs(a.x1 - a.x0), h = Math.abs(a.y1 - a.y0);
  if (!a.moved) { w = 180; h = 180; x = a.x0 - w / 2; y = a.y0 - h / 2; }
  w = clamp(w, 90, 4000); h = clamp(h, 90, 4000);
  const o = {
    id: uid(),
    type: 'sticky',
    x, y, w, h,
    color: state.noteColor,
    fontSize: clamp(Math.round(Math.sqrt(w * h) / 6.5), 16, 40),
    text: ''
  };
  pushUndo();
  page().objects.push(o);
  state.selectedIds = new Set([o.id]);
  scheduleThumb();
  openEditor(o, 'sticky', true);
}

/* ================================================================
   9. HISTORY (Undo / Redo for objects and deleted pages)
   ================================================================ */
const stripCache = o => { const c = { ...o }; delete c._wrap; return c; };
const snapshot = () => JSON.parse(JSON.stringify(page().objects.map(stripCache)));

function pushUndo() {
  const p = page();
  p.undo.push({ objects: snapshot(), time: Date.now() });
  if (p.undo.length > HIST_MAX) p.undo.shift();
  p.redo.length = 0;
  updateHistoryUI();
}

function undo() {
  const p = page();
  const lastUndo = p.undo.length ? p.undo[p.undo.length - 1] : null;
  const lastDel = deletedPagesHistory.length ? deletedPagesHistory[deletedPagesHistory.length - 1] : null;

  const undoTime = lastUndo ? (lastUndo.time || 0) : -1;
  const delTime = lastDel ? (lastDel.time || 0) : -1;

  // Restore deleted page if it is newer than the last object undo on the current page, or if active page has no undo history
  if (lastDel && (delTime >= undoTime || !lastUndo)) {
    const { page: restoredPage, index } = deletedPagesHistory.pop();
    const targetIndex = clamp(index, 0, pages.length);
    pages.splice(targetIndex, 0, restoredPage);
    state.pageIndex = targetIndex;
    state.selectedIds.clear();
    rebuildStrip();
    syncBgSeg();
    updateZoomLabel();
    updateHistoryUI();
    scheduleSave();
    needsRender = true;
    toast(`Page ${targetIndex + 1} restored`);
    return;
  }

  if (lastUndo) {
    const entry = p.undo.pop();
    p.redo.push({ objects: snapshot(), time: Date.now() });
    p.objects = Array.isArray(entry) ? entry : entry.objects;
    state.selectedIds.clear();
    updateHistoryUI();
    scheduleThumb();
    needsRender = true;
    toast('Undo');
    return;
  }
}

function redo() {
  const p = page();
  if (!p.redo.length) return;
  const entry = p.redo.pop();
  p.undo.push({ objects: snapshot(), time: Date.now() });
  p.objects = Array.isArray(entry) ? entry : entry.objects;
  state.selectedIds.clear();
  updateHistoryUI();
  scheduleThumb();
  needsRender = true;
  toast('Redo');
}

function updateHistoryUI() {
  $('undoBtn').disabled = (!page().undo.length && !deletedPagesHistory.length);
  $('redoBtn').disabled = !page().redo.length;
}

/* ================================================================
   10. IMAGES & CLIPBOARD
   ================================================================ */
function importImageFile(file, at) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    toast('That file is not an image');
    return;
  }
  const rd = new FileReader();
  rd.onload = () => finalizeImageSrc(rd.result, at);
  rd.onerror = () => toast('Could not read that image');
  rd.readAsDataURL(file);
}

function finalizeImageSrc(src, at) {
  const im = new Image();
  im.onload = () => {
    let w = im.naturalWidth, h = im.naturalHeight, out = src;
    const MAXPX = 1600;
    if (Math.max(w, h) > MAXPX) {
      const f = MAXPX / Math.max(w, h);
      const t = document.createElement('canvas');
      t.width = Math.round(w * f);
      t.height = Math.round(h * f);
      t.getContext('2d').drawImage(im, 0, 0, t.width, t.height);
      out = t.toDataURL('image/png');
      if (out.length > 1400000) out = t.toDataURL('image/jpeg', 0.9);
      w = t.width;
      h = t.height;
    }
    registerAndPlace(im, out, w, h, at);
  };
  im.onerror = () => toast('Could not load that image');
  im.src = src;
}

function registerAndPlace(el, src, w, h, at) {
  const id = uid();
  IMG.set(id, { el, src, w, h });
  const v = page().view;
  const maxW = (VW / v.zoom) * 0.55, maxH = (VH / v.zoom) * 0.55;
  const f = Math.min(maxW / w, maxH / h, 1);
  const dw = w * f, dh = h * f;
  const c = at || { x: (VW / 2 - v.panX) / v.zoom, y: (VH / 2 - v.panY) / v.zoom };
  const o = { id: uid(), type: 'image', imgId: id, x: c.x - dw / 2, y: c.y - dh / 2, w: dw, h: dh };
  pushUndo();
  page().objects.push(o);
  state.selectedIds = new Set([o.id]);
  scheduleThumb();
  needsRender = true;
  toast('Image added');
}

$('insertImgBtn').onclick = () => { commitEditor(); $('imageInput').click(); };
$('imageInput').addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) importImageFile(f, null);
  e.target.value = '';
});

/* Drag & drop image files */
['dragenter', 'dragover'].forEach(ev =>
  window.addEventListener(ev, e => { e.preventDefault(); $('dropHint').style.display = 'block'; }));
window.addEventListener('dragleave', e => {
  if (!e.relatedTarget) $('dropHint').style.display = 'none';
});
window.addEventListener('drop', e => {
  e.preventDefault();
  $('dropHint').style.display = 'none';
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) importImageFile(f, worldFromClient(e.clientX, e.clientY));
});

/* Universal Copy / Paste Handlers */
window.addEventListener('copy', e => {
  if (editing || (e.target && e.target.tagName === 'TEXTAREA')) return;
  const selected = getSelectedObjects();
  if (selected.length) {
    clipObjects = selected.map(cloneObj);
    const payload = JSON.stringify({ type: 'brightboard-clip', objects: clipObjects });
    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', payload);
      e.preventDefault();
    }
  }
});

window.addEventListener('paste', e => {
  if (editing || (e.target && e.target.tagName === 'TEXTAREA')) return;
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) {
        e.preventDefault();
        importImageFile(f, null);
        return;
      }
    }
  }

  const rawText = e.clipboardData && e.clipboardData.getData('text');
  if (rawText && rawText.trim()) {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && parsed.type === 'brightboard-clip' && Array.isArray(parsed.objects) && parsed.objects.length) {
        e.preventDefault();
        const clones = parsed.objects.map(o => {
          const c = cloneObj(o);
          translateObj(c, 24, 24);
          return c;
        });
        pushUndo();
        clones.forEach(c => page().objects.push(c));
        state.selectedIds = new Set(clones.map(c => c.id));
        scheduleThumb();
        needsRender = true;
        toast(`${clones.length} object${clones.length > 1 ? 's' : ''} pasted`);
        return;
      }
    } catch (_) {}
  }

  // If internal objects were copied within current session and no external text on clipboard
  if (!rawText && clipObjects && clipObjects.length) {
    e.preventDefault();
    const clones = clipObjects.map(o => {
      const c = cloneObj(o);
      translateObj(c, 24, 24);
      return c;
    });
    pushUndo();
    clones.forEach(c => page().objects.push(c));
    state.selectedIds = new Set(clones.map(c => c.id));
    scheduleThumb();
    needsRender = true;
    toast(`${clones.length} object${clones.length > 1 ? 's' : ''} pasted`);
    return;
  }

  // If external text copied, paste as Text note at center of viewport
  const text = rawText;
  if (text && text.trim()) {
    e.preventDefault();
    const v = page().view;
    const cx = (VW / 2 - v.panX) / v.zoom;
    const cy = (VH / 2 - v.panY) / v.zoom;
    const lines = text.split('\n');
    const o = {
      id: uid(),
      type: 'text',
      x: cx - 100,
      y: cy - 20,
      color: state.color,
      fontSize: state.fontSize,
      lines
    };
    pushUndo();
    page().objects.push(o);
    state.selectedIds = new Set([o.id]);
    scheduleThumb();
    needsRender = true;
    toast('Text pasted');
  }
});

/* ================================================================
   11. PNG EXPORT & JSON BACKUP / RESTORE
   ================================================================ */
function exportPNG() {
  commitEditor();
  const p = page();
  const b = contentBounds(p.objects);
  const pad = 48;
  let W, H, view;
  if (b) {
    let sc = 2;
    const MAXS = 8000;
    const needW = b.w + pad * 2, needH = b.h + pad * 2;
    if (Math.max(needW, needH) * sc > MAXS) sc = Math.max(0.3, MAXS / Math.max(needW, needH));
    W = Math.ceil(needW * sc);
    H = Math.ceil(needH * sc);
    view = { zoom: sc, panX: (pad - b.x) * sc, panY: (pad - b.y) * sc };
  } else {
    W = 1280;
    H = 800;
    view = { zoom: 1, panX: 0, panY: 0 };
  }
  const oc = document.createElement('canvas');
  oc.width = W;
  oc.height = H;
  const octx = oc.getContext('2d');
  paintBoard(octx, W, H, view, p.bg, p.objects, null);

  const fname = `brightboard-p${state.pageIndex + 1}-${getTimestamp()}.png`;
  const deliver = url => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }, 5000);
    toast('PNG downloaded');
  };
  try {
    oc.toBlob(blob => {
      if (blob) deliver(URL.createObjectURL(blob));
      else deliver(oc.toDataURL('image/png'));
    }, 'image/png');
  } catch (err) {
    toast('Export blocked — a canvas element was tainted');
  }
}

function exportJSONBackup() {
  const data = serializeBoard();
  data.exportedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brightboard-backup-${getTimestamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  $('backupModal').classList.remove('show');
  toast('Notebook JSON exported');
}

function restoreFromJSONFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data && Array.isArray(data.pages) && data.pages.length) {
        restoreBoard(data);
        rebuildStrip();
        syncBgSeg();
        updateZoomLabel();
        updateHistoryUI();
        scheduleSave();
        needsRender = true;
        $('backupModal').classList.remove('show');
        toast('Notebook restored from JSON');
      } else {
        toast('Invalid notebook backup file');
      }
    } catch (_) {
      toast('Could not parse backup file');
    }
  };
  reader.readAsText(file);
}

/* ================================================================
   12. PAGES — strip, thumbnails, add / delete / switch
   ================================================================ */
function rebuildStrip() {
  const strip = $('pagestrip');
  strip.innerHTML = '';
  pages.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'pthumb' + (i === state.pageIndex ? ' active' : '');
    if (!p.thumbCanvas) {
      p.thumbCanvas = document.createElement('canvas');
      p.thumbCanvas.width = TH_W * 2;
      p.thumbCanvas.height = TH_H * 2;
    }
    d.appendChild(p.thumbCanvas);
    const n = document.createElement('span');
    n.className = 'pnum';
    n.textContent = i + 1;
    d.appendChild(n);

    // Always show cross button (even when 1 page is open)
    const del = document.createElement('button');
    del.className = 'pdel';
    del.title = pages.length === 1 ? 'Clear this page' : 'Delete page';
    del.innerHTML = X_SVG;
    del.onclick = ev => {
      ev.stopPropagation();
      deleteOrClearPage(i);
    };
    d.appendChild(del);

    d.onclick = () => switchPage(i);
    strip.appendChild(d);
  });
  const add = document.createElement('button');
  add.id = 'addPage';
  add.title = 'Add new page';
  add.innerHTML = PLUS_SVG;
  add.onclick = addPage;
  strip.appendChild(add);
}

function switchPage(i) {
  if (i === state.pageIndex || i < 0 || i >= pages.length) return;
  commitEditor();
  state.pageIndex = i;
  state.selectedIds.clear();
  syncBgSeg();
  updateZoomLabel();
  updateHistoryUI();
  rebuildStrip();
  needsRender = true;
}

function addPage() {
  commitEditor();
  pages.push(newPage(page().bg));
  state.pageIndex = pages.length - 1;
  state.selectedIds.clear();
  rebuildStrip();
  scheduleSave();
  needsRender = true;
  toast(`Page ${pages.length} created`);
}

function deleteOrClearPage(i) {
  commitEditor();
  if (pages.length === 1) {
    // Only 1 page open: clear all objects on it immediately without confirmation
    const cur = pages[0];
    if (cur.objects.length > 0) {
      pushUndo();
      cur.objects = [];
      state.selectedIds.clear();
      scheduleThumb();
      needsRender = true;
      toast('Page cleared — Ctrl+Z to undo');
    } else {
      toast('Page is already empty');
    }
    return;
  }
  // Multiple pages: delete the page immediately without confirmation and save to deletedPagesHistory for Ctrl+Z
  const removed = pages.splice(i, 1)[0];
  deletedPagesHistory.push({ page: removed, index: i, time: Date.now() });
  if (state.pageIndex >= pages.length) state.pageIndex = pages.length - 1;
  state.selectedIds.clear();
  rebuildStrip();
  syncBgSeg();
  updateZoomLabel();
  updateHistoryUI();
  scheduleSave();
  needsRender = true;
  toast('Page deleted — Ctrl+Z to restore');
}

function clearCurrentPage() {
  commitEditor();
  const p = page();
  if (!p.objects.length) { toast('Page is already empty'); return; }
  pushUndo();
  p.objects = [];
  state.selectedIds.clear();
  scheduleThumb();
  needsRender = true;
  toast('Page cleared — Ctrl+Z to undo');
}

function renderThumb(p) {
  if (!p.thumbCanvas) {
    p.thumbCanvas = document.createElement('canvas');
    p.thumbCanvas.width = TH_W * 2;
    p.thumbCanvas.height = TH_H * 2;
  }
  const c = p.thumbCanvas.getContext('2d');
  const b = contentBounds(p.objects);
  let view;
  if (b) {
    const z = clamp(Math.min((TH_W - 14) / Math.max(b.w, 1), (TH_H - 14) / Math.max(b.h, 1)), 0.02, 0.6);
    view = { zoom: z, panX: (TH_W - b.w * z) / 2 - b.x * z, panY: (TH_H - b.h * z) / 2 - b.y * z };
  } else {
    view = { zoom: 0.2, panX: TH_W / 2, panY: TH_H / 2 };
  }
  c.setTransform(2, 0, 0, 2, 0, 0);
  paintBoard(c, TH_W, TH_H, view, p.bg, p.objects, null);
}

function scheduleThumb() {
  page().thumbDirty = true;
  scheduleSave();
}

function thumbSweep() {
  for (const p of pages) {
    if (p.thumbDirty) {
      renderThumb(p);
      p.thumbDirty = false;
    }
  }
}

/* ================================================================
   13. AUTOSAVE & STORAGE GARBAGE COLLECTION
   ================================================================ */
let saveTimer = null, saveBroken = false;

function pruneUnusedImages() {
  const usedImgIds = new Set();
  for (const p of pages) {
    for (const o of p.objects) {
      if (o.type === 'image' && o.imgId) usedImgIds.add(o.imgId);
    }
  }
  for (const id of IMG.keys()) {
    if (!usedImgIds.has(id)) IMG.delete(id);
  }
}

function serializeBoard() {
  pruneUnusedImages();
  return {
    v: 1,
    appVersion: APP_VERSION,
    pageIndex: state.pageIndex,
    pages: pages.map(p => ({ bg: p.bg, view: p.view, objects: p.objects.map(stripCache) })),
    images: [...IMG].map(([id, r]) => [id, r.src]),
  };
}

function scheduleSave() {
  if (saveBroken) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}

function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeBoard()));
    saveBroken = false;
  } catch (e) {
    if (!saveBroken) {
      saveBroken = true;
      toast('Autosave paused — board is too large for local storage');
    }
  }
}
window.addEventListener('beforeunload', saveNow);

function restoreBoard(d) {
  pages.length = 0;
  deletedPagesHistory.length = 0;
  d.pages.forEach(pd => {
    const p = newPage(pd.bg || 'grid');
    p.objects = (pd.objects || []).map(o => { const c = { ...o }; delete c._wrap; return c; });
    if (pd.view) p.view = { zoom: clamp(pd.view.zoom || 1, 0.2, 5),
                            panX: pd.view.panX || 0, panY: pd.view.panY || 0 };
    pages.push(p);
  });
  state.pageIndex = clamp(d.pageIndex | 0, 0, pages.length - 1);
  state.selectedIds.clear();
  (d.images || []).forEach(([id, src]) => {
    const el = new Image();
    el.onload = () => {
      IMG.set(id, { el, src, w: el.naturalWidth, h: el.naturalHeight });
      needsRender = true;
      pages.forEach(p => p.thumbDirty = true);
    };
    el.src = src;
  });
}

function invalidateWrapCaches() {
  pages.forEach(p => p.objects.forEach(o => { delete o._wrap; }));
}

/* ================================================================
   14. UI WIRING & INTERACTION
   ================================================================ */
function buildSwatches() {
  const row = $('swatchRow');
  MARKERS.forEach(col => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.dataset.col = col;
    b.style.background = col;
    b.title = col;
    b.onclick = () => {
      setColor(col);
      const selected = getSelectedObjects();
      if (selected.length) {
        pushUndo();
        selected.forEach(o => { if (o.color) o.color = col; });
        scheduleThumb();
        needsRender = true;
      }
    };
    row.appendChild(b);
  });
}

function setColor(c) {
  state.color = c;
  document.querySelectorAll('#swatchRow .swatch:not(.custom)')
    .forEach(s => s.classList.toggle('active', s.dataset.col === c));
  $('customSw').classList.toggle('active', c === state.custom);
}

function buildNotePalette() {
  NOTES.forEach(col => {
    const b = document.createElement('button');
    b.className = 'nswatch';
    b.dataset.col = col;
    b.style.background = col;
    b.title = 'Note colour';
    b.onclick = () => {
      setNoteColor(col);
      const selected = getSelectedObjects();
      if (selected.length) {
        pushUndo();
        selected.forEach(o => { if (o.type === 'sticky') o.color = col; });
        scheduleThumb();
        needsRender = true;
      }
    };
    $('noteRow').appendChild(b);
  });
}

function setNoteColor(col) {
  state.noteColor = col;
  document.querySelectorAll('.nswatch').forEach(s => s.classList.toggle('active', s.dataset.col === col));
}

function setTool(t) {
  if (state.tool === t) return;
  commitEditor();
  state.tool = t;
  document.querySelectorAll('#toolrail .tbtn[data-tool]')
    .forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  $('eraserRing').style.display = 'none';
  $('laserDot').style.display = 'none';
  refreshContextUI();
}

function refreshContextUI() {
  const t = state.tool;
  const shapeish = ['line', 'rect', 'ellipse', 'arrow'].includes(t);
  const sw  = ['pen', 'highlighter', ...shapeish ? [] : [], 'text'].includes(t) || shapeish;
  const wr  = ['pen', 'highlighter', 'eraser'].includes(t) || shapeish;
  const fr  = t === 'text';
  const nr  = t === 'sticky';
  const fl  = t === 'rect' || t === 'ellipse';
  const show = (id, on) => { $(id).style.display = on ? '' : 'none'; };

  // Contextual width label
  if (t === 'eraser') {
    $('widthLabel').textContent = 'Size';
    $('widthRow').title = 'Eraser size (Scroll mouse wheel to adjust)';
  } else {
    $('widthLabel').textContent = 'Stroke';
    $('widthRow').title = 'Stroke size (Scroll mouse wheel to adjust)';
  }

  show('swatchRow', sw);
  show('widthRow', wr);
  show('fontRow', fr);
  show('noteRow', nr);
  show('fillRow', fl);
  show('ctxGroup', sw || wr || fr || nr || fl);
  canvas.style.cursor = CURSORS[t] || 'default';
  needsRender = true;
}

function syncBgSeg() {
  const bg = page().bg;
  document.querySelectorAll('#bgSeg button').forEach(b => b.classList.toggle('active', b.dataset.bg === bg));
}

function setBg(bg) {
  page().bg = bg;
  syncBgSeg();
  scheduleThumb();
  needsRender = true;
}

/* Modal */
let modalCb = null;
function showConfirm(title, msg, okText, cb) {
  $('modalTitle').textContent = title;
  $('modalMsg').textContent = msg;
  $('modalOk').textContent = okText || 'Confirm';
  modalCb = cb;
  modalOpen = true;
  $('modal').classList.add('show');
}

function closeModal(ok) {
  $('modal').classList.remove('show');
  modalOpen = false;
  const cb = modalCb;
  modalCb = null;
  if (ok && cb) cb();
}

/* Toast */
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* Hint */
function showHint() {
  $('hint').classList.add('show');
  setTimeout(hideHint, 6000);
}
function hideHint() { $('hint').classList.remove('show'); }

/* Help Panel */
function toggleHelp(force) {
  const h = $('helpPanel');
  const on = force !== undefined ? force : !h.classList.contains('show');
  h.classList.toggle('show', on);
}

/* Bind UI Event Handlers */
function bindUI() {
  document.querySelectorAll('#toolrail .tbtn[data-tool]')
    .forEach(b => b.onclick = () => setTool(b.dataset.tool));

  $('undoBtn').onclick = () => { commitEditor(); undo(); };
  $('redoBtn').onclick = () => { commitEditor(); redo(); };

  // Clear button clears board immediately without modal popup!
  $('clearBtn').onclick = clearCurrentPage;

  $('customColor').addEventListener('input', e => {
    state.custom = e.target.value;
    $('customSw').style.setProperty('--cc', e.target.value);
    setColor(e.target.value);
    const selected = getSelectedObjects();
    if (selected.length) {
      pushUndo();
      selected.forEach(o => { if (o.color) o.color = e.target.value; });
      scheduleThumb();
      needsRender = true;
    }
  });

  function updateStrokeSize(val) {
    const min = +$('widthRange').min || 1;
    const max = +$('widthRange').max || 48;
    const clamped = clamp(Math.round(val), min, max);
    state.size = clamped;
    $('widthRange').value = clamped;
    $('widthVal').textContent = clamped;
    const selected = getSelectedObjects();
    if (selected.length) {
      pushUndo();
      selected.forEach(o => { if (o.width !== undefined) o.width = state.size; });
      scheduleThumb();
      needsRender = true;
    }
  }

  $('widthRange').addEventListener('input', e => {
    updateStrokeSize(+e.target.value);
  });

  $('widthRow').addEventListener('wheel', e => {
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    const delta = e.deltaY < 0 ? step : -step;
    updateStrokeSize(state.size + delta);
  }, { passive: false });

  function updateFontSize(val) {
    const clamped = clamp(Math.round(val), 10, 96);
    state.fontSize = clamped;
    $('fontVal').textContent = clamped;
    const selected = getSelectedObjects();
    if (selected.length) {
      pushUndo();
      selected.forEach(o => { if (o.fontSize !== undefined) o.fontSize = state.fontSize; });
      scheduleThumb();
      needsRender = true;
    }
  }

  $('fontMinus').onclick = () => updateFontSize(state.fontSize - 2);
  $('fontPlus').onclick = () => updateFontSize(state.fontSize + 2);

  $('fontRow').addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 2 : -2;
    updateFontSize(state.fontSize + delta);
  }, { passive: false });

  $('fillBtn').onclick = () => {
    state.fill = !state.fill;
    $('fillBtn').classList.toggle('on', state.fill);
    const selected = getSelectedObjects();
    if (selected.length) {
      pushUndo();
      selected.forEach(o => { if (o.fill !== undefined) o.fill = state.fill; });
      scheduleThumb();
      needsRender = true;
    }
  };

  document.querySelectorAll('#bgSeg button').forEach(b => b.onclick = () => setBg(b.dataset.bg));

  $('zoomIn').onclick   = () => { zoomBy(1.25); scheduleSave(); };
  $('zoomOut').onclick  = () => { zoomBy(0.8);  scheduleSave(); };
  $('zoomLabel').onclick = () => { setZoom(1);  scheduleSave(); };
  $('fitBtn').onclick   = () => { fitView();    scheduleSave(); };

  $('exportBtn').onclick = exportPNG;
  $('helpBtn').onclick = () => toggleHelp();

  // Backup & Restore handlers
  $('backupBtn').onclick = () => {
    $('backupModal').classList.add('show');
  };
  $('backupCloseBtn').onclick = () => {
    $('backupModal').classList.remove('show');
  };
  $('backupModal').addEventListener('pointerdown', e => {
    if (e.target === $('backupModal')) $('backupModal').classList.remove('show');
  });
  $('downloadBackupBtn').onclick = exportJSONBackup;
  $('uploadBackupBtn').onclick = () => $('backupInput').click();
  $('backupInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) restoreFromJSONFile(f);
    e.target.value = '';
  });

  $('selFront').onclick = bringSelToFront;
  $('selBack').onclick = sendSelToBack;
  $('selDup').onclick = duplicateSelection;
  $('selDel').onclick = deleteSelection;

  $('modalOk').onclick = () => closeModal(true);
  $('modalCancel').onclick = () => closeModal(false);
  $('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) closeModal(false); });

  $('hint').onclick = hideHint;

  // Version badge click
  const vb = $('versionBadge');
  if (vb) {
    vb.onclick = () => {
      toast(`BrightBoard v${APP_VERSION} — Smart Whiteboard & Notebook`);
    };
  }

  document.addEventListener('pointerdown', e => {
    const h = $('helpPanel');
    if (!h.classList.contains('show')) return;
    if (h.contains(e.target) || $('helpBtn').contains(e.target)) return;
    h.classList.remove('show');
  });

  /* Text editor lifecycle */
  const ta = $('textEditor');
  ta.addEventListener('blur', () => commitEditor());
  ta.addEventListener('input', () => { needsRender = true; });
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); commitEditor(); }
  });
}

/* ================================================================
   15. KEYBOARD SYSTEM
   ================================================================ */
window.addEventListener('keydown', e => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

  if (modalOpen) {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(false); }
    return;
  }
  if ($('backupModal').classList.contains('show')) {
    if (e.key === 'Escape') { e.preventDefault(); $('backupModal').classList.remove('show'); }
    return;
  }
  if (e.code === 'Space') {
    if (e.target === document.body || e.target === canvas) e.preventDefault();
    if (!spaceHeld) { spaceHeld = true; canvas.style.cursor = 'grab'; }
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod) {
    const k = e.key.toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      commitEditor();
      if (e.shiftKey) redo();
      else undo();
    } else if (k === 'y') {
      e.preventDefault();
      commitEditor();
      redo();
    } else if (k === 'd') {
      e.preventDefault();
      commitEditor();
      if (state.selectedIds.size) duplicateSelection();
    } else if (k === 's') {
      e.preventDefault();
      saveNow();
      toast('Board saved');
    } else if (k === 'c') {
      const selected = getSelectedObjects();
      if (selected.length) {
        e.preventDefault();
        clipObjects = selected.map(cloneObj);
        toast(`Copied ${selected.length} object${selected.length > 1 ? 's' : ''} — Ctrl+V to paste`);
      }
    } else if (k === 'a') {
      e.preventDefault();
      // Ctrl+A = Select All objects on this page!
      state.selectedIds = new Set(page().objects.map(o => o.id));
      needsRender = true;
      toast(`Selected all (${page().objects.length} objects)`);
    }
    return;
  }
  if (editing || e.altKey) return;

  if (e.key === 'Shift' && action && action.type === 'rotate') {
    doRotate(lastPtr ? worldFromClient(lastPtr.x, lastPtr.y) : action.startW, e, action);
  }

  const k = e.key.toLowerCase();
  if (TOOLKEYS[k]) {
    e.preventDefault();
    setTool(TOOLKEYS[k]);
    return;
  }

  switch (e.key) {
    case '?':
    case '/':
      e.preventDefault();
      toggleHelp();
      break;
    case "'":
      // Prevent Firefox Quick Find (links only) from opening on canvas
      e.preventDefault();
      break;
    case 'Escape':
      e.preventDefault();
      if ($('helpPanel').classList.contains('show')) toggleHelp(false);
      else { state.selectedIds.clear(); needsRender = true; }
      break;
    case 'Delete':
    case 'Backspace':
      if (state.selectedIds.size) {
        e.preventDefault();
        deleteSelection();
      }
      break;
    case '[':
      if (state.selectedIds.size) {
        e.preventDefault();
        sendSelToBack();
      }
      break;
    case ']':
      if (state.selectedIds.size) {
        e.preventDefault();
        bringSelToFront();
      }
      break;
    case 'ArrowUp':
      if (state.selectedIds.size) { e.preventDefault(); nudge(0, -(e.shiftKey ? 12 : 3) / page().view.zoom); }
      break;
    case 'ArrowDown':
      if (state.selectedIds.size) { e.preventDefault(); nudge(0,  (e.shiftKey ? 12 : 3) / page().view.zoom); }
      break;
    case 'ArrowLeft':
      if (state.selectedIds.size) { e.preventDefault(); nudge(-(e.shiftKey ? 12 : 3) / page().view.zoom, 0); }
      break;
    case 'ArrowRight':
      if (state.selectedIds.size) { e.preventDefault(); nudge( (e.shiftKey ? 12 : 3) / page().view.zoom, 0); }
      break;
    default:
      // Prevent Firefox "Search for text when you start typing" from hijacking canvas hotkeys
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
      }
      break;
  }
});

window.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    spaceHeld = false;
    canvas.style.cursor = CURSORS[state.tool] || 'default';
  }
  if (e.key === 'Shift' && action && action.type === 'rotate') {
    doRotate(lastPtr ? worldFromClient(lastPtr.x, lastPtr.y) : action.startW, e, action);
  }
});

/* ================================================================
   16. BOOTSTRAP
   ================================================================ */
function boot() {
  resizeCanvas();
  buildSwatches();
  buildNotePalette();
  bindUI();

  let restored = false;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.pages) && d.pages.length) {
        restoreBoard(d);
        restored = true;
      }
    }
  } catch (_) {}

  rebuildStrip();
  syncBgSeg();
  setColor(state.color);
  setNoteColor(state.noteColor);
  setTool(state.tool);
  updateHistoryUI();
  updateZoomLabel();

  if (restored) toast('Welcome back — notebook restored');
  else showHint();

  requestAnimationFrame(tick);
  setInterval(thumbSweep, 400);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      invalidateWrapCaches();
      pages.forEach(p => p.thumbDirty = true);
      needsRender = true;
    });
  }
}

boot();
