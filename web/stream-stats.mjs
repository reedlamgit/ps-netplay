export class CounterRate {
  constructor() { this.previous = null; }
  sample(value, time) {
    if (!Number.isFinite(value) || !Number.isFinite(time)) return null;
    const previous = this.previous;
    this.previous = { value, time };
    if (!previous || time <= previous.time || value < previous.value) return null;
    return Math.round((value - previous.value) * 10000 / (time - previous.time)) / 10;
  }
}
export function videoStats(report, role) {
  const entries = [...report.values()];
  const videos = entries.filter(stat => stat.type === (role === 'host' ? 'outbound-rtp' : 'inbound-rtp') && (stat.kind === 'video' || stat.mediaType === 'video'));
  function sum(key) {
    const values = videos.map(stat => stat[key]).filter(Number.isFinite);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  }
  const codec = entries.find(stat => stat.id === videos[0]?.codecId) || report.get(videos[0]?.codecId);
  return { received: sum('framesReceived'), decoded: sum('framesDecoded'), encoded: sum('framesEncoded'), bytes: sum(role === 'host' ? 'bytesSent' : 'bytesReceived'), codec: codec?.mimeType?.split('/')[1] || '' };
}
