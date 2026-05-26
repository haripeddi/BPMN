/**
 * MFlex Resize Module
 *
 * Two parts working together:
 *
 * 1. MflexResizeRules — overrides BpmnRules at high priority to allow
 *    resizing ALL shape types (Tasks, Events, Gateways, Pools, Lanes…).
 *    By default bpmn-js only allows SubProcess/Lane/Participant/TextAnnotation.
 *
 * 2. MflexResizeHandles — draws 8 Miro-style circular handles around
 *    the selected element using fixed-position DOM elements.
 *    On mousedown each handle delegates to diagram-js's native
 *    `resize.activate(event, shape, direction)` — so undo/redo, snap-
 *    lines, connection re-routing and all other diagram-js resize
 *    plumbing is preserved automatically.
 */

// ─── Handle geometry ─────────────────────────────────────────────────────────

const HANDLE_HALF = 5; // half of the rendered handle diameter (10 px)

const DIRECTIONS = [
  { id: 'nw', rx: 0,   ry: 0,   cursor: 'nw-resize' },
  { id: 'n',  rx: 0.5, ry: 0,   cursor: 'n-resize'  },
  { id: 'ne', rx: 1,   ry: 0,   cursor: 'ne-resize' },
  { id: 'e',  rx: 1,   ry: 0.5, cursor: 'e-resize'  },
  { id: 'se', rx: 1,   ry: 1,   cursor: 'se-resize' },
  { id: 's',  rx: 0.5, ry: 1,   cursor: 's-resize'  },
  { id: 'sw', rx: 0,   ry: 1,   cursor: 'sw-resize' },
  { id: 'w',  rx: 0,   ry: 0.5, cursor: 'w-resize'  },
];

// ─── Resize Rules override ────────────────────────────────────────────────────

import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import { is }       from 'bpmn-js/lib/util/ModelUtil';

class MflexResizeRules extends RuleProvider {
  constructor(eventBus) {
    super(eventBus);
  }

  init() {
    /**
     * Priority 2000 > BpmnRules default (1000) → runs first.
     * Returning true/false here short-circuits the default bpmn-js check.
     *
     * For Participant / Lane we return null so bpmn-js's native
     * LaneResizeBehavior can handle proportional lane resize correctly.
     * We still enforce a sensible minimum so the pool doesn't collapse.
     */
    this.addRule('shape.resize', 2000, ({ shape, newBounds }) => {
      if (!shape) return null;
      if (shape.waypoints) return null;
      if (shape.type === 'label') return false;

      // Delegate pool/lane resize to bpmn-js (LaneResizeBehavior)
      if (is(shape, 'bpmn:Participant') || is(shape, 'bpmn:Lane')) {
        if (newBounds) {
          // only block if unreasonably small
          if (newBounds.width < 50 || newBounds.height < 30) return false;
        }
        return null; // let bpmn-js decide
      }

      if (newBounds) {
        return newBounds.width >= 20 && newBounds.height >= 20;
      }

      return true;
    });
  }
}

MflexResizeRules.$inject = ['eventBus'];

// ─── Resize Handles ───────────────────────────────────────────────────────────

