# 📓 BrightBoard — Smart Whiteboard & Notebook Web App

![Version](https://img.shields.io/badge/version-1.0.0-E4572E?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![HTML5](https://img.shields.io/badge/HTML5-Canvas-orange?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?style=flat-square)

A blazing-fast, elegant, multi-page vector whiteboard and digital notebook web application built with pure HTML5 Canvas and vanilla JavaScript. Features a warm classroom paper theme, infinite pan & zoom, rich drawing tools, sticky notes, laser pointer, real-time page thumbnails, localStorage persistence, and 2× high-resolution PNG export.

---

## ✨ Features

- ✍️ **Rich Vector Drawing Tools**:
  - **Smooth Pen**: Speed-tapered bezier curves for natural handwriting.
  - **Highlighter**: Semi-transparent multiply blend mode for clean text highlighting.
  - **Geometric Shapes**: Lines, Rectangles, Ellipses, and Arrows with Shift-to-snap angle/aspect ratio constraints.
  - **Text Tool**: Dynamic inline text editor with custom sizing and color.
  - **Sticky Notes**: Handwritten pastel notes (Caveat font) with automatic word wrapping and custom palette.
  - **Object Eraser**: Continuous sweep path collision detection for instant stroke & object removal.
  - **Laser Pointer**: Glowing, fading laser trail (750ms decay) for presentations and lectures.
- 🔍 **Infinite Canvas & Viewport**:
  - Smooth pan (`Space` + drag, middle/right mouse drag).
  - Smooth zoom (`Ctrl` + Wheel, Zoom In/Out buttons, pinch-to-zoom on touch screens).
  - 1-click **Reset to 100%** and **Fit Content to Screen**.
- 📄 **Multi-Page Notebook System**:
  - Real-time thumbnail previews with asynchronous dirty tracking.
  - Add, switch, and delete pages with safety confirmation.
  - Individual background grid types per page: **Blank**, **Dotted**, **Grid**, **Ruled**.
- 🎯 **Object Selection & Manipulation**:
  - 4-corner bounding box with uniform proportional scaling.
  - Move, Nudge with arrow keys (`Shift` for 4× steps).
  - Duplicate (`Ctrl+D` or `Alt`+drag).
  - Layer ordering: Bring to Front (`]`), Send to Back (`[`).
  - Delete with `Del` or `Backspace`.
- 📋 **Universal Clipboard & Media**:
  - Copy and paste objects within the board (`Ctrl+C`, `Ctrl+V`).
  - Direct paste of images from system clipboard or file explorer.
  - Direct paste of external text into automatic text blocks.
  - Drag-and-drop image file import.
- 💾 **Autosave & Export**:
  - Debounced `localStorage` autosave with automatic orphaned image cleanup.
  - Clean state restoration on browser reload.
  - 2× High-Resolution PNG export cropped directly to content bounding box.
- 🏷️ **Version Badge**:
  - Discrete, glassmorphic version indicator (`v1.0.0`) pinned in the bottom-right corner.

---

## ⌨️ Keyboard Shortcuts

| Key / Combination | Action |
|---|---|
| `V` | Select / Move Tool |
| `P` | Freehand Pen |
| `H` | Highlighter |
| `E` | Object Eraser |
| `L` | Straight Line |
| `R` | Rectangle (Hold `Shift` for square) |
| `O` | Ellipse (Hold `Shift` for circle) |
| `A` | Arrow |
| `T` | Text Box |
| `N` | Sticky Note |
| `K` | Laser Pointer |
| `Space` (Hold) | Pan canvas with any tool |
| `Ctrl` + `Z` / `Ctrl` + `Shift` + `Z` | Undo / Redo |
| `Ctrl` + `Y` | Redo |
| `Ctrl` + `C` / `Ctrl` + `V` | Copy / Paste object or text |
| `Ctrl` + `D` | Duplicate selection |
| `Alt` + Drag | Quick duplicate while moving |
| `[` / `]` | Send to Back / Bring to Front |
| `Arrow Keys` | Nudge selection (Hold `Shift` for bigger steps) |
| `Del` / `Backspace` | Delete selected object |
| `Ctrl` + `S` | Manual save to browser storage |
| `?` | Toggle shortcuts & help panel |
| `Esc` | Deselect object / close dialog / dismiss text editor |

---

## 🚀 Getting Started

### Run Locally

No build step, bundler, or dependencies required! Simply open `index.html` in any modern web browser or serve locally:

```bash
# Option 1: Python 3
python -m http.server 8080

# Option 2: Node.js (npx serve)
npx serve .

# Option 3: VS Code Live Server
# Right-click index.html -> "Open with Live Server"
```

Open `http://localhost:8080` in your browser.

---

## 🌐 Deploy to GitHub Pages

1. Push this repository to GitHub:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git branch -M main
   git push -u origin main
   ```
2. In your GitHub repository, navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, select **Deploy from a branch**.
4. Choose the `main` branch and `/ (root)` directory, then click **Save**.
5. Your notebook web app will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO/` within seconds!

---

## 📁 Project Structure

```
NoteBook/
├── index.html         # Main web application entry point
├── css/
│   └── style.css      # Warm classroom theme & glassmorphic styling
├── js/
│   └── app.js         # Core whiteboard & notebook engine
├── .gitignore         # Git ignore rules
└── README.md          # Documentation & shortcut guide
```

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
