import test from 'node:test';
import assert from 'node:assert/strict';
import { biosArchive, captureGame, gameViewport, sourceAudioNodes } from '../web/media.mjs';

test('BIOS archive preserves its exact filename and bytes', async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4])], 'scph5500.bin');
  const url = await biosArchive(file);
  try {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const view = new DataView(bytes.buffer);
    assert.equal(view.getUint32(0, true), 0x04034b50);
    const nameLength = view.getUint16(26, true);
    assert.equal(new TextDecoder().decode(bytes.slice(30, 30 + nameLength)), 'scph5500.bin');
    assert.deepEqual([...bytes.slice(30 + nameLength, 34 + nameLength)], [1, 2, 3, 4]);
    assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  } finally { URL.revokeObjectURL(url); }
});

test('stream crops a wide host canvas instead of squashing its letterboxed game', () => {
  const crop = gameViewport(1200, 600, 4 / 3);
  assert.deepEqual(crop, { x: 200, y: 0, width: 800, height: 600 });
});

test('portrait capture follows the core’s top-aligned portrait viewport', () => {
  assert.deepEqual(gameViewport(400, 800, 4 / 3), { x: 0, y: 0, width: 400, height: 300 });
});

test('audio capture taps OpenAL source gains, not its unused context gain', () => {
  const first = { connect() {} }, second = { connect() {} }, contextGain = { connect() {} };
  const emulator = { Module: { AL: { currentCtx: { gain: contextGain, sources: { a: { gain: first }, b: { gain: second }, c: {} } } } } };
  assert.deepEqual(sourceAudioNodes(emulator), [first, second]);
  assert.deepEqual(sourceAudioNodes({}), []);
});

test('cannot open a stream before the emulator starts', async () => {
  await assert.rejects(captureGame({ started: false }), /Start the game/);
});
