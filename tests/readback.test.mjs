import test from 'node:test';
import assert from 'node:assert/strict';
import { enableGameReadback } from '../web/readback.mjs';

test('only the emulator WebGL context preserves pixels for asynchronous capture', () => {
  const calls = [];
  const prototype = { getContext(type, attributes) { calls.push({ canvas: this, type, attributes }); return {}; } };
  const original = prototype.getContext;
  const game = Object.create(prototype), other = Object.create(prototype);
  const restore = enableGameReadback(() => game, prototype);
  game.getContext('webgl2', { alpha: true, preserveDrawingBuffer: false });
  other.getContext('webgl', { preserveDrawingBuffer: false });
  game.getContext('2d', { alpha: false });
  assert.equal(calls[0].attributes.preserveDrawingBuffer, true);
  assert.equal(calls[0].attributes.alpha, true);
  assert.equal(calls[1].attributes.preserveDrawingBuffer, false);
  assert.deepEqual(calls[2].attributes, { alpha: false });
  restore();
  assert.equal(prototype.getContext, original);
});
