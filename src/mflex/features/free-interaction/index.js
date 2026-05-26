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
  constructor(copyPaste, selection, canvas, keyboard, eventBus) {
    this._cp      = copyPaste;
    this._sel     = selection;
    this._canvas  = canvas;

    // Ctrl/Cmd + C  →  copy selection
    keyboard.addListener(1500, ({ keyEvent }) => {
      if (!isCmdC(keyEvent)) return;
      const selected = selection.get();
      if (selected.length) {
        copyPaste.copy(selected);
        return true; // consumed
      }
    });

    // Ctrl/Cmd + V  →  paste
    keyboard.addListener(1500, ({ keyEvent }) => {
      if (!isCmdV(keyEvent)) return;
      this._paste();
      return true;
    });

    // Ctrl/Cmd + D  →  duplicate (copy + paste with offset)
    keyboard.addListener(1500, ({ keyEvent }) => {
      if (!isCmdD(keyEvent)) return;
      keyEvent.preventDefault();
      const selected = selection.get();
      if (selected.length) {
        copyPaste.copy(selected);
        this._paste(20, 20);
      }
      return true;
    });
  }

  copy(elements) {
    if (elements && elements.length) this._cp.copy(elements);
  }

  paste(dx = 0, dy = 0) { this._paste(dx, dy); }

  _paste(dx = 0, dy = 0) {
    try {
      const root = this._canvas.getRootElement();
      const vb   = this._canvas.viewbox();
      // Paste at viewport centre + optional offset
      this._cp.paste({
        element: root,
        point: {
          x: vb.x + vb.width  / 2 + dx,
          y: vb.y + vb.height / 2 + dy,
        }
      });
    } catch (err) {
      console.warn('[mflex] paste error:', err.message);
    }
  }
}

MflexCopyPaste.$inject = ['copyPaste', 'selection', 'canvas', 'keyboard', 'eventBus'];

// ─── Keyboard helpers ─────────────────────────────────────────────────────────

function isCmd(e)  { return e.ctrlKey || e.metaKey; }
function isCmdC(e) { return isCmd(e) && (e.key === 'c' || e.key === 'C') && !e.shiftKey; }
function isCmdV(e) { return isCmd(e) && (e.key === 'v' || e.key === 'V') && !e.shiftKey; }
function isCmdD(e) { return isCmd(e) && (e.key === 'd' || e.key === 'D') && !e.shiftKey; }

// ─── Module descriptor ───────────────────────────────────────────────────────

export default {
  __init__: ['mflexMoveRules', 'mflexFreeText', 'mflexCopyPaste'],
  mflexMoveRules: ['type', MflexMoveRules],
  mflexFreeText:  ['type', MflexFreeText],
  mflexCopyPaste: ['type', MflexCopyPaste],
};
