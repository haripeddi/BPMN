/**
 * MFlex StyleApplier — v2
 *
 * Correct approach:
 *  1. In-memory Map for instant visual application (no moddle round-trips during editing)
 *  2. Direct SVG mutation via canvas.getGraphics() — the only reliable way to override
 *     bpmn-js text/font rendering
 *  3. Persist to mflex:Style extension elements only at save time (persistToModdle)
 *  4. Load back from mflex:Style on import.done
 *  5. Re-apply on every element.changed so styles survive bpmn-js re-renders
 */
import { is } from 'bpmn-js/lib/util/ModelUtil';

const MFLEX_STYLE_TYPE = 'mflex:Style';
const STYLE_ATTRS = [
  'fontFamily', 'fontSize', 'textColor', 'textAlign',
  'bold', 'italic', 'underline', 'borderWidth', 'textDirection',
  'stickyFill',   // background fill for sticky-note TextAnnotations
];

export default class StyleApplier {
  constructor(modeler) {
    this._modeler = modeler;
    this._styles  = new Map(); // elementId → { fontFamily, fontSize, textColor, … }

    // Persistent <style> tag for font/text rules (CSS !important beats any bpmn-js re-render)
    this._fontStyleEl = document.createElement('style');
    this._fontStyleEl.id = 'mflex-font-styles';
    document.head.appendChild(this._fontStyleEl);

    this._bindEvents();
  }

  // ─── Event hooks ─────────────────────────────────────────────────────────

