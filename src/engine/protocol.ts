import type { EditableNativeScore, EditorCommand, EditorSnapshot } from './editor-protocol';
export type ScoreFormat = 'mscz' | 'mscx';
export interface RenderedScore { pages: string[] }

export type WorkerRequest =
	| { type: 'init'; id: number; scriptUrl: string; wasm: ArrayBuffer; data: ArrayBuffer }
	| { type: 'render'; id: number; format: ScoreFormat; data: ArrayBuffer }
	| { type: 'editor-open'; id: number; session: string; format: ScoreFormat; data: ArrayBuffer }
	| { type: 'editor-select'; id: number; session: string; page: number; x: number; y: number }
	| { type: 'editor-command'; id: number; session: string; command: EditorCommand }
	| { type: 'editor-close'; id: number; session: string }
	| { type: 'native-open'; id: number; session: string; format: string; data: Uint8Array; fonts: Uint8Array[]; layout: boolean }
	| { type: 'native-call'; id: number; session: string; method: string; args: unknown[] }
	| { type: 'native-static'; id: number; method: string; args: unknown[] }
	| { type: 'audio-start'; id: number; session: string; scoreSession?: string; soundfont: ArrayBuffer; data?: ArrayBuffer; format?: ScoreFormat }
	| { type: 'audio-pull'; id: number; session: string }
	| { type: 'audio-stop'; id: number; session: string }
	| { type: 'resource'; id: number; data: ArrayBuffer | null };

export type WorkerResponse =
	| { type: 'ready'; id: number }
	| { type: 'rendered'; id: number; pages: string[] }
	| { type: 'editor-state'; id: number; snapshot: EditorSnapshot }
	| { type: 'native-result'; id: number; value: unknown }
	| { type: 'audio-chunks'; id: number; chunks: AudioChunk[] }
	| { type: 'audio-ready'; id: number; positions: ScorePositions }
	| { type: 'error'; id: number; message: string }
	| { type: 'resource'; id: number; path: string };

/** Verified against OTS web-public/src/index.js. */
export interface NativeScore extends EditableNativeScore {
	metadata(): Promise<{ pages: number }>;
	saveSvg(page: number, background: boolean, highlight: boolean): Promise<string>;
	destroy(): void;
}
export interface NativeEngine {
	ready: Promise<void>;
	load(format: string, data: Uint8Array, fonts: Uint8Array[], layout: boolean): Promise<NativeScore>;
	fetchResource(path: string): Promise<Uint8Array | null>;
	hasSoundfont: boolean;
	setSoundFont(data: Uint8Array): Promise<void>;
}

export interface AudioChunk {
	done: boolean;
	startTime: number;
	endTime: number;
	chunk: Uint8Array;
	sampleRate: number;
	channels: number;
	framesPerChannel: number;
}
export interface ScorePosition { id: number; x: number; y: number; sx: number; sy: number; width?: number; height?: number; page: number; geometryAvailable?: boolean }
export interface ScorePositions { elements: ScorePosition[]; events: { elid: number; position: number }[]; pageSize: { width: number; height: number } }
