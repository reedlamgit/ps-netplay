// A separate, bounded-size canvas keeps the stream independent of the phone's
// display resolution and excludes the host's on-screen controls.
export function gameViewport(width, height, aspect = 4 / 3) {
  const gameWidth = Math.min(width, height * aspect);
  const gameHeight = Math.min(height, width / aspect);
  // The current EmulatorJS core sets video_top_portrait_viewport=true.
  return { x: (width - gameWidth) / 2, y: width < height ? 0 : (height - gameHeight) / 2, width: gameWidth, height: gameHeight };
}

export function sourceAudioNodes(emulator) {
  return Object.values(emulator?.Module?.AL?.currentCtx?.sources || {}).map(source => source.gain).filter(node => typeof node?.connect === 'function');
}

export async function captureGame(emulator) {
  if (!emulator?.started || !emulator.canvas) throw new Error('Start the game before opening a room.');
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  if (typeof canvas.captureStream !== 'function') throw new Error('This browser cannot stream the game canvas. Try a computer host.');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not create the game stream.');
  const stream = canvas.captureStream(30);
  let stopped = false;
  let frame;
  let previous = 0;
  let lastAudioScan = 0;
  const audioNodes = new Set();
  let destination;
  function connectAudioSources() {
    if (!destination) return;
    for (const node of sourceAudioNodes(emulator)) {
      if (!audioNodes.has(node)) {
        try { node.connect(destination); audioNodes.add(node); } catch { /* A resetting core may briefly expose a source from an old AudioContext. */ }
      }
    }
  }
  function draw(now) {
    if (stopped) return;
    if (now - previous >= 1000 / 30) {
      const aspect = emulator.gameManager.getVideoDimensions('aspect') || 4 / 3;
      const crop = gameViewport(emulator.canvas.width, emulator.canvas.height, aspect);
      context.drawImage(emulator.canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      previous = now;
    }
    if (now - lastAudioScan > 1000) { connectAudioSources(); lastAudioScan = now; }
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  let audioWarning = '';
  try {
    const al = emulator.Module?.AL?.currentCtx;
    if (al?.audioCtx) {
      await al.audioCtx.resume();
      destination = al.audioCtx.createMediaStreamDestination();
      connectAudioSources();
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    } else audioWarning = 'Audio capture is unavailable in this emulator/browser; P2 will receive video only.';
  } catch {
    audioWarning = 'Audio capture failed; P2 will receive video only.';
  }
  return {
    stream,
    audioWarning,
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      stream.getTracks().forEach(track => track.stop());
      for (const node of audioNodes) {
        try { node.disconnect(destination); } catch { /* Source may already be disconnected on emulator exit. */ }
      }
      audioNodes.clear();
    }
  };
}

export async function biosArchive(file) {
  // BIOS filenames matter to the core. ZIP preserves the filename while the
  // stable loader's blob-URL and direct-File BIOS paths do not.
  const data = new Uint8Array(await file.arrayBuffer());
  const name = new TextEncoder().encode(file.name);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = new Uint8Array(30 + name.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
  lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
  lv.setUint16(26, name.length, true); local.set(name, 30); local.set(data, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
  cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
  cv.setUint16(28, name.length, true); central.set(name, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true); ev.setUint32(16, local.length, true);
  return URL.createObjectURL(new Blob([local, central, end], { type: 'application/zip' }));
}
