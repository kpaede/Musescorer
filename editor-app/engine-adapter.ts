import { invoke } from './bridge-runtime';

async function load(format: string, data: Uint8Array, fonts: Uint8Array[] = [], doLayout = true) {
 const opened = await invoke('native-open', [format, data, fonts, doLayout]) as { session: string; methods: string[] };
 const session = opened.session;
 const rpc = (method: string, args: unknown[] = []) => invoke('native-call', [session, method, args]);
 const score: Record<string, unknown> = { sessionId: session, excerptId: -1, destroyed: false };
 for (const method of opened.methods) score[method] = (...args: unknown[]) => rpc(method, args);
 score.destroy = async () => { if (score.destroyed) return; score.destroyed = true; await invoke('native-close', [session]); };
 score.setExcerptId = async (id: number) => { score.excerptId = id; await rpc('setExcerptId', [id]); };
 score.synthAudio = async (start: number) => { const pointer = await rpc('_synthAudio', [start]); return (cancel = false) => rpc('processSynth', [pointer, cancel]); };
 score.synthAudioBatch = async (start: number, size: number) => { const pointer = await rpc('_synthAudio', [start]); return (cancel = false) => rpc('processSynthBatch', [pointer, size, cancel]); };
 score.synthAudioBatchFromSelection = async (size: number) => { const pointer = await rpc('_synthAudioFromSelection'); return (cancel = false) => rpc('processSynthBatch', [pointer, size, cancel]); };
 score.synthAudioBatchForMeasureRange = async (from: number, to: number, size: number) => { const pointer = await rpc('_synthAudioForMeasureRange', [from, to]); return (cancel = false) => rpc('processSynthBatch', [pointer, size, cancel]); };
 score.synthSelectionPreviewBatch = async (size: number, duration = 500) => { const pointer = await rpc('_synthAudioSelectionPreview', [duration]); return (cancel = false) => rpc('processSynthBatch', [pointer, size, cancel]); };
 return score;
}
export default { ready: Promise.resolve(), load, version: () => invoke('native-static', ['version', []]), setLogLevel: (level: number) => invoke('native-static', ['setLogLevel', [level]]), resourceBaseUrl: undefined };
