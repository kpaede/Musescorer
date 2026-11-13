interface FrameConfiguration { token: string; path: string; params: string; theme: string; origin: string }
declare global { interface Window { __MUSESCORER_CONFIG?: FrameConfiguration } }
const config = (() => { const value = window.__MUSESCORER_CONFIG; if (!value) throw new Error('The local editor connection is missing.'); return value; })();
let sequence = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
window.addEventListener('message', (event: MessageEvent<unknown>) => {
 if (!event.data || typeof event.data !== 'object') return;
 const data = event.data as { token?: unknown; type?: unknown; id?: unknown; error?: unknown; value?: unknown };
 if (event.source !== window.parent || data.token !== config.token || data.type !== 'musescorer-response') return;
 const call = pending.get(data.id as number); if (!call) return;
 pending.delete(data.id as number);
 if (data.error) call.reject(new Error(typeof data.error === 'string' ? data.error : 'The score editor request failed.')); else call.resolve(data.value);
});
export function invoke(method: string, args: unknown[] = []): Promise<unknown> {
 return new Promise((resolve, reject) => {
  const id = ++sequence; pending.set(id, { resolve, reject });
  window.parent.postMessage({ type: 'musescorer-request', token: config.token, id, method, args }, config.origin);
 });
}
export function parameters(): URLSearchParams { return new URLSearchParams(config.params); }
export function initializeHost(): void {
 const original = window.fetch.bind(window);
 window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('blob:') || url.startsWith('data:')) return original(input, init);
  if (init?.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (url.includes('/api/')) return Response.json({ error: 'This server or cloud service is unavailable in local Obsidian mode.' }, { status: 501 });
  const result = await invoke('asset', [url]) as { data: ArrayBuffer; contentType: string };
  if (init?.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  return new Response(result.data, { headers: { 'Content-Type': result.contentType } });
 };
 // Local notation editing has no analytics endpoint.
 window.addEventListener('musescorer-score', event => { const detail = (event as CustomEvent<{ score?: { sessionId?: string }; sourceFileName?: string }>).detail; if (detail.score?.sessionId) void invoke('active-score', [detail.score.sessionId, detail.sourceFileName]); });
 window.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void invoke('save-current'); } });
 window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!event.data || typeof event.data !== 'object') return;
  const data = event.data as { token?: unknown; type?: unknown };
  if (event.source !== window.parent || data.token !== config.token) return;
  if (data.type === 'musescorer-stop-audio') window.dispatchEvent(new Event('musescorer-stop-audio'));
 });
}
