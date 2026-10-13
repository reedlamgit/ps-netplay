// Libretro joypad IDs. Player indexes are zero-based: 0=P1, 1=P2.
export const BUTTONS = Object.freeze({ cross: 0, square: 1, select: 2, start: 3, up: 4, down: 5, left: 6, right: 7, circle: 8, triangle: 9, l1: 10, r1: 11, l2: 12, r2: 13 });
const allowed = new Set(Object.values(BUTTONS));
export function normalizeButtons(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => Number.isInteger(id) && allowed.has(id)))].sort((a, b) => a - b);
}
export class InputState {
  constructor(apply) { this.apply = apply; this.held = new Set(); this.lastSeen = 0; }
  update(buttons, now = Date.now()) {
    const next = new Set(normalizeButtons(buttons));
    for (const id of this.held) if (!next.has(id)) this.apply(1, id, 0);
    for (const id of next) if (!this.held.has(id)) this.apply(1, id, 1);
    this.held = next;
    this.lastSeen = now;
  }
  release() { this.update([]); }
  expire(now = Date.now()) { if (now - this.lastSeen > 1000 && this.held.size) this.release(); }
}
export function findHost(players) {
  return Object.values(players || {}).find(player => player.role === 'host')?.socketId || null;
}
export function parseRoom(value) {
  let code = String(value || '').trim();
  if (code.startsWith('https://') || code.startsWith('http://')) {
    try { code = new URL(code).searchParams.get('room') || ''; } catch { return null; }
  }
  return /^[a-f0-9]{24}$/.test(code) ? code : null;
}
