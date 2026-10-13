import { findHost } from './controls.mjs';

export const SERVER = 'https://ps-netplay.onrender.com';
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] };

// Uses the existing EmulatorJS server for room membership and WebRTC signaling.
// Media and controls go directly between browsers, not through Render.
export class GameRoom {
  constructor({ onStatus, onStream, onChannel, onClose, onPeerLeft }) {
    Object.assign(this, { onStatus, onStream, onChannel, onClose, onPeerLeft });
    this.peers = new Map();
    this.players = {};
    this.closed = false;
    this.socket = null;
  }
  async connect() {
    this.onStatus('Waking multiplayer server… this can take about a minute.');
    for (let attempt = 0; attempt < 3; attempt++) {
      this.wakeController = new AbortController();
      const timer = setTimeout(() => this.wakeController?.abort(), 35000);
      try {
        const response = await fetch(`${SERVER}/list`, { signal: this.wakeController.signal });
        if (!response.ok) throw new Error('Server unavailable.');
        break;
      } catch {
        if (this.closed) throw new Error('Connection canceled.');
        if (attempt === 2) throw new Error('The multiplayer server did not wake up. Try again shortly.');
        this.onStatus('Server still waking… retrying the connection.');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } finally { clearTimeout(timer); }
    }
    if (this.closed) throw new Error('Connection canceled.');
    this.onStatus('Connecting to the room server…');
    this.socket = window.io(SERVER, { transports: ['websocket'], reconnection: false, timeout: 25000 });
    this.socket.on('users-updated', players => this.membersChanged(players));
    this.socket.on('webrtc-signal', data => this.signal(data).catch(error => this.peerError(error)));
    await new Promise((resolve, reject) => {
      this.cancelConnection = () => reject(new Error('Connection canceled.'));
      this.socket.once('connect', () => { this.cancelConnection = null; resolve(); });
      this.socket.once('connect_error', () => { this.cancelConnection = null; reject(new Error('Could not connect to the multiplayer server.')); });
    });
    this.socket.on('disconnect', () => {
      if (!this.closed) this.onClose('Room disconnected. Reopen the room to reconnect.');
      this.close();
    });
  }
  async enter(role, room, stream) {
    this.role = role;
    this.code = room;
    this.stream = stream;
    await this.connect();
    if (this.closed) throw new Error('Connection canceled.');
    const extra = { sessionid: room, userid: crypto.randomUUID(), role, player_name: role === 'host' ? 'P1' : 'P2', domain: `ps-pocket-${room}`, game_id: 'screen-stream-v1', room_name: 'PS Pocket' };
    const payload = role === 'host' ? { extra, maxPlayers: 2 } : { extra };
    await new Promise((resolve, reject) => {
      this.socket.timeout(15000).emit(role === 'host' ? 'open-room' : 'join-room', payload, (timeout, error, players) => {
        if (timeout) return reject(new Error('Room request timed out. Try again.'));
        if (error) return reject(new Error(typeof error === 'string' ? error : 'Unable to enter this room.'));
        if (players) this.membersChanged(players);
        resolve();
      });
    });
    if (role === 'host') this.onStatus('Room open · waiting for P2');
    else this.onStatus('Joined as P2 · connecting to the host…');
  }
  membersChanged(players) {
    if (this.closed) return;
    this.players = players;
    const ids = new Set(Object.values(players).map(player => player.socketId));
    for (const [id, peer] of this.peers) {
      if (!ids.has(id)) {
        clearTimeout(peer.connectTimer);
        clearTimeout(peer.disconnectTimer);
        peer.pc.close();
        this.peers.delete(id);
        this.onPeerLeft?.();
      }
    }
    if (this.role === 'host') {
      for (const player of Object.values(players)) {
        if (player.role === 'guest' && player.socketId !== this.socket.id && !this.peers.has(player.socketId)) {
          this.offer(player.socketId).catch(error => this.peerError(error));
        }
      }
      if (Object.values(players).length === 1) this.onStatus('Room open · waiting for P2');
    } else if (!findHost(players)) {
      this.onClose('The host left the room. Ask them for a new room link.');
      this.close();
    }
  }
  peer(id) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection(ICE);
    const peer = { pc, pending: [], channel: null, disconnectTimer: null };
    this.peers.set(id, peer);
    pc.onicecandidate = event => {
      if (event.candidate && !this.closed) this.socket.emit('webrtc-signal', { target: id, candidate: event.candidate.toJSON() });
    };
    pc.ontrack = event => {
      if (this.role === 'guest') {
        if (!peer.received) peer.received = new MediaStream();
        if (!peer.received.getTracks().some(track => track.id === event.track.id)) peer.received.addTrack(event.track);
        this.onStream(peer.received);
      }
    };
    pc.ondatachannel = event => this.channel(peer, event.channel);
    pc.onconnectionstatechange = () => {
      if (this.closed || this.peers.get(id) !== peer) return;
      clearTimeout(peer.disconnectTimer);
      if (pc.connectionState === 'connected') {
        clearTimeout(peer.connectTimer);
        if (peer.channel?.readyState === 'open') this.onChannel(peer.channel);
        this.onStatus(this.role === 'host' ? 'P2 connected · game streaming live' : 'Connected as P2 · game streaming live');
      }
      if (pc.connectionState === 'failed') this.peerError(new Error('Direct connection failed. Try both phones on the same Wi-Fi. This prototype has no TURN relay.'));
      if (pc.connectionState === 'disconnected') {
        this.onStatus('Connection interrupted · trying to recover…');
        this.onPeerLeft?.();
        peer.disconnectTimer = setTimeout(() => this.peerError(new Error('Connection lost. Reopen the room and try again.')), 12000);
      }
    };
    peer.connectTimer = setTimeout(() => {
      if (pc.connectionState !== 'connected' && !this.closed) this.peerError(new Error('Could not establish a direct connection. Try the same Wi-Fi; some networks need a TURN relay, which is not configured yet.'));
    }, 35000);
    return peer;
  }
  channel(peer, channel) {
    peer.channel = channel;
    channel.onopen = () => { if (!this.closed) this.onChannel(channel); };
    channel.onclose = () => { if (!this.closed) this.onPeerLeft?.(); };
    if (channel.readyState === 'open') this.onChannel(channel);
  }
  async offer(id) {
    this.onStatus('P2 joined · establishing the live stream…');
    const peer = this.peer(id);
    for (const track of this.stream.getTracks()) peer.pc.addTrack(track, this.stream);
    this.channel(peer, peer.pc.createDataChannel('ps-controls', { ordered: true }));
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    if (!this.closed) this.socket.emit('webrtc-signal', { target: id, offer: peer.pc.localDescription.toJSON() });
  }
  async signal(data) {
    if (this.closed || !data.sender) return;
    // Ignore signals from sockets outside this room or from other guests.
    const sender = Object.values(this.players).find(player => player.socketId === data.sender);
    if (!sender || (this.role === 'guest' && sender.role !== 'host') || (this.role === 'host' && sender.role !== 'guest')) return;
    const peer = this.peer(data.sender);
    if (data.offer && this.role === 'guest') {
      await peer.pc.setRemoteDescription(data.offer);
      await this.flushCandidates(peer);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      if (!this.closed) this.socket.emit('webrtc-signal', { target: data.sender, answer: peer.pc.localDescription.toJSON() });
    } else if (data.answer && this.role === 'host') {
      await peer.pc.setRemoteDescription(data.answer);
      await this.flushCandidates(peer);
    } else if (data.candidate) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);
      else peer.pending.push(data.candidate);
    }
  }
  async flushCandidates(peer) {
    for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
  }
  peerError(error) {
    if (this.closed) return;
    this.onClose(error.message + ' Reopen the room to try again.');
    this.close();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.wakeController?.abort();
    this.cancelConnection?.();
    this.cancelConnection = null;
    for (const peer of this.peers.values()) {
      clearTimeout(peer.connectTimer);
      clearTimeout(peer.disconnectTimer);
      peer.pc.close();
    }
    this.peers.clear();
    if (this.socket) { this.socket.emit('leave-room'); this.socket.disconnect(); }
  }
}
