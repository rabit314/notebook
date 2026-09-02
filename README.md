# 📓 BrightBoard — Smart Whiteboard & Notebook Web App

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-2EA44F?style=for-the-badge&logo=github)](https://rabit314.github.io/notebook/)
[![Version](https://img.shields.io/badge/Version-v1.0.0-E4572E?style=for-the-badge)](https://github.com/rabit314/notebook)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

A blazing-fast, responsive, multi-page vector whiteboard and notebook web application built with pure HTML5 Canvas and vanilla JavaScript. Designed with a warm classroom paper aesthetic (`#FCFAF3`), persimmon accents (`#E4572E`), and zero external framework bloat.

🔗 **Live App**: [https://rabit314.github.io/notebook/](https://rabit314.github.io/notebook/)

---

## 🌟 Key Features

### ✍️ Intelligent Vector Drawing Tools
- **Velocity-Tapered Pen**: Freehand drawing with smooth quadratic Bézier interpolation and speed-dependent stroke tapering for a natural pen-on-paper feel.
- **Multiply-Blend Highlighter**: Authentic fluorescent marker that multiplies underneath black ink, preserving line contrast.
- **Geometric Shapes**: Lines, Rectangles, Ellipses, and Arrows with `Shift`-key aspect ratio lock (perfect squares, circles, and 15° snapped angles) and optional tint fill.
- **Handwritten Sticky Notes**: Warm pastel sticky notes (Caveat font) with automatic multi-paragraph word wrapping, custom color palettes, and inline editing.
- **Inline Text Boxes**: Direct typographic annotation (Nunito font) with adjustable font sizes and real-time canvas alignment.
- **Continuous Sweep Eraser**: Swept-circle path collision algorithm that instantly erases entire strokes and objects without leaving jagged artifacts.
- **Laser Pointer**: Luminous, self-decaying (750ms trail) red laser for lectures, meetings, presentations, and screen sharing.

### 📄 Multi-Page Notebook System
- **Real-Time Asynchronous Thumbnails**: Dedicated off-screen thumbnail canvases with dirty-region scheduling for zero-lag page management.
- **Page Management**: Add, switch, and delete pages with safety confirmation.
- **Independent Page Backgrounds**: Choose between **Blank**, **Dotted Grid**, **Square Grid**, and **Ruled Lines** on a per-page basis.

### 🎯 Object Manipulation & Inspection
- **Universal Corner Resizing**: Proportional, uniform scaling from opposite anchor corners across all object types (strokes, shapes, text, sticky notes, images).
- **Selection Toolbar**: Quick Layering (**Bring to Front** / **Send to Back**), **Duplicate** (`Ctrl+D`), and **Delete**.
- **Live Toolbar Sync**: Selecting an object dynamically updates toolbar swatches, stroke sliders, and font pickers; tweaking controls updates the selected object in real time!
- **Keyboard Nudging**: Arrow keys nudge selected items by 3px (`Shift` + Arrow for 12px jumps).

### 📋 Universal Clipboard & Media Import
- **Internal Object Copy/Paste**: `Ctrl+C` and `Ctrl+V` clone any element with automatic offset.
- **System Clipboard Paste**: Direct pasting of screenshots/images or external text from your operating system clipboard directly onto the canvas.
- **Drag & Drop**: Drop image files (`.png`, `.jpg`, `.webp`, `.svg`) directly onto the board.

### 💾 Autosave, Export & Portable JSON Backup
- **Automatic Persistence**: Debounced `localStorage` autosave with automatic orphaned image garbage collection.
- **2× High-Resolution PNG Export**: One-click raster export cropped tightly to content bounding box.
- **JSON Backup & Restore**: Export your entire notebook as a `.json` backup file or import existing backups across devices.

### 🏷️ Discreet Version Badge
- **Location**: Pinned in the **bottom-right corner** (`v1.0.0`) with a translucent glassmorphic backdrop. Clicking displays version and status information.

---

## ⌨️ Keyboard Shortcuts Reference

| Key / Shortcut | Tool / Action | Description |
|---|---|---|
| <kbd>V</kbd> | **Select Tool** | Move, select, and resize objects |
| <kbd>P</kbd> | **Pen** | Natural velocity-tapered handwriting |
| <kbd>H</kbd> | **Highlighter** | Semi-transparent text marker |
| <kbd>E</kbd> | **Eraser** | Swept-circle object eraser |
| <kbd>L</kbd> | **Line** | Straight vector line |
| <kbd>R</kbd> | **Rectangle** | Rectangle (Hold <kbd>Shift</kbd> for square) |
| <kbd>O</kbd> | **Ellipse** | Ellipse (Hold <kbd>Shift</kbd> for circle) |
| <kbd>A</kbd> | **Arrow** | Vector arrow with directional head |
| <kbd>T</kbd> | **Text** | Place editable text box |
| <kbd>N</kbd> | **Sticky Note** | Place sticky note |
| <kbd>K</kbd> | **Laser Pointer** | Glowing laser trail for presentations |
| <kbd>Space</kbd> *(hold)* | **Pan Canvas** | Pan the canvas with any active tool |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | **Undo** | Undo last canvas action |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | **Redo** | Redo last canvas action |
| <kbd>Ctrl</kbd> + <kbd>C</kbd> | **Copy** | Copy selected object to clipboard |
| <kbd>Ctrl</kbd> + <kbd>V</kbd> | **Paste** | Paste copied object, image, or text |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | **Duplicate** | Duplicate current selection |
| <kbd>Alt</kbd> + Drag | **Quick Duplicate** | Clone object while moving |
| <kbd>[</kbd> / <kbd>]</kbd> | **Z-Order** | Send to Back / Bring to Front |
| <kbd>Arrow Keys</kbd> | **Nudge** | Move selection (Hold <kbd>Shift</kbd> for 4× step) |
| <kbd>Del</kbd> / <kbd>Backspace</kbd> | **Delete** | Remove selected object |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | **Manual Save** | Immediately trigger local storage save |
| <kbd>?</kbd> | **Help** | Toggle shortcut cheat sheet |
| <kbd>Esc</kbd> | **Deselect / Cancel** | Deselect active object or dismiss modal |

---

## 🏗️ Project Architecture

```
notebook/
├── index.html         # Semantic HTML5 entry point & UI overlays
├── css/
│   └── style.css      # Warm classroom design system & responsive media queries
├── js/
│   └── app.js         # Complete vector canvas engine, multi-page controller, & state
├── .gitignore         # Git ignore configuration
├── LICENSE            # MIT License
└── README.md          # Project documentation
```

### Key Technical Details
1. **DPI-Aware Canvas Rendering**: Automatic adjustment for device pixel ratios (`window.devicePixelRatio`) ensures sharp lines on Retina and 4K displays.
2. **Transform Pipeline**: Unified `worldFromClient` and `paintBoard` matrix transforms for smooth multi-touch pinch-to-zoom and panning.
3. **Dirty-Region Thumbnail Sweeper**: Asynchronous `setInterval` sweep renders only dirty thumbnails every 400ms, preserving 60 FPS drawing responsiveness.
4. **Resilient Icon Mounting**: Deferred Lucide icon initialization with multi-stage retry queues and fallback glyph rendering.

---

## 🚀 Local Development

No Node build tools or heavy dependencies required!

### Option 1: Python Built-in Server
```bash
# Python 3
python -m http.server 8080
```
Visit `http://localhost:8080` in your browser.

### Option 2: Node.js `npx serve`
```bash
npx serve .
```

### Option 3: Direct File Opening
Double-click `index.html` to open in any browser directly.

---

## 🌐 GitHub Pages Deployment

This repository is pre-configured for instant zero-config deployment to GitHub Pages:

1. Go to your repository **Settings** ➔ **Pages**.
2. Under **Build and deployment** ➔ **Source**, select **Deploy from a branch**.
3. Choose `main` as branch and `/ (root)` as folder, then click **Save**.
4. Your whiteboard app will be live at:
   **`https://rabit314.github.io/notebook/`**

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
