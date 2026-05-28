/**
 * MFlex Free Interaction
 *
 * Three capabilities bundled together:
 *
 * 1. MflexMoveRules — RuleProvider at priority 2000 that allows moving ANY
 *    element to ANY position on the canvas, overriding bpmn-js's strict
 *    FlowNode containment rules.  Gives the same drag-anywhere freedom as Miro.
 *
 * 2. MflexFreeText — diagram-js service that listens for double-click on
 *    empty canvas and places an editable TextAnnotation at that exact point,
 *    then immediately activates direct editing so the user can start typing.
 *
 * 3. MflexCopyPaste — wires Ctrl/Cmd + C / V / D keyboard shortcuts and
 *    exposes copy / paste / duplicate as callable methods used by the toolbar.
 */

import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import { is }       from 'bpmn-js/lib/util/ModelUtil';

// ─── 1. Free Move Rules ───────────────────────────────────────────────────────

export class MflexMoveRules extends RuleProvider {
  constructor(eventBus) {
    super(eventBus);
  }

  init() {
    /**
     * Priority 2000 > BpmnRules (1000) → runs first and short-circuits.
     * Returning `true` here allows the move regardless of parent/target.
     */
    this.addRule('elements.move', 2000, ({ shapes }) => {
      if (!shapes || !shapes.length) return null;
      // Never intercept pure label moves — let bpmn-js handle those
      if (shapes.every(s => s.type === 'label')) return null;
      return true;
    });
  }
}

MflexMoveRules.$inject = ['eventBus'];

// ─── 2. Free Text (double-click on canvas) ────────────────────────────────────

export class MflexFreeText {
  constructor(eventBus, elementFactory, modeling, canvas, directEditing) {
    this._ef     = elementFactory;
    this._model  = modeling;
    this._canvas = canvas;
    this._de     = directEditing;

    // Listen for double-click on the root element (= empty canvas background)
    eventBus.on('element.dblclick', 1500, (event) => {
      const { element, originalEvent } = event;

      // Only act when clicking on the root Process / Collaboration (empty canvas)
      const root = canvas.getRootElement();
      if (element !== root) return;

      event.stopPropagation(); // prevent bpmn-js default (process name edit)

      // Convert screen coords → canvas coords
      const vb = canvas.viewbox();
      const cr = canvas.getContainer().getBoundingClientRect();
      const cx = (originalEvent.clientX - cr.left) / vb.scale + vb.x;
      const cy = (originalEvent.clientY - cr.top)  / vb.scale + vb.y;

      // Create a TextAnnotation centred on the click point
      const W = 150, H = 60;
      const shape = this._ef.createShape({
        type:   'bpmn:TextAnnotation',
        width:  W,
        height: H,
      });

      const newShape = this._model.createShape(
        shape,
        { x: cx - W / 2, y: cy - H / 2 },
        root
      );

      // Start direct editing so the user can type immediately
      requestAnimationFrame(() => {
        try { this._de.activate(newShape); } catch (_) {}
      });
    });
  }
}

MflexFreeText.$inject = ['eventBus', 'elementFactory', 'modeling', 'canvas', 'directEditing'];

// ─── 3. Copy / Paste helper ───────────────────────────────────────────────────

export class MflexCopyPaste {
  constructor(copyPaste, selection, canvas, elementRegistry) {
    this._cp      = copyPaste;
    this._sel     = selection;
    this._canvas  = canvas;
    this._elementRegistry = elementRegistry;
    this._lastPointer = null;

    const canvasEl = canvas.getContainer();
    canvasEl.addEventListener('mousemove', (e) => {
      const vb = canvas.viewbox();
      const cr = canvasEl.getBoundingClientRect();
      this._lastPointer = {
        x: (e.clientX - cr.left) / vb.scale + vb.x,
        y: (e.clientY - cr.top)  / vb.scale + vb.y,
      };
    });

    // Single capture-phase key handler (Mac-friendly, avoids duplicate paste handlers).
    window.addEventListener('keydown', (keyEvent) => {
      if (shouldIgnoreShortcut(keyEvent)) return;

      const selected = selection.get();

      if (isCmdC(keyEvent)) {
        if (selected.length) {
          keyEvent.preventDefault();
          copyPaste.copy(selected);
        }
        return;
      }

      if (isCmdV(keyEvent)) {
        keyEvent.preventDefault();
        this._paste();
        return;
      }

      if (isCmdD(keyEvent)) {
        keyEvent.preventDefault();
        if (selected.length) {
          copyPaste.copy(selected);
          this._paste(24, 24);
        }
        return;
      }

      if (isCmdA(keyEvent)) {
        keyEvent.preventDefault();
        const root = canvas.getRootElement();
        const all = this._elementRegistry.getAll()
          .filter(el => !el.labelTarget && el !== root && !el.waypoints);
        this._sel.select(all);
      }
    }, true);
  }

