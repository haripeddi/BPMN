import './style.css';
import './mflex/styles/context-toolbar.css';
import './mflex/styles/resize-handles.css';
import './mflex/styles/shape-panel.css';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import MflexModule, { initMflex } from './mflex/index.js';
import mflexDescriptor from './mflex/moddle/mflex.json';

const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
                   xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                   xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                   xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                   id="sample-diagram"
                   targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn2:process id="Process_1" isExecutable="false">
    <bpmn2:startEvent id="StartEvent_1"/>
  </bpmn2:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="412" y="240" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn2:definitions>`;

const modeler = new BpmnModeler({
  container: '#canvas',
  keyboard: { bindTo: window },
  additionalModules: [MflexModule],
  moddleExtensions: { mflex: mflexDescriptor },
  textRenderer: {
    defaultStyle: {
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize:   14,
      fontWeight: 'normal'
    },
    externalStyle: {
      fontSize:   '14px',
      lineHeight: 1.4
    }
  },
  bpmnRenderer: {
    defaultFillColor:   '#ffffff',
    defaultStrokeColor: '#374151'
  }
});

const mflex = initMflex(modeler);
window.__mflex = mflex;
window.__modeler = modeler;

// ─── Right-click context menu ─────────────────────────────────────────────────
(function initContextMenu() {
  let menu = null;

  function removeMenu() {
    if (menu) { menu.remove(); menu = null; }
  }

  function getCanvasCoords(clientX, clientY) {
    const canvas = modeler.get('canvas');
    const vb = canvas.viewbox();
    const cr = canvas.getContainer().getBoundingClientRect();
    return {
      x: (clientX - cr.left) / vb.scale + vb.x,
      y: (clientY - cr.top)  / vb.scale + vb.y,
    };
  }

  document.getElementById('canvas').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    removeMenu();

    const selection     = modeler.get('selection').get();
    const copyPaste     = modeler.get('copyPaste');
    const canvas        = modeler.get('canvas');
    const modeling      = modeler.get('modeling');

    const items = [];

    if (selection.length) {
      items.push({ label: 'Copy',       kbd: 'Ctrl+C', icon: copyIcon,  action: () => copyPaste.copy(selection) });
      items.push({ label: 'Duplicate',  kbd: 'Ctrl+D', icon: dupIcon,   action: () => {
        copyPaste.copy(selection);
        copyPaste.paste({ element: canvas.getRootElement(), point: {
          x: selection[0].x + (selection[0].width || 100) + 20,
          y: selection[0].y + 20,
        }});
      }});
      items.push({ label: 'Delete',     kbd: 'Del',    icon: delIcon,   action: () => modeling.removeElements(selection.slice()), danger: true });
      items.push({ type: 'sep' });
    }

    items.push({ label: 'Paste',        kbd: 'Ctrl+V', icon: pasteIcon, action: () => {
      const pt = getCanvasCoords(e.clientX, e.clientY);
      copyPaste.paste({ element: canvas.getRootElement(), point: pt });
    }});
    items.push({ label: 'Select All',   kbd: 'Ctrl+A', icon: selIcon,   action: () => {
      const all = modeler.get('elementRegistry').getAll()
        .filter(el => !el.labelTarget && el !== canvas.getRootElement());
      modeler.get('selection').select(all);
    }});

    // Build DOM
    menu = document.createElement('div');
    menu.id = 'mflex-ctx-menu';
    items.forEach(item => {
      if (item.type === 'sep') {
        const s = document.createElement('div');
        s.className = 'mflex-ctx-sep';
        menu.appendChild(s);
        return;
      }
      const row = document.createElement('div');
      row.className = 'mflex-ctx-item' + (item.danger ? ' danger' : '');
      row.innerHTML = `${item.icon}<span>${item.label}</span><span class="mflex-ctx-kbd">${item.kbd}</span>`;
      row.addEventListener('click', () => { removeMenu(); item.action(); });
      menu.appendChild(row);
    });

    menu.style.left = `${Math.min(e.clientX, window.innerWidth  - 180)}px`;
    menu.style.top  = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
    document.body.appendChild(menu);
  });

  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.contains(e.target)) removeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') removeMenu(); });
})();

// ─── SVG icon strings for context menu ───────────────────────────────────────
const copyIcon  = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/></svg>`;
const dupIcon   = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="9" height="9" rx="1.5"/><rect x="6" y="6" width="9" height="9" rx="1.5"/></svg>`;
const delIcon   = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="2,4 14,4"/><path d="M5 4V2h6v2"/><rect x="3" y="4" width="10" height="10" rx="1"/></svg>`;
const pasteIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="10" height="9" rx="1.5"/><path d="M6 5V3.5A1.5 1.5 0 0 1 7.5 2h1A1.5 1.5 0 0 1 10 3.5V5"/></svg>`;
const selIcon   = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke-dasharray="3 2"/></svg>`;

