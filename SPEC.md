# Product Specification: BPMN Editor with Miro-Grade Object Flexibility

**Version:** 1.0 (living document)
**Date:** 2026-05-26
**Status:** v1 implemented and running — this document reflects the current codebase
**Baseline:** `bpmn-js-app/` (Vite + `bpmn-js` v17 Modeler)
**Source repo:** https://github.com/haripeddi/BPMN
**Dev server:** `npm install && npm run dev` → http://localhost:5173

---

## 1. Executive summary

The editor combines **`bpmn-js`** (standards-compliant BPMN 2.0 modeling) with a custom **MFlex layer** that adds Miro-like visual flexibility. Every canvas element can be styled, resized, and arranged freely — without breaking the underlying BPMN semantics or XML interchange format.

**v1 delivered:**

| Capability | Status |
|------------|--------|
| Left shape panel — categorised shapes, sticky notes, click-to-place | ✅ Done |
| Dynamic context toolbar (per element-type controls) | ✅ Done |
| Custom fill, text color, font, border controls | ✅ Done |
| Sticky notes with colored backgrounds | ✅ Done |
| TextAnnotation rendered as clean text box (no bracket) | ✅ Done |
| Swimlane (Participant/Lane) text horizontal by default | ✅ Done |
| Custom resize handles (white square Miro-style) | ✅ Done |
| Free move / free text insertion anywhere | ✅ Done |
| Copy / paste via keyboard shortcuts | ✅ Done |
| Style persistence in `.bpmn` XML via `mflex:Style` extension | ✅ Done |
| SubProcess collapse/expand toggle | ✅ Done |
| Clean selection visuals (no default blue outlines/spots) | ✅ Done |

**Planned for v2:**

| Capability | Priority |
|------------|----------|
| Fill opacity slider | P1 |
| Format painter (copy style → paste style) | P1 |
| Right inspector panel (advanced BPMN properties) | P1 |
| Compact presentation mode for tasks/gateways | P2 |
| Partial text selection formatting | P2 |
| Export/import warning for viewers without mflex extension | P2 |

---

## 2. Problem statement (observed gaps — all resolved in v1)

| # | User observation | Root cause in OSS stack | Resolution in v1 |
|---|------------------|-------------------------|------------------|
| G1 | Objects aren't flexible | `bpmn-js` resize limited by BPMN DI rules | Custom `MflexResizeRules` + `MflexResizeHandles` override default rules; all main element types freely resizable |
| G2 | No custom fill/text colors | Colors not exposed in default UI | MFlex Context Toolbar exposes fill/text/border pickers with preset palette + hex input |
| G3 | Can't maximize/minimize objects | Only SubProcess supports collapse | Collapse toggle added to Context Toolbar for SubProcess; zoom-to-fit via toolbar |
| G4 | No font types | Default `textRenderer` is global | Per-element `fontFamily`, `fontSize`, bold/italic/underline via `StyleApplier` + SVG patching |
| G5 | Need to drag shapes from palette | bpmn-js default is drag-to-place | **Click-to-place**: click panel item → shape ghost follows cursor → click canvas to drop |
| G6 | Swimlane text appears vertical | bpmn-js default: pool labels rotated 270° | `StyleApplier._applyTextDirection` strips rotation, recentres in 30px header strip |
| G7 | No sticky notes | Not a BPMN concept | Implemented using `bpmn:TextAnnotation` + `stickyFill` attribute; colored, rounded, bracket-hidden |
| G8 | Blue selection handles/spots visible | Default `.djs-resizer` + `.djs-outline` CSS | CSS overrides hide default handles; custom white `mflex-rh` handles added |

**Design principle:** Close the *experience* gap with Miro without abandoning BPMN. Where BPMN forbids a visual (e.g. arbitrary rotation of a Start Event), the UI disables the control.

---

## 3. Goals and non-goals

### 3.1 Goals (v1 — all achieved)

