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

    this._bindEvents();
  }

  // ─── Event hooks ─────────────────────────────────────────────────────────

  _bindEvents() {
    const eventBus = this._modeler.get('eventBus');

    // Re-apply after every re-render (shape move, resize, property change, etc.)
    eventBus.on('element.changed', ({ element }) => {
      if (!element) return;

      if (this._styles.has(element.id)) {
        setTimeout(() => this._applyToSvg(element), 30);
      }

      // When a Participant/Lane LABEL changes (e.g. after text edit), re-apply text direction
      if (element.type === 'label' && element.labelTarget) {
        const parentId = element.labelTarget.id;
        if (this._styles.has(parentId)) {
          setTimeout(() => this._applyToSvg(element.labelTarget), 30);
        }
      }

      // Always clean up TextAnnotation rendering (remove bracket, apply stickyFill)
      if (is(element, 'bpmn:TextAnnotation')) {
        setTimeout(() => this._applyAnnotationStyle(element), 30);
      }
    });

    // After full diagram import: read stored styles from moddle, then paint them
    eventBus.on('import.done', () => {
      this._loadFromModdle();
      requestAnimationFrame(() => this._reapplyAll());
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
   * Stored in memory → painted to SVG immediately.
   * Pass null for a key to remove that style.
   */
  setStyle(elements, attrs) {
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

      this._applyToSvg(element);
    });
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
    const textEls = gfx.querySelectorAll('text, tspan');
    textEls.forEach(t => {
      if (style.textColor) {
        t.style.fill = style.textColor;
        t.setAttribute('fill', style.textColor);
      }
      if (style.fontFamily) {
        t.style.fontFamily = style.fontFamily;
        t.setAttribute('font-family', style.fontFamily);
      }
      if (style.fontSize) {
        t.style.fontSize = `${style.fontSize}px`;
        t.setAttribute('font-size', style.fontSize);
      }
      if (style.bold !== undefined) {
        t.style.fontWeight = style.bold ? 'bold' : 'normal';
      }
      if (style.italic !== undefined) {
        t.style.fontStyle = style.italic ? 'italic' : 'normal';
      }
      if (style.underline !== undefined) {
        t.style.textDecoration = style.underline ? 'underline' : 'none';
      }
    });

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