const statusEl = document.getElementById('status');

function setStatus(text, kind = '') {
  statusEl.textContent = text || '';
  statusEl.className = `status ${kind}`.trim();
  if (text && kind === 'ok') {
    setTimeout(() => {
      if (statusEl.textContent === text) {
        statusEl.textContent = '';
        statusEl.className = 'status';
      }
    }, 2000);
  }
}

async function openDiagram(xml) {
  try {
    await modeler.importXML(xml);
    modeler.get('canvas').zoom('fit-viewport', 'auto');
    setStatus('Diagram loaded', 'ok');
  } catch (err) {
    console.error('Failed to import diagram:', err);
    setStatus('Failed to load diagram', 'error');
  }
}

function getCanvasPointFromClient(clientX, clientY) {
  const canvas = modeler.get('canvas');
  const vb = canvas.viewbox();
  const cr = canvas.getContainer().getBoundingClientRect();
  return {
    x: (clientX - cr.left) / vb.scale + vb.x,
    y: (clientY - cr.top)  / vb.scale + vb.y,
  };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function getImageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function insertImageOnCanvas(file, point = null) {
  const dataUrl = await readFileAsDataURL(file);
  const natural = await getImageSize(dataUrl);
  const canvas = modeler.get('canvas');
  const ef = modeler.get('elementFactory');
  const modeling = modeler.get('modeling');
  const root = canvas.getRootElement();
  const vb = canvas.viewbox();

  const maxW = Math.max(220, vb.width * 0.45);
  const maxH = Math.max(180, vb.height * 0.45);
  const scale = Math.min(maxW / natural.width, maxH / natural.height, 1);
  const width = Math.max(120, Math.round(natural.width * scale));
  const height = Math.max(80, Math.round(natural.height * scale));

  const anchor = point || { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
  const shape = ef.createShape({
    type: 'bpmn:TextAnnotation',
    width,
    height
  });
  if (shape.businessObject) {
    shape.businessObject.text = '';
    shape.businessObject.__mflexImageSrc = dataUrl;
  }

  modeling.createShape(shape, { x: anchor.x - width / 2, y: anchor.y - height / 2 }, root);
}

function downloadBlob(filename, contents, mime) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('btn-new').addEventListener('click', () => {
  openDiagram(EMPTY_DIAGRAM);
});

const fileInput = document.getElementById('file-input');
document.getElementById('btn-open').addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
});
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const isImage = !!(file.type && file.type.startsWith('image/'));

  try {
    if (isImage) {
      await insertImageOnCanvas(file);
      setStatus('Image added to canvas', 'ok');
    } else {
      const text = await file.text();
      await openDiagram(text);
    }
  } catch (err) {
    console.error(err);
    setStatus('Open failed', 'error');
  }
});

document.getElementById('btn-save-bpmn').addEventListener('click', async () => {
  try {
    // Write in-memory styles to BPMN model before serialising
    mflex.applier.persistToModdle();
    const { xml } = await modeler.saveXML({ format: true });
    downloadBlob('diagram.bpmn', xml, 'application/xml');
    setStatus('Saved diagram.bpmn', 'ok');
  } catch (err) {
    console.error(err);
    setStatus('Save failed', 'error');
  }
});

document.getElementById('btn-save-svg').addEventListener('click', async () => {
  try {
    const { svg } = await modeler.saveSVG();
    downloadBlob('diagram.svg', svg, 'image/svg+xml');
    setStatus('Saved diagram.svg', 'ok');
  } catch (err) {
    console.error(err);
    setStatus('SVG export failed', 'error');
  }
});

// Paste image from OS clipboard (e.g., screenshots on Mac) directly to canvas
window.addEventListener('paste', async (e) => {
  const items = (e.clipboardData && e.clipboardData.items) || [];
  const imageItem = Array.from(items).find(it => it.type && it.type.startsWith('image/'));
  if (!imageItem) return;

  const file = imageItem.getAsFile();
  if (!file) return;

  e.preventDefault();
  try {
    const hasPointer = typeof e.clientX === 'number' && typeof e.clientY === 'number' && (e.clientX !== 0 || e.clientY !== 0);
    const point = hasPointer ? getCanvasPointFromClient(e.clientX, e.clientY) : null;
    await insertImageOnCanvas(file, point);
    setStatus('Pasted image to canvas', 'ok');
  } catch (err) {
    console.error(err);
    setStatus('Image paste failed', 'error');
  }
}, true);

document.getElementById('btn-undo').addEventListener('click', () => {
  modeler.get('commandStack').undo();
});
document.getElementById('btn-redo').addEventListener('click', () => {
  modeler.get('commandStack').redo();
});

openDiagram(EMPTY_DIAGRAM);
