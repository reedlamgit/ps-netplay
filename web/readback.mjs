// Must run before the emulator creates its WebGL context. The default false
// lets the compositor discard the buffer, so later canvas copies can be black.
export function enableGameReadback(getCanvas, prototype = HTMLCanvasElement.prototype) {
  const original = prototype.getContext;
  function getContext(type, attributes) {
    if (this === getCanvas() && ['webgl', 'webgl2', 'experimental-webgl'].includes(type)) {
      return original.call(this, type, { ...attributes, preserveDrawingBuffer: true });
    }
    return original.call(this, type, attributes);
  }
  prototype.getContext = getContext;
  return () => { if (prototype.getContext === getContext) prototype.getContext = original; };
}
