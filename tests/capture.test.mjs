import test from 'node:test';
import assert from 'node:assert/strict';
import { captureGame } from '../web/media.mjs';

function browserFixture({ failDraw = 0, manual = true } = {}) {
  const old = { document: globalThis.document, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  const queue = new Map();
  let id = 0, draws = 0, requests = 0, attached = false, removed = false, stopped = 0;
  const rates = [];
  const track = { stop() { stopped++; } };
  if (manual) track.requestFrame = () => { requests++; };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track], addTrack() {} };
  const context = { drawImage() { draws++; if (draws === failDraw) throw new Error('Transient canvas resize'); } };
  const canvas = { width: 0, height: 0, setAttribute() {}, getContext: () => context, captureStream(rate) { rates.push(rate); return stream; }, remove() { removed = true; } };
  globalThis.document = { createElement: () => canvas };
  globalThis.requestAnimationFrame = fn => { queue.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = key => queue.delete(key);
  return {
    source: { width: 640, height: 480 },
    preview: { appendChild(value) { assert.equal(value, canvas); attached = true; } },
    tick(now) { const [key, fn] = queue.entries().next().value; queue.delete(key); fn(now); },
    info: () => ({ draws, requests, attached, removed, stopped, rates, queued: queue.size }),
    restore() { globalThis.document = old.document; globalThis.requestAnimationFrame = old.raf; globalThis.cancelAnimationFrame = old.caf; }
  };
}
function emulator(fixture) { return { started: true, canvas: fixture.source, gameManager: { getVideoDimensions: () => 4 / 3 } }; }

test('capture continues after a transient canvas draw exception', async () => {
  const fixture = browserFixture({ failDraw: 2 });
  let capture;
  try {
    capture = await captureGame(emulator(fixture), fixture.preview);
    fixture.tick(100); fixture.tick(150);
    assert.equal(fixture.info().queued, 1, 'a failed draw must not kill the capture loop');
    fixture.tick(200);
    assert.equal(capture.stats.frames, 2);
    assert.equal(capture.stats.lastError, '');
  } finally { capture?.stop(); fixture.restore(); }
});
test('capture canvas is attached and each successful draw explicitly requests a video frame', async () => {
  const fixture = browserFixture();
  let capture;
  try {
    capture = await captureGame(emulator(fixture), fixture.preview);
    fixture.tick(100); fixture.tick(150);
    assert.equal(fixture.info().attached, true);
    assert.deepEqual(fixture.info().rates, [0]);
    assert.equal(fixture.info().requests, 2);
    capture.stop();
    assert.equal(fixture.info().removed, true);
    assert.equal(fixture.info().queued, 0);
  } finally { capture?.stop(); fixture.restore(); }
});
test('browsers without requestFrame fall back to automatic canvas capture', async () => {
  const fixture = browserFixture({ manual: false });
  let capture;
  try {
    capture = await captureGame(emulator(fixture), fixture.preview);
    fixture.tick(100);
    assert.deepEqual(fixture.info().rates, [0, 30]);
    assert.equal(capture.stats.frames, 1);
  } finally { capture?.stop(); fixture.restore(); }
});

test('zero-sized source during rotation is retried, not a fatal draw error', async () => {
  const fixture = browserFixture();
  let capture;
  try {
    capture = await captureGame(emulator(fixture), fixture.preview);
    fixture.source.width = 0;
    fixture.tick(100);
    assert.equal(fixture.info().draws, 0);
    assert.equal(fixture.info().queued, 1);
    fixture.source.width = 640;
    fixture.tick(150);
    assert.equal(capture.stats.frames, 1);
  } finally { capture?.stop(); fixture.restore(); }
});
