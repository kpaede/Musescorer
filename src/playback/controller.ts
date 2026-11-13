import type { TFile, Vault } from 'obsidian';
import { EngineClient } from '../engine/client';
import type { AudioChunk, ScoreFormat, ScorePosition, ScorePositions } from '../engine/protocol';

export interface PlaybackState { owner: string | null; status: 'idle' | 'loading' | 'playing'; error?: string }

/** One audible transport per plugin, fed by native 44.1-kHz stereo synthesis. */
export class PlaybackController {
 private context?: AudioContext;
 private sources = new Set<AudioBufferSourceNode>();
 private listeners = new Set<(state: PlaybackState) => void>();
 private generation = 0;
 private external = new Map<string, () => void>();
 private highlights = new Set<(owner: string | null, box: ScorePosition | null) => void>();
 private animation?: number;
 private spans: { at: number; end: number; scoreMs: number }[] = [];
 private nativeSession?: string;
 private state: PlaybackState = { owner: null, status: 'idle' };
 constructor(private client: EngineClient, private vault: Vault) {}
 subscribe(listener: (state: PlaybackState) => void): () => void {
  this.listeners.add(listener); listener(this.state);
  return () => this.listeners.delete(listener);
 }
 registerExternal(owner: string, stop: () => void): () => void { this.external.set(owner, stop); return () => this.external.delete(owner); }
 stopExternal(except?: string): void { for (const [owner, stop] of this.external) if (owner !== except) stop(); }
 subscribeHighlights(listener: (owner: string | null, box: ScorePosition | null) => void): () => void { this.highlights.add(listener); return () => this.highlights.delete(listener); }
 isOwner(owner: string): boolean { return this.state.owner === owner; }
 async playFile(file: TFile, owner: string): Promise<void> { await this.start(owner, `playback-${crypto.randomUUID()}`, file); }
 async playSession(session: string, owner: string): Promise<void> { await this.start(owner, session); }
 private async start(owner: string, scoreSession: string, file?: TFile): Promise<void> {
  // Create/resume in the button's user gesture before awaiting any disk or worker work.
  this.stopExternal();
  this.context ??= new AudioContext();
  const resume = this.context.resume();
  await this.stop();
  const generation = ++this.generation;
  const session = `audio-${crypto.randomUUID()}`;
  let started = false;
  this.emit({ owner, status: 'loading' });
  this.client.pin();
  try {
   await resume;
   const [soundfont, data] = await Promise.all([this.client.readSoundfont(), file ? this.vault.readBinary(file) : Promise.resolve(undefined)]);
   if (generation !== this.generation) return;
   this.nativeSession = session;
   started = true;
   const ready = await this.client.request({ type: 'audio-start', session, scoreSession: file ? undefined : scoreSession, soundfont, data, format: file?.extension.toLowerCase() as ScoreFormat | undefined }, data ? [soundfont, data] : [soundfont]);
   if (generation !== this.generation) { await this.client.request({ type: 'audio-stop', session }); return; }
   if (ready.type !== 'audio-ready') throw new Error('Playback positions are missing.');
   this.animate(owner, ready.positions, generation);
   let nextTime = this.context.currentTime + 0.12;
   this.emit({ owner, status: 'playing' });
   let done = false;
   while (!done && generation === this.generation) {
    while (nextTime - this.context.currentTime > 1.5 && generation === this.generation) await this.delay(40);
    if (generation !== this.generation) break;
    const response = await this.client.request({ type: 'audio-pull', session });
    if (generation !== this.generation) break;
    if (response.type !== 'audio-chunks') throw new Error('The engine did not return audio data.');
    done = response.chunks.length === 0 || response.chunks.some(chunk => chunk.done);
    const buffer = this.audioBuffer(response.chunks);
    if (buffer) {
     const source = this.context.createBufferSource();
     source.buffer = buffer;
     source.connect(this.context.destination);
     const at = Math.max(nextTime, this.context.currentTime + 0.035);
     source.start(at);
     nextTime = at + buffer.duration;
     const first = response.chunks.find(chunk => chunk.chunk.byteLength > 0);
     this.spans.push({ at, end: nextTime, scoreMs: (first?.startTime ?? 0) * 1000 });
     this.sources.add(source);
     source.onended = () => { source.disconnect(); this.sources.delete(source); };
    }
   }
   while (generation === this.generation && this.context.currentTime < nextTime) await this.delay(40);
  } catch (error) {
   if (generation === this.generation) this.emit({ owner, status: 'idle', error: error instanceof Error ? error.message : 'Playback failed.' });
  } finally {
   if (started) await this.client.request({ type: 'audio-stop', session }).catch(() => undefined);
   if (generation === this.generation) {
    this.nativeSession = undefined;
    this.silence();
    if (!this.state.error) this.emit({ owner: null, status: 'idle' });
   }
   this.client.unpin();
  }
 }
 private audioBuffer(chunks: AudioChunk[]): AudioBuffer | null {
  const populated = chunks.filter(chunk => chunk.chunk.byteLength > 0);
  if (!populated.length || !this.context) return null;
  if (populated.some(chunk => chunk.channels !== 2 || chunk.sampleRate !== 44100 || chunk.chunk.byteLength !== chunk.framesPerChannel * 8)) throw new Error('Unexpected audio format from the MuseScore engine.');
  const frames = populated.reduce((sum, chunk) => sum + chunk.framesPerChannel, 0);
  const buffer = this.context.createBuffer(2, frames, 44100);
  let offset = 0;
  for (const chunk of populated) {
   const samples = new Float32Array(chunk.chunk.buffer, chunk.chunk.byteOffset, chunk.chunk.byteLength / 4);
   buffer.getChannelData(0).set(samples.subarray(0, chunk.framesPerChannel), offset);
   buffer.getChannelData(1).set(samples.subarray(chunk.framesPerChannel), offset);
   offset += chunk.framesPerChannel;
  }
  return buffer;
 }
 async stop(owner?: string): Promise<void> {
  if (owner && !this.isOwner(owner)) return;
  this.generation++;
  this.silence();
  const session = this.nativeSession;
  this.nativeSession = undefined;
  this.emit({ owner: null, status: 'idle' });
  if (session) await this.client.request({ type: 'audio-stop', session }).catch(() => undefined);
 }
 private silence(): void {
  if (this.animation !== undefined) window.cancelAnimationFrame(this.animation);
  this.animation = undefined; this.spans = [];
  for (const listener of this.highlights) listener(null, null);
  for (const source of this.sources) { try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
  this.sources.clear();
 }
 private animate(owner: string, positions: ScorePositions, generation: number): void {
  const events = positions.events.filter(event => Number.isFinite(event.position)).sort((a, b) => a.position - b.position);
  const tick = (): void => {
   if (generation !== this.generation || !this.context) return;
   const stamp = this.context.getOutputTimestamp?.();
   const audible = stamp && typeof stamp.contextTime === 'number' && typeof stamp.performanceTime === 'number' && stamp.performanceTime > 0
    ? Math.min(this.context.currentTime, stamp.contextTime + Math.max(0, performance.now() - stamp.performanceTime) / 1000)
    : Math.max(0, this.context.currentTime - this.context.baseLatency);
   while (this.spans.length > 1 && audible >= this.spans[1]!.at) this.spans.shift();
   const span = this.spans[0];
   const time = span ? span.scoreMs + Math.max(0, Math.min(span.end, audible) - span.at) * 1000 : -1;
   let low = 0, high = events.length - 1, found = -1;
   while (low <= high) { const middle = (low + high) >>> 1; if (events[middle]!.position <= time) { found = middle; low = middle + 1; } else high = middle - 1; }
   const index = events[found]?.elid;
   const box = span && audible >= span.at && index !== undefined ? positions.elements[index] ?? null : null;
   for (const listener of this.highlights) listener(owner, box);
   this.animation = window.requestAnimationFrame(tick);
  };
  tick();
 }
 private emit(state: PlaybackState): void { this.state = state; for (const listener of this.listeners) listener(state); }
 private delay(milliseconds: number): Promise<void> { return new Promise(resolve => window.setTimeout(resolve, milliseconds)); }
 dispose(): void { this.stopExternal(); this.external.clear(); this.highlights.clear(); void this.stop(); void this.context?.close(); this.listeners.clear(); }
}