class MflexResizeHandles {
  constructor(eventBus, canvas, selection, resize) {
    this._canvas     = canvas;
    this._resize     = resize;   // diagram-js native Resize service
    this._container  = null;
    this._current    = null;
    this._isDragging = false;    // true while a move/create drag is in flight
    this._isEditing  = false;    // true while direct-edit is active

    // Show handles on selection change
    eventBus.on('selection.changed', (e) => {
      const shapes = (e.newSelection || []).filter(
        el => !el.waypoints && el.type !== 'label' && el.width
      );
      this._clear();
      if (shapes.length === 1 && !this._isDragging && !this._isEditing) {
        this._show(shapes[0]);
      }
    });

    // Reposition handles when the element is resized or viewport scrolls/zooms.
    // Do NOT reposition on element.changed during a move — that is what caused the ghost.
    eventBus.on([
      'resize.end',
      'canvas.viewbox.changed',
    ], () => {
      if (this._current && !this._isDragging && !this._isEditing) {
        this._clear();
        this._show(this._current);
      }
    });

    // element.changed: only refresh position when we are not mid-drag
    eventBus.on('element.changed', ({ element }) => {
      if (this._isDragging || this._isEditing) return;
      if (this._current && element && element.id === this._current.id) {
        this._clear();
        this._show(this._current);
      }
    });

    // ── Drag / move lifecycle ───────────────────────────────────────────
    // shape.move.start / shape.move.end cover element drag via the Move tool.
    // create.start / create.end cover dragging from the palette.
    // drag.start is the low-level fallback for any other drag.
    const onDragStart = () => {
      this._isDragging = true;
      this._clear();
    };

    const onDragEnd = () => {
      this._isDragging = false;
      if (this._current && !this._isEditing) {
        this._clear();
        this._show(this._current);
      }
    };

    eventBus.on([
      'shape.move.start',
      'create.start',
      'drag.start',
      'resize.start',
      'canvas.viewbox.changing',
    ], onDragStart);

    eventBus.on([
      'shape.move.end',
      'shape.move.canceled',
      'create.end',
      'create.canceled',
      'drag.end',
      'drag.canceled',
      'resize.end',
      'canvas.viewbox.changed',
    ], onDragEnd);

    // ── Direct-edit lifecycle ────────────────────────────────────────────
    // Hide handles while the user types inside an element.
    eventBus.on('directEditing.activate', () => {
      this._isEditing = true;
      this._clear();
    });

    eventBus.on(['directEditing.complete', 'directEditing.cancel'], () => {
      this._isEditing = false;
      if (this._current) {
        this._clear();
        this._show(this._current);
      }
    });
  }

  // ── coordinate helper ────────────────────────────────────────────────────

  _toPage(diagramX, diagramY) {
    const vb   = this._canvas.viewbox();
    const rect = this._canvas.getContainer().getBoundingClientRect();
    const sx   = rect.width  / vb.outer.width;
    const sy   = rect.height / vb.outer.height;
    return {
      left: rect.left + (diagramX - vb.x) * sx,
      top:  rect.top  + (diagramY - vb.y) * sy
    };
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  _clear() {
    if (this._container) {
      this._container.remove();
      this._container = null;
    }
    this._current = null;
  }

  _show(element) {
    if (!element || !element.width || !element.height) return;
    this._current = element;

    // Wrapper div — pointer-events:none so it doesn't block canvas interactions
    const c = document.createElement('div');
    c.className = 'mflex-resize-layer';
    c.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:7500;';

    const { x, y, width, height } = element;

    DIRECTIONS.forEach(dir => {
      const h   = document.createElement('div');
      h.className       = `mflex-rh mflex-rh-${dir.id}`;
      h.style.cursor    = dir.cursor;
      h.style.pointerEvents = 'all';

      // Position centred on the handle point
      const pt = this._toPage(x + dir.rx * width, y + dir.ry * height);
      h.style.left = `${pt.left - HANDLE_HALF}px`;
      h.style.top  = `${pt.top  - HANDLE_HALF}px`;

      // Hand off to diagram-js native resize — gives free undo/redo, snap, routing
      h.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          this._resize.activate(e, element, dir.id);
        } catch (_) {
          // Element may not support resize in a particular state; fail silently
        }
      });

      c.appendChild(h);
    });

    document.body.appendChild(c);
    this._container = c;
  }
}

// ── Global pointer-event guard ────────────────────────────────────────────
// While any mouse drag is in flight diagram-js uses elementFromPoint to find
// hover targets.  Our handles have pointer-events:all which makes the browser
// return a handle <div> instead of the underlying SVG shape — bpmn-js then
// crashes trying to translate an undefined element.
// Fix: blanket-disable handle pointer-events on mousedown, restore on mouseup.
document.addEventListener('mousedown', () => {
  document.querySelectorAll('.mflex-rh').forEach(h => {
    h.style.pointerEvents = 'none';
  });
}, true);

document.addEventListener('mouseup', () => {
  // Small defer so the resize activate click isn't accidentally blocked
  requestAnimationFrame(() => {
    document.querySelectorAll('.mflex-rh').forEach(h => {
      h.style.pointerEvents = 'all';
    });
  });
}, true);

MflexResizeHandles.$inject = ['eventBus', 'canvas', 'selection', 'resize'];

// ─── Module export ────────────────────────────────────────────────────────────

export default {
  __init__: ['mflexResizeHandles', 'mflexResizeRules'],
  mflexResizeHandles: ['type', MflexResizeHandles],
  mflexResizeRules:   ['type', MflexResizeRules]
};
