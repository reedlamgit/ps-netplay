import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeGame } from '../web/lifecycle.mjs';

function emulator(calls, audioState = 'interrupted') {
  return {
    started: true,
    paused: true,
    play() { calls.push('play'); this.paused = false; },
    gameManager: { toggleMainLoop(value) { calls.push(`core:${value}`); } },
    Module: {
      resumeMainLoop() { calls.push('runtime'); },
      AL: { currentCtx: { audioCtx: { state: audioState, resume() { calls.push('audio'); this.state = 'running'; return Promise.resolve(); } } } }
    },
    elements: { parent: { focus() { calls.push('focus'); } } }
  };
}

test('a resume gesture wakes interrupted audio and both game loops without resetting game', async () => {
  const calls = [];
  const game = emulator(calls);
  const result = await resumeGame(game);
  assert.deepEqual(calls, ['audio', 'play', 'core:1', 'runtime', 'focus']);
  assert.equal(game.paused, false);
  assert.equal(result.audioRunning, true);
});
test('audio resume starts synchronously inside the tap, before awaiting anything', async () => {
  const calls = [];
  const promise = resumeGame(emulator(calls));
  assert.equal(calls[0], 'audio');
  await promise;
});
test('resume reports missing/evicted emulator rather than claiming success', async () => {
  await assert.rejects(resumeGame(null), /reload/i);
});
test('a lost WebGL context reports that the game needs reloading', async () => {
  const game = emulator([]);
  game.Module.ctx = { isContextLost: () => true };
  await assert.rejects(resumeGame(game), /graphics.*reload/i);
});
