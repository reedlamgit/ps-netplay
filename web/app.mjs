import { InputState, parseRoom } from './controls.mjs';
import { GameRoom } from './room.mjs';
import { biosArchive, captureGame } from './media.mjs';

const $ = id => document.getElementById(id);
let room = null;
let capture = null;
let mode = 'setup';
let channel = null;
let wakeLock = null;
let remoteInput = null;
let biosUrl = null;
const held = new Map();
const touchButtons = [...document.querySelectorAll('[data-button]')];
const keyboard = { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 0, KeyX: 8, KeyA: 1, KeyS: 9, Enter: 3, ShiftLeft: 2, KeyQ: 10, KeyE: 11 };

function show(next) {
  mode = next;
  $('setup').hidden = next !== 'setup';
  $('host-player').hidden = next !== 'host';
  $('guest-player').hidden = next !== 'guest';
  document.body.classList.toggle('in-game', next !== 'setup');
}
function status(message) {
  $(mode === 'host' ? 'host-status' : mode === 'guest' ? 'guest-status' : 'join-status').textContent = message;
}
function ready() {
  $('start').disabled = !($('rom').files.length && $('bios').files.length);
  $('status').textContent = $('start').disabled ? 'Choose both files to begin.' : `Ready: ${$('rom').files[0].name}`;
}
$('rom').addEventListener('change', ready);
$('bios').addEventListener('change', ready);

async function keepAwake() {
  try { if (!wakeLock && navigator.wakeLock && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); }
  catch { /* Browser may deny wake locks; the host must keep the screen awake. */ }
  wakeLock?.addEventListener('release', () => { wakeLock = null; }, { once: true });
}

$('start').addEventListener('click', async () => {
  const game = $('rom').files[0], bios = $('bios').files[0];
  if (!game || !bios) return;
  if (!/\.(chd|pbp|iso|bin|zip|7z)$/i.test(game.name)) { $('status').textContent = 'Choose a CHD, PBP, ISO, BIN, ZIP or 7Z game file.'; return; }
  if (!/\.bin$/i.test(bios.name) || bios.size !== 524288) { $('status').textContent = 'Choose a 512 KB PlayStation BIOS .bin file, such as scph5500.bin.'; return; }
  $('start').disabled = true;
  try {
    biosUrl = await biosArchive(bios);
    Object.assign(window, {
      EJS_player: '#game', EJS_core: 'psx', EJS_gameUrl: game, EJS_gameName: game.name,
      EJS_biosUrl: biosUrl, EJS_pathtodata: 'https://cdn.emulatorjs.org/stable/data/',
      EJS_startOnLoaded: true, EJS_color: '#c6da95', EJS_language: 'en-US',
      EJS_onGameStart: () => {
        status('Game running · create a room to invite Player 2.');
        $('create-room').disabled = false;
        remoteInput = new InputState((player, id, value) => window.EJS_emulator.gameManager.simulateInput(player, id, value));
        keepAwake();
      }
    });
    show('host');
    status('Downloading emulator and loading your game…');
    const script = document.createElement('script');
    script.src = window.EJS_pathtodata + 'loader.js';
    script.onerror = () => status('Could not download the emulator. Check your connection, then reload.');
    document.body.appendChild(script);
  } catch (error) { $('status').textContent = error.message; $('start').disabled = false; }
});

function releaseControls() {
  held.clear();
  touchButtons.forEach(button => button.classList.remove('pressed'));
  sendControls();
  remoteInput?.release();
}
function controlsEnabled(enabled) { touchButtons.forEach(button => { button.disabled = !enabled; }); }
function sendControls() {
  if (mode !== 'guest' || channel?.readyState !== 'open' || channel.bufferedAmount > 8192) return;
  channel.send(JSON.stringify({ type: 'buttons', buttons: [...new Set(held.values())] }));
}
function stopRoom() {
  releaseControls();
  controlsEnabled(false);
  channel = null;
  room?.close();
  room = null;
  capture?.stop();
  capture = null;
  $('room-share').hidden = true;
  $('close-room').hidden = true;
  $('create-room').hidden = false;
  $('create-room').disabled = !window.EJS_emulator?.started;
  if (mode === 'guest') {
    $('remote-video').srcObject = null;
    $('remote-video').muted = true;
    $('sound').textContent = 'Enable sound';
    $('sound').disabled = true;
    $('video-wait').hidden = false;
  }
}
function createConnection() {
  return new GameRoom({
    onStatus: status,
    onStream: stream => {
      const video = $('remote-video');
      if (video.srcObject !== stream) video.srcObject = stream;
      video.play().catch(() => status('Tap Enable sound to start the live video.'));
      $('sound').disabled = false;
    },
    onChannel: next => {
      channel = next;
      if (mode === 'guest') { controlsEnabled(true); sendControls(); }
      else next.onmessage = event => {
        if (typeof event.data !== 'string' || event.data.length > 1024) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'buttons') remoteInput?.update(message.buttons);
        } catch { /* Ignore malformed peer messages. */ }
      };
    },
    onPeerLeft: () => {
      releaseControls();
      controlsEnabled(false);
      channel = null;
    },
    onClose: message => { stopRoom(); status(message); }
  });
}

