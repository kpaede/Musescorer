import type { TFile } from 'obsidian';
import { EngineClient } from './client';
import type { RenderedScore, ScoreFormat } from './protocol';

/** One engine, serialized jobs, bounded SVG cache, no native score retained by a view. */
export class ScoreRenderer {
	private queue: Promise<unknown> = Promise.resolve();
	private inflight = new Map<string, { promise: Promise<RenderedScore>; signals: Set<AbortSignal> }>();
	private cache = new Map<string, { score: RenderedScore; bytes: number }>();
	private cacheBytes = 0;
	private completedJobs = 0;
	private disposed = false;

	constructor(private client: EngineClient) {}

	render(file: TFile, read: () => Promise<ArrayBuffer>, signal: AbortSignal): Promise<RenderedScore> {
		if (this.disposed || signal.aborted) return Promise.reject(new Error('Rendering cancelled.'));
		const key = JSON.stringify([file.path, file.stat.mtime, file.stat.size]);
		const cached = this.cache.get(key);
		if (cached) {
			this.cache.delete(key);
			this.cache.set(key, cached);
			return Promise.resolve(cached.score);
		}
		const running = this.inflight.get(key);
		if (running) {
			running.signals.add(signal);
			return running.promise;
		}
		const signals = new Set([signal]);
		const job = this.queue.then(async () => {
			if (this.disposed || [...signals].every(subscriber => subscriber.aborted)) throw new Error('Rendering cancelled.');
			if (this.completedJobs >= 16) { this.client.recycleIfIdle(); this.completedJobs = 0; }
			try {
				if ([...signals].every(subscriber => subscriber.aborted)) throw new Error('Rendering cancelled.');
				const data = await read();
				const response = await this.client.request({ type: 'render', format: file.extension.toLowerCase() as ScoreFormat, data }, [data]);
				if (response.type !== 'rendered') throw new Error('Unexpected response from the MuseScore engine.');
				const score = { pages: response.pages };
				this.remember(key, score);
				this.completedJobs++;
				return score;
			} catch (error) {
				this.client.recycleIfIdle();
				throw error;
			} finally {
				this.client.scheduleIdle();
			}
		});
		this.queue = job.catch(() => undefined);
		this.inflight.set(key, { promise: job, signals });
		void job.finally(() => this.inflight.delete(key)).catch(() => undefined);
		return job;
	}

	private remember(key: string, score: RenderedScore): void {
		const bytes = score.pages.reduce((sum, page) => sum + page.length * 2, 0);
		const limit = 32 * 1024 * 1024;
		if (bytes > limit || this.disposed) return;
		while (this.cacheBytes + bytes > limit && this.cache.size) {
			const oldest = this.cache.entries().next().value as [string, { bytes: number }] | undefined;
			if (!oldest) break;
			this.cache.delete(oldest[0]);
			this.cacheBytes -= oldest[1].bytes;
		}
		this.cache.set(key, { score, bytes });
		this.cacheBytes += bytes;
	}

 dispose(): void { this.disposed = true; this.cache.clear(); this.cacheBytes = 0; this.inflight.clear(); }
}
