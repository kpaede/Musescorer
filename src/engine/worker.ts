import type { AudioChunk, NativeEngine, NativeScore, WorkerRequest, WorkerResponse } from './protocol';
import type { EditorSnapshot } from './editor-protocol';

interface RendererWorkerScope {
	onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
	postMessage(message: WorkerResponse): void;
	importScripts(url: string): void;
	MUSESCORER_MODULE_OPTIONS?: Record<string, unknown>;
	MuseScoreEngine?: { default: NativeEngine };
}
const scope = self as unknown as RendererWorkerScope;
const resources = new Map<number, (data: ArrayBuffer | null) => void>();
let resourceId = 0;
let soundfontHash: string | undefined;
let engine: NativeEngine | undefined;
let queue = Promise.resolve();
const sessions = new Map<string, NativeScore>();
let playback: { session: string; scoreSession?: string; score: NativeScore; owned: boolean; pull: (cancel?: boolean) => Promise<AudioChunk[]> } | undefined;
async function stopAudio(session?: string): Promise<void> {
 if (!playback || (session && session !== playback.session && session !== playback.scoreSession)) return;
 const old = playback;
 playback = undefined;
 try { await old.pull(true); } finally { if (old.owned) old.score.destroy(); }
}
async function installSoundfont(data: Uint8Array): Promise<void> {
 if (!engine) throw new Error('The engine is not ready.');
 const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(data).buffer);
 const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
 if (hash === soundfontHash && engine.hasSoundfont) return;
 await engine.setSoundFont(data); soundfontHash = hash;
}
async function renderPages(score: NativeScore, highlight: boolean): Promise<string[]> {
 const { pages: count } = await score.metadata();
 if (!Number.isSafeInteger(count) || count < 1) throw new Error('The score has no renderable pages.');
 const pages: string[] = [];
 for (let page = 0; page < count; page++) {
  const svg = await score.saveSvg(page, true, highlight);
  if (!svg.includes('<svg')) throw new Error(`Page ${page + 1} does not contain valid SVG.`);
  pages.push(svg);
 }
 return pages;
}
async function snapshot(score: NativeScore, backup: boolean): Promise<EditorSnapshot> {
 return { pages: await renderPages(score, true), selection: await score.getSelectedElementProperties(), history: await score.getUndoInfo(), backup: backup ? await score.saveMsc('mscz') : undefined };
}