  _bindEvents() {
    const eventBus = this._modeler.get('eventBus');

    // ── Hook into the rendering pipeline (LOW_PRIORITY = fires AFTER bpmn-js renders) ──
    // This is the most reliable way to apply text/font styles — they are applied
    // directly after every bpmn-js render pass, so they can never be overwritten.
    const LOW_PRIORITY = 500;
    eventBus.on('render.shape', LOW_PRIORITY, (event) => {
      const { element, gfx } = event.context;
      const style = this._styles.get(element.id);
      if (!style) return;
      this._applyTextStylesToGfx(style, gfx);
    });

    // Re-apply after every element change (move, resize, property update, etc.)
    eventBus.on('element.changed', ({ element }) => {
      if (!element) return;

      if (this._styles.has(element.id)) {
        setTimeout(() => this._applyToSvg(element), 30);
      }

      // When a Participant/Lane LABEL changes, re-apply text direction
      if (element.type === 'label' && element.labelTarget) {
        const parentId = element.labelTarget.id;
        if (this._styles.has(parentId)) {
          setTimeout(() => this._applyToSvg(element.labelTarget), 30);
        }
      }

      // Always clean up TextAnnotation rendering (bracket removal + fill)
      if (is(element, 'bpmn:TextAnnotation')) {
        setTimeout(() => this._applyAnnotationStyle(element), 30);
      }
    });

    // After full diagram import: read stored styles from moddle, then paint them
    eventBus.on('import.done', () => {
      this._loadFromModdle();
      requestAnimationFrame(() => this._reapplyAll());
    });

    // ── Sticky note editing: full-coverage, correct colors, Enter = newline ──
    this._annotationEditing = false;

    eventBus.on('directEditing.activate', ({ element }) => {
      this._annotationEditing = is(element, 'bpmn:TextAnnotation');
      if (!this._annotationEditing) return;

      const fill = (this._styles.get(element.id) || {}).stickyFill || null;

      // TextBox creates the DOM synchronously before firing this event
      setTimeout(() => {
        const parent  = document.querySelector('.djs-direct-editing-parent');
        if (!parent) return;
        const content = parent.querySelector('.djs-direct-editing-content');

        // ① Cover the full note area with correct background
        if (fill) {
          parent.style.backgroundColor = fill;
          parent.style.borderRadius    = '5px';
          parent.style.border          = 'none';
          parent.style.boxShadow       = `inset 0 0 0 2px rgba(0,0,0,.12)`;
        } else {
          parent.style.backgroundColor = '#ffffff';
          parent.style.border          = '1px solid #9ca3af';
          parent.style.borderRadius    = '4px';
        }

        // ② Make the content div fill the full parent height so every
        //    click on the note body positions the cursor correctly
        if (content) {
          content.style.height      = '100%';
          content.style.minHeight   = parent.offsetHeight + 'px';
          content.style.boxSizing   = 'border-box';
          content.style.cursor      = 'text';
          content.style.whiteSpace  = 'pre-wrap';
          content.style.overflowWrap = 'break-word';
          // Left-align text (override any inherited center)
          content.style.textAlign   = 'left';
        }
      }, 0);
    });

    eventBus.on(['directEditing.complete', 'directEditing.cancel', 'directEditing.deactivate'], () => {
      this._annotationEditing = false;
    });

    // ③ Enter key → insert newline (not complete) when editing sticky notes.
    //    Use document capture phase so our handler fires BEFORE diagram-js's
    //    own keydown handler (which is in bubble phase on the content element).
    document.addEventListener('keydown', (e) => {
      if (!this._annotationEditing) return;
      if (e.key !== 'Enter' || e.shiftKey) return;

      // Stop the event from reaching the bpmn-js keyHandler on the content element
      e.stopPropagation();
      e.preventDefault();

      // Insert a line break at the current cursor position
      const content = document.querySelector('.djs-direct-editing-content');
      if (!content) return;
      content.focus();
      // Use execCommand (supported by all Chromium/Firefox for contenteditable)
      if (!document.execCommand('insertLineBreak')) {
        // Fallback: insert a newline text node
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const br = document.createElement('br');
          range.insertNode(br);
          const after = document.createTextNode('\u200B');
          br.after(after);
          range.setStartAfter(after);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }, true); // ← capture phase

    // After text editing completes on a TextAnnotation, auto-resize to fit content
    eventBus.on('directEditing.complete', ({ element }) => {
      if (!is(element, 'bpmn:TextAnnotation')) return;
      setTimeout(() => this._autoResizeAnnotation(element), 40);
    });

    // When a new shape lands on canvas (from palette / paste / import)
    eventBus.on('shape.added', ({ element }) => {
      // Default new Pool / Lane labels to horizontal
      if (is(element, 'bpmn:Participant') || is(element, 'bpmn:Lane')) {
        const cur = this._styles.get(element.id) || {};
        if (cur.textDirection === undefined) {
          this._styles.set(element.id, { ...cur, textDirection: 'horizontal' });
        }
        // Re-apply after bpmn-js finishes rendering the rotated label
        setTimeout(() => this._applyToSvg(element), 30);
      }

      if (this._styles.has(element.id)) {
        requestAnimationFrame(() => this._applyToSvg(element));
      }

      // When a label for a Participant/Lane is added, apply parent's text direction
      if (element.type === 'label' && element.labelTarget) {
        const parentId = element.labelTarget.id;
        if (this._styles.has(parentId)) {
          requestAnimationFrame(() => this._applyToSvg(element.labelTarget));
        }
      }

      // Pick up pending fill tagged by ShapePanel before create.start
      if (is(element, 'bpmn:TextAnnotation')) {
        const bo   = element.businessObject;
        const fill = bo && bo.__mflexStickyFill;
        if (fill) {
          delete bo.__mflexStickyFill;
          const cur = this._styles.get(element.id) || {};
          this._styles.set(element.id, { ...cur, stickyFill: fill });
        }
        // Always render clean (no bracket; fill if set)
        setTimeout(() => this._applyAnnotationStyle(element), 30);
      }
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Apply fill and/or stroke using the native BPMN in Color API.
   * bpmn-js persists these in DI XML automatically.
   */
  setColor(elements, { fill, stroke }) {
    const modeling = this._modeler.get('modeling');
    const colors = {};
    if (fill   !== undefined) colors.fill   = fill;
    if (stroke !== undefined) colors.stroke = stroke;
    if (Object.keys(colors).length) {
      modeling.setColor(elements, colors);
    }
  }

  /**
   * Apply typography / border-width styles.
   * Stored in memory → painted to SVG immediately via both CSS injection (reliable
   * across bpmn-js re-renders) and direct SVG attributes (for immediate feedback).
   * Pass null for a key to remove that style.
   */
  setStyle(elements, attrs) {
    const eventBus = this._modeler.get('eventBus');

    elements.forEach(element => {
      if (!element || !element.id) return;

      const current = this._styles.get(element.id) || {};
      const updated = { ...current };

      Object.entries(attrs).forEach(([k, v]) => {
        if (v === null || v === undefined) {
          delete updated[k];
        } else {
          updated[k] = v;
        }
      });

      if (Object.keys(updated).length === 0) {
        this._styles.delete(element.id);
      } else {
        this._styles.set(element.id, updated);
      }

      // Immediate direct patch (fastest feedback)
      this._applyToSvg(element);

      // Trigger a bpmn-js re-render so our render.shape hook applies styles
      // during the render pipeline — this survives any future re-renders too
      eventBus.fire('element.changed', { element });
    });

    // CSS stylesheet backup (persists across re-renders without needing element.changed)
    this._rebuildFontStyles();
  }

  /**
   * Apply text/font styles directly to SVG text elements inside a gfx group.
   * Called both from _applyToSvg (post-render) and from the render.shape hook.
   */
  _applyTextStylesToGfx(style, gfx) {
    if (!gfx) return;
    const textEls = gfx.querySelectorAll('text, tspan');
    textEls.forEach(t => {
      if (style.textColor)  { t.style.fill = style.textColor; t.setAttribute('fill', style.textColor); }
      if (style.fontFamily) { t.style.fontFamily = style.fontFamily; t.setAttribute('font-family', style.fontFamily); }
      if (style.fontSize)   { t.style.fontSize = `${style.fontSize}px`; t.setAttribute('font-size', style.fontSize); }
      if (style.bold      !== undefined) t.style.fontWeight    = style.bold      ? 'bold'      : 'normal';
      if (style.italic    !== undefined) t.style.fontStyle     = style.italic    ? 'italic'    : 'normal';
      if (style.underline !== undefined) t.style.textDecoration = style.underline ? 'underline' : 'none';
    });
  }

  /**
   * Inject a persistent <style> tag with per-element text rules using !important.
   * This ensures font/bold/italic/color always apply, even after bpmn-js re-renders.
   */
  _rebuildFontStyles() {
    let css = '';
    this._styles.forEach((style, id) => {
      let rules = '';
      if (style.fontFamily) rules += `font-family: "${style.fontFamily}" !important; `;
      if (style.fontSize)   rules += `font-size: ${style.fontSize}px !important; `;
      if (style.textColor)  rules += `fill: ${style.textColor} !important; `;
      if (style.bold      !== undefined) rules += `font-weight: ${style.bold      ? 'bold'      : 'normal'   } !important; `;
      if (style.italic    !== undefined) rules += `font-style:  ${style.italic    ? 'italic'    : 'normal'   } !important; `;
      if (style.underline !== undefined) rules += `text-decoration: ${style.underline ? 'underline' : 'none'} !important; `;
      if (!rules) return;
      const sel = `.djs-element[data-element-id="${id}"] .djs-visual text,` +
                  `.djs-element[data-element-id="${id}"] .djs-visual tspan`;
      css += `${sel} { ${rules} }\n`;
    });
    this._fontStyleEl.textContent = css;
  }

  /**
   * After direct-editing completes on a TextAnnotation, resize the shape to fit
   * the actual rendered text height. Base minimum is 80px.
   */
  _autoResizeAnnotation(element) {
    const canvas   = this._modeler.get('canvas');
    const modeling = this._modeler.get('modeling');
    let gfx;
    try { gfx = canvas.getGraphics(element); } catch (_) { return; }
    if (!gfx) return;

    const textEl = gfx.querySelector('.djs-visual text');
    if (!textEl) return;

    try {
      const bbox        = textEl.getBBox();
      const padding     = 28;                           // top + bottom padding
      const minHeight   = 80;
      const neededH     = Math.max(minHeight, Math.ceil(bbox.height) + padding);

      if (neededH > element.height + 4) {
        modeling.resizeShape(element, {
          x: element.x, y: element.y,
          width: element.width, height: neededH
        });
      }
    } catch (_) {}
  }

  /** Read the mflex style for an element */
  getStyle(element) {
    if (!element) return {};
    return { ...(this._styles.get(element.id) || {}) };
  }

  /** Read fill/stroke from BPMN in Color DI */
  getColor(element) {
    if (!element) return {};
    const di = element.di;
    if (!di) return {};
    try {
      return {
        fill:   di.get('bioc:fill')   || di.get('background-color') || null,
        stroke: di.get('bioc:stroke') || di.get('border-color')     || null
      };
    } catch (_) {
      return {};
    }
  }

  /** Call before saveXML to write the in-memory styles into the BPMN model */
  persistToModdle() {
    const elementRegistry = this._modeler.get('elementRegistry');
    const moddle          = this._modeler.get('moddle');

    this._styles.forEach((styleObj, elementId) => {
      const element = elementRegistry.get(elementId);
      if (!element || !element.businessObject) return;
      const bo = element.businessObject;

      if (!bo.extensionElements) {
        bo.extensionElements = moddle.create('bpmn:ExtensionElements', { values: [] });
      }

      let mstyle = bo.extensionElements.values.find(v => v.$type === MFLEX_STYLE_TYPE);
      if (!mstyle) {
        mstyle = moddle.create(MFLEX_STYLE_TYPE);
        bo.extensionElements.values.push(mstyle);
      }

      STYLE_ATTRS.forEach(k => {
        if (styleObj[k] !== undefined) {
          mstyle[k] = styleObj[k];
        }
      });
    });
  }

  /** True when the element type supports the given control */
  supports(element, control) {
    if (!element) return false;

    const FILL_TYPES = [
      'bpmn:Task', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:SendTask',
      'bpmn:ReceiveTask', 'bpmn:ManualTask', 'bpmn:BusinessRuleTask',
      'bpmn:ScriptTask', 'bpmn:SubProcess', 'bpmn:CallActivity',
      'bpmn:StartEvent', 'bpmn:EndEvent', 'bpmn:IntermediateCatchEvent',
      'bpmn:IntermediateThrowEvent', 'bpmn:BoundaryEvent',
      'bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway', 'bpmn:ParallelGateway',
      'bpmn:EventBasedGateway', 'bpmn:ComplexGateway',
      'bpmn:Participant', 'bpmn:Lane',
      'bpmn:DataObjectReference', 'bpmn:DataStoreReference',
      'bpmn:Group', 'bpmn:TextAnnotation'
    ];
    const RESIZE_TYPES = [
      'bpmn:Task', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:SendTask',
      'bpmn:ReceiveTask', 'bpmn:ManualTask', 'bpmn:BusinessRuleTask',
      'bpmn:ScriptTask', 'bpmn:SubProcess', 'bpmn:CallActivity',
      'bpmn:Participant', 'bpmn:Lane', 'bpmn:TextAnnotation', 'bpmn:Group'
    ];

    switch (control) {
      case 'fill':     return FILL_TYPES.some(t => is(element, t));
      case 'border':   return FILL_TYPES.some(t => is(element, t));
      case 'font':     return FILL_TYPES.some(t => is(element, t));
      case 'resize':   return RESIZE_TYPES.some(t => is(element, t));
      case 'collapse': return is(element, 'bpmn:SubProcess');
      case 'addLane':  return is(element, 'bpmn:Participant') || is(element, 'bpmn:Lane');
      default:         return false;
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /** Paint stored styles onto the live SVG element */
  _applyToSvg(element) {
    const canvas = this._modeler.get('canvas');
    const style  = this._styles.get(element.id);
    if (!style) return;

    let gfx;
    try { gfx = canvas.getGraphics(element); } catch (_) { return; }
    if (!gfx) return;

    // ── Text / label styling ─────────────────────────────────────────────
    this._applyTextStylesToGfx(style, gfx);

    // ── Border / stroke width ────────────────────────────────────────────
    if (style.borderWidth) {
      const shapeEls = gfx.querySelectorAll('rect, circle, path, ellipse, polygon, polyline');
      shapeEls.forEach(s => {
        s.style.strokeWidth = `${style.borderWidth}px`;
        s.setAttribute('stroke-width', style.borderWidth);
      });
    }

    // ── Swimlane text direction ───────────────────────────────────────────
    if (is(element, 'bpmn:Participant') || is(element, 'bpmn:Lane')) {
      this._applyTextDirection(element, style, gfx);
    }

    // ── Sticky note fill (TextAnnotation) ────────────────────────────────
    if (is(element, 'bpmn:TextAnnotation') && style.stickyFill) {
      this._applyAnnotationStyle(element, style.stickyFill, gfx);
    }
  }

  /**
   * Override the bpmn-js label rotation so pool/lane names read horizontally.
   *
   * bpmn-js renders the pool/lane name with transform="translate(0,H) rotate(270)"
   * on a <g> inside .djs-visual. We strip that rotation and re-centre the text
   * in the 30px header strip.
   */
  _applyTextDirection(element, style, gfx) {
    const dir = style.textDirection || 'horizontal';
    if (dir !== 'horizontal') return; // vertical is bpmn-js default, nothing to do

    const visual = gfx.querySelector('.djs-visual');
    if (!visual) return;

    // Find the <g> inside .djs-visual that carries a rotate() transform
    // (bpmn-js wraps the lane label text in such a group for horizontal pools)
    const rotatedGs = Array.from(visual.querySelectorAll('g[transform]')).filter(g => {
      return (g.getAttribute('transform') || '').includes('rotate');
    });

    rotatedGs.forEach(labelG => {
      // Strip the rotation — keep any translate so the group stays in place
      const t = labelG.getAttribute('transform') || '';
      const withoutRotate = t.replace(/rotate\s*\([^)]*\)/g, '').trim();
      labelG.setAttribute('transform', withoutRotate || '');

      // Re-position the text to be centred in the 30px header strip
      const textEl = labelG.querySelector('text');
      if (textEl) {
        textEl.setAttribute('x',                '15');       // mid of 30px header
        textEl.setAttribute('y',                String(element.height / 2));
        textEl.setAttribute('text-anchor',      'middle');
        textEl.setAttribute('dominant-baseline','middle');
        textEl.querySelectorAll('tspan').forEach(ts => {
          ts.removeAttribute('x');
          ts.removeAttribute('y');
          ts.removeAttribute('dy');
        });
      }
    });
  }

  /**
   * Apply clean text-box rendering to a TextAnnotation:
   *  • Always hides the BPMN bracket path (the line on the left)
   *  • Shows a subtle rounded border instead
   *  • If a stickyFill colour is provided, shows that as the background
   */
  _applyAnnotationStyle(element, fillColor, gfx) {
    const canvas = this._modeler.get('canvas');
    if (!gfx) {
      try { gfx = canvas.getGraphics(element); } catch (_) { return; }
      if (!gfx) return;
    }

    // Resolve fill: explicit override → stored stickyFill style → no fill
    const fill = fillColor
      || (this._styles.get(element.id) || {}).stickyFill
      || null;

    const visual = gfx.querySelector('.djs-visual');
    if (!visual) return;

    // Hide the BPMN bracket path (vertical line on the left)
    visual.querySelectorAll('path').forEach(p => { p.style.display = 'none'; });

    // Find or create the background rect
    let bgRect = visual.querySelector('rect.mflex-bg');
    if (!bgRect) {
      // Reuse bpmn-js's own rect if present, otherwise create one
      const existing = visual.querySelector('rect');
      if (existing) {
        existing.classList.add('mflex-bg');
        bgRect = existing;
      } else {
        bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.classList.add('mflex-bg');
        visual.insertBefore(bgRect, visual.firstChild);
      }
    }

    const w = element.width  || 160;
    const h = element.height || 120;

    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width',  String(w));
    bgRect.setAttribute('height', String(h));

    if (fill) {
      bgRect.setAttribute('rx', '5');
      bgRect.setAttribute('ry', '5');
      bgRect.setAttribute('stroke', 'none');
      bgRect.setAttribute('fill', fill);
      bgRect.style.fill   = fill;
      bgRect.style.stroke = 'none';
    } else {
      bgRect.setAttribute('rx', '4');
      bgRect.setAttribute('ry', '4');
      bgRect.setAttribute('stroke', '#9ca3af');
      bgRect.setAttribute('stroke-width', '1');
      bgRect.setAttribute('fill', '#ffffff');
      bgRect.style.fill   = '#ffffff';
      bgRect.style.stroke = '#9ca3af';
    }
  }

  /** Re-apply all stored styles to every visible element */
  _reapplyAll() {
    const elementRegistry = this._modeler.get('elementRegistry');
    this._styles.forEach((_, id) => {
      const el = elementRegistry.get(id);
      if (el) this._applyToSvg(el);
    });
    // Rebuild CSS stylesheet so font rules are active for all loaded elements
    this._rebuildFontStyles();
    // Clean up all TextAnnotation renderings (remove bracket, apply fill if set)
    elementRegistry.forEach(el => {
      if (is(el, 'bpmn:TextAnnotation')) this._applyAnnotationStyle(el);
    });
  }

  /** Load mflex:Style extension elements into the in-memory map (called after import) */
  _loadFromModdle() {
    this._styles.clear();
    const elementRegistry = this._modeler.get('elementRegistry');

    elementRegistry.forEach(element => {
      if (!element.businessObject) return;
      const bo = element.businessObject;
      if (!bo.extensionElements) return;

      const mstyle = bo.extensionElements.values
        .find(v => v.$type === MFLEX_STYLE_TYPE);
      if (!mstyle) return;

      const attrs = {};
      STYLE_ATTRS.forEach(k => {
        if (mstyle[k] !== undefined && mstyle[k] !== null) {
          attrs[k] = mstyle[k];
        }
      });

      if (Object.keys(attrs).length) {
        this._styles.set(element.id, attrs);
      }
    });
  }
}