  copy(elements) {
    if (elements && elements.length) this._cp.copy(elements);
  }

  paste(dx = 0, dy = 0) { this._paste(dx, dy); }

  _paste(dx = 0, dy = 0) {
    try {
      const root = this._canvas.getRootElement();
      const vb   = this._canvas.viewbox();
      // Paste at current mouse position if available; otherwise viewport center.
      const base = this._lastPointer || {
        x: vb.x + vb.width  / 2,
        y: vb.y + vb.height / 2,
      };
      this._cp.paste({
        element: root,
        point: {
          x: base.x + dx,
          y: base.y + dy,
        }
      });
    } catch (err) {
      console.warn('[mflex] paste error:', err.message);
    }
  }
}

MflexCopyPaste.$inject = ['copyPaste', 'selection', 'canvas', 'elementRegistry'];

// ─── 4. Marquee select (Miro-like empty-canvas drag) ─────────────────────────

export class MflexMarqueeSelect {
  constructor(eventBus, canvas, lassoTool) {
    const canvasEl = canvas.getContainer();

    // Robust fallback: start marquee from empty-canvas DOM background drag.
    canvasEl.addEventListener('mousedown', (e) => {
      if (!e || e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (e.target && e.target.closest('.djs-element')) return;
      try { lassoTool.activateSelection(e); } catch (_) {}
    }, true);

    eventBus.on('element.mousedown', 1600, (event) => {
      const { element, originalEvent } = event;
      if (!originalEvent || originalEvent.button !== 0) return;
      if (originalEvent.ctrlKey || originalEvent.metaKey || originalEvent.shiftKey || originalEvent.altKey) return;

      const root = canvas.getRootElement();
      if (element !== root) return;

      // Start rectangle selection on empty-canvas drag instead of pan/move behavior.
      try {
        lassoTool.activateSelection(originalEvent);
        event.stopPropagation();
      } catch (_) {}
    });
  }
}

MflexMarqueeSelect.$inject = ['eventBus', 'canvas', 'lassoTool'];

// ─── Keyboard helpers ─────────────────────────────────────────────────────────

function isCmd(e)  { return e.ctrlKey || e.metaKey; }
function isCmdC(e) { return isCmd(e) && (e.key === 'c' || e.key === 'C') && !e.shiftKey; }
function isCmdV(e) { return isCmd(e) && (e.key === 'v' || e.key === 'V') && !e.shiftKey; }
function isCmdD(e) { return isCmd(e) && (e.key === 'd' || e.key === 'D') && !e.shiftKey; }
function isCmdA(e) { return isCmd(e) && (e.key === 'a' || e.key === 'A') && !e.shiftKey; }

function shouldIgnoreShortcut(e) {
  const t = e.target;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  if (t.closest && t.closest('.djs-direct-editing-parent')) return true;
  return false;
}

// ─── Module descriptor ───────────────────────────────────────────────────────

export default {
  __init__: ['mflexMoveRules', 'mflexFreeText', 'mflexCopyPaste', 'mflexMarqueeSelect'],
  mflexMoveRules: ['type', MflexMoveRules],
  mflexFreeText:  ['type', MflexFreeText],
  mflexCopyPaste: ['type', MflexCopyPaste],
  mflexMarqueeSelect: ['type', MflexMarqueeSelect],
};
