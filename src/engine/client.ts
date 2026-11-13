import type { DataAdapter } from 'obsidian';
import type { WorkerRequest, WorkerResponse } from './protocol';

interface PendingCall { resolve(value: WorkerResponse): void; reject(error: Error): void; timer: number }
export type EngineRequest = WorkerRequest extends infer R ? R extends { id: number } ? Omit<R, 'id'> : never : never;

/** Shared local worker transport for preview jobs and persistent editor sessions. */
export class EngineClient {
 private worker?: Worker;
 private engineUrl?: string;
 private boot?: Promise<void>;
 private pending = new Map<number, PendingCall>();
 private resources = new Set<string>();
 private sequence = 0;
 private disposed = false;
 private idle?: number;
 private pins = 0;
 constructor(private adapter: DataAdapter, private pluginDir: string) {}

 async request(message: EngineRequest, transfer: Transferable[] = []): Promise<WorkerResponse> {
  if (this.disposed) throw new Error('The plugin has been disabled.');
  if (this.idle) window.clearTimeout(this.idle);
  this.boot ??= this.startWorker().catch((error: unknown) => { this.stopWorker(); throw error; });
  await this.boot;
  return this.call({ ...message, id: ++this.sequence }, transfer);
 }
 pin(): void { this.pins++; if (this.idle) window.clearTimeout(this.idle); }
 unpin(): void { this.pins = Math.max(0, this.pins - 1); this.scheduleIdle(); }
 scheduleIdle(): void {
  if (this.idle) window.clearTimeout(this.idle);
  if (!this.pins && !this.disposed) this.idle = window.setTimeout(() => this.stopWorker(), 60_000);
 }
 recycleIfIdle(): void { if (!this.pins) this.stopWorker(); }
 readSoundfont(): Promise<ArrayBuffer> { return this.adapter.readBinary(`${this.pluginDir}/engine/soundfont.sf3`); }
	private async startWorker(): Promise<void> {
		const [workerSource, engineSource, wasm, data, resourceList] = await Promise.all([
			this.adapter.read(`${this.pluginDir}/renderer-worker.js`),
			this.adapter.read(`${this.pluginDir}/engine.js`),
			this.adapter.readBinary(`${this.pluginDir}/engine/webmscore.lib.wasm`),
			this.adapter.readBinary(`${this.pluginDir}/engine/webmscore.lib.data`),
			this.adapter.read(`${this.pluginDir}/engine/resources.json`),
		]);
		if (this.disposed) throw new Error('The plugin has been disabled.');
		const names: unknown = JSON.parse(resourceList);
		if (!Array.isArray(names) || !names.every((name: unknown) => typeof name === 'string' && /^fonts\/[\w/.-]+$/u.test(name) && !name.includes('..'))) {
			throw new Error('The local font file list is invalid.');
		}
		this.resources = new Set(names as string[]);
		this.engineUrl = URL.createObjectURL(new Blob([engineSource], { type: 'text/javascript' }));
		const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
		try { this.worker = new Worker(workerUrl, { name: 'MuseScorer engraving' }); }
		finally { URL.revokeObjectURL(workerUrl); }
		this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data);
		this.worker.onerror = () => this.stopWorker(new Error('The MuseScore engine crashed. Reload the score.'));
		this.worker.onmessageerror = () => this.stopWorker(new Error('Could not read the MuseScore engine response.'));
		await this.call({ type: 'init', id: ++this.sequence, scriptUrl: this.engineUrl, wasm, data }, [wasm, data]);
		URL.revokeObjectURL(this.engineUrl);
		this.engineUrl = undefined;
	}

	private handleMessage(message: WorkerResponse): void {
		if (message.type === 'resource') {
			const worker = this.worker;
			const load = this.resources.has(message.path)
				? this.adapter.readBinary(`${this.pluginDir}/engine/resources/${message.path}`)
				: Promise.resolve(null);
			void load.then(data => {
				if (worker === this.worker) worker?.postMessage({ type: 'resource', id: message.id, data }, data ? [data] : []);
			}).catch(() => {
				if (worker === this.worker) this.stopWorker(new Error(`Eine lokale MuseScore-Schriftdatei fehlt: ${message.path}`));
			});
			return;
		}
		const pending = this.pending.get(message.id);
		if (!pending) return;
		window.clearTimeout(pending.timer);
		this.pending.delete(message.id);
		if (message.type === 'error') pending.reject(new Error(message.message));
		else pending.resolve(message);
	}

	private call(message: WorkerRequest, transfer: Transferable[]): Promise<WorkerResponse> {
		return new Promise((resolve, reject) => {
			const timer = window.setTimeout(() => this.stopWorker(new Error('Rendering took longer than two minutes. Try a smaller score.')), 120_000);
			this.pending.set(message.id, { resolve, reject, timer });
			try {
				if (!this.worker) throw new Error('The MuseScore engine is unavailable.');
				this.worker.postMessage(message, transfer);
			} catch (error) {
				window.clearTimeout(timer);
				this.pending.delete(message.id);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private stopWorker(error = new Error('The MuseScore engine has stopped.')): void {
		if (this.idle) window.clearTimeout(this.idle);
		this.worker?.terminate();
		this.worker = undefined;
		this.boot = undefined;
		if (this.engineUrl) URL.revokeObjectURL(this.engineUrl);
		this.engineUrl = undefined;
		for (const pending of this.pending.values()) {
			window.clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}

 dispose(): void { this.disposed = true; this.stopWorker(); }
}