1. **Per-element styling** for all modeled BPMN shapes, connections, and labels.
2. **Miro-style context toolbar** appearing on selection, with color, typography, alignment, border, and size controls.
3. **Left shape panel** with categorised shapes and one-click placement.
4. **Sticky notes** anywhere on the canvas, with coloured backgrounds.
5. **Persistent styling** in `.bpmn` files via `mflex:Style` extension element.
6. **Resize and dimension control** with custom handles and numeric inputs.
7. **Collapse / expand** for SubProcesses; zoom to selection.
8. **Free text insertion** anywhere on the canvas.
9. **Copy / paste** via Ctrl/Cmd+C / Ctrl/Cmd+V.
10. **Zero regression** on existing bpmn-js toolbar (New, Open, Save, Undo/Redo).

### 3.2 Non-goals (v1)

- ~~Freeform non-BPMN sticky notes~~ *(now IN scope — implemented via TextAnnotation + stickyFill)*
- Real-time multi-user cursors.
- Full rich-text HTML inside labels.
- Camunda/Zeebe execution properties.
- Copy/paste buttons in the context toolbar *(user removed; keyboard shortcuts only)*.

---

## 4. Reference: Miro object model (target UX)

| Style property | Applies to | v1 status |
|----------------|------------|-----------|
| `fillColor` | Shapes, stickies | ✅ Via `modeling.setColor` + `stickyFill` |
| `color` (text) | Text, shapes | ✅ `textColor` in `mflex:Style` |
| `fontFamily`, `fontSize` | Text, shapes | ✅ |
| `textAlign` | Text, shapes | ✅ |
| `bold`, `italic`, `underline` | Text | ✅ |
| `borderWidth`, `borderColor` | Shapes | ✅ `borderWidth`; `borderColor` in schema, UI pending |
| `width`, `height` | Shapes | ✅ Resize handles + numeric inputs |
| `fillOpacity` | Shapes | 📋 Schema ready, UI slider pending v2 |

**Miro interaction patterns implemented:**

