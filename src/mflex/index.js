/**
 * MFlex entry point.
 */
import StyleApplier        from './features/style-applier/index.js';
import ContextToolbar      from './features/context-toolbar/index.js';
import MflexRenderer       from './features/custom-renderer/index.js';
import ResizeModule        from './features/resize/index.js';
import ShapePanel          from './features/shape-panel/index.js';
import {
  MflexMoveRules,
  MflexFreeText,
  MflexCopyPaste,
  MflexMarqueeSelect,
} from './features/free-interaction/index.js';

export { StyleApplier, ContextToolbar, ShapePanel };

/**
 * Bootstrap — call once after BpmnModeler is constructed.
 */
export function initMflex(modeler) {
  const applier    = new StyleApplier(modeler);
  const toolbar    = new ContextToolbar(modeler, applier);
  const shapePanel = new ShapePanel(modeler);
  return { applier, toolbar, shapePanel };
}

// Single merged module descriptor for additionalModules
export default {
  __init__: [
    'mflexRenderer',
    'mflexResizeHandles',
    'mflexResizeRules',
    'mflexMoveRules',
    'mflexFreeText',
    'mflexCopyPaste',
    'mflexMarqueeSelect',
  ],
  mflexRenderer:      ['type', MflexRenderer],
  mflexResizeHandles: ResizeModule.mflexResizeHandles,
  mflexResizeRules:   ResizeModule.mflexResizeRules,
  mflexMoveRules:     ['type', MflexMoveRules],
  mflexFreeText:      ['type', MflexFreeText],
  mflexCopyPaste:     ['type', MflexCopyPaste],
  mflexMarqueeSelect: ['type', MflexMarqueeSelect],
};
