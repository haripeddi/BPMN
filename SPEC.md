# Product Specification: BPMN Editor with Miro-Grade Object Flexibility

**Version:** 0.1 (draft)  
**Date:** 2026-05-26  
**Status:** Specification only — no implementation in this document  
**Baseline:** `bpmn-js-app/` (Vite + `bpmn-js` Modeler)  
**Constraint:** Existing application code remains untouched until an explicit implementation phase. All enhancements are additive modules, UI shells, and configuration layered on top of the current editor.

---

## 1. Executive summary

The current open-source stack (`bpmn-js` + default palette/context pad) delivers **valid BPMN modeling** but **not** the per-object creative freedom users expect from Miro. Miro treats every board item as a first-class visual object with immediate styling, resizing, typography, and container behavior via a persistent **context toolbar** and rich `style` properties ([Miro Web SDK — style reference](https://developers.miro.com/docs/web-sdk-reference-guide), [Text](https://developers.miro.com/docs/websdk-reference-text), [Shape](https://developers.miro.com/miro-ea/docs/shape_shape-1), [Frames](https://help.miro.com/hc/en-us/articles/360018261813-Frames)).

This specification defines **“BPMN + Miro flexibility”**: keep BPMN semantics, notation rules, import/export, and execution-relevant structure intact, while giving **every placeable BPMN element** Miro-like affordances for appearance, size, text, and collapse/expand where the standard allows.

**Out of scope for v1:** Replacing `bpmn-js` with Miro SDK, embedding a live Miro board, or breaking BPMN 2.0 interchange without a documented extension namespace.

---

## 2. Problem statement (observed gaps)

| # | User observation | Root cause in OSS stack | Miro equivalent |
|---|------------------|-------------------------|-----------------|
| G1 | Objects aren’t flexible | `bpmn-js` optimizes for **notation compliance**; resize handles and freeform layout are limited by BPMN DI bounds and element-specific rules | Drag resize, aspect control, context menu dimensions ([Text help](https://help.miro.com/hc/en-us/articles/360017572094-Text)) |
| G2 | No custom fill/text colors | Colors exist but are **not exposed in UI** by default; users don’t discover `Modeling#setColor` | `fillColor`, `color`, opacity on selection ([Shape SDK](https://developers.miro.com/miro-ea/docs/shape_shape-1)) |
| G3 | Can’t maximize/minimize objects | Only **SubProcess** supports collapse/expand (`isExpanded`) + drilldown ([bpmn.io blog](https://bpmn.io/blog/posts/2022-bpmn-js-900-collapsed-subprocesses)); other elements have no “compact” mode | Frames resize; no true collapse for arbitrary widgets — **we map “minimize” to BPMN collapse + visual compact modes** |
| G4 | No font types | Default `textRenderer` is global; per-element font family/size not in stock properties panel | `fontFamily`, `fontSize`, bold/italic/underline ([Text SDK](https://developers.miro.com/docs/websdk-reference-text)) |

**Design principle:** Close the *experience* gap with Miro, not by abandoning BPMN. Where BPMN forbids a visual (e.g. arbitrary rotation of a Start Event), the UI **disables** the control and explains why.

---

## 3. Goals and non-goals

### 3.1 Goals

1. **Per-element styling** for all modeled BPMN shapes, connections, and labels that users can place from the palette.
2. **Miro-style context toolbar** appearing on single and multi-selection, with color, typography, alignment, border, and size controls.
3. **Persistent styling** in saved `.bpmn` files via standards-aligned extensions (BPMN in Color + custom moddle namespace).
4. **Resize and dimension control** within BPMN-valid bounds; optional numeric width/height like Miro’s resize dialog.
5. **Collapse / expand** for SubProcesses (native) plus a **“compact presentation”** mode for supported elements where full collapse is invalid.
6. **Format painter** (copy style → apply style) across compatible elements.
7. **Zero regression** to current `bpmn-js-app` toolbar (New, Open, Save, Undo/Redo) until explicitly merged.

### 3.2 Non-goals (v1)

- Freeform non-BPMN shapes (sticky notes, generic rectangles) on the same canvas — candidate for v2 “annotations layer.”
- Real-time multi-user cursors (Miro collaboration).
- Full rich-text HTML inside labels (Miro-level); v1 targets **plain text + limited inline emphasis** where `bpmn-js` allows.
- Camunda/Zeebe execution properties unless separately requested.

---

## 4. Reference: Miro object model (target UX)

Miro board items expose a consistent **`style` object** when selected ([Web SDK reference](https://developers.miro.com/docs/web-sdk-reference-guide)):

| Style property | Applies to | Purpose |
|----------------|------------|---------|
| `fillColor` / `fillOpacity` | Shapes, text, stickies | Background |
| `color` (text) | Text, shapes | Foreground / label color |
| `fontFamily`, `fontSize` | Text, shapes | Typography |
| `textAlign`, `textAlignVertical` | Text, shapes | Alignment |
| `borderColor`, `borderWidth`, `borderStyle`, `borderOpacity` | Shapes | Outline |
| `bold`, `italic`, `underline`, `strike` | Text | Emphasis |
| `width`, `height` (item-level) | Text, shapes, frames | Dimensions |

**Miro interaction patterns to mirror:**

- **Selection → context toolbar** (not buried in a side panel only).
- **Drag handles** on selection bbox for resize ([Text — white dot / borders](https://help.miro.com/hc/en-us/articles/360017572094-Text)).
- **Create frame around selection** ([Frames](https://help.miro.com/hc/en-us/articles/360018261813-Frames)) → maps to **Participant/Pool/Lane grouping** or **SubProcess** in BPMN, not a non-standard frame primitive in v1.
- **Copy formatting** shortcut (Ctrl/Cmd+Alt+C/V) ([Text help](https://help.miro.com/hc/en-us/articles/360017572094-Text)).

---

## 5. BPMN technical baseline (how we extend without forking)

Official `bpmn-js` extension points relevant to this spec:

| Capability | Mechanism | Reference |
|------------|-----------|-----------|
| Fill/stroke colors (persisted) | `modeling.setColor(elements, { stroke, fill })` — BPMN in Color | [colors example](https://github.com/bpmn-io/bpmn-js-examples/tree/main/colors) |
| Color picker UX | `bpmn-js-color-picker` module (context pad) | [bpmn-js-color-picker](https://github.com/bpmn-io/bpmn-js-color-picker) |
| Per-render overrides | `eventBus` `render.shape` / `render.connection` → `context.attrs` | [Rendering system](https://deepwiki.com/bpmn-io/bpmn-js/3-rendering-system) |
| Global font defaults | `textRenderer.defaultStyle` / `externalStyle` | [bpmn.io blog 2.1](https://bpmn.io/blog/posts/2018-bpmn-js-2-1-0) |
| Custom properties UI | `bpmn-js-properties-panel` + custom `PropertiesProvider` + **moddle extension** | [properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel/), [custom extensions](https://deepwiki.com/bpmn-io/bpmn-js-examples/4.2-custom-properties-panel-extensions) |
| SubProcess minimize/maximize | `modeling.toggleCollapse(element)` + drilldown overlays | [collapsed subprocesses](https://bpmn.io/blog/posts/2022-bpmn-js-900-collapsed-subprocesses) |
| Custom element drawing | `BaseRenderer` module (`additionalModules`) | [custom rendering example](https://github.com/bpmn-io/bpmn-js-example-custom-rendering) |

**Architectural rule:** New behavior ships as **`additionalModules`** + CSS + optional side panel DOM — the current `src/main.js` entrypoint only gains a single `import './bootstrap-mflex.js'` (or similar) when implementation starts.

---

## 6. Product concept: “MFlex” layer

**MFlex** (working name: **Miro-style Flexibility layer**) sits above `diagram-js` / `bpmn-js`:

```
┌─────────────────────────────────────────────────────────────┐
│  App chrome (existing topbar: New/Open/Save/Undo)           │
├─────────────────────────────────────────────────────────────┤
│  MFlex Context Toolbar (NEW) — selection-driven             │
├──────────────────────────────┬──────────────────────────────┤
│  BPMN Canvas (bpmn-js)       │  MFlex Inspector (NEW, opt.) │
│  + palette / context pad     │  Advanced props + BPMN ids     │
├──────────────────────────────┴──────────────────────────────┤
│  diagram-js overlays: resize handles, compact badges        │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Functional requirements

### 7.1 Universal selection behavior (FR-SEL)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SEL-01 | Single-click selects element; shows MFlex toolbar anchored above selection | P0 |
| FR-SEL-02 | Shift+click and marquee multi-select supported | P0 |
| FR-SEL-03 | Multi-select toolbar shows **common** style controls (intersection of capabilities) | P0 |
| FR-SEL-04 | Connection (sequence flow, message flow, association) selection exposes line color & stroke width where valid | P0 |
| FR-SEL-05 | Label selection (external labels) exposes font controls independent of parent shape when technically feasible | P1 |

### 7.2 Colors and opacity (FR-COL) — addresses G2

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-COL-01 | **Fill color** picker for tasks, subprocesses, pools, lanes, gateways, events, data objects, groups | P0 |
| FR-COL-02 | **Text/label color** picker for name labels | P0 |
| FR-COL-03 | **Border/stroke color** picker | P0 |
| FR-COL-04 | Preset palette (12–16 colors) + hex input + “reset to theme default” | P0 |
| FR-COL-05 | Fill opacity slider 0–100% (store as extension attribute; apply at render) | P1 |
| FR-COL-06 | Persist via `modeling.setColor` for stroke/fill where supported; overflow attributes in moddle `mflex:` for opacity/text color | P0 |
| FR-COL-07 | Undo/redo integrates with command stack | P0 |

**BPMN note:** Event definitions (icons inside circles) keep standard glyphs; fill applies to **circle background** only, not replacing BPMN icons.

### 7.3 Typography (FR-TXT) — addresses G4

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-TXT-01 | Font family dropdown: at minimum **Arial, Helvetica, Inter, Roboto, Georgia, Times New Roman, Courier New** (+ system default) | P0 |
| FR-TXT-02 | Font size: 8–48px preset list + numeric input | P0 |
| FR-TXT-03 | Bold, italic, underline toggles (store in `mflex:textStyle`; render via custom label provider or HTML overlay where supported) | P1 |
| FR-TXT-04 | Horizontal align: left, center, right | P0 |
| FR-TXT-05 | Vertical align: top, middle, bottom (tasks/subprocesses) | P1 |
| FR-TXT-06 | Changing font on a **partial** text selection is out of scope v1 (Miro also limits this on some widgets) | — |

**Implementation note:** Global defaults via `textRenderer`; per-element overrides via moddle + `render.shape` label attrs or custom `TextRenderer` module.

### 7.4 Resize and dimensions (FR-SIZ) — addresses G1

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SIZ-01 | 8-point resize handles on selection for resizable BPMN elements (Task, SubProcess, Pool, Lane, Group, TextAnnotation, expanded SubProcess) | P0 |
| FR-SIZ-02 | Shift+drag preserves aspect ratio where BPMN allows | P1 |
| FR-SIZ-03 | Toolbar “Dimensions” popover: width × height in px; apply via `modeling.resizeShape` | P0 |
| FR-SIZ-04 | Min/max size guards per element type (e.g. events stay circular — **resize adjusts radius uniformly**) | P0 |
| FR-SIZ-05 | Disable resize for elements where BPMN DI forbids free sizing; show tooltip | P0 |

### 7.5 Collapse, expand, and “compact” (FR-COLP) — addresses G3

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-COLP-01 | **SubProcess:** toolbar toggle Collapse ↔ Expand using `modeling.toggleCollapse` | P0 |
| FR-COLP-02 | **SubProcess:** drilldown affordance when collapsed (native overlay) — do not disable | P0 |
| FR-COLP-03 | **Call Activity:** display as collapsed tile by default; link to called process reference in inspector | P1 |
| FR-COLP-04 | **Compact mode** (presentation-only, `mflex:compact=true`): hide label area inside shape, show icon + short title bar — for Task, Gateway — **does not change BPMN type** | P2 |
| FR-COLP-05 | “Maximize view” = zoom selection to fit viewport (`canvas.zoom('fit-viewport', element)`), not element mutation | P0 |

**Clarification:** Miro does not truly “minimize” arbitrary shapes to an icon-only state ([Frames](https://help.miro.com/hc/en-us/articles/360018261813-Frames) — resize only). Our BPMN-aligned mapping:

| User phrase | BPMN behavior |
|-------------|---------------|
| Minimize subprocess | Collapse (`isExpanded=false`) |
| Maximize on screen | Zoom to element |
| Make task smaller | Resize + optional compact mode |

### 7.6 Object flexibility and editing (FR-FLX) — addresses G1

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-FLX-01 | Direct-edit label on double-click (existing behavior retained) | P0 |
| FR-FLX-02 | Drag-to-move, snaplines, connect via connection rules (existing) | P0 |
| FR-FLX-03 | Context pad retains BPMN operations (delete, connect, replace type) | P0 |
| FR-FLX-04 | **Replace element type** from toolbar dropdown (subset: Task ↔ UserTask ↔ ServiceTask, etc.) | P1 |
| FR-FLX-05 | **Format painter:** pick style from element A, apply to B (colors + font + border) | P1 |
| FR-FLX-06 | **Create container around selection:** wrap in SubProcess or Group (user choice) | P1 |

### 7.7 Inspector panel (FR-INS)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-INS-01 | Right docked panel, collapsible, 280–360px width | P1 |
| FR-INS-02 | Sections: **Appearance** (mirror toolbar), **BPMN** (id, name, documentation), **Advanced** (listeners — optional later) | P1 |
| FR-INS-03 | Register custom `PropertiesProvider` — do not fork Camunda provider unless needed | P1 |

### 7.8 Persistence and interchange (FR-IO)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-IO-01 | Save/load `.bpmn` includes all `mflex:` attributes and BPMN in Color DI | P0 |
| FR-IO-02 | Import from standard BPMN 2.0 without extensions renders with default theme | P0 |
| FR-IO-03 | Export warning if viewer lacks extensions (soft — colors still in XML) | P2 |
| FR-IO-04 | Document extension URI in README: `xmlns:mflex="http://example.com/mflex/1.0"` (final URI TBD) | P0 |

---

## 8. Moddle extension schema (draft)

Namespace prefix: **`mflex`**

```xml
<bpmn2:task id="Task_1" name="Review">
  <bpmn2:extensionElements>
    <mflex:style
      fontFamily="Inter"
      fontSize="14"
      textColor="#1a1a1a"
      textAlign="center"
      textAlignVertical="middle"
      fillOpacity="0.9"
      borderColor="#ff7400"
      borderWidth="2"
      bold="false"
      italic="false"
      underline="false"
      compact="false"
    />
  </bpmn2:extensionElements>
</bpmn2:task>
```

| Attribute | Type | Notes |
|-----------|------|-------|
| `fontFamily` | string | |
| `fontSize` | number | px |
| `textColor` | string | hex |
| `textAlign` | enum | left \| center \| right |
| `textAlignVertical` | enum | top \| middle \| bottom |
| `fillOpacity` | number | 0–1 |
| `borderColor` | string | hex |
| `borderWidth` | number | px |
| `bold`, `italic`, `underline` | boolean | |
| `compact` | boolean | presentation-only |

**Colors (fill/stroke):** Prefer [BPMN in Color](https://github.com/bpmn-miwg/bpmn-in-color) via `modeling.setColor`; use `mflex` only for properties not covered.

---

## 9. UI specification: MFlex Context Toolbar

### 9.1 Placement and behavior

- Appears **8px above** the selection bounding box, centered; flips below if clipped by viewport.
- Hidden when nothing selected or during canvas pan with spacebar.
- Sticky while typing in direct-edit mode (font controls apply to element).

### 9.2 Toolbar groups (left → right)

| Group | Controls | Elements |
|-------|----------|----------|
| **Type** | Element icon + name (read-only) + “Change type” submenu | Shapes |
| **Fill** | Color swatch → popover (palette, hex, reset) | Shapes |
| **Text** | Color, font family, font size | Shapes + labels |
| **Border** | Color, width (1/2/3/4) | Shapes |
| **Align** | H-align, V-align | Tasks, subprocesses, annotations |
| **Size** | W×H inputs, lock aspect | Resizable |
| **Collapse** | Toggle (subprocess only) | SubProcess |
| **View** | Zoom to fit selection | All |
| **More** | Format painter, create container, reset styles | All |

### 9.3 Multi-selection rules

- **Fill / text / border / font:** apply to all selected **if same element category** (all tasks, or all flows).
- Mixed selection (Task + Gateway): show only **colors** and **view** actions.
- Show count badge: `3 elements`.

### 9.4 Visual design tokens (align with Miro-like clarity)

- Toolbar: white background, `border-radius: 8px`, shadow `0 4px 16px rgba(0,0,0,0.12)`.
- Active toggle: `#4262ff` accent (Miro-adjacent blue).
- Disabled control: 40% opacity + tooltip on hover.

---

## 10. Element capability matrix

Defines which controls are **enabled**, **disabled**, or **N/A** per BPMN type.

| Element | Fill | Text color | Font | Border | Resize | Collapse | Compact |
|---------|------|------------|------|--------|--------|----------|---------|
| Start/End/Intermediate Event | ● | ● | ● | ○ (circle stroke) | ● (uniform) | N/A | P2 |
| Task / Activity | ● | ● | ● | ● | ● | N/A | P2 |
| SubProcess | ● | ● | ● | ● | ● | ● | N/A |
| Gateway | ● | ● | ● | ○ | ● | N/A | P2 |
| Pool / Lane | ● | ● | ● | ● | ● | N/A | N/A |
| DataObject / Store | ● | ● | ● | ● | ● | N/A | N/A |
| TextAnnotation | ○ | ● | ● | ○ | ● | N/A | N/A |
| Group | ○ | ○ | ○ | ● (dashed) | ● | N/A | N/A |
| SequenceFlow | ○ | ○ | ○ | ● (line) | N/A | N/A | N/A |
| MessageFlow | ○ | ○ | ○ | ● | N/A | N/A | N/A |
| Association | ○ | ○ | ○ | ● | N/A | N/A | N/A |

Legend: ● = full support, ○ = limited, N/A = hidden

---

## 11. Module architecture (implementation blueprint)

Planned package layout **alongside** existing app (not modifying `main.js` until merge):

```
bpmn-js-app/
  src/                          # EXISTING — frozen in spec phase
  mflex/                        # NEW — all flexibility code
    index.js                    # exports MflexModule bundle
    moddle/mflex.json           # moddle descriptor
    features/
      context-toolbar/          # UI + selection sync
      style-applier/             # modeling + setColor + mflex attrs
      typography/                # textRenderer overrides
      resize/                    # enhanced handles + dimension popover
      collapse/                  # subprocess toggle + zoom actions
      format-painter/
      properties-provider/      # inspector groups
    styles/
      context-toolbar.css
      color-picker.css
  SPEC.md                       # this document
```

**Module registration (future one-liner):**

```javascript
import MflexModule from '../mflex';
const modeler = new BpmnModeler({
  container: '#canvas',
  additionalModules: [MflexModule],
  moddleExtensions: { mflex: mflexDescriptor },
  textRenderer: { defaultStyle: { fontFamily: 'Inter, Arial, sans-serif' } },
  bpmnRenderer: { defaultFillColor: '#ffffff', defaultStrokeColor: '#1a1a1a' }
});
```

**Recommended OSS dependencies to evaluate in implementation phase:**

| Package | Role |
|---------|------|
| `bpmn-js-color-picker` | Bootstrap color UX |
| `bpmn-js-properties-panel` | Inspector host |
| `@bpmn-io/properties-panel` | Entry components |

---

## 12. User stories and acceptance criteria

### US-01 — Color a task like Miro

**As a** modeler, **I want** to set background and text colors on a task **so that** it matches our workshop color language.

**Acceptance:**

- Select task → fill swatch → choose `#FFF59D` → task background updates immediately.
- Save BPMN → reopen → color preserved.
- Undo reverts color.

### US-02 — Change font on a gateway label

**As a** modeler, **I want** Arial 16px bold on a gateway name **so that** it matches slide decks.

**Acceptance:**

- Font family and size apply to gateway label after deselect.
- Exported XML contains `mflex:style` attributes.
- Round-trip does not lose gateway type.

### US-03 — Resize subprocess and collapse it

**As a** modeler, **I want** to shrink a subprocess and collapse it **so that** the diagram stays readable.

**Acceptance:**

- Resize handles change subprocess bounds.
- Collapse toggle sets `isExpanded=false` and shows drilldown overlay.
- Drilldown opens child plane; breadcrumb returns to parent.

### US-04 — Format painter across tasks

**As a** modeler, **I want** to copy style from one task to three others **so that** I don’t repeat formatting.

**Acceptance:**

- Copy style → multi-select tasks → apply style → all match source colors/font/border.
- Does not change task IDs or types.

### US-05 — Zoom to element (“maximize”)

**As a** presenter, **I want** to zoom the viewport to the selected element **so that** the audience sees detail.

**Acceptance:**

- “Zoom to selection” fits element with padding; no XML mutation.

---

## 13. Phased delivery plan

| Phase | Scope | Outcome |
|-------|-------|---------|
| **P0 — Foundation** | `mflex` moddle, `style-applier`, integrate `bpmn-js-color-picker`, context toolbar (fill/text/border), undo | Colors work end-to-end |
| **P1 — Typography & resize** | Font family/size, align, dimension popover, enhanced handles | Addresses G1 + G4 |
| **P2 — Collapse & containers** | SubProcess collapse UX, wrap-in-subprocess, format painter | Addresses G3 |
| **P3 — Inspector & polish** | Right panel, compact mode, opacity, keyboard shortcuts | Parity with Miro help articles |
| **P4 — Optional annotations** | Non-BPMN sticky layer (if product still needs pure Miro widgets) | Stretch |

**Merge policy:** Each phase adds `mflex/` code + a feature flag in a **new** bootstrap file; flip flag to enable in dev; only replace `main.js` import when stable.

---

## 14. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| BPMN validation rejects custom XML | High | Use `extensionElements` + documented namespace; test with Camunda Modeler import |
| Label font changes not supported natively | Medium | Custom `TextRenderer` or external label HTML overlay |
| Multi-select mixed types confuse users | Medium | Capability matrix + disabled controls |
| Performance on large diagrams | Medium | Debounce style updates; batch `modeling.updateProperties` |
| “Compact mode” misread as semantic change | Low | Clear UI badge “Presentation only”; not exported as BPMN type change |

---

## 15. Success metrics

| Metric | Target |
|--------|--------|
| Time to apply fill + font to one element | < 5 seconds (3 clicks) |
| Style persistence across save/reload | 100% for P0 attributes |
| BPMN 2.0 validity | No invalid XML from appearance-only edits |
| Existing app regression | All current toolbar actions pass smoke test |

---

## 16. Open questions (for implementation kickoff)

1. **Extension URI:** Use company-owned namespace vs. `https://bpmn.io/mflex`?
2. **Default theme:** Match current `bpmn-js` whites or Miro-like soft gray canvas `#F3F4F6`?
3. **Compact mode:** Ship in P2 or defer to avoid confusion with collapsed subprocess?
4. **Camunda compatibility:** Should `mflex` attributes be ignored or shown in Camunda Modeler?
5. **Annotations layer:** Required for workshop stickies, or is BPMN-only canvas sufficient?

---

## 17. References

### Miro (UX target)

- [Web SDK reference — style properties](https://developers.miro.com/docs/web-sdk-reference-guide)
- [Text item SDK](https://developers.miro.com/docs/websdk-reference-text)
- [Shape item SDK](https://developers.miro.com/miro-ea/docs/shape_shape-1)
- [Text — Help Center](https://help.miro.com/hc/en-us/articles/360017572094-Text)
- [Frames — Help Center](https://help.miro.com/hc/en-us/articles/360018261813-Frames)

### bpmn-js (implementation)

- [Visual customization (blog)](https://bpmn.io/blog/posts/2018-bpmn-js-2-1-0)
- [Colors example](https://github.com/bpmn-io/bpmn-js-examples/tree/main/colors)
- [bpmn-js-color-picker](https://github.com/bpmn-io/bpmn-js-color-picker)
- [Custom rendering example](https://github.com/bpmn-io/bpmn-js-example-custom-rendering)
- [Collapsed subprocesses (blog)](https://bpmn.io/blog/posts/2022-bpmn-js-900-collapsed-subprocesses)
- [Properties panel](https://github.com/bpmn-io/bpmn-js-properties-panel/)

### Current baseline

- Local app: `bpmn-js-app/` (unchanged by this spec)

---

## 18. Document approval

| Role | Name | Date | Sign-off |
|------|------|------|----------|
| Product owner | | | |
| Engineering | | | |
| UX | | | |

---

*End of specification v0.1*
