import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../web/room.mjs';

class FakePeer {
  constructor() { this.connectionState = 'new'; }
  close() { this.connectionState = 'closed'; }
}

test('recovered ICE connection restores the still-open controller channel', () => {
  const original = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = FakePeer;
  let activeChannel = null;
  const room = new GameRoom({ onStatus() {}, onStream() {}, onClose() {}, onChannel: value => { activeChannel = value; }, onPeerLeft: () => { activeChannel = null; } });
  room.role = 'guest';
  room.socket = { emit() {}, disconnect() {} };
  try {
    const peer = room.peer('host');
    peer.channel = { readyState: 'open' };
    peer.pc.connectionState = 'disconnected';
    peer.pc.onconnectionstatechange();
    assert.equal(activeChannel, null);
    peer.pc.connectionState = 'connected';
    peer.pc.onconnectionstatechange();
    assert.equal(activeChannel, peer.channel);
  } finally { room.close(); globalThis.RTCPeerConnection = original; }
});

test('terminal connection failure closes peers and leaves the room', () => {
  let message = '';
  let disconnected = false;
  let peerClosed = false;
  const room = new GameRoom({ onStatus() {}, onStream() {}, onChannel() {}, onClose: value => { message = value; } });
  room.socket = { emit() {}, disconnect() { disconnected = true; } };
  room.peers.set('guest', { pc: { close() { peerClosed = true; } } });
  room.peerError(new Error('Connection failed.'));
  assert.equal(room.closed, true);
  assert.equal(room.peers.size, 0);
  assert.equal(disconnected, true);
  assert.equal(peerClosed, true);
  assert.match(message, /Reopen the room/);
});
