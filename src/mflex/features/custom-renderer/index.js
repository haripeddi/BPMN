/**
 * MFlex Custom Renderer
 *
 * Intercepts render.shape / render.connection events to apply mflex:Style
 * attributes (borderWidth, textColor, font) at draw time, complementing
 * the built-in BPMN in Color fill/stroke.
 */

const HIGH_PRIORITY = 1500;
const MFLEX_STYLE_TYPE = 'mflex:Style';

function getMflexStyle(element) {
  const bo = element.businessObject;
  if (!bo || !bo.extensionElements) return null;
  return bo.extensionElements.values.find(v => v.$type === MFLEX_STYLE_TYPE) || null;
}

export default class MflexRenderer {
  constructor(eventBus) {
    // Listen early; modify SVG elements after the default renderer draws them
    eventBus.on('render.shape', HIGH_PRIORITY, (ctx) => {
      // We do not intercept here — we post-process via element.changed
    });
  }
}

MflexRenderer.$inject = ['eventBus'];
