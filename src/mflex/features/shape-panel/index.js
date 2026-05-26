/**
 * MFlex Shape Panel
 *
 * Miro-style sidebar:
 *  • Click a shape → it attaches to the mouse cursor
 *  • Click anywhere on the canvas to place it  (no drag required)
 *  • Or drag it straight from the panel
 *
 * Sections (all collapsible, "Basic Shapes" and "Flowchart" open by default):
 *   Basic Shapes | Flowchart | BPMN Tasks | BPMN Events | BPMN Gateways | Swimlanes | Data & Artifacts
 */

// ─── Sticky note icon helper ──────────────────────────────────────────────────
function stickyIcon(bg, border) {
  return `<svg viewBox="0 0 36 36" fill="${bg}"><rect x="2" y="2" width="32" height="32" rx="3" stroke="${border}" stroke-width="1.5"/><line x1="7" y1="12" x2="29" y2="12" stroke="${border}" stroke-width="1.2" opacity=".5"/><line x1="7" y1="18" x2="25" y2="18" stroke="${border}" stroke-width="1.2" opacity=".5"/><line x1="7" y1="24" x2="19" y2="24" stroke="${border}" stroke-width="1.2" opacity=".5"/></svg>`;
}

// ─── Inline SVG icons for Basic Shapes ───────────────────────────────────────
const I = {
  rect:      `<svg viewBox="0 0 36 36" fill="none"><rect x="3" y="10" width="30" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/></svg>`,
  roundRect: `<svg viewBox="0 0 36 36" fill="none"><rect x="3" y="10" width="30" height="16" rx="8" stroke="currentColor" stroke-width="1.8"/></svg>`,
  circle:    `<svg viewBox="0 0 36 36" fill="none"><circle cx="18" cy="18" r="14" stroke="currentColor" stroke-width="1.8"/></svg>`,
  oval:      `<svg viewBox="0 0 36 36" fill="none"><ellipse cx="18" cy="18" rx="16" ry="10" stroke="currentColor" stroke-width="1.8"/></svg>`,
  diamond:   `<svg viewBox="0 0 36 36" fill="none"><polygon points="18,2 34,18 18,34 2,18" stroke="currentColor" stroke-width="1.8"/></svg>`,
  triangle:  `<svg viewBox="0 0 36 36" fill="none"><polygon points="18,3 34,33 2,33" stroke="currentColor" stroke-width="1.8"/></svg>`,
  parallelogram: `<svg viewBox="0 0 36 36" fill="none"><polygon points="8,10 33,10 28,26 3,26" stroke="currentColor" stroke-width="1.8"/></svg>`,
  cylinder:  `<svg viewBox="0 0 36 36" fill="none"><ellipse cx="18" cy="10" rx="14" ry="5" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="10" x2="4" y2="26" stroke="currentColor" stroke-width="1.5"/><line x1="32" y1="10" x2="32" y2="26" stroke="currentColor" stroke-width="1.5"/><ellipse cx="18" cy="26" rx="14" ry="5" stroke="currentColor" stroke-width="1.5"/></svg>`,
  hexagon:   `<svg viewBox="0 0 36 36" fill="none"><polygon points="9,5 27,5 35,18 27,31 9,31 1,18" stroke="currentColor" stroke-width="1.8"/></svg>`,
  textBox:   `<svg viewBox="0 0 36 36" fill="none"><rect x="3" y="10" width="30" height="16" rx="2" stroke="currentColor" stroke-width="1.8" stroke-dasharray="4 2"/><line x1="8" y1="16" x2="28" y2="16" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="20" x2="22" y2="20" stroke="currentColor" stroke-width="1.5"/></svg>`,
  arrow:     `<svg viewBox="0 0 36 36" fill="none"><line x1="4" y1="18" x2="28" y2="18" stroke="currentColor" stroke-width="2"/><polyline points="20,11 28,18 20,25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  note:      `<svg viewBox="0 0 36 36" fill="none"><polygon points="4,4 28,4 32,8 32,32 4,32" stroke="currentColor" stroke-width="1.8"/><line x1="28" y1="4" x2="28" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="28" y1="8" x2="32" y2="8" stroke="currentColor" stroke-width="1.5"/></svg>`,
  // Start/End flowchart icons  startEnd:   `<svg viewBox="0 0 36 36" fill="none"><rect x="3" y="10" width="30" height="16" rx="8" stroke="currentColor" stroke-width="1.8"/></svg>`,
  process:   `<svg viewBox="0 0 36 36" fill="none"><rect x="3" y="10" width="30" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/></svg>`,
  decision:  `<svg viewBox="0 0 36 36" fill="none"><polygon points="18,2 34,18 18,34 2,18" stroke="currentColor" stroke-width="1.8"/></svg>`,
  terminator:`<svg viewBox="0 0 36 36" fill="none"><rect x="3" y="10" width="30" height="16" rx="8" stroke="currentColor" stroke-width="2.5"/></svg>`,
};

// ─── Shape catalogue ─────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'sticky',
    label: 'Sticky Notes',
    open: true,
    items: [
      { label: 'Yellow',  fill: '#fef9c3', iconSvg: stickyIcon('#fef9c3','#ca8a04'), create: ef => ef.createShape({ type: 'bpmn:TextAnnotation', width: 160, height: 80 }) },
      { label: 'Green',   fill: '#dcfce7', iconSvg: stickyIcon('#dcfce7','#16a34a'), create: ef => ef.createShape({ type: 'bpmn:TextAnnotation', width: 160, height: 80 }) },
      { label: 'Blue',    fill: '#dbeafe', iconSvg: stickyIcon('#dbeafe','#2563eb'), create: ef => ef.createShape({ type: 'bpmn:TextAnnotation', width: 160, height: 80 }) },
      { label: 'Pink',    fill: '#fce7f3', iconSvg: stickyIcon('#fce7f3','#db2777'), create: ef => ef.createShape({ type: 'bpmn:TextAnnotation', width: 160, height: 80 }) },
      { label: 'Purple',  fill: '#f3e8ff', iconSvg: stickyIcon('#f3e8ff','#9333ea'), create: ef => ef.createShape({ type: 'bpmn:TextAnnotation', width: 160, height: 80 }) },
      { label: 'Orange',  fill: '#ffedd5', iconSvg: stickyIcon('#ffedd5','#ea580c'), create: ef => ef.createShape({ type: 'bpmn:TextAnnotation', width: 160, height: 80 }) },
    ]
  },
  {
    id: 'basic',
    label: 'Basic Shapes',
    open: true,
    items: [
      { label: 'Rectangle',      iconSvg: I.rect,      create: ef => ef.createShape({ type: 'bpmn:Task', width: 120, height: 60 }) },
      { label: 'Rounded Rect',   iconSvg: I.roundRect, shapeType: 'rounded-rect',   create: ef => ef.createShape({ type: 'bpmn:Task', width: 120, height: 60 }) },
      { label: 'Circle',         iconSvg: I.circle,    create: ef => ef.createShape({ type: 'bpmn:StartEvent', width: 60, height: 60 }) },
      { label: 'Oval / Ellipse', iconSvg: I.oval,      create: ef => ef.createShape({ type: 'bpmn:StartEvent', width: 100, height: 60 }) },
      { label: 'Diamond',        iconSvg: I.diamond,   create: ef => ef.createShape({ type: 'bpmn:ExclusiveGateway', width: 60, height: 60 }) },
      { label: 'Triangle',       iconSvg: I.triangle,  shapeType: 'triangle',       create: ef => ef.createShape({ type: 'bpmn:Task', width: 80, height: 70 }) },
      { label: 'Parallelogram',  iconSvg: I.parallelogram, shapeType: 'parallelogram', create: ef => ef.createShape({ type: 'bpmn:Task', width: 120, height: 60 }) },
      { label: 'Cylinder / DB',  iconSvg: I.cylinder,  create: ef => ef.createShape({ type: 'bpmn:DataStoreReference' }) },
      { label: 'Hexagon',        iconSvg: I.hexagon,   shapeType: 'hexagon',        create: ef => ef.createShape({ type: 'bpmn:Task', width: 110, height: 80 }) },
      { label: 'Text Box',       iconSvg: I.textBox,   create: ef => ef.createShape({ type: 'bpmn:TextAnnotation', width: 140, height: 60 }) },
      { label: 'Note',           iconSvg: I.note,      create: ef => ef.createShape({ type: 'bpmn:TextAnnotation', width: 120, height: 80 }) },
      { label: 'Arrow',          iconSvg: I.arrow,     create: ef => ef.createShape({ type: 'bpmn:TextAnnotation', width: 100, height: 40 }) },
    ]
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    open: true,
    items: [
      { label: 'Start / End',  iconSvg: I.startEnd,    create: ef => ef.createShape({ type: 'bpmn:StartEvent' }) },
      { label: 'Process',      iconSvg: I.process,     create: ef => ef.createShape({ type: 'bpmn:Task' }) },
      { label: 'Decision',     iconSvg: I.decision,    create: ef => ef.createShape({ type: 'bpmn:ExclusiveGateway' }) },
      { label: 'Terminator',   iconSvg: I.terminator,  create: ef => ef.createShape({ type: 'bpmn:EndEvent' }) },
      { label: 'Data',         iconSvg: I.parallelogram, create: ef => ef.createShape({ type: 'bpmn:DataObjectReference' }) },
      { label: 'Database',     iconSvg: I.cylinder,    create: ef => ef.createShape({ type: 'bpmn:DataStoreReference' }) },
      { label: 'Annotation',   icon: 'bpmn-icon-text-annotation', create: ef => ef.createShape({ type: 'bpmn:TextAnnotation' }) },
      { label: 'Pool',         icon: 'bpmn-icon-participant',     create: ef => ef.createParticipantShape(true) },
    ]
  },
  {
    id: 'tasks',
    label: 'BPMN Tasks',
    open: false,
    items: [
      { label: 'Generic Task',  icon: 'bpmn-icon-task',               create: ef => ef.createShape({ type: 'bpmn:Task' }) },
      { label: 'User Task',     icon: 'bpmn-icon-user-task',          create: ef => ef.createShape({ type: 'bpmn:UserTask' }) },
      { label: 'Service Task',  icon: 'bpmn-icon-service-task',       create: ef => ef.createShape({ type: 'bpmn:ServiceTask' }) },
      { label: 'Send Task',     icon: 'bpmn-icon-send-task',          create: ef => ef.createShape({ type: 'bpmn:SendTask' }) },
      { label: 'Receive Task',  icon: 'bpmn-icon-receive-task',       create: ef => ef.createShape({ type: 'bpmn:ReceiveTask' }) },
      { label: 'Manual Task',   icon: 'bpmn-icon-manual-task',        create: ef => ef.createShape({ type: 'bpmn:ManualTask' }) },
      { label: 'Script Task',   icon: 'bpmn-icon-script-task',        create: ef => ef.createShape({ type: 'bpmn:ScriptTask' }) },
      { label: 'Business Rule', icon: 'bpmn-icon-business-rule-task', create: ef => ef.createShape({ type: 'bpmn:BusinessRuleTask' }) },
      { label: 'Sub-Process',   icon: 'bpmn-icon-subprocess-expanded',create: ef => ef.createShape({ type: 'bpmn:SubProcess', isExpanded: true }) },
      { label: 'Call Activity', icon: 'bpmn-icon-call-activity',      create: ef => ef.createShape({ type: 'bpmn:CallActivity' }) },
    ]
  },
  {
    id: 'events',
    label: 'BPMN Events',
    open: false,
    items: [
      { label: 'Start',          icon: 'bpmn-icon-start-event-none',                create: ef => ef.createShape({ type: 'bpmn:StartEvent' }) },
      { label: 'Timer Start',    icon: 'bpmn-icon-start-event-timer',               create: ef => ef.createShape({ type: 'bpmn:StartEvent',             eventDefinitionType: 'bpmn:TimerEventDefinition' }) },
      { label: 'Message Start',  icon: 'bpmn-icon-start-event-message',             create: ef => ef.createShape({ type: 'bpmn:StartEvent',             eventDefinitionType: 'bpmn:MessageEventDefinition' }) },
      { label: 'Signal Start',   icon: 'bpmn-icon-start-event-signal',              create: ef => ef.createShape({ type: 'bpmn:StartEvent',             eventDefinitionType: 'bpmn:SignalEventDefinition' }) },
      { label: 'Cond. Start',    icon: 'bpmn-icon-start-event-condition',           create: ef => ef.createShape({ type: 'bpmn:StartEvent',             eventDefinitionType: 'bpmn:ConditionalEventDefinition' }) },
      { label: 'Interm. Catch',  icon: 'bpmn-icon-intermediate-event-catch-none',    create: ef => ef.createShape({ type: 'bpmn:IntermediateCatchEvent' }) },
      { label: 'Timer Catch',    icon: 'bpmn-icon-intermediate-event-catch-timer',   create: ef => ef.createShape({ type: 'bpmn:IntermediateCatchEvent', eventDefinitionType: 'bpmn:TimerEventDefinition' }) },
      { label: 'Message Catch',  icon: 'bpmn-icon-intermediate-event-catch-message', create: ef => ef.createShape({ type: 'bpmn:IntermediateCatchEvent', eventDefinitionType: 'bpmn:MessageEventDefinition' }) },
      { label: 'Interm. Throw',  icon: 'bpmn-icon-intermediate-event-throw-none',    create: ef => ef.createShape({ type: 'bpmn:IntermediateThrowEvent' }) },
      { label: 'End',            icon: 'bpmn-icon-end-event-none',                  create: ef => ef.createShape({ type: 'bpmn:EndEvent' }) },
      { label: 'Message End',    icon: 'bpmn-icon-end-event-message',               create: ef => ef.createShape({ type: 'bpmn:EndEvent',               eventDefinitionType: 'bpmn:MessageEventDefinition' }) },
      { label: 'Error End',      icon: 'bpmn-icon-end-event-error',                 create: ef => ef.createShape({ type: 'bpmn:EndEvent',               eventDefinitionType: 'bpmn:ErrorEventDefinition' }) },
      { label: 'Terminate End',  icon: 'bpmn-icon-end-event-terminate',             create: ef => ef.createShape({ type: 'bpmn:EndEvent',               eventDefinitionType: 'bpmn:TerminateEventDefinition' }) },
    ]
  },
  {
    id: 'gateways',
    label: 'BPMN Gateways',
    open: false,
    items: [
      { label: 'Exclusive (X)', icon: 'bpmn-icon-gateway-xor',        create: ef => ef.createShape({ type: 'bpmn:ExclusiveGateway' }) },
      { label: 'Inclusive (O)', icon: 'bpmn-icon-gateway-or',         create: ef => ef.createShape({ type: 'bpmn:InclusiveGateway' }) },
      { label: 'Parallel (+)',  icon: 'bpmn-icon-gateway-parallel',   create: ef => ef.createShape({ type: 'bpmn:ParallelGateway' }) },
      { label: 'Event-Based',   icon: 'bpmn-icon-gateway-eventbased', create: ef => ef.createShape({ type: 'bpmn:EventBasedGateway' }) },
      { label: 'Complex (*)',   icon: 'bpmn-icon-gateway-complex',    create: ef => ef.createShape({ type: 'bpmn:ComplexGateway' }) },
    ]
  },
  {
    id: 'swimlanes',
    label: 'Swimlanes',
    open: false,
    items: [
      { label: 'Pool / Lane', icon: 'bpmn-icon-participant', create: ef => ef.createParticipantShape(true) },
    ]
  },
  {
    id: 'data',
    label: 'Data & Artifacts',
    open: false,
    items: [
      { label: 'Data Object', icon: 'bpmn-icon-data-object',     create: ef => ef.createShape({ type: 'bpmn:DataObjectReference' }) },
      { label: 'Data Store',  icon: 'bpmn-icon-data-store',      create: ef => ef.createShape({ type: 'bpmn:DataStoreReference' }) },
      { label: 'Group',       icon: 'bpmn-icon-group',           create: ef => ef.createShape({ type: 'bpmn:Group' }) },
      { label: 'Annotation',  icon: 'bpmn-icon-text-annotation', create: ef => ef.createShape({ type: 'bpmn:TextAnnotation' }) },
    ]
  },
];

// ─── ShapePanel class ─────────────────────────────────────────────────────────

export default class ShapePanel {
  constructor(modeler) {
    this._modeler   = modeler;
    this._el        = document.getElementById('shape-panel');
    this._allItems  = [];
    this._activeBtn = null;

    if (!this._el) return;
    this._build();
  }

  // ── Build DOM ────────────────────────────────────────────────────────────

  _build() {
    let idx = 0;

    const sectionsHtml = SECTIONS.map(sec => {
      const itemsHtml = sec.items.map(item => {
        const i = idx++;
        this._allItems.push(item);
        const iconHtml = item.iconSvg
          ? `<span class="sp-icon sp-icon-svg">${item.iconSvg}</span>`
          : `<span class="${item.icon} sp-icon"></span>`;
        return `
          <div class="sp-item" data-idx="${i}" title="${item.label}">
            ${iconHtml}
            <span class="sp-label">${item.label}</span>
          </div>`;
      }).join('');

      return `
        <div class="sp-section${sec.open ? ' open' : ''}" id="sp-sec-${sec.id}">
          <div class="sp-sec-hdr">
            <svg class="sp-arrow" viewBox="0 0 10 10" width="8" height="8"><path d="M2 3 L5 7 L8 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${sec.label}
          </div>
          <div class="sp-items">${itemsHtml}</div>
        </div>`;
    }).join('');

    this._el.innerHTML = `
      <div class="sp-search-wrap">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#9ca3af" stroke-width="1.5" class="sp-search-icon">
          <circle cx="6.5" cy="6.5" r="5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>
        </svg>
        <input class="sp-search" id="sp-search" placeholder="Search shapes…" autocomplete="off" />
      </div>
      <div class="sp-body">${sectionsHtml}</div>`;

    this._wireItems();
    this._wireSearch();
    this._wireSections();
  }

  // ── Wire click-to-place ──────────────────────────────────────────────────
  // Exactly mirrors how bpmn-js's own palette works:
  //   click on item  → create.start(click-event, shape)
  //   shape ghost follows cursor (no holding required)
  //   click anywhere on canvas → shape placed at that position

  _wireItems() {
    this._el.querySelectorAll('.sp-item').forEach(el => {
      const item = this._allItems[parseInt(el.dataset.idx, 10)];

      // dragstart: held-mouse drag directly from panel (classic behaviour)
      el.addEventListener('dragstart', (e) => {
        e.preventDefault();
      });

      // click: activate create-mode — shape ghost follows cursor until canvas click
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._startCreate(e, item, el);
      });
    });
  }

  _startCreate(event, item, btn) {
    const ef       = this._modeler.get('elementFactory');
    const create   = this._modeler.get('create');
    const eventBus = this._modeler.get('eventBus');

    let shape;
    try {
      shape = item.create(ef);
    } catch (err) {
      console.error('[mflex] elementFactory failed:', err.message);
      return;
    }

    // Tag the businessObject BEFORE create.start so StyleApplier can read
    // it reliably in shape.added — no event-timing dependencies.
    const fill = item.fill || null;
    if (fill && shape.businessObject) {
      shape.businessObject.__mflexStickyFill = fill;
    }

    // Tag custom shape type (parallelogram, hexagon, triangle, rounded-rect)
    const shapeType = item.shapeType || null;
    if (shapeType && shape.businessObject) {
      shape.businessObject.__mflexShapeType = shapeType;
    }

    // create.start(event, shape) — same call bpmn-js palette uses for 'click'
    // The shape ghost attaches to the cursor; user moves to canvas and clicks to place.
    try {
      create.start(event, shape);
    } catch (err) {
      console.error('[mflex] create.start failed:', err.message);
      return;
    }

    this._setActive(btn);

    const cancel = () => {
      this._setActive(null);
      eventBus.off('create.canceled', cancel);
    };
    eventBus.on('create.canceled', cancel);
  }

  _setActive(btn) {
    if (this._activeBtn) this._activeBtn.classList.remove('active');
    this._activeBtn = btn;
    if (btn) btn.classList.add('active');
  }

  // ── Collapse / expand sections ───────────────────────────────────────────

  _wireSections() {
    this._el.querySelectorAll('.sp-sec-hdr').forEach(hdr => {
      hdr.addEventListener('click', () => {
        hdr.closest('.sp-section').classList.toggle('open');
      });
    });
  }

  // ── Search / filter ──────────────────────────────────────────────────────

  _wireSearch() {
    const input = this._el.querySelector('#sp-search');
    if (!input) return;

    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();

      if (!q) {
        this._el.querySelectorAll('.sp-item').forEach(el => el.style.display = '');
        this._el.querySelectorAll('.sp-section').forEach(el => el.style.display = '');
        return;
      }

      this._el.querySelectorAll('.sp-section').forEach(sec => {
        sec.classList.add('open');
        sec.style.display = '';
      });

      this._el.querySelectorAll('.sp-item').forEach(el => {
        const label = (el.querySelector('.sp-label') || el).textContent.toLowerCase();
        el.style.display = label.includes(q) ? '' : 'none';
      });

      this._el.querySelectorAll('.sp-section').forEach(sec => {
        const anyVisible = Array.from(sec.querySelectorAll('.sp-item'))
          .some(el => el.style.display !== 'none');
        sec.style.display = anyVisible ? '' : 'none';
      });
    });
  }
}
