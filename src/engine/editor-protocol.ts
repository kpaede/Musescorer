export type EditorCommand = 'pitchUp' | 'pitchDown' | 'doubleDuration' | 'halfDuration' | 'toggleDot' | 'deleteSelection' | 'undo' | 'redo' | 'selectNextChord' | 'selectPrevChord' | 'clearSelection';
export interface EditorSnapshot {
 pages: string[];
 selection: Record<string, unknown>;
 history: { index: number; size: number; clean: boolean };
 /** A native MSCZ snapshot after a mutation, used for crash recovery and saving a copy. */
 backup?: Uint8Array;
}
import type { AudioChunk, ScorePositions } from './protocol';
export interface EditableNativeScore {
 getSelectedElementProperties(): Promise<Record<string, unknown>>;
 getUndoInfo(): Promise<{ index: number; size: number; clean: boolean }>;
 selectElementAtPoint(page: number, x: number, y: number): Promise<boolean>;
 saveMsc(format: 'mscz'): Promise<Uint8Array>;
 pitchUp(): Promise<boolean>;
 pitchDown(): Promise<boolean>;
 doubleDuration(): Promise<boolean>;
 halfDuration(): Promise<boolean>;
 toggleDot(): Promise<boolean>;
 deleteSelection(): Promise<boolean>;
 undo(): Promise<boolean>;
 redo(): Promise<boolean>;
 selectNextChord(): Promise<boolean>;
 selectPrevChord(): Promise<boolean>;
 clearSelection(): Promise<boolean>;
 synthAudioBatch(start: number, batchSize: number): Promise<(cancel?: boolean) => Promise<AudioChunk[]>>;
 segmentPositions(): Promise<ScorePositions>;
}
