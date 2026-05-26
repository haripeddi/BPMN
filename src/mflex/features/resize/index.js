/**
 * MFlex Resize + Connection Module
 *
 * Three parts working together:
 *
 * 1. MflexResizeRules — overrides BpmnRules at high priority to allow
 *    resizing ALL shape types.
 *
 * 2. MflexResizeHandles — draws 4 Miro-style square corner handles for
 *    resizing. Delegates to diagram-js native resize.
 *
 * 3. Connection dots — 4 blue circular dots at the midpoints of each side
 *    of the selected element.
 *    • Hover a dot  → shows a ghost preview of the same element type in
 *                     that direction (indicates where a new connected
 *                     element would appear).
 *    • Click a dot  → creates a new element of the same type and connects
 *                     it with a sequence flow.
 *    • Drag from dot → activates bpmn-js native connect tool so the user
 *                      can draw an arrow to an existing element.
 */

// ─── Handle geometry ─────────────────────────────────────────────────────────

const RESIZE_HALF  = 5;   // half of 10 px square corner handle
const CONNECT_HALF = 7;   // half of 14 px circular connection dot
const CONNECT_GAP  = 60;  // diagram-unit gap between source and ghost

/** Four corners → used for resize only */
const RESIZE_DIRS = [
  { id: 'nw', rx: 0, ry: 0, cursor: 'nw-resize' },
  { id: 'ne', rx: 1, ry: 0, cursor: 'ne-resize' },
  { id: 'se', rx: 1, ry: 1, cursor: 'se-resize' },
  { id: 'sw', rx: 0, ry: 1, cursor: 'sw-resize' },
];

/** Four midpoints → used for connection dots */
const CONNECT_SIDES = [
  { id: 'n', rx: 0.5, ry: 0,   dx:  0, dy: -1 },
  { id: 'e', rx: 1,   ry: 0.5, dx:  1, dy:  0 },
  { id: 's', rx: 0.5, ry: 1,   dx:  0, dy:  1 },
  { id: 'w', rx: 0,   ry: 0.5, dx: -1, dy:  0 },
];

// ─── Resize Rules override ────────────────────────────────────────────────────

import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import { is }       from 'bpmn-js/lib/util/ModelUtil';

class MflexResizeRules extends RuleProvider {
  constructor(eventBus) {
    super(eventBus);
  }

  init() {
    this.addRule('shape.resize', 2000, ({ shape, newBounds }) => {
      if (!shape) return null;
      if (shape.waypoints) return null;
      if (shape.type === 'label') return false;

      if (is(shape, 'bpmn:Participant') || is(shape, 'bpmn:Lane')) {
        if (newBounds) {
          if (newBounds.width < 50 || newBounds.height < 30) return false;
        }
        return null;
      }

      if (newBounds) {
        return newBounds.width >= 20 && newBounds.height >= 20;
      }

      return true;
    });
  }
}

MflexResizeRules.$inject = ['eventBus'];

// ─── Resize + Connection Handles ──────────────────────────────────────────────