async function processRequest(request: Exclude<WorkerRequest, { type: 'resource' }>): Promise<void> {
	try {
		if (request.type === 'init') {
			// Inject local bytes before Emscripten starts. No network or app:// fetch required.
			scope.MUSESCORER_MODULE_OPTIONS = {
				wasmBinary: new Uint8Array(request.wasm),
				getPreloadedPackage: () => request.data,
				locateFile: (path: string) => `https://musescorer.invalid/${path}`,
			};
			scope.importScripts(request.scriptUrl);
			engine = scope.MuseScoreEngine?.default;
			if (!engine) throw new Error('The local MuseScore engine has not loaded.');
			await engine.ready;
			engine.fetchResource = async (path: string) => {
				const id = ++resourceId;
				const data = await new Promise<ArrayBuffer | null>(resolve => {
					resources.set(id, resolve);
					scope.postMessage({ type: 'resource', id, path });
				});
				return data ? new Uint8Array(data) : null;
			};
			scope.MUSESCORER_MODULE_OPTIONS = undefined;
			scope.postMessage({ type: 'ready', id: request.id });
			return;
		}
		if (!engine) throw new Error('The MuseScore engine is not ready.');
  if (request.type === 'native-open') {
   if (sessions.has(request.session)) throw new Error('This native session is already open.');
   const score = await engine.load(request.format, request.data, request.fonts, request.layout);
   sessions.set(request.session, score);
   const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(score) as object).filter(name => name !== 'constructor' && typeof Reflect.get(score, name) === 'function');
   scope.postMessage({ type: 'native-result', id: request.id, value: { methods } }); return;
  }
  if (request.type === 'native-call') {
   const score = sessions.get(request.session);
   if (!score || !Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(score), request.method) || request.method === 'constructor' || request.method === 'destroy') throw new Error('Invalid native editor call.');
   const method: unknown = Reflect.get(score, request.method);
   if (typeof method !== 'function') throw new Error(`The engine does not support ${request.method}.`);
   const value: unknown = request.method === 'setSoundFont' && request.args[0] instanceof Uint8Array
    ? await installSoundfont(request.args[0]) : await Reflect.apply(method, score, request.args);
   scope.postMessage({ type: 'native-result', id: request.id, value }); return;
  }
  if (request.type === 'native-static') {
   if (!['version', 'setLogLevel', 'setSoundFont'].includes(request.method)) throw new Error('Invalid engine call.');
   const method: unknown = Reflect.get(engine, request.method);
   if (typeof method !== 'function') throw new Error('The engine function is missing.');
   const value: unknown = request.method === 'setSoundFont' && request.args[0] instanceof Uint8Array
    ? await installSoundfont(request.args[0]) : await Reflect.apply(method, engine, request.args);
   scope.postMessage({ type: 'native-result', id: request.id, value }); return;
  }

  if (request.type === 'audio-stop') {
   await stopAudio(request.session);
   scope.postMessage({ type: 'ready', id: request.id }); return;
  }
  if (request.type === 'audio-start') {
   await stopAudio();
   if (!engine.hasSoundfont) await installSoundfont(new Uint8Array(request.soundfont));
   let score = sessions.get(request.scoreSession ?? request.session);
   let owned = false;
   if (!score && request.data && request.format) { score = await engine.load(request.format, new Uint8Array(request.data), [], true); owned = true; }
   if (!score) throw new Error('The playback score is not open.');
   try { playback = { session: request.session, scoreSession: request.scoreSession, score, owned, pull: await score.synthAudioBatch(0, 64) }; }
   catch (error) { if (owned) score.destroy(); throw error; }
   scope.postMessage({ type: 'audio-ready', id: request.id, positions: await score.segmentPositions() }); return;
  }
  if (request.type === 'audio-pull') {
   if (!playback || playback.session !== request.session) throw new Error('Playback has stopped.');
   const chunks = await playback.pull();
   scope.postMessage({ type: 'audio-chunks', id: request.id, chunks }); return;
  }
  if (request.type === 'editor-open') {
   if (sessions.has(request.session)) throw new Error('This editor session is already open.');
   const score = await engine.load(request.format, new Uint8Array(request.data), [], true);
   try {
    const state = await snapshot(score, true);
    sessions.set(request.session, score);
    scope.postMessage({ type: 'editor-state', id: request.id, snapshot: state });
   } catch (error) { score.destroy(); throw error; }
   return;
  }
  if (request.type === 'editor-close') {
   await stopAudio(request.session);
   sessions.get(request.session)?.destroy(); sessions.delete(request.session);
   scope.postMessage({ type: 'ready', id: request.id }); return;
  }
  if (request.type === 'editor-select' || request.type === 'editor-command') {
   const score = sessions.get(request.session);
   if (!score) throw new Error('The editor session has ended. Reopen the score.');
   const mutation = request.type === 'editor-command' && !['selectNextChord', 'selectPrevChord', 'clearSelection'].includes(request.command);
   if (mutation) await stopAudio(request.session);
   if (request.type === 'editor-select') await score.selectElementAtPoint(request.page, request.x, request.y);
   else await score[request.command]();
   scope.postMessage({ type: 'editor-state', id: request.id, snapshot: await snapshot(score, mutation) }); return;
  }
  let score: NativeScore | undefined;
  try {
   score = await engine.load(request.format, new Uint8Array(request.data), [], true);
   scope.postMessage({ type: 'rendered', id: request.id, pages: await renderPages(score, false) });
  } finally { score?.destroy(); }

	} catch (error) {
		scope.postMessage({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
	}
}

scope.onmessage = (event): void => {
	const request = event.data;
	// Replies bypass the queue because load() can be waiting for a font.
	if (request.type === 'resource') {
		resources.get(request.id)?.(request.data);
		resources.delete(request.id);
		return;
	}
	queue = queue.then(() => processRequest(request));
};
