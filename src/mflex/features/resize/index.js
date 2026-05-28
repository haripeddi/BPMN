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
  constructor(eventBus, canvas, selection, resize, connect, modeling, elementFactory, elementRegistry) {
    this._canvas         = canvas;
    this._resize         = resize;
    this._connect        = connect;
    this._modeling       = modeling;
    this._elementFactory = elementFactory;
    this._elementRegistry = elementRegistry;
    this._container      = null;
    this._current        = null;
    this._ghost          = null;
    this._previewConn    = null;
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

    // Keep connections visible after aggressive free-move / overlap cases.
    eventBus.on('shape.move.end', (e) => {
      const moved = (e && (e.shape || (e.context && e.context.shape))) || null;
      if (!moved) return;
      this._ensureVisibleConnections(moved);
    });

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
    this._clearPreviewConnection();
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
        this._clearPreviewConnection();
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
            // Simple click → connect to nearest in that direction, else create new
            this._clearGhost();
            this._clearPreviewConnection();
            this._connectFromSide(element, side);
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
   * Shows a ghost that visually mirrors the source element at the position
   * where a new connected element would be created. The element's actual
   * SVG visual is cloned so the ghost looks identical to the source shape.
   */
  _showGhost(element, side) {
    this._clearGhost();

    const { x, y, width, height } = element;
    const { sx, sy } = this._scale();
    const existingTarget = this._findNearestTarget(element, side);
    const previewElement = existingTarget || element;
    const { x: px, y: py, width: pw, height: ph } = previewElement;

    // Center of the ghost in diagram coordinates:
    // if a nearby target exists, mirror that target; otherwise show new-shape location.
    const gCX = existingTarget
      ? (px + pw / 2)
      : (x + width / 2 + side.dx * (width + CONNECT_GAP));
    const gCY = existingTarget
      ? (py + ph / 2)
      : (y + height / 2 + side.dy * (height + CONNECT_GAP));

    if (existingTarget) {
      this._showPreviewConnection(element, existingTarget, side);
    } else {
      this._clearPreviewConnection();
    }

    // Top-left corner of ghost in page coordinates
    const tl = this._toPage(gCX - pw / 2, gCY - ph / 2);

    const ghost = document.createElement('div');
    ghost.className = 'mflex-connect-ghost';
    ghost.style.cssText = [
      'position:fixed',
      `left:${tl.left}px`,
      `top:${tl.top}px`,
      `width:${Math.max(pw * sx, 30)}px`,
      `height:${Math.max(ph * sy, 24)}px`,
      'pointer-events:all',
      'overflow:hidden',
    ].join(';');

    // Clone the source element's rendered SVG so the ghost looks like the actual shape
    try {
      const gfxNode  = this._canvas.getGraphics(previewElement);
      const container = (gfxNode && gfxNode.node) || gfxNode;
      const visualGrp = container && container.querySelector('.djs-visual');
      if (visualGrp) {
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgEl.setAttribute('viewBox', `0 0 ${pw} ${ph}`);
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svgEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0.5;pointer-events:none;';

        const cloned = visualGrp.cloneNode(true);
        // Remove text labels — ghost shows shape silhouette only
        cloned.querySelectorAll('text, tspan').forEach(n => n.remove());
        svgEl.appendChild(cloned);
        ghost.appendChild(svgEl);
      }
    } catch (_) { /* fallback: plain ghost outline div */ }

    // Clicking the ghost also creates the connected element
    ghost.addEventListener('click', (e) => {
      e.stopPropagation();
      this._clearGhost();
      this._clearPreviewConnection();
      this._connectFromSide(element, side);
    });

    ghost.addEventListener('mouseleave', () => {
      this._clearGhost();
      this._clearPreviewConnection();
    });

    document.body.appendChild(ghost);
    this._ghost = ghost;
  }

  _clearGhost() {
    if (this._ghost) {
      this._ghost.remove();
      this._ghost = null;
    }
  }

  _showPreviewConnection(sourceElement, targetElement, side) {
    this._clearPreviewConnection();

    const sourceCenterY = sourceElement.y + sourceElement.height / 2;
    const sourceCenterX = sourceElement.x + sourceElement.width / 2;
    const targetCenterY = targetElement.y + targetElement.height / 2;
    const targetCenterX = targetElement.x + targetElement.width / 2;

    let fromX = sourceCenterX;
    let fromY = sourceCenterY;
    let toX = targetCenterX;
    let toY = targetCenterY;

    if (side.id === 'e') {
      fromX = sourceElement.x + sourceElement.width;
      fromY = sourceCenterY;
      toX = targetElement.x;
      toY = clamp(sourceCenterY, targetElement.y, targetElement.y + targetElement.height);
    } else if (side.id === 'w') {
      fromX = sourceElement.x;
      fromY = sourceCenterY;
      toX = targetElement.x + targetElement.width;
      toY = clamp(sourceCenterY, targetElement.y, targetElement.y + targetElement.height);
    } else if (side.id === 's') {
      fromX = sourceCenterX;
      fromY = sourceElement.y + sourceElement.height;
      toX = clamp(sourceCenterX, targetElement.x, targetElement.x + targetElement.width);
      toY = targetElement.y;
    } else if (side.id === 'n') {
      fromX = sourceCenterX;
      fromY = sourceElement.y;
      toX = clamp(sourceCenterX, targetElement.x, targetElement.x + targetElement.width);
      toY = targetElement.y + targetElement.height;
    }

    const p1 = this._toPage(fromX, fromY);
    const p2 = this._toPage(toX, toY);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('mflex-conn-preview');
    svg.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'width:100vw',
      'height:100vh',
      'pointer-events:none',
      'z-index:7490'
    ].join(';');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'mflex-preview-arrowhead');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto');

    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowPath.setAttribute('fill', '#2563eb');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(p1.left));
    line.setAttribute('y1', String(p1.top));
    line.setAttribute('x2', String(p2.left));
    line.setAttribute('y2', String(p2.top));
    line.setAttribute('stroke', '#2563eb');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', 'url(#mflex-preview-arrowhead)');
    line.setAttribute('stroke-dasharray', '5 4');
    svg.appendChild(line);

    document.body.appendChild(svg);
    this._previewConn = svg;
  }

  _clearPreviewConnection() {
    if (this._previewConn) {
      this._previewConn.remove();
      this._previewConn = null;
    }
  }

  _connectFromSide(sourceElement, side) {
    const target = this._findNearestTarget(sourceElement, side);
    if (target) {
      // If a nearby target exists, prioritize connecting to it.
      // Do NOT create a new shape in this path; this matches Miro-style intent.
      if (!this._connectElements(sourceElement, target, side)) {
        console.warn('[mflex] Found nearby target but connection was not allowed');
      }
      return;
    }

    this._createConnected(sourceElement, side);
  }

  _findNearestTarget(sourceElement, side) {
    const sx1 = sourceElement.x;
    const sy1 = sourceElement.y;
    const sx2 = sourceElement.x + sourceElement.width;
    const sy2 = sourceElement.y + sourceElement.height;
    const MAX_ALONG_DIST = 500;
    const AXIS_PAD = 12;

    const candidates = this._elementRegistry.filter((el) => {
      if (!el || el.id === sourceElement.id) return false;
      if (el.waypoints || el.type === 'label') return false;
      if (!el.width || !el.height) return false;
      if (!this._isConnectableNode(el)) return false;
      return true;
    });

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const el of candidates) {
      const tx1 = el.x;
      const ty1 = el.y;
      const tx2 = el.x + el.width;
      const ty2 = el.y + el.height;

      let along = Number.POSITIVE_INFINITY;
      let perp = Number.POSITIVE_INFINITY;

      if (side.id === 'e') {
        along = tx1 - sx2;
        if (along < -AXIS_PAD || along > MAX_ALONG_DIST) continue;
        perp = intervalGap(sy1, sy2, ty1, ty2);
      } else if (side.id === 'w') {
        along = sx1 - tx2;
        if (along < -AXIS_PAD || along > MAX_ALONG_DIST) continue;
        perp = intervalGap(sy1, sy2, ty1, ty2);
      } else if (side.id === 's') {
        along = ty1 - sy2;
        if (along < -AXIS_PAD || along > MAX_ALONG_DIST) continue;
        perp = intervalGap(sx1, sx2, tx1, tx2);
      } else if (side.id === 'n') {
        along = sy1 - ty2;
        if (along < -AXIS_PAD || along > MAX_ALONG_DIST) continue;
        perp = intervalGap(sx1, sx2, tx1, tx2);
      }

      // Strongly prioritize objects aligned on the same row/column,
      // then nearest in the requested direction.
      const score = perp * 10 + Math.max(0, along);
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return best;
  }

  _isConnectableNode(element) {
    const bo = element && element.businessObject;
    if (!bo || typeof bo.$instanceOf !== 'function') return false;

    // Exclude non-connectable containers/canvas structures that otherwise
    // often become false "nearest targets" (Lane/Participant/etc).
    if (bo.$instanceOf('bpmn:Participant')) return false;
    if (bo.$instanceOf('bpmn:Lane')) return false;
    if (bo.$instanceOf('bpmn:Process')) return false;
    if (bo.$instanceOf('bpmn:Collaboration')) return false;

    // Include actual diagram nodes users expect to connect.
    return (
      bo.$instanceOf('bpmn:FlowNode') ||
      bo.$instanceOf('bpmn:Artifact') ||
      bo.$instanceOf('bpmn:DataObjectReference')
    );
  }

  _hasConnectionBetween(sourceElement, targetElement) {
    const outgoing = sourceElement.outgoing || [];
    return outgoing.some((conn) => conn && conn.target && conn.target.id === targetElement.id);
  }

  _connectElements(sourceElement, targetElement, side = null) {
    if (!targetElement) return false;
    if (this._hasConnectionBetween(sourceElement, targetElement)) return true;

    const waypoints = side ? this._buildWaypointsForSide(sourceElement, targetElement, side) : null;

    // Attempt 1: auto type by bpmn-js rules
    try {
      const conn = this._modeling.connect(sourceElement, targetElement);
      if (conn) return true;
    } catch (_) {}

    // Attempt 2: explicit SequenceFlow with robust parent fallback order.
    // Using the nearest valid parent keeps BPMN DI waypoints + arrow marker stable.
    const seqParents = [
      sourceElement.parent,
      targetElement.parent,
      this._findCommonConnectionParent(sourceElement, targetElement)
    ].filter(Boolean);

    for (const p of seqParents) {
      try {
        this._modeling.createConnection(
          sourceElement,
          targetElement,
          waypoints
            ? { type: 'bpmn:SequenceFlow', waypoints }
            : { type: 'bpmn:SequenceFlow' },
          p
        );
        return true;
      } catch (_) {}
    }

    // Attempt 3: explicit Association as final fallback.
    // Set associationDirection=One so the fallback still has a visible arrowhead.
    const assocParents = seqParents.length ? seqParents : [sourceElement.parent].filter(Boolean);
    for (const p of assocParents) {
      try {
        this._modeling.createConnection(
          sourceElement,
          targetElement,
          waypoints
            ? { type: 'bpmn:Association', associationDirection: 'One', waypoints }
            : { type: 'bpmn:Association', associationDirection: 'One' },
          p
        );
        return true;
      } catch (_) {}
    }

    return false;
  }

  _ensureVisibleConnections(shape) {
    const conns = [...(shape.incoming || []), ...(shape.outgoing || [])];
    conns.forEach((conn) => {
      if (!conn || !conn.source || !conn.target) return;
      const wp = conn.waypoints || [];
      if (wp.length < 2) return;

      const a = wp[0];
      const b = wp[wp.length - 1];
      const dist = Math.hypot((b.x - a.x), (b.y - a.y));
      if (dist >= 12) return; // normal connection is already visible

      const rebuilt = this._buildConnectionWaypointsFromBounds(conn.source, conn.target);
      if (!rebuilt) return;
      try {
        this._modeling.updateWaypoints(conn, rebuilt);
      } catch (_) {}
    });
  }

  _buildConnectionWaypointsFromBounds(sourceElement, targetElement) {
    if (!sourceElement || !targetElement) return null;
    const sx = sourceElement.x + sourceElement.width / 2;
    const sy = sourceElement.y + sourceElement.height / 2;
    const tx = targetElement.x + targetElement.width / 2;
    const ty = targetElement.y + targetElement.height / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    const OUTER = 4;

    let from;
    let to;

    if (Math.abs(dx) >= Math.abs(dy)) {
      // Horizontal dominant
      if (dx >= 0) {
        from = { x: sourceElement.x + sourceElement.width, y: sy };
        to   = { x: targetElement.x - OUTER, y: clamp(sy, targetElement.y, targetElement.y + targetElement.height) };
      } else {
        from = { x: sourceElement.x, y: sy };
        to   = { x: targetElement.x + targetElement.width + OUTER, y: clamp(sy, targetElement.y, targetElement.y + targetElement.height) };
      }
    } else {
      // Vertical dominant
      if (dy >= 0) {
        from = { x: sx, y: sourceElement.y + sourceElement.height };
        to   = { x: clamp(sx, targetElement.x, targetElement.x + targetElement.width), y: targetElement.y - OUTER };
      } else {
        from = { x: sx, y: sourceElement.y };
        to   = { x: clamp(sx, targetElement.x, targetElement.x + targetElement.width), y: targetElement.y + targetElement.height + OUTER };
      }
    }

    return [from, to];
  }

  _findCommonConnectionParent(sourceElement, targetElement) {
    const sourceAncestors = new Set();
    let cur = sourceElement;
    while (cur) {
      sourceAncestors.add(cur);
      cur = cur.parent;
    }

    cur = targetElement;
    while (cur) {
      if (sourceAncestors.has(cur)) return cur;
      cur = cur.parent;
    }

    return sourceElement.parent || null;
  }

  _buildWaypointsForSide(sourceElement, targetElement, side) {
    const sourceCenterX = sourceElement.x + sourceElement.width / 2;
    const sourceCenterY = sourceElement.y + sourceElement.height / 2;
    const targetCenterX = targetElement.x + targetElement.width / 2;
    const targetCenterY = targetElement.y + targetElement.height / 2;
    const OUTER = 3;

    let from = { x: sourceCenterX, y: sourceCenterY };
    let to = { x: targetCenterX, y: targetCenterY };

    if (side.id === 'e') {
      from = { x: sourceElement.x + sourceElement.width, y: sourceCenterY };
      to = {
        x: targetElement.x - OUTER,
        y: clamp(sourceCenterY, targetElement.y, targetElement.y + targetElement.height)
      };
    } else if (side.id === 'w') {
      from = { x: sourceElement.x, y: sourceCenterY };
      to = {
        x: targetElement.x + targetElement.width + OUTER,
        y: clamp(sourceCenterY, targetElement.y, targetElement.y + targetElement.height)
      };
    } else if (side.id === 's') {
      from = { x: sourceCenterX, y: sourceElement.y + sourceElement.height };
      to = {
        x: clamp(sourceCenterX, targetElement.x, targetElement.x + targetElement.width),
        y: targetElement.y - OUTER
      };
    } else if (side.id === 'n') {
      from = { x: sourceCenterX, y: sourceElement.y };
      to = {
        x: clamp(sourceCenterX, targetElement.x, targetElement.x + targetElement.width),
        y: targetElement.y + targetElement.height + OUTER
      };
    }

    return [from, to];
  }

  // ── Create connected element ──────────────────────────────────────────────

  /**
   * Creates a new shape of the same type as sourceElement, positioned in
   * the given side direction, and connects them with an arrow.
   *
   * Connection strategy (in priority order):
   *  1. modeling.connect(source, target)   — lets bpmn-js pick the right type
   *  2. explicit bpmn:SequenceFlow          — for Tasks / Events / Gateways
   *  3. explicit bpmn:Association           — for TextAnnotations / Artifacts
   */
  _createConnected(sourceElement, side) {
    const { x, y, width, height } = sourceElement;

    // Center of the new element in diagram coordinates
    const cx = x + width  / 2 + side.dx * (width  + CONNECT_GAP);
    const cy = y + height / 2 + side.dy * (height + CONNECT_GAP);

    // Walk up from Lane to find the real process/subprocess container
    // (SequenceFlows must live in the process, not in a Lane)
    let connParent = sourceElement.parent;
    while (connParent && connParent.type === 'bpmn:Lane') {
      connParent = connParent.parent;
    }
    if (!connParent) connParent = sourceElement.parent;

    let shape = null;
    try {
      const newShapeEl = this._elementFactory.createShape({
        type:   sourceElement.type,
        width:  width,
        height: height,
      });

      // Propagate custom shape type (parallelogram, hexagon, …) to the new element
      const srcShapeType = sourceElement.businessObject && sourceElement.businessObject.__mflexShapeType;
      if (srcShapeType && newShapeEl.businessObject) {
        newShapeEl.businessObject.__mflexShapeType = srcShapeType;
      }

      shape = this._modeling.createShape(
        newShapeEl,
        { x: cx, y: cy },
        sourceElement.parent
      );
    } catch (err) {
      console.warn('[mflex] createShape failed:', err);
      return;
    }

    if (!this._connectElements(sourceElement, shape, side)) {
      console.warn('[mflex] Could not create connection');
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
  'connect', 'modeling', 'elementFactory', 'elementRegistry',
];

// ─── Module export ────────────────────────────────────────────────────────────

export default {
  __init__: ['mflexResizeHandles', 'mflexResizeRules'],
  mflexResizeHandles: ['type', MflexResizeHandles],
  mflexResizeRules:   ['type', MflexResizeRules],
};

function intervalGap(a1, a2, b1, b2) {
  if (a2 < b1) return b1 - a2;
  if (b2 < a1) return a1 - b2;
  return 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
