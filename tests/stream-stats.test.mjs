import test from 'node:test';
import assert from 'node:assert/strict';
import { CounterRate, videoStats } from '../web/stream-stats.mjs';

test('frame rate distinguishes a stalled counter from an unknown first sample', () => {
  const rate = new CounterRate();
  assert.equal(rate.sample(1, 1000), null);
  assert.equal(rate.sample(1, 2000), 0);
  assert.equal(rate.sample(31, 3000), 30);
  assert.equal(rate.sample(5, 4000), null, 'a reset is not negative FPS');
});
test('video stats ignore audio and keep receiving and decoding separate', () => {
  const report = new Map([
    ['audio', { type: 'inbound-rtp', kind: 'audio', framesReceived: 100 }],
    ['video', { type: 'inbound-rtp', kind: 'video', framesReceived: 50, framesDecoded: 1, bytesReceived: 9000, codecId: 'codec' }],
    ['codec', { type: 'codec', mimeType: 'video/H264' }]
  ]);
  assert.deepEqual(videoStats(report, 'guest'), { received: 50, decoded: 1, encoded: null, bytes: 9000, codec: 'H264' });
});
test('outgoing stats expose encoded frames, not simply connection state', () => {
  const report = new Map([['v', { type: 'outbound-rtp', mediaType: 'video', framesEncoded: 70, bytesSent: 12000 }]]);
  assert.equal(videoStats(report, 'host').encoded, 70);
  assert.equal(videoStats(new Map(), 'guest').decoded, null);
});