class MflexResizeHandles {
  constructor(eventBus, canvas, selection, resize, connect, modeling, elementFactory) {
    this._canvas         = canvas;
    this._resize         = resize;
    this._connect        = connect;
    this._modeling       = modeling;
    this._elementFactory = elementFactory;
    this._container      = null;
    this._current        = null;
    this._ghost          = null;
    this._isDragging     = false;
    this._isEditing      = false;

    // ── Selection ──────────────────────────────────────────────────────────
    eventBus.on('selection.changed', (e) => {
      const shapes = (e.newSelection || []).filter(
        el => !el.waypoints && el.type !== 'label' && el.width
      );
      this._clear();
      if (shapes.length === 1 && !this._isDragging && !this._isEditing) {
        this._show(shapes[0]);
      }
    });

    // Reposition on resize or viewport change
    eventBus.on([
      'resize.end',
      'canvas.viewbox.changed',
    ], () => {
      if (this._current && !this._isDragging && !this._isEditing) {
        this._clear();
        this._show(this._current);
      }
    });

    // Refresh position when element data changes (not during move)
    eventBus.on('element.changed', ({ element }) => {
      if (this._isDragging || this._isEditing) return;
      if (this._current && element && element.id === this._current.id) {
        this._clear();
        this._show(this._current);
      }
    });

    // ── Drag / move lifecycle ───────────────────────────────────────────
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

  // ── Coordinate helpers ────────────────────────────────────────────────────

  /** Diagram (x, y) → page {left, top} in fixed coordinates */
  _toPage(diagramX, diagramY) {
    const vb   = this._canvas.viewbox();
    const rect = this._canvas.getContainer().getBoundingClientRect();
    const sx   = rect.width  / vb.outer.width;
    const sy   = rect.height / vb.outer.height;
    return {
      left: rect.left + (diagramX - vb.x) * sx,
      top:  rect.top  + (diagramY - vb.y) * sy,
    };
  }

  /** Returns current canvas scale {sx, sy} */
  _scale() {
    const vb   = this._canvas.viewbox();
    const rect = this._canvas.getContainer().getBoundingClientRect();
    return {
      sx: rect.width  / vb.outer.width,
      sy: rect.height / vb.outer.height,
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  _clear() {
    this._clearGhost();
    if (this._container) {
      this._container.remove();
      this._container = null;
    }
    this._current = null;
  }

  _show(element) {
    if (!element || !element.width || !element.height) return;
    this._current = element;

    const c = document.createElement('div');
    c.className = 'mflex-resize-layer';
    c.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:7500;';

    const { x, y, width, height } = element;

    // ── Corner resize handles ──────────────────────────────────────────────
    RESIZE_DIRS.forEach(dir => {
      const h = document.createElement('div');
      h.className       = `mflex-rh mflex-rh-${dir.id}`;
      h.style.cursor    = dir.cursor;
      h.style.pointerEvents = 'all';

      const pt = this._toPage(x + dir.rx * width, y + dir.ry * height);
      h.style.left = `${pt.left - RESIZE_HALF}px`;
      h.style.top  = `${pt.top  - RESIZE_HALF}px`;

      h.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { this._resize.activate(e, element, dir.id); } catch (_) {}
      });

      c.appendChild(h);
    });

    // ── Connection dots (midpoints) ────────────────────────────────────────
    CONNECT_SIDES.forEach(side => {
      const d = document.createElement('div');
      d.className       = `mflex-cd mflex-cd-${side.id}`;
      d.style.cursor    = 'crosshair';
      d.style.pointerEvents = 'all';

      const pt = this._toPage(x + side.rx * width, y + side.ry * height);
      d.style.left = `${pt.left - CONNECT_HALF}px`;
      d.style.top  = `${pt.top  - CONNECT_HALF}px`;

      // Ghost preview on hover
      d.addEventListener('mouseenter', () => this._showGhost(element, side));
      d.addEventListener('mouseleave', (e) => {
        // Keep ghost alive while cursor moves to it
        if (this._ghost && this._ghost.contains(e.relatedTarget)) return;
        this._clearGhost();
      });

      // Click vs drag: start on mousedown, decide on mousemove/mouseup
      d.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX, startY = e.clientY;
        let dragged = false;

        // Connection start point in diagram coords (midpoint of this side)
        const connPt = {
          x: x + side.rx * width,
          y: y + side.ry * height,
        };

        const onMove = (me) => {
          if (!dragged && (Math.abs(me.clientX - startX) > 5 || Math.abs(me.clientY - startY) > 5)) {
            dragged = true;
            document.removeEventListener('mousemove', onMove);
            this._clearGhost();
            // Hand off to bpmn-js native connect dragging
            try { this._connect.start(me, element, connPt); } catch (err) {
              console.warn('[mflex] connect.start:', err);
            }
          }
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (!dragged) {
            // Simple click → create a new connected element
            this._clearGhost();
            this._createConnected(element, side);
          }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      c.appendChild(d);
    });

    document.body.appendChild(c);
    this._container = c;
  }

  // ── Ghost preview ─────────────────────────────────────────────────────────

  /**
   * Shows a translucent ghost div at the position where a new element
   * would be created if the user clicks this connection dot.
   */
  _showGhost(element, side) {
    this._clearGhost();

    const { x, y, width, height } = element;
    const { sx, sy } = this._scale();

    // Center of the ghost in diagram coordinates
    const gCX = x + width  / 2 + side.dx * (width  + CONNECT_GAP);
    const gCY = y + height / 2 + side.dy * (height + CONNECT_GAP);

    // Top-left corner of ghost in page coordinates
    const tl = this._toPage(gCX - width / 2, gCY - height / 2);

    const ghost = document.createElement('div');
    ghost.className = 'mflex-connect-ghost';
    ghost.style.cssText = [
      'position:fixed',
      `left:${tl.left}px`,
      `top:${tl.top}px`,
      `width:${Math.max(width * sx, 30)}px`,
      `height:${Math.max(height * sy, 24)}px`,
      'pointer-events:all',
    ].join(';');

    // Clicking the ghost also creates the connected element
    ghost.addEventListener('click', (e) => {
      e.stopPropagation();
      this._clearGhost();
      this._createConnected(element, side);
    });

    ghost.addEventListener('mouseleave', () => this._clearGhost());

    document.body.appendChild(ghost);
    this._ghost = ghost;
  }

  _clearGhost() {
    if (this._ghost) {
      this._ghost.remove();
      this._ghost = null;
    }
  }

  // ── Create connected element ──────────────────────────────────────────────

  /**
   * Creates a new shape of the same type as sourceElement, positioned in
   * the given side direction, and connects them with a sequence flow.
   */
  _createConnected(sourceElement, side) {
    const { x, y, width, height } = sourceElement;

    // Center of the new element
    const cx = x + width  / 2 + side.dx * (width  + CONNECT_GAP);
    const cy = y + height / 2 + side.dy * (height + CONNECT_GAP);

    try {
      const newShapeEl = this._elementFactory.createShape({
        type:   sourceElement.type,
        width:  width,
        height: height,
      });

      const shape = this._modeling.createShape(
        newShapeEl,
        { x: cx, y: cy },
        sourceElement.parent
      );

      this._modeling.connect(sourceElement, shape);
    } catch (err) {
      console.warn('[mflex] createConnected:', err);
    }
  }
}

// ── Global pointer-event guard ────────────────────────────────────────────
// Disable handle pointer-events on any mousedown so bpmn-js hit-testing
// doesn't land on our overlay divs during drag operations.
document.addEventListener('mousedown', () => {
  document.querySelectorAll('.mflex-rh, .mflex-cd').forEach(h => {
    h.style.pointerEvents = 'none';
  });
}, true);

document.addEventListener('mouseup', () => {
  requestAnimationFrame(() => {
    document.querySelectorAll('.mflex-rh, .mflex-cd').forEach(h => {
      h.style.pointerEvents = 'all';
    });
  });
}, true);

MflexResizeHandles.$inject = [
  'eventBus', 'canvas', 'selection', 'resize',
  'connect', 'modeling', 'elementFactory',
];

// ─── Module export ────────────────────────────────────────────────────────────

export default {
  __init__: ['mflexResizeHandles', 'mflexResizeRules'],
  mflexResizeHandles: ['type', MflexResizeHandles],
  mflexResizeRules:   ['type', MflexResizeRules],
};
