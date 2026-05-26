/**
 * MFlex Context Toolbar — dynamic, Miro-style
 *
 * Shows only the controls that are relevant for the selected element type:
 *   • Connections  → stroke color + width
 *   • Events       → fill + border
 *   • Gateways     → fill + border
 *   • Tasks        → fill + text + font + emphasis + align + border + size
 *   • Swimlanes    → fill + border + size + Add Lane + Text Direction
 *   • Annotations  → text + font + emphasis + align + border + size
 *   • Data         → fill + border + size
 *   • Group        → fill + border + size
 *   • SubProcess   → task controls + collapse toggle
 */

import { is } from 'bpmn-js/lib/util/ModelUtil';

const TOPBAR_HEIGHT = 48;
const TOOLBAR_OFFSET = 20; // gap between element and toolbar

const PRESET_COLORS = [
  '#ffffff','#f8fafc','#fef9c3','#fce7f3','#dbeafe',
  '#dcfce7','#ffe4e6','#f3e8ff','#ffedd5','#e0f2fe',
  '#374151','#1e3a5f','#7c3aed','#b91c1c','#047857',
  '#0369a1','#9a3412','#6b21a8','#0f172a','#000000'
];

const FONTS = [
  'Arial','Helvetica','Inter','Roboto','Georgia',
  'Times New Roman','Courier New','Verdana','Tahoma'
];

// Control groups visible per element category
function getVisibleGroups(elements) {
  if (!elements.length) return new Set();
  const el    = elements[0];

  // External floating labels (e.g. event name labels)
  if (el.type === 'label' || el.labelTarget) {
    return new Set(['textColor','font','fontSize','emphasis','align']);
  }
  if (el.waypoints) {
    return new Set(['border', 'borderWidth']);
  }
  if (is(el, 'bpmn:Participant') || is(el, 'bpmn:Lane')) {
    return new Set(['fill', 'border', 'borderWidth', 'size', 'addLane', 'textDir']);
  }
  if (is(el, 'bpmn:SubProcess') || is(el, 'bpmn:CallActivity')) {
    return new Set(['fill','textColor','font','fontSize','emphasis','align','border','borderWidth','size','collapse']);
  }
  if (is(el, 'bpmn:Task')) {
    return new Set(['fill','textColor','font','fontSize','emphasis','align','border','borderWidth','size']);
  }
  if (is(el, 'bpmn:Event')) {
    return new Set(['fill','border','borderWidth','size']);
  }
  if (is(el, 'bpmn:Gateway')) {
    return new Set(['fill','border','borderWidth','size']);
  }
  if (is(el, 'bpmn:TextAnnotation')) {
    return new Set(['fill','textColor','font','fontSize','emphasis','align','border','borderWidth','size']);
  }
  if (is(el, 'bpmn:DataObjectReference') || is(el, 'bpmn:DataStoreReference')) {
    return new Set(['fill','border','size']);
  }
  if (is(el, 'bpmn:Group')) {
    return new Set(['fill','border','borderWidth','size']);
  }
  return new Set(['fill','textColor','font','fontSize','emphasis','align','border','borderWidth','size']);
}

// Map group key → DOM id
const GROUP_MAP = {
  fill:        'mflex-group-fill',
  textColor:   'mflex-group-text-color',
  font:        'mflex-group-font',
  fontSize:    'mflex-group-font-size',
  emphasis:    'mflex-group-emphasis',
  align:       'mflex-group-align',
  border:      'mflex-group-border',
  borderWidth: 'mflex-group-border-width',
  size:        'mflex-group-size',
  addLane:     'mflex-group-addlane',
  collapse:    'mflex-group-collapse',
  textDir:     'mflex-group-text-dir',
};

// ─── ContextToolbar ───────────────────────────────────────────────────────────

export default class ContextToolbar {
  constructor(modeler, styleApplier) {
    this._modeler     = modeler;
    this._applier     = styleApplier;
    this._selection   = [];
    this._formatPaint = null;
    this._isEditing   = false;
    this._isDragging  = false;

    this._container = this._createContainer();
    document.body.appendChild(this._container);
    this._bindEvents();
  }

  // ─── DOM ─────────────────────────────────────────────────────────────────

  _createContainer() {
    const el = document.createElement('div');
    el.id = 'mflex-toolbar';
    el.setAttribute('role', 'toolbar');
    el.innerHTML = this._buildHTML();
    el.style.display = 'none';
    return el;
  }

