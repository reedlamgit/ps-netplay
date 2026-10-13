import test from 'node:test';
import assert from 'node:assert/strict';
import { BUTTONS, normalizeButtons, InputState, findHost, parseRoom } from '../web/controls.mjs';

test('PlayStation buttons use libretro input IDs, not emulator hotkeys', () => {
  assert.equal(BUTTONS.cross, 0);
  assert.equal(BUTTONS.circle, 8);
  assert.equal(BUTTONS.square, 1);
  assert.equal(BUTTONS.triangle, 9);
  assert.equal(BUTTONS.start, 3);
});
test('incoming controller snapshots reject malformed and out-of-range input', () => {
  assert.deepEqual(normalizeButtons([4, 4, 0, 24, -1, '3', 3.2, null]), [0, 4]);
  assert.deepEqual(normalizeButtons('4'), []);
});
test('input snapshots affect only P2 and release previous held buttons', () => {
  const calls = [];
  const state = new InputState((...args) => calls.push(args));
  state.update([0, 4], 100);
  state.update([0], 200);
  assert.deepEqual(calls, [[1, 0, 1], [1, 4, 1], [1, 4, 0]]);
  state.release();
  assert.deepEqual(calls.at(-1), [1, 0, 0]);
});
test('watchdog releases controls if the remote phone stops responding', () => {
  const calls = [];
  const state = new InputState((...args) => calls.push(args));
  state.update([3], 100);
  state.expire(500);
  assert.equal(calls.length, 1);
  state.expire(1200);
  assert.deepEqual(calls.at(-1), [1, 3, 0]);
});
test('room host is explicit rather than whichever player joined first', () => {
  assert.equal(findHost({ guest: { role: 'guest', socketId: 'g' }, host: { role: 'host', socketId: 'h' } }), 'h');
  assert.equal(findHost({ guest: { role: 'guest', socketId: 'g' } }), null);
});
test('room parser accepts a shared link or code, rejects arbitrary input', () => {
  const room = 'abc123abc123abc123abc123';
  assert.equal(parseRoom(room), room);
  assert.equal(parseRoom(`https://ps-pocket.vercel.app/?room=${room}`), room);
  assert.equal(parseRoom('javascript:alert(1)'), null);
  assert.equal(parseRoom(''), null);
});
