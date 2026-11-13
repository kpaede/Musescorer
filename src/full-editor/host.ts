import { Notice, type App, type TFile } from 'obsidian';
import type { EngineClient } from '../engine/client';
import type { PlaybackController } from '../playback/controller';
import { DraftStore } from '../editor/drafts';
import { SaveCopyModal } from '../editor/save-copy';

interface FrameRequest { type: 'musescorer-request'; token: string; id: number; method: string; args: unknown[] }
export class FullEditorHost {
 readonly token = crypto.randomUUID();
 private sessions = new Set<string>();
 private operations = new Set<Promise<void>>();
 private active?: string;
 private histories = new Map<string, string>();
 private closed = false;
 private scriptUrl?: string;
 private sourceMtime: number;
 private recovered = false;
 private detachedName?: string;
 private source?: ArrayBuffer;
 private unregisterAudio?: () => void;
 private initialFormat: string;
 constructor(private app: App, private client: EngineClient, private player: PlaybackController, private drafts: DraftStore, private frame: HTMLIFrameElement, private file: TFile, private dir: string, private onStatus: (message: string) => void) {
  this.sourceMtime = file.stat.mtime; this.initialFormat = file.extension;
 }
 async start(): Promise<void> {
  this.unregisterAudio = this.player.registerExternal(this.token, () => this.stopAudio());
  const draft = await this.drafts.read(this.file);
  this.recovered = !!draft;
  this.sourceMtime = draft?.sourceMtime ?? this.file.stat.mtime;
  this.source = draft?.data ?? await this.app.vault.readBinary(this.file);
  this.initialFormat = draft ? 'mscz' : this.file.extension;
  const [script, css] = await Promise.all([this.app.vault.adapter.read(`${this.dir}/full-editor/editor.js`), this.app.vault.adapter.read(`${this.dir}/full-editor/editor.css`)]);
  if (this.closed) return;
  this.scriptUrl = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
  const params = new URLSearchParams({ score: `/musescorer-source.${this.initialFormat}`, scoreId: `obsidian:${this.file.path}` });
  const configuration = JSON.stringify({ token: this.token, path: this.file.path, params: params.toString(), theme: this.app.workspace.containerEl.ownerDocument.body.hasClass('theme-dark') ? 'dark' : 'light', origin: window.location.origin }).replace(/</gu, '\\u003c');
  this.frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src blob: data:; worker-src blob:; base-uri 'none';"><style>${css.replace(/<\/style/giu, '<\\/style')}html,body,#root{margin:0;width:100%;height:100%;}</style></head><body><div id="root"></div><script>window.__MUSESCORER_CONFIG=${configuration};window.addEventListener('error',e=>parent.postMessage({type:'musescorer-frame-error',token:window.__MUSESCORER_CONFIG.token,message:e.message},window.__MUSESCORER_CONFIG.origin));if(localStorage.getItem('ots-editor-highlight-noteheads')===null)localStorage.setItem('ots-editor-highlight-noteheads','1');</script><script src="${this.scriptUrl}"></script></body></html>`;
  this.onStatus(draft?.sourceChanged ? 'Draft restored; the source file has changed since the draft was saved.' : draft ? 'Local draft restored.' : this.file.name);
 }
 receive(event: MessageEvent<unknown>): void {
  if (this.closed || event.source !== this.frame.contentWindow || event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') return;
  if ('type' in event.data && event.data.type === 'musescorer-frame-error' && 'token' in event.data && event.data.token === this.token && 'message' in event.data) { this.onStatus(`Editor error: ${String(event.data.message)}`); return; }
  const message = event.data as Partial<FrameRequest>;
  if (message.type !== 'musescorer-request' || message.token !== this.token || typeof message.id !== 'number' || typeof message.method !== 'string' || !Array.isArray(message.args)) return;
  const task = this.handle(message.method, message.args).then(value => this.reply(message.id!, value), error => this.reply(message.id!, undefined, error instanceof Error ? error.message : String(error)));
  this.operations.add(task); void task.finally(() => this.operations.delete(task));
 }
 private reply(id: number, value?: unknown, error?: string): void {
  if (!this.closed) this.frame.contentWindow?.postMessage({ type: 'musescorer-response', token: this.token, id, value, error }, window.location.origin);
 }
 private async native(session: string, method: string, args: unknown[] = []): Promise<unknown> {
  if (!this.sessions.has(session)) throw new Error('The editor session is not open.');
  const response = await this.client.request({ type: 'native-call', session, method, args });
  if (response.type !== 'native-result') throw new Error('Invalid engine response.');
  return response.value;
 }
 private async handle(method: string, args: unknown[]): Promise<unknown> {
  if (method === 'asset') return this.asset(String(args[0]));
  if (method === 'native-open') {
   const [format, data, fonts, layout] = args;
   if (typeof format !== 'string' || !(data instanceof Uint8Array) || !Array.isArray(fonts) || !fonts.every(font => font instanceof Uint8Array)) throw new Error('Invalid native score file.');
   const session = `ots-${crypto.randomUUID()}`; this.client.pin();
   try {
    const response = await this.client.request({ type: 'native-open', session, format, data, fonts: fonts, layout: layout !== false });
    if (response.type !== 'native-result' || !response.value || typeof response.value !== 'object') throw new Error('The engine could not open the score.');
    this.sessions.add(session); return { ...response.value, session };
   } catch (error) { this.client.unpin(); throw error; }
  }
  if (method === 'native-call') {
   const [session, operation, params] = args;
   if (typeof session !== 'string' || typeof operation !== 'string' || !Array.isArray(params)) throw new Error('Invalid editor command.');
   if (operation.startsWith('_synthAudio')) { this.player.stopExternal(this.token); await this.player.stop(); }
   const result = await this.native(session, operation, params);
   if (operation === 'getUndoInfo' && this.active === session && result && typeof result === 'object' && 'index' in result && 'size' in result && 'clean' in result) {
    const signature = JSON.stringify(result);
    if (this.histories.get(session) !== signature) {
     this.histories.set(session, signature);
     await this.persist(result.clean === true && !this.recovered);
    }
   }
   return result;
  }
  if (method === 'native-close') { await this.closeSession(String(args[0])); return; }
  if (method === 'native-static') {
   if (typeof args[0] !== 'string' || !Array.isArray(args[1])) throw new Error('Invalid engine call.');
   const response = await this.client.request({ type: 'native-static', method: args[0], args: args[1] });
   return response.type === 'native-result' ? response.value : undefined;
  }
  if (method === 'active-score') { if (typeof args[0] === 'string' && this.sessions.has(args[0])) this.active = args[0]; if (typeof args[1] === 'string') { this.detachedName = args[1]; this.onStatus(`${this.detachedName} · New or imported score – save a copy to the vault`); } return; }
  if (method === 'save-current') return this.save();
  throw new Error('This host command is unsupported.');
 }
 private async asset(url: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const pathname = url.split('?')[0] ?? '';
  if (pathname === `/musescorer-source.${this.initialFormat}` && this.source) return { data: this.source, contentType: 'application/octet-stream' };
  if (/^\/(?:score-editor\/)?soundfonts\/[^/]+\.sf[23]$/u.test(pathname)) return { data: await this.client.readSoundfont(), contentType: 'application/octet-stream' };
  const data = /^\/(?:score-editor\/)?data\/(templates|clefs)\.json$/u.exec(pathname);
  if (data) return { data: new TextEncoder().encode(await this.app.vault.adapter.read(`${this.dir}/full-editor/data/${data[1]}.json`)).buffer, contentType: 'application/json' };
  throw new Error(`This resource is unavailable in the local editor: ${pathname}`);
 }
 async save(): Promise<void> {
  if (!this.active) { new Notice('Wait for the score to finish opening.'); return; }
  const bytes = await this.native(this.active, 'saveMsc', ['mscz']);
  if (!(bytes instanceof Uint8Array)) throw new Error('The engine did not return a native score file.');
  new SaveCopyModal(this.app, this.detachedName ? { basename: this.detachedName.replace(/\.[^.]+$/u, ''), parent: this.file.parent } : this.file, bytes).open();
 }
 private async persist(clean: boolean): Promise<void> {
  if (!this.active || this.detachedName) return;
  if (clean) { await this.drafts.remove(this.file); return; }
  const data = await this.native(this.active, 'saveMsc', ['mscz']);
  if (data instanceof Uint8Array) { await this.drafts.write(this.file, data, false, this.sourceMtime); this.onStatus(`${this.file.name} · Draft saved locally`); }
 }
 stopAudio(): void { this.frame.contentWindow?.postMessage({ type: 'musescorer-stop-audio', token: this.token }, window.location.origin); }
 private async closeSession(session: string): Promise<void> {
  if (!this.sessions.has(session)) return;
  if (session === this.active && !this.closed) {
   const history = await this.native(session, 'getUndoInfo');
   if (history && typeof history === 'object' && 'clean' in history) await this.persist(history.clean === true && !this.recovered);
  }
  if (!this.sessions.delete(session)) return;
  if (session === this.active) this.active = undefined;
  try { await this.client.request({ type: 'editor-close', session }); } catch { /* Plugin unload terminates the module. */ }
  finally { this.client.unpin(); }
 }
 async dispose(): Promise<void> {
  this.closed = true; this.stopAudio(); this.unregisterAudio?.();
  await Promise.allSettled(this.operations);
  if (this.active) {
   try {
    const history = await this.native(this.active, 'getUndoInfo');
    if (history && typeof history === 'object' && 'clean' in history) await this.persist(history.clean === true && !this.recovered);
   } catch { /* The latest completed mutation was already saved; a terminated worker cannot be queried. */ }
  }
  await Promise.all([...this.sessions].map(session => this.closeSession(session)));
  if (this.scriptUrl) URL.revokeObjectURL(this.scriptUrl);
 }
}