  _buildHTML() {
    const swatches = (id) =>
      PRESET_COLORS.map(c =>
        `<button class="mflex-swatch" data-color="${c}" data-target="${id}" style="background:${c}" title="${c}"></button>`
      ).join('');

    const fontOpts = FONTS.map(f => `<option value="${f}">${f}</option>`).join('');

    return `
    <div class="mflex-tb-inner">
      <span class="mflex-type-label" id="mflex-type-label"></span>
      <div class="mflex-sep"></div>

      <!-- Fill color -->
      <div class="mflex-group" id="mflex-group-fill">
        <button class="mflex-swatch-btn" id="mflex-fill-btn" title="Fill color">
          <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="9" rx="1" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="12" width="12" height="2.5" rx="1" fill="currentColor"/></svg>
          <span class="mflex-chevron">▾</span>
        </button>
        <div class="mflex-popover" id="mflex-fill-pop">
          <div class="mflex-swatch-grid">${swatches('fill')}</div>
          <div class="mflex-hex-row">
            <span class="mflex-hex-hash">#</span>
            <input class="mflex-hex-input" id="mflex-fill-hex" maxlength="6" placeholder="hex"/>
            <button class="mflex-apply-btn" data-apply="fill">OK</button>
          </div>
          <button class="mflex-reset-btn" data-reset="fill">Remove fill</button>
        </div>
      </div>

      <!-- Text color -->
      <div class="mflex-group" id="mflex-group-text-color">
        <button class="mflex-swatch-btn" id="mflex-text-color-btn" title="Text color">
          <svg width="16" height="16" viewBox="0 0 16 16"><text x="2" y="13" font-size="13" font-weight="bold" fill="currentColor">A</text><rect x="2" y="13.5" width="8" height="2" rx="1" fill="currentColor"/></svg>
          <span class="mflex-chevron">▾</span>
        </button>
        <div class="mflex-popover" id="mflex-text-color-pop">
          <div class="mflex-swatch-grid">${swatches('textColor')}</div>
          <div class="mflex-hex-row">
            <span class="mflex-hex-hash">#</span>
            <input class="mflex-hex-input" id="mflex-text-hex" maxlength="6" placeholder="hex"/>
            <button class="mflex-apply-btn" data-apply="textColor">OK</button>
          </div>
          <button class="mflex-reset-btn" data-reset="textColor">Remove</button>
        </div>
      </div>

      <div class="mflex-sep"></div>

      <!-- Font family -->
      <div class="mflex-group" id="mflex-group-font">
        <select class="mflex-select mflex-font-family" id="mflex-font-family" title="Font">${fontOpts}</select>
      </div>

      <!-- Font size -->
      <div class="mflex-group" id="mflex-group-font-size">
        <select class="mflex-select mflex-font-size" id="mflex-font-size" title="Size">
          ${[8,10,11,12,14,16,18,20,24,28,32,36,40,48].map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>

      <!-- Bold / Italic / Underline -->
      <div class="mflex-group" id="mflex-group-emphasis">
        <button class="mflex-icon-btn mflex-toggle" id="mflex-bold"      title="Bold"><b>B</b></button>
        <button class="mflex-icon-btn mflex-toggle" id="mflex-italic"    title="Italic"><i>I</i></button>
        <button class="mflex-icon-btn mflex-toggle" id="mflex-underline" title="Underline"><u>U</u></button>
      </div>

      <div class="mflex-sep"></div>

      <!-- H-align -->
      <div class="mflex-group" id="mflex-group-align">
        <button class="mflex-icon-btn mflex-toggle mflex-align" data-align="left"   title="Left">
          <svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <button class="mflex-icon-btn mflex-toggle mflex-align" data-align="center" title="Center">
          <svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <button class="mflex-icon-btn mflex-toggle mflex-align" data-align="right"  title="Right">
          <svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
      </div>

      <div class="mflex-sep"></div>

      <!-- Border color -->
      <div class="mflex-group" id="mflex-group-border">
        <button class="mflex-swatch-btn" id="mflex-border-btn" title="Border color">
          <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2" y="13" width="12" height="1.5" rx="1" fill="currentColor"/></svg>
          <span class="mflex-chevron">▾</span>
        </button>
        <div class="mflex-popover" id="mflex-border-color-pop">
          <div class="mflex-swatch-grid">${swatches('borderColor')}</div>
          <div class="mflex-hex-row">
            <span class="mflex-hex-hash">#</span>
            <input class="mflex-hex-input" id="mflex-border-hex" maxlength="6" placeholder="hex"/>
            <button class="mflex-apply-btn" data-apply="borderColor">OK</button>
          </div>
          <button class="mflex-reset-btn" data-reset="borderColor">Remove</button>
        </div>
      </div>

      <!-- Border width -->
      <div class="mflex-group" id="mflex-group-border-width">
        <select class="mflex-select mflex-border-width" id="mflex-border-width" title="Border width">
          <option value="1">1px</option>
          <option value="2" selected>2px</option>
          <option value="3">3px</option>
          <option value="4">4px</option>
          <option value="6">6px</option>
        </select>
      </div>

      <div class="mflex-sep"></div>

      <!-- Dimensions W×H -->
      <div class="mflex-group" id="mflex-group-size">
        <button class="mflex-icon-btn" id="mflex-size-btn" title="Set width × height">
          <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="6" x2="14" y2="2" stroke="currentColor" stroke-width="1.5"/><polyline points="12,2 14,2 14,4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
          W×H
        </button>
        <div class="mflex-popover mflex-size-pop" id="mflex-size-pop">
          <label class="mflex-dim-label">W <input type="number" id="mflex-width-input" min="30" class="mflex-dim-input"/></label>
          <label class="mflex-dim-label">H <input type="number" id="mflex-height-input" min="30" class="mflex-dim-input"/></label>
          <button class="mflex-apply-btn" id="mflex-size-apply">Apply</button>
        </div>
      </div>

      <!-- Add Lane (Pool / Lane only) -->
      <div class="mflex-group" id="mflex-group-addlane" style="display:none">
        <button class="mflex-icon-btn" id="mflex-addlane-btn" title="Add lane below">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <rect x="1" y="1" width="14" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>
            <rect x="1" y="9" width="14" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".45"/>
            <line x1="8" y1="11" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="7" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          + Lane
        </button>
      </div>

      <!-- Text direction toggle (Pool / Lane only) -->
      <div class="mflex-group" id="mflex-group-text-dir" style="display:none">
        <button class="mflex-icon-btn mflex-toggle" id="mflex-text-dir-btn" title="Toggle label direction: horizontal / vertical">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 14 A6 6 0 1 1 14 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <polyline points="11,5 14,8 11,11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="4" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- Collapse toggle (SubProcess only) -->
      <div class="mflex-group" id="mflex-group-collapse" style="display:none">
        <button class="mflex-icon-btn mflex-toggle" id="mflex-collapse-btn" title="Collapse / Expand">
          <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1.5"/><line id="mflex-collapse-vline" x1="8" y1="5" x2="8" y2="11" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
      </div>

      <!-- Zoom to fit -->
      <div class="mflex-group">
        <button class="mflex-icon-btn" id="mflex-zoomfit-btn" title="Zoom to selection">
          <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="11" y1="11" x2="14" y2="14" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" stroke-width="1.5"/><line x1="7" y1="5" x2="7" y2="9" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
      </div>

      <div class="mflex-sep"></div>

      <!-- Format painter -->
      <div class="mflex-group">
        <button class="mflex-icon-btn mflex-toggle" id="mflex-format-paint-btn" title="Format painter">
          <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor" opacity=".3" stroke="currentColor" stroke-width="1.2"/><line x1="9" y1="5.5" x2="14" y2="5.5" stroke="currentColor" stroke-width="1.5"/><line x1="14" y1="5.5" x2="14" y2="14" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="14" x2="14" y2="14" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
      </div>

      <!-- Reset -->
      <div class="mflex-group">
        <button class="mflex-icon-btn" id="mflex-reset-btn" title="Reset all styles">
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3a5 5 0 1 0 4.546 2.914" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><polyline points="12,1 12,5 8,5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <div class="mflex-sep"></div>

      <!-- Delete -->
      <div class="mflex-group">
        <button class="mflex-icon-btn mflex-delete-btn" id="mflex-delete-btn" title="Delete (Del)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="2,4 14,4"/><path d="M5 4V2h6v2"/><rect x="3" y="4" width="10" height="10" rx="1"/><line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/>
          </svg>
        </button>
      </div>
    </div>`;
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  _bindEvents() {
    const eventBus = this._modeler.get('eventBus');

    eventBus.on('selection.changed', (e) => {
      // Include labels so we can show text controls for them
      this._selection = e.newSelection || [];
      if (!this._isEditing && !this._isDragging) this._sync();
    });

    eventBus.on(['element.changed', 'shape.move.end', 'resize.end'], () => {
      if (this._selection.length && !this._isEditing && !this._isDragging) this._reposition();
    });

    eventBus.on('canvas.viewbox.changing', () => this._hide());
    eventBus.on('canvas.viewbox.changed', () => {
      if (this._selection.length && !this._isEditing) this._reposition();
    });

    eventBus.on(['shape.move.start', 'create.start', 'drag.start'], () => {
      this._isDragging = true;
      this._hide();
    });
    eventBus.on(['shape.move.end', 'shape.move.canceled', 'create.end', 'create.canceled', 'drag.end', 'drag.canceled'], () => {
      this._isDragging = false;
      if (this._selection.length && !this._isEditing) this._sync();
    });

    eventBus.on('directEditing.activate', () => {
      this._isEditing = true;
      this._hide();
    });
    eventBus.on(['directEditing.complete', 'directEditing.cancel'], () => {
      this._isEditing = false;
      if (this._selection.length) this._sync();
    });

    document.addEventListener('pointerdown', (e) => {
      if (!this._container.contains(e.target)) this._closePopovers();
    });

    this._bindActions();
  }

  _bindActions() {
    const tb = this._container;

    // Color swatches
    tb.querySelectorAll('.mflex-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        this._applyColorProp(btn.dataset.target, btn.dataset.color);
        this._closePopovers();
      });
    });

    // Hex inputs
    tb.querySelectorAll('.mflex-apply-btn[data-apply]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hexMap = { fill: 'mflex-fill-hex', textColor: 'mflex-text-hex', borderColor: 'mflex-border-hex' };
        const raw = document.getElementById(hexMap[btn.dataset.apply]).value.replace('#','');
        if (/^[0-9a-fA-F]{6}$/.test(raw)) {
          this._applyColorProp(btn.dataset.apply, `#${raw}`);
          this._closePopovers();
        }
      });
    });

    // Popover toggles
    const popToggle = (btnId, popId) => {
      tb.querySelector(`#${btnId}`).addEventListener('click', (e) => {
        e.stopPropagation();
        const pop = tb.querySelector(`#${popId}`);
        const was = pop.classList.contains('open');
        this._closePopovers();
        if (!was) pop.classList.add('open');
      });
    };
    popToggle('mflex-fill-btn',       'mflex-fill-pop');
    popToggle('mflex-text-color-btn', 'mflex-text-color-pop');
    popToggle('mflex-border-btn',     'mflex-border-color-pop');
    popToggle('mflex-size-btn',       'mflex-size-pop');

    // Reset color buttons
    tb.querySelectorAll('.mflex-reset-btn[data-reset]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._applyColorProp(btn.dataset.reset, null);
        this._closePopovers();
      });
    });

    // Font family
    tb.querySelector('#mflex-font-family').addEventListener('change', (e) => {
      this._applier.setStyle(this._selection, { fontFamily: e.target.value });
    });

    // Font size
    tb.querySelector('#mflex-font-size').addEventListener('change', (e) => {
      this._applier.setStyle(this._selection, { fontSize: +e.target.value });
    });

    // Emphasis
    ['bold','italic','underline'].forEach(prop => {
      const id = `mflex-${prop}`;
      tb.querySelector(`#${id}`).addEventListener('click', () => {
        const cur = this._getCommonStyle(prop);
        this._applier.setStyle(this._selection, { [prop]: !cur });
        tb.querySelector(`#${id}`).classList.toggle('active', !cur);
      });
    });

    // Align
    tb.querySelectorAll('.mflex-align').forEach(btn => {
      btn.addEventListener('click', () => {
        this._applier.setStyle(this._selection, { textAlign: btn.dataset.align });
        tb.querySelectorAll('.mflex-align').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Border width
    tb.querySelector('#mflex-border-width').addEventListener('change', (e) => {
      this._applier.setStyle(this._selection, { borderWidth: +e.target.value });
    });

    // W×H apply
    tb.querySelector('#mflex-size-apply').addEventListener('click', () => {
      const w = parseInt(tb.querySelector('#mflex-width-input').value, 10);
      const h = parseInt(tb.querySelector('#mflex-height-input').value, 10);
      if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) this._applyDimensions(w, h);
      this._closePopovers();
    });

    // Add Lane
    tb.querySelector('#mflex-addlane-btn').addEventListener('click', () => {
      if (this._selection.length === 1) {
        try { this._modeler.get('modeling').addLane(this._selection[0], 'bottom'); }
        catch (err) { console.warn('[mflex] addLane:', err.message); }
      }
    });

    // Text Direction toggle
    tb.querySelector('#mflex-text-dir-btn').addEventListener('click', () => {
      if (!this._selection.length) return;
      const el = this._selection[0];
      const cur = this._applier.getStyle(el).textDirection || 'horizontal';
      const next = cur === 'horizontal' ? 'vertical' : 'horizontal';
      this._applier.setStyle(this._selection, { textDirection: next });
      tb.querySelector('#mflex-text-dir-btn').classList.toggle('active', next === 'vertical');
    });

    // Collapse
    tb.querySelector('#mflex-collapse-btn').addEventListener('click', () => {
      if (this._selection.length === 1) {
        try { this._modeler.get('modeling').toggleCollapse(this._selection[0]); }
        catch (_) {}
      }
    });

    // Zoom to fit
    tb.querySelector('#mflex-zoomfit-btn').addEventListener('click', () => {
      if (!this._selection.length) return;
      const canvas = this._modeler.get('canvas');
      const bbox   = this._selectionBBox();
      if (bbox) canvas.zoom('fit-viewport', { x: bbox.mid.x, y: bbox.mid.y });
    });

    // Format painter
    tb.querySelector('#mflex-format-paint-btn').addEventListener('click', () => {
      if (this._formatPaint) {
        this._applyFormatPaint();
        this._formatPaint = null;
        tb.querySelector('#mflex-format-paint-btn').classList.remove('active');
      } else if (this._selection.length === 1) {
        this._formatPaint = {
          color: this._applier.getColor(this._selection[0]),
          style: this._applier.getStyle(this._selection[0])
        };
        tb.querySelector('#mflex-format-paint-btn').classList.add('active');
      }
    });

    // Reset all styles
    tb.querySelector('#mflex-reset-btn').addEventListener('click', () => {
      this._applier.setColor(this._selection, { fill: null, stroke: null });
      this._applier.setStyle(this._selection, {
        fontFamily: null, fontSize: null, textColor: null,
        textAlign: null, bold: null, italic: null, underline: null,
        borderColor: null, borderWidth: null, textDirection: null
      });
    });

    // Delete
    tb.querySelector('#mflex-delete-btn').addEventListener('click', () => {
      if (!this._selection.length) return;
      try {
        this._modeler.get('modeling').removeElements(this._selection.slice());
      } catch (_) {}
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _applyColorProp(prop, value) {
    if (prop === 'fill')        this._applier.setColor(this._selection, { fill: value });
    else if (prop === 'borderColor') {
      this._applier.setColor(this._selection, { stroke: value });
      this._applier.setStyle(this._selection, { borderColor: value });
    }
    else if (prop === 'textColor') this._applier.setStyle(this._selection, { textColor: value });
  }

  _applyDimensions(w, h) {
    const modeling = this._modeler.get('modeling');
    this._selection.forEach(el => {
      if (el.x == null) return;
      try { modeling.resizeShape(el, { x: el.x, y: el.y, width: w, height: h }); }
      catch (_) {}
    });
  }

  _applyFormatPaint() {
    if (!this._formatPaint) return;
    const { color, style } = this._formatPaint;
    if (color.fill || color.stroke) this._applier.setColor(this._selection, color);
    const s = Object.fromEntries(Object.entries(style).filter(([k]) => !k.startsWith('$')));
    if (Object.keys(s).length) this._applier.setStyle(this._selection, s);
  }

  _getCommonStyle(prop) {
    if (!this._selection.length) return null;
    const vals = this._selection.map(el => this._applier.getStyle(el)[prop]);
    return vals.every(v => v === vals[0]) ? vals[0] : null;
  }

  _selectionBBox() {
    if (!this._selection.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    this._selection.forEach(el => {
      if (el.x == null) return;
      x1 = Math.min(x1, el.x);         y1 = Math.min(y1, el.y);
      x2 = Math.max(x2, el.x + (el.width||0));
      y2 = Math.max(y2, el.y + (el.height||0));
    });
    return { x: x1, y: y1, width: x2-x1, height: y2-y1, mid: { x: (x1+x2)/2, y: (y1+y2)/2 } };
  }

  // ─── Sync & Reposition ────────────────────────────────────────────────────

  _sync() {
    const tb = this._container;
    if (!this._selection.length) { this._hide(); return; }

    const first = this._selection[0];
    const style = this._applier.getStyle(first);
    const multi = this._selection.length > 1;

    // Type label
    tb.querySelector('#mflex-type-label').textContent = multi
      ? `${this._selection.length} elements`
      : first.type.replace('bpmn:', '');

    // Font controls
    const ff = tb.querySelector('#mflex-font-family');
    if (style.fontFamily) ff.value = style.fontFamily;
    const fs = tb.querySelector('#mflex-font-size');
    if (style.fontSize) fs.value = style.fontSize;

    // Emphasis
    tb.querySelector('#mflex-bold').classList.toggle('active',      !!style.bold);
    tb.querySelector('#mflex-italic').classList.toggle('active',    !!style.italic);
    tb.querySelector('#mflex-underline').classList.toggle('active', !!style.underline);

    // Align
    tb.querySelectorAll('.mflex-align').forEach(b =>
      b.classList.toggle('active', b.dataset.align === (style.textAlign || 'center'))
    );

    // Border width
    if (style.borderWidth) tb.querySelector('#mflex-border-width').value = style.borderWidth;

    // Dimensions
    if (first.width)  tb.querySelector('#mflex-width-input').value  = Math.round(first.width);
    if (first.height) tb.querySelector('#mflex-height-input').value = Math.round(first.height);

    // Text direction button state
    const textDir = style.textDirection || 'horizontal';
    tb.querySelector('#mflex-text-dir-btn').classList.toggle('active', textDir === 'vertical');

    // Collapse button state
    if (first.businessObject && first.businessObject.isExpanded !== undefined) {
      const isExpanded = first.businessObject.isExpanded !== false;
      tb.querySelector('#mflex-collapse-btn').classList.toggle('active', !isExpanded);
      tb.querySelector('#mflex-collapse-btn').title = isExpanded ? 'Collapse' : 'Expand';
      const vline = tb.querySelector('#mflex-collapse-vline');
      if (vline) vline.style.display = isExpanded ? '' : 'none';
    }

    // Show/hide groups based on element type
    const visible = getVisibleGroups(this._selection);
    Object.entries(GROUP_MAP).forEach(([key, id]) => {
      const el = tb.querySelector(`#${id}`);
      if (el) el.style.display = visible.has(key) ? '' : 'none';
    });

    this._show();
    this._reposition();
  }

  _reposition() {
    if (!this._selection.length) return;
    const canvas     = this._modeler.get('canvas');
    const vb         = canvas.viewbox();
    const bbox       = this._selectionBBox();
    if (!bbox || bbox.x === Infinity) return;

    const canvasEl   = canvas.getContainer();
    const cr         = canvasEl.getBoundingClientRect();
    const sx         = cr.width  / vb.outer.width;
    const sy         = cr.height / vb.outer.height;

    const pageX  = cr.left + (bbox.x - vb.x) * sx;
    const pageY  = cr.top  + (bbox.y - vb.y) * sy;
    const pageW  = bbox.width  * sx;

    const tb  = this._container;
    const tbW = tb.offsetWidth || 600;

    let left = pageX + pageW / 2 - tbW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tbW - 8));

    let top = pageY - tb.offsetHeight - TOOLBAR_OFFSET + window.scrollY;
    if (top < TOPBAR_HEIGHT + 4) {
      top = pageY + bbox.height * sy + TOOLBAR_OFFSET + window.scrollY;
    }

    tb.style.left = `${left}px`;
    tb.style.top  = `${top}px`;
  }

  _show()          { this._container.style.display = ''; }
  _hide()          { this._container.style.display = 'none'; this._closePopovers(); }
  _closePopovers() { this._container.querySelectorAll('.mflex-popover.open').forEach(p => p.classList.remove('open')); }
}
