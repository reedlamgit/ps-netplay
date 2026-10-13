// Invoke directly from a user tap: iOS may require a fresh gesture to wake audio.
export async function resumeGame(emulator) {
  if (!emulator?.started || !emulator.Module) throw new Error('The browser discarded the game. Reload the page and select your files again.');
  if (emulator.Module.ctx?.isContextLost?.()) throw new Error('The graphics context was lost. Reload the page and select your files again.');
  const context = emulator.Module.AL?.currentCtx?.audioCtx;
  let audioResume;
  try { audioResume = context && context.state !== 'closed' ? context.resume() : Promise.resolve(); }
  catch { audioResume = Promise.resolve(); }
  // Audio resumption must not prevent game-loop recovery when iOS delays it.
  emulator.play?.();
  emulator.gameManager?.toggleMainLoop(1);
  emulator.Module.resumeMainLoop?.();
  emulator.elements?.parent?.focus({ preventScroll: true });
  let timer;
  try {
    await Promise.race([Promise.resolve(audioResume).catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 2000); })]);
  } finally { clearTimeout(timer); }
  return { audioRunning: !context || context.state === 'running' };
}
