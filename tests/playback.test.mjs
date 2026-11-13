import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/playback/controller.ts'], bundle: true, write: false, format: 'esm' });
const { PlaybackController } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function transport() {
 const calls = [], nodes = [], states = [];
 class Context {
  currentTime = 0;
  state = 'suspended';
  destination = {};
  baseLatency = 0;
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createBuffer(channels, frames, sampleRate) {
   const data = Array.from({ length: channels }, () => new Float32Array(frames));
   return { duration: frames / sampleRate, getChannelData: channel => data[channel] };
  }
  createBufferSource() {
   const node = { connect() {}, disconnect() {}, start(at) { this.at = at; }, stop() { this.stopped = true; } };
   nodes.push(node); return node;
  }
 }
 const contexts = [];
 globalThis.AudioContext = class extends Context { constructor() { super(); contexts.push(this); } };
 globalThis.window = { setTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
 const client = {
  pins: 0, pin() { this.pins++; }, unpin() { this.pins--; },
  async readSoundfont() { return new ArrayBuffer(1); },
  async request(request) {
   calls.push(request);
   if (request.type === 'audio-start') return { type: 'audio-ready', positions: { events: [], elements: [] } };
   if (request.type === 'audio-pull') return { type: 'audio-chunks', chunks: [{ done: true, startTime: 0, chunk: new Uint8Array(44100 * 8), channels: 2, sampleRate: 44100, framesPerChannel: 44100 }] };
   return { type: 'native-result' };
  },
 };
 const controller = new PlaybackController(client, { async readBinary() { return new ArrayBuffer(1); } });
 controller.subscribe(state => states.push(state));
 return { controller, client, calls, nodes, contexts, states, file: { extension: 'mscz' } };
}

async function ready(t) {
 for (let tries = 0; tries < 20 && !t.nodes.length; tries++) await new Promise(resolve => setImmediate(resolve));
 assert.equal(t.nodes.length, 1);
}

test('pause retains the native stream and queued audio; resume continues without restarting', async () => {
 const t = transport();
 const playing = t.controller.toggleFile(t.file, 'embed');
 try {
  await ready(t);
  await t.controller.toggleFile(t.file, 'embed');
  assert.equal(t.states.at(-1).status, 'paused');
  assert.equal(t.contexts[0].state, 'suspended');
  assert.equal(t.calls.filter(call => call.type === 'audio-stop').length, 0);
  assert.equal(t.client.pins, 1);
  assert.equal(t.nodes[0].stopped, undefined);
  await t.controller.toggleFile(t.file, 'embed');
  assert.equal(t.contexts[0].state, 'running');
  assert.equal(t.states.at(-1).status, 'playing');
  assert.equal(t.calls.filter(call => call.type === 'audio-start').length, 1);
  assert.equal(t.nodes.length, 1);
  t.contexts[0].currentTime = 2;
  await playing;
  assert.equal(t.client.pins, 0);
  assert.equal(t.states.at(-1).status, 'idle');
 } finally { await t.controller.stop(); t.controller.dispose(); }
});

test('stop while paused clears queued sources, and another owner cannot pause the score', async () => {
 const t = transport();
 const playing = t.controller.playFile(t.file, 'embed');
 try {
  await ready(t);
  await t.controller.pause('another-embed');
  assert.equal(t.states.at(-1).status, 'playing');
  await t.controller.pause('embed');
  await t.controller.stop('embed');
  assert.equal(t.nodes[0].stopped, true);
  assert.equal(t.states.at(-1).status, 'idle');
  await t.controller.resume('embed');
  assert.equal(t.states.at(-1).status, 'idle');
  await playing;
  assert.equal(t.client.pins, 0);
 } finally { await t.controller.stop(); t.controller.dispose(); }
});