$('create-room').addEventListener('click', async () => {
  $('create-room').disabled = true;
  let connection;
  try {
    capture = await captureGame(window.EJS_emulator);
    const code = crypto.randomUUID().replaceAll('-', '').slice(0, 24);
    connection = createConnection();
    room = connection;
    await connection.enter('host', code, capture.stream);
    if (room !== connection || connection.closed) return;
    $('share-link').value = `${location.origin}/?room=${code}`;
    $('room-share').hidden = false;
    $('close-room').hidden = false;
    $('create-room').hidden = true;
    $('media-note').textContent = capture.audioWarning || 'Game + audio stream directly from this device. Keep this page open.';
    await keepAwake();
  } catch (error) {
    if (connection && room !== connection) return;
    stopRoom(); status(error.message);
  }
});
$('close-room').addEventListener('click', () => { stopRoom(); status('Room closed · you can create another room.'); });
$('copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('share-link').value); $('copy-link').textContent = 'Copied'; setTimeout(() => { $('copy-link').textContent = 'Copy link'; }, 2000); }
  catch { $('share-link').focus(); $('share-link').select(); status('Select and copy the room link manually.'); }
});
$('join').addEventListener('click', async () => {
  const code = parseRoom($('room-code').value);
  if (!code) { $('join-status').textContent = 'Paste a valid PS Pocket room link or its 24-character code.'; return; }
  $('join').disabled = true;
  show('guest');
  const connection = createConnection();
  room = connection;
  try {
    await connection.enter('guest', code);
    if (room === connection && !connection.closed) await keepAwake();
  } catch (error) {
    if (room === connection) { stopRoom(); status(error.message + ' Tap Leave room to try again.'); }
  } finally { if (!room || room === connection) $('join').disabled = false; }
});
$('remote-video').addEventListener('loadeddata', () => { $('video-wait').hidden = true; });
$('sound').addEventListener('click', async () => {
  const video = $('remote-video');
  try {
    video.muted = !video.muted;
    await video.play();
    $('sound').textContent = video.muted ? 'Enable sound' : 'Mute sound';
  } catch { status('Playback was blocked. Tap Enable sound again.'); }
});
$('leave').addEventListener('click', () => {
  stopRoom();
  wakeLock?.release();
  show('setup');
  $('join').disabled = false;
  $('join-status').textContent = 'You left the room.';
});
$('back').addEventListener('click', () => location.assign('/'));

for (const button of touchButtons) {
  button.addEventListener('contextmenu', event => event.preventDefault());
  button.addEventListener('pointerdown', event => {
    if (button.disabled || mode !== 'guest') return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    held.set(`pointer:${event.pointerId}`, Number(button.dataset.button));
    button.classList.add('pressed');
    sendControls();
  });
  function release(event) {
    held.delete(`pointer:${event.pointerId}`);
    if (![...held.values()].includes(Number(button.dataset.button))) button.classList.remove('pressed');
    sendControls();
  }
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}
window.addEventListener('keydown', event => {
  if (mode !== 'guest' || channel?.readyState !== 'open' || !(event.code in keyboard) || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
  event.preventDefault();
  held.set(`key:${event.code}`, keyboard[event.code]);
  sendControls();
});
window.addEventListener('keyup', event => {
  if (!held.has(`key:${event.code}`)) return;
  held.delete(`key:${event.code}`);
  sendControls();
});
window.addEventListener('blur', releaseControls);
window.addEventListener('pagehide', () => { stopRoom(); if (biosUrl) URL.revokeObjectURL(biosUrl); });
document.addEventListener('visibilitychange', () => {
  releaseControls();
  if (document.visibilityState === 'visible' && mode !== 'setup') keepAwake();
});
setInterval(() => { if (mode === 'guest') sendControls(); else remoteInput?.expire(); }, 100);

const queryRoom = parseRoom(new URL(location.href).searchParams.get('room'));
if (queryRoom) {
  $('room-code').value = queryRoom;
  $('join-status').textContent = 'Your room is ready to join. Tap Join room.';
  document.querySelector('.host-setup').hidden = true;
  document.querySelector('h1').textContent = 'Player 2. Ready?';
  document.querySelector('.intro').textContent = 'Join the host’s live game. You don’t need to load any files.';
  document.querySelector('.setup-grid').classList.add('join-only');
}