- **Selection → context toolbar** anchored 20px above selection bounding box.
- **Drag handles** — 8 white-square handles on selection bbox (mflex-rh).
- **Click-to-place** from panel (vs. Miro's drag — ours is superior for keyboard users).
- **Sticky notes** with background colors matching Miro's note palette.

---

## 5. Technical baseline

**Stack:**

| Layer | Technology |
|-------|-----------|
| Bundler | Vite 5 |
| BPMN library | bpmn-js v17.11.1 |
| Diagramming core | diagram-js (bundled in bpmn-js) |
| BPMN model | moddle + bpmn-moddle |
| Custom extension | mflex moddle descriptor |

**Key `bpmn-js` extension points used:**

| Capability | Mechanism |
|------------|-----------|
| Fill/stroke colors | `modeling.setColor(elements, { stroke, fill })` |
| Per-element typography/style | Direct SVG mutation via `canvas.getGraphics(element)` |
| Custom resize behavior | `MflexResizeRules` via `additionalModules` |
| Shape creation from panel | `create.start(clickEvent, shape)` — native palette mechanism |
| Style persistence | `mflex:Style` in `extensionElements`, persisted on `saveXML` |
| Style restoration | `import.done` event → `_loadFromModdle` → `_reapplyAll` |
| Re-apply after re-render | `element.changed` + `shape.added` events with `setTimeout(fn, 30)` |

---

## 6. MFlex layer architecture

```
bpmn-js-app/
  src/
    main.js                        # BpmnModeler init + MFlex bootstrap
    style.css                      # Global canvas styles
    mflex/
      index.js                     # Module exports + initMflex()
      moddle/
        mflex.json                 # mflex:Style moddle descriptor
      features/
        style-applier/
          index.js                 # In-memory style Map + SVG patching + moddle persistence
        context-toolbar/
          index.js                 # Dynamic toolbar (selection-driven groups)
        shape-panel/
          index.js                 # Left sidebar: sections, items, click-to-place
        resize/
          index.js                 # MflexResizeHandles + MflexResizeRules
        free-interaction/
          index.js                 # MflexMoveRules, MflexFreeText, MflexCopyPaste
        custom-renderer/
          index.js                 # MflexRenderer (additionalModules)
      styles/
        context-toolbar.css
        resize-handles.css
        shape-panel.css
  index.html
  package.json
  vite.config.js (if present)
  SPEC.md
  .gitignore                       # node_modules/, dist/, .vite excluded
```

**Module registration in `main.js`:**

```javascript
import MflexModule from './mflex/index.js';
import mflexDescriptor from './mflex/moddle/mflex.json';
import { initMflex } from './mflex/index.js';

const modeler = new BpmnModeler({
  container: '#canvas',
  additionalModules: [MflexModule],
  moddleExtensions: { mflex: mflexDescriptor },
});

const { applier, toolbar, shapePanel } = initMflex(modeler);
window.__mflex = { applier, toolbar, shapePanel };
```

---

## 7. Shape Panel (implemented)

The left-hand panel provides Miro-style one-click shape insertion, organised in collapsible sections.

### 7.1 Sections and items

| Section | Items | Open by default |
|---------|-------|-----------------|
| **Sticky Notes** | Yellow, Green, Blue, Pink, Purple, Orange | ✅ Yes |
| **Basic Shapes** | Rectangle, Rounded Rect, Circle, Oval, Diamond, Triangle, Parallelogram, Cylinder/DB, Hexagon, Text Box, Note, Arrow | ✅ Yes |
| **Flowchart** | Start/End, Process, Decision, Terminator, Data, Database, Annotation, Pool | ✅ Yes |
| **BPMN Tasks** | Generic, User, Service, Send, Receive, Manual, Script, Business Rule, Sub-Process, Call Activity | No |
| **BPMN Events** | Start, Timer/Message/Signal/Cond Start, Interm. Catch/Throw, End, Message/Error/Terminate End | No |
| **BPMN Gateways** | Exclusive, Inclusive, Parallel, Event-Based, Complex | No |
| **Swimlanes** | Pool / Lane | No |
| **Data & Artifacts** | Data Object, Data Store, Group, Annotation | No |

Panel also includes a **search / filter** input that filters items across all sections in real time.

### 7.2 Click-to-place interaction

1. User clicks a panel item.
2. `create.start(clickEvent, shape)` is called — same mechanism as bpmn-js's own palette.
3. A ghost shape follows the cursor across the canvas.
4. User clicks anywhere on the canvas → shape is placed centered at that point.
5. Press `Escape` at any time to cancel.

**Sticky note fill:** Before `create.start`, the shape's `businessObject.__mflexStickyFill` is set to the note's fill color. `StyleApplier.shape.added` reads this flag, stores the color in `_styles`, and calls `_applyAnnotationStyle` after a 30ms delay (allowing bpmn-js to finish rendering first).

---

## 8. Sticky Notes (implemented)

Sticky notes use `bpmn:TextAnnotation` as the underlying BPMN element. The default bracket rendering is replaced with a clean colored box.

### 8.1 Available colors

| Label | Fill | Border |
|-------|------|--------|
| Yellow | `#fef9c3` | `#ca8a04` |
| Green | `#dcfce7` | `#16a34a` |
| Blue | `#dbeafe` | `#2563eb` |
| Pink | `#fce7f3` | `#db2777` |
| Purple | `#f3e8ff` | `#9333ea` |
| Orange | `#ffedd5` | `#ea580c` |

### 8.2 Rendering approach

`StyleApplier._applyAnnotationStyle(element, fillColor, gfx)`:

1. Hides all `<path>` elements in `.djs-visual` (removes the BPMN bracket).
2. Finds or creates a `<rect class="mflex-bg">` covering the full element bounds.
3. If `stickyFill` is set: applies fill color + `rx/ry: 5` (rounded corners), no stroke.
4. If no fill: renders as a clean text box — white background, `#9ca3af` border, `rx/ry: 4`.
5. Both `setAttribute` and `style.fill` are set to ensure CSS does not override.

This method is called on `shape.added`, `element.changed`, and directly from `setStyle`.

### 8.3 Plain TextAnnotation (Text Box)

All `bpmn:TextAnnotation` elements (even without `stickyFill`) receive the clean-box treatment — white background, subtle gray border, bracket hidden. This provides a usable "text box" primitive.

---

## 9. Context Toolbar (implemented)

### 9.1 Placement

- Appears **20px above** the selection bounding box, centered horizontally.
- Flips below if clipped by the top edge or the topbar (48px height).
- Hidden during direct text editing (`directEditing.activate` event).
- Re-shown on `directEditing.complete` / `directEditing.cancel`.

### 9.2 Control groups — per element type

| Element category | Visible groups |
|-----------------|----------------|
| **Label / external label** | Text color, Font family, Font size, Emphasis (B/I/U), Align |
| **Connection** (SequenceFlow etc.) | Border color, Border width |
| **Participant / Lane** | Fill, Border, Border width, Size, Add Lane, Text direction toggle |
| **SubProcess / CallActivity** | Fill, Text color, Font, Font size, Emphasis, Align, Border, Border width, Size, Collapse toggle |
| **Task** (all variants) | Fill, Text color, Font, Font size, Emphasis, Align, Border, Border width, Size |
| **Event** | Fill, Border, Border width, Size |
| **Gateway** | Fill, Border, Border width, Size |
| **TextAnnotation** | Text color, Font, Font size, Emphasis, Align, Border, Border width, Size |
| **Data** (Object / Store) | Fill, Border, Border width, Size |
| **Group** | Fill, Border, Border width, Size |

### 9.3 Fill / color controls

- **20-color preset palette** (whites, pastels, darks, blacks).
- **Hex input** field for exact values.
- Preset palette includes sticky-note colors for quick sticky tinting.
- Fill applied via `modeling.setColor` (bpmn-js standard — persisted in BPMN DI).

### 9.4 Typography controls

- **Font family** dropdown: Arial, Helvetica, Inter, Roboto, Georgia, Times New Roman, Courier New, Verdana, Tahoma.
- **Font size** selector: 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48 px + free numeric input.
- **Bold / Italic / Underline** toggle buttons.
- **Horizontal align**: Left / Center / Right.
- Applied via `StyleApplier.setStyle` → direct SVG text mutation → persisted in `mflex:Style`.

### 9.5 Border controls

- **Border width**: 1 / 2 / 3 / 4 px presets.
- Applied via `StyleApplier.setStyle` → SVG `stroke-width` mutation.

### 9.6 Size controls

- **Width** and **Height** numeric inputs (px).
- Applied via `modeling.resizeShape`.

### 9.7 Swimlane-specific controls

- **Add Lane** button: adds a sub-lane via `modeling.addLane`.
- **Text direction** toggle: cycles between Horizontal / Vertical.

### 9.8 Collapse control (SubProcess)

- Toggle button: Collapse ↔ Expand.
- Uses `modeling.toggleCollapse(element)`.

### 9.9 Intentionally excluded from toolbar

- Copy / Paste buttons (removed per user request — keyboard shortcuts only: Ctrl/Cmd+C / V).

---

## 10. Moddle extension schema

Namespace prefix: **`mflex`**
URI: `http://mflex/1.0`

### 10.1 mflex:Style attributes

```xml
<bpmn2:task id="Task_1" name="Review">
  <bpmn2:extensionElements>
    <mflex:style
      fontFamily="Inter"
      fontSize="14"
      textColor="#1a1a1a"
      textAlign="center"
      bold="false"
      italic="false"
      underline="false"
      borderWidth="2"
      textDirection="horizontal"
      stickyFill="#fef9c3"
    />
  </bpmn2:extensionElements>
</bpmn2:task>
```

| Attribute | Type | Status | Notes |
|-----------|------|--------|-------|
| `fontFamily` | String | ✅ Implemented | Font name |
| `fontSize` | Integer | ✅ Implemented | px |
| `textColor` | String | ✅ Implemented | hex |
| `textAlign` | String | ✅ Implemented | `left` / `center` / `right` |
| `textAlignVertical` | String | 📋 Schema only | `top` / `middle` / `bottom` — UI pending |
| `fillOpacity` | Real | 📋 Schema only | 0–1 — UI slider pending |
| `borderColor` | String | 📋 Schema only | hex — UI pending |
| `borderWidth` | Integer | ✅ Implemented | px |
| `bold` | Boolean | ✅ Implemented | |
| `italic` | Boolean | ✅ Implemented | |
| `underline` | Boolean | ✅ Implemented | |
| `compact` | Boolean | 📋 Schema only | presentation-only compact mode — pending |
| `textDirection` | String | ✅ Implemented | `horizontal` / `vertical` (Participant/Lane) |
| `stickyFill` | String | ✅ Implemented | hex fill for TextAnnotation sticky notes |

**Colors (fill/stroke):** Stored as BPMN in Color DI attributes (`bioc:fill`, `bioc:stroke`) via `modeling.setColor` — these are NOT in `mflex:Style`. The `mflex:Style` element only holds properties not covered by the standard.

---

## 11. StyleApplier — implementation detail

`src/mflex/features/style-applier/index.js`

### 11.1 In-memory store

`this._styles: Map<elementId, StyleObject>` — holds live styles for immediate rendering, decoupled from moddle round-trips during editing.

### 11.2 Event hooks

| Event | Action |
|-------|--------|
| `element.changed` | `setTimeout(() => _applyToSvg(element), 30)` — re-applies after every bpmn-js re-render |
| `element.changed` (TextAnnotation) | `setTimeout(() => _applyAnnotationStyle(element), 30)` |
| `element.changed` (label of Participant/Lane) | Re-applies parent's `textDirection` |
| `shape.added` | Sets default `textDirection: 'horizontal'` for Participant/Lane; picks up `__mflexStickyFill` flag for sticky notes; schedules annotation style + text direction with `setTimeout(fn, 30)` |
| `import.done` | `_loadFromModdle()` → `_reapplyAll()` |

**Why `setTimeout(fn, 30)` instead of `requestAnimationFrame`:** bpmn-js sometimes fires additional synchronous re-renders after its own `element.changed` handler. A 30ms delay ensures our SVG patch runs after all bpmn-js rendering is complete for that event cycle.

### 11.3 Public API

```javascript
applier.setStyle(elements, attrs)    // Set mflex style attributes
applier.getStyle(element)            // Read mflex style for element
applier.setColor(elements, {fill, stroke})  // Delegate to modeling.setColor
applier.getColor(element)            // Read fill/stroke from BPMN DI
applier.supports(element, control)  // Check if element supports a control
applier.persistToModdle()           // Called before saveXML
```

---

## 12. Swimlane text direction (implemented)

bpmn-js renders Pool/Lane names with `transform="translate(0, H) rotate(270)"` on a `<g>` inside `.djs-visual` — always rotated, by design.

**Our override (`_applyTextDirection`):**

1. Finds `<g transform="... rotate(...)">` elements inside `.djs-visual`.
2. Strips the `rotate(...)` part, leaving `translate(...)` intact.
3. Repositions the inner `<text>` to `x=15, y=height/2` (centered in the 30px header strip).
4. Sets `text-anchor: middle`, `dominant-baseline: middle`.
5. Removes per-`<tspan>` x/y/dy offsets.

Re-applied on every `element.changed` (via `setTimeout`) so it survives any bpmn-js re-render triggered by text edits, resizes, or moves.

Default `textDirection: 'horizontal'` is set automatically in `_styles` when a Participant or Lane is added to the canvas.

---

## 13. Element capability matrix

| Element | Fill | Text color | Font | Border | Resize | Collapse | Sticky fill |
|---------|------|------------|------|--------|--------|----------|-------------|
| Start / End / Intermediate Event | ● | — | — | ● | ● (uniform) | N/A | N/A |
| Task (all variants) | ● | ● | ● | ● | ● | N/A | N/A |
| SubProcess | ● | ● | ● | ● | ● | ● | N/A |
| Call Activity | ● | ● | ● | ● | ● | ● | N/A |
| Gateway | ● | — | — | ● | ● | N/A | N/A |
| Pool / Participant | ● | — | — | ● | ● | N/A | N/A |
| Lane | ● | — | — | ● | ● | N/A | N/A |
| TextAnnotation | ● (white box) | ● | ● | ● | ● | N/A | ● |
| Group | ● | — | — | ● | ● | N/A | N/A |
| DataObject / DataStore | ● | — | — | ● | ● | N/A | N/A |
| SequenceFlow / Connection | — | — | — | ● (line) | N/A | N/A | N/A |
| Label (external) | — | ● | ● | — | N/A | N/A | N/A |

Legend: ● = supported, — = not applicable / disabled

---

## 14. Free interaction module (implemented)

`src/mflex/features/free-interaction/index.js` exports three diagram-js modules:

| Class | Role |
|-------|------|
| `MflexMoveRules` | Overrides move rules to allow free repositioning of all elements including items inside pools/lanes |
| `MflexFreeText` | Allows double-clicking on empty canvas to insert a `bpmn:TextAnnotation` (free text box) at that position |
| `MflexCopyPaste` | Keyboard copy/paste (Ctrl/Cmd+C, Ctrl/Cmd+V) for selected elements |

---

## 15. Resize module (implemented)

`src/mflex/features/resize/index.js` exports two diagram-js modules:

| Module | Role |
|--------|------|
| `MflexResizeHandles` | Replaces default `.djs-resizer` with 8 white square corner/edge handles (`mflex-rh` elements) |
| `MflexResizeRules` | Overrides `ResizeBehavior` to allow resizing of element types that bpmn-js locks by default |

**Handle appearance:** White squares (`#ffffff`), 8×8px, `border: 1.5px solid #9ca3af`, `border-radius: 2px`, pointer cursor.
**Selected state:** Blue fill (`#3b82f6`), white border.

---

## 16. User stories and acceptance status

### US-01 — Color a task
**As a** modeler, **I want** to set background and text colors on a task.
- ✅ Select task → fill swatch in toolbar → choose color → immediate update.
- ✅ Save BPMN → reopen → color preserved via BPMN in Color DI.
- ✅ Undo reverts color.

### US-02 — Change font on a label
**As a** modeler, **I want** Arial 16px bold on a gateway or task name.
- ✅ Font family and size apply immediately.
- ✅ Exported XML contains `mflex:style` attributes.
- ✅ Round-trip does not lose element type.

### US-03 — Resize and collapse subprocess
**As a** modeler, **I want** to shrink a subprocess and collapse it.
- ✅ Resize handles change bounds.
- ✅ Collapse toggle sets `isExpanded=false`.
- ✅ Drilldown opens child plane; breadcrumb returns to parent.

### US-04 — Place a sticky note
**As a** workshop facilitator, **I want** to drop colored sticky notes anywhere on the canvas.
- ✅ Click sticky note color in panel → ghost follows cursor → click canvas to place.
- ✅ Correct fill color applied; bracket hidden; clean rounded box.
- ✅ Double-click to type inside.

### US-05 — Swimlane horizontal text
**As a** modeler, **I want** pool/lane names to read horizontally (not rotated).
- ✅ New pools/lanes default to horizontal text.
- ✅ Text direction toggle in toolbar switches between Horizontal / Vertical.
- ✅ Survives text edits and re-renders.

### US-06 — Free text anywhere
**As a** modeler, **I want** to double-click the empty canvas to add a text annotation.
- ✅ Double-click on empty canvas creates a TextAnnotation at that position.

### US-07 — Copy and paste
**As a** modeler, **I want** to copy elements and paste them.
- ✅ Ctrl/Cmd+C copies selection; Ctrl/Cmd+V pastes near original position.
- ✅ Copy/paste buttons removed from toolbar (keyboard only).

---

## 17. Persistence and interchange

| Requirement | Status |
|-------------|--------|
| Save/load `.bpmn` includes `mflex:` attributes | ✅ `persistToModdle()` called before `saveXML` |
| Save/load `.bpmn` includes fill/stroke (BPMN in Color) | ✅ Stored by bpmn-js automatically |
| Import from standard BPMN 2.0 renders with defaults | ✅ `import.done` → `_loadFromModdle` → `_reapplyAll` |
| mflex extension URI documented | ✅ `http://mflex/1.0` (final URI TBD for production) |

---

## 18. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| bpmn-js re-render overwrites SVG patches | High | All patches re-applied on `element.changed` + `shape.added` via `setTimeout(fn, 30)` |
| `stickyFill` lost across save/load | Medium | `stickyFill` added to `STYLE_ATTRS` list → persisted to moddle on save, reloaded on import |
| Swimlane text direction reverts on edit | Medium | `element.changed` on the label element re-applies parent's `textDirection` |
| BPMN validation rejects custom XML | Low | Uses `extensionElements` + documented namespace; standard `bioc:` for colors |
| Performance on large diagrams (many element.changed) | Medium | `setTimeout` batching; no synchronous style recalculation |

---

## 19. Resolved design decisions

| Question | Decision |
|----------|----------|
| Extension URI | `http://mflex/1.0` (update to company-owned URI before production) |
| Default canvas color | White (`#ffffff`) — matching bpmn-js default |
| Sticky notes BPMN type | `bpmn:TextAnnotation` + `stickyFill` attribute — no custom element type |
| Panel placement | Fixed left sidebar, 220px wide, scrollable |
| Drag vs. click-to-place | Click-to-place adopted (ghost follows cursor) — same as bpmn-js palette |
| Copy/paste in toolbar | Removed — keyboard shortcuts only (user preference) |
| Swimlane default text direction | Horizontal (overrides bpmn-js 270° rotation default) |
| Clean TextAnnotation rendering | Always applied to ALL TextAnnotations — removes bracket, adds white box |

---

## 20. Still open

1. **Extension URI for production:** Use `http://mflex/1.0` vs. company-owned namespace?
2. **`borderColor` UI:** Schema attribute exists; toolbar control not yet wired.
3. **`fillOpacity` UI:** Schema attribute exists; slider not yet added to toolbar.
4. **Format painter:** Pick style from element A → paint to B (Ctrl+Alt+C/V).
5. **Inspector panel:** Right-docked panel for BPMN ID, documentation, advanced properties.
6. **Compact mode:** Presentation-only hide-label mode for tasks/gateways.
7. **Camunda Modeler compatibility:** `mflex:` attributes are preserved on import/export; appearance controls are not shown (ignored silently).

---

## 21. References

### Miro (UX target)
- [Web SDK reference — style properties](https://developers.miro.com/docs/web-sdk-reference-guide)
- [Text item SDK](https://developers.miro.com/docs/websdk-reference-text)
- [Shape item SDK](https://developers.miro.com/miro-ea/docs/shape_shape-1)
- [Text — Help Center](https://help.miro.com/hc/en-us/articles/360017572094-Text)
- [Frames — Help Center](https://help.miro.com/hc/en-us/articles/360018261813-Frames)

### bpmn-js (implementation)
- [Visual customization (blog)](https://bpmn.io/blog/posts/2018-bpmn-js-2-1-0)
- [Colors example](https://github.com/bpmn-io/bpmn-js-examples/tree/main/colors)
- [Custom rendering example](https://github.com/bpmn-io/bpmn-js-example-custom-rendering)
- [Collapsed subprocesses (blog)](https://bpmn.io/blog/posts/2022-bpmn-js-900-collapsed-subprocesses)
- [Properties panel](https://github.com/bpmn-io/bpmn-js-properties-panel/)
- [bpmn-js v17 source](https://github.com/bpmn-io/bpmn-js)

### Source repository
- https://github.com/haripeddi/BPMN

---

## 22. Document history

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-05-26 | Initial spec — pre-implementation |
| 1.0 | 2026-05-26 | Full rewrite to reflect v1 implemented codebase |

---

*End of specification v1.0*
