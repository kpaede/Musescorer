import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';

// No HTTP server: the actual shipped worker/engine receive all bytes from disk.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
 const page = await browser.newPage();
 // A browser-intercepted empty HTTPS document supplies a secure origin like Obsidian app://.
 // No server, DNS lookup or remote document is involved, and the WASM engine is not mocked.
 await page.route('https://musescorer-harness.test/', route => route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto('https://musescorer-harness.test/');
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 const network = [];
 page.on('request', request => { if (/^https?:/u.test(request.url())) network.push(request.url()); });
 const worker = await readFile('renderer-worker.js', 'utf8');
 const engine = await readFile('engine.js', 'utf8');
 const wasm = await readFile('engine/webmscore.lib.wasm');
 const data = await readFile('engine/webmscore.lib.data');
 const names = JSON.parse(await readFile('engine/resources.json', 'utf8'));
 const fonts = Object.fromEntries(await Promise.all(names.map(async name => [name, (await readFile(`engine/resources/${name}`)).toString('base64')])));
 await page.exposeFunction('readFont', async name => fonts[name] ?? null);
 await page.evaluate(async ({ workerSource, engineSource, wasmBase64, dataBase64 }) => {
  const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0)).buffer;
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  const engineUrl = URL.createObjectURL(new Blob([engineSource], { type: 'text/javascript' }));
  const instance = new Worker(workerUrl);
  URL.revokeObjectURL(workerUrl);
  let sequence = 0;
  const pending = new Map();
  instance.onmessage = async event => {
   const message = event.data;
   if (message.type === 'resource') {
    const font = await window.readFont(message.path);
    const data = font ? bytes(font) : null;
    instance.postMessage({ type: 'resource', id: message.id, data }, data ? [data] : []);
    return;
   }
   const call = pending.get(message.id);
   pending.delete(message.id);
   if (message.type === 'error') call.reject(new Error(message.message)); else call.resolve(message);
  };
  instance.onerror = event => { for (const call of pending.values()) call.reject(new Error(event.message)); pending.clear(); };
  window.rpc = (message, transfer = []) => new Promise((resolve, reject) => {
   const id = ++sequence;
   const timer = setTimeout(() => reject(new Error('Worker test timeout')), 120000);
   pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
   instance.postMessage({ ...message, id }, transfer);
  });
  window.decodeBytes = bytes;
  window.workerInstance = instance;
  const wasm = bytes(wasmBase64), data = bytes(dataBase64);
  await window.rpc({ type: 'init', scriptUrl: engineUrl, wasm, data }, [wasm, data]);
  URL.revokeObjectURL(engineUrl);
 }, { workerSource: worker, engineSource: engine, wasmBase64: wasm.toString('base64'), dataBase64: data.toString('base64') });
 await mkdir('test-results', { recursive: true });
 const report = [];
 const nativeMscx = execFileSync('unzip', ['-p', 'tests/fixtures/c_scale.mscz', 'score.mscx']);
 // The original archive has a separate score_style.mss; standalone MSCX does not.
 // Repack the same standalone XML without a sidecar for a valid equality comparison.
 const standaloneArchive = execFileSync('python3', ['-c', 'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr("score.mscx",sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(b.getvalue())'], { input: nativeMscx });
 for (const [name, format, content] of [
  ['c_scale.mscz', 'mscz', await readFile('tests/fixtures/c_scale.mscz')],
  ['c_scale.mscx', 'mscx', nativeMscx],
  ['c_scale_standalone.mscz', 'mscz', standaloneArchive],
  ['bach_orig.mscz', 'mscz', await readFile('tests/fixtures/bach_orig.mscz')],
  ['legacy-1.14.mscx', 'mscx', await readFile('tests/fixtures/legacy-1.14.mscx')],
  ...await Promise.all(['lasteid-4.20.mscz', 'keysig-concertkey-4.70.mscz', 'text-linebreak-4.70.mscz'].map(async name => [name, 'mscz', await readFile(`tests/fixtures/format-compat/${name}`)])),
 ]) {
  const response = await page.evaluate(async ({ base64, format }) => {
   const data = window.decodeBytes(base64);
   return window.rpc({ type: 'render', format, data }, [data]);
  }, { base64: content.toString('base64'), format });
  assert.equal(response.type, 'rendered');
  assert.ok(response.pages.length >= 1);
  for (const svg of response.pages) {
   assert.match(svg, /<svg/u);
   assert.match(svg, /<path/u);
   assert.doesNotMatch(svg, /<text[\s>]/u, 'The SVG must contain outlined text, since image documents cannot load font files.');
  }
  if (name === 'bach_orig.mscz') assert.ok(response.pages.length > 1, 'Bach fixture must exercise multi-page output.');
  await writeFile(`test-results/${name}.svg`, response.pages[0]);
  report.push({ file: name, pages: response.pages.length, svgBytes: response.pages.reduce((n, svg) => n + Buffer.byteLength(svg), 0), sha256: createHash('sha256').update(response.pages.join('')).digest('hex') });
  if (name === 'c_scale_standalone.mscz') assert.equal(report[1].sha256, report[2].sha256, 'Native compressed and uncompressed scores should render identically.');
  console.log(`${name}: ${response.pages.length} page(s), ${report.at(-1).svgBytes} SVG bytes`);
  if (name === 'bach_orig.mscz') {
   await page.evaluate(async pages => {
    document.body.style.background = '#202020';
    for (const svg of pages) {
     const image = document.createElement('img');
     image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
     image.style.cssText = 'display:block;width:700px;background:white;margin:16px auto';
     document.body.append(image);
     await image.decode();
    }
   }, response.pages);
   await page.screenshot({ path: 'test-results/bach-pages.png', fullPage: true });
  }
 }
 // Exercise the actual persistent editor protocol and native audio synthesis.
 const soundfont = await readFile('engine/soundfont.sf3');
 const interaction = await page.evaluate(async ({ base64, fontBase64 }) => {
  const session = 'smoke-editor';
  const data = window.decodeBytes(base64);
  const opened = await window.rpc({ type: 'editor-open', session, format: 'mscz', data }, [data]);
  const parsed = new DOMParser().parseFromString(opened.snapshot.pages[0], 'image/svg+xml');
  const root = document.importNode(parsed.documentElement, true);
  root.style.cssText = 'position:absolute;visibility:hidden;width:2977px;height:4208px';
  document.body.append(root);
  const note = root.querySelector('.Note');
  if (!note) throw new Error('Fixture has no native Note glyph');
  const box = note.getBBox();
  const transform = root.getCTM().inverse().multiply(note.getCTM());
  const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(transform);
  root.remove();
  const selected = await window.rpc({ type: 'editor-select', session, page: 0, x: point.x, y: point.y });
  const changed = await window.rpc({ type: 'editor-command', session, command: 'pitchUp' });
  const undone = await window.rpc({ type: 'editor-command', session, command: 'undo' });
  const redone = await window.rpc({ type: 'editor-command', session, command: 'redo' });
  const font = window.decodeBytes(fontBase64);
  await window.rpc({ type: 'audio-start', session: 'audio-1', scoreSession: session, soundfont: font }, [font]);
  const audio = await window.rpc({ type: 'audio-pull', session: 'audio-1' });
  let peak = 0, frames = 0;
  for (const chunk of audio.chunks) {
   frames += chunk.framesPerChannel;
   const samples = new Float32Array(chunk.chunk.buffer, chunk.chunk.byteOffset, chunk.chunk.byteLength / 4);
   for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  }
  const sameFont = new Uint8Array(window.decodeBytes(fontBase64));
  await window.rpc({ type: 'native-call', session, method: 'setSoundFont', args: [sameFont] });
  const uninterrupted = await window.rpc({ type: 'audio-pull', session: 'audio-1' });
  const uninterruptedFrames = uninterrupted.chunks.reduce((sum, chunk) => sum + chunk.framesPerChannel, 0);
  await window.rpc({ type: 'audio-stop', session: 'audio-1' });
  await window.rpc({ type: 'audio-start', session: 'audio-2', scoreSession: session, soundfont: new ArrayBuffer(0) });
  await window.rpc({ type: 'audio-stop', session: 'audio-1' });
  const replacement = await window.rpc({ type: 'audio-pull', session: 'audio-2' });
  const replacementFrames = replacement.chunks.reduce((sum, chunk) => sum + chunk.framesPerChannel, 0);
  await window.rpc({ type: 'audio-stop', session: 'audio-2' });
  let staleRejected = false;
  try { await window.rpc({ type: 'audio-pull', session: 'audio-1' }); } catch { staleRejected = true; }
  const changedSvg = changed.snapshot.pages[0] !== selected.snapshot.pages[0];
  const undoRestored = undone.snapshot.pages[0] === selected.snapshot.pages[0];
  const redoRestored = redone.snapshot.pages[0] === changed.snapshot.pages[0];
  const backup = changed.snapshot.backup;
  const nativeBackup = btoa(String.fromCharCode(...backup));
  const restored = await window.rpc({ type: 'editor-open', session: 'restored-editor', format: 'mscz', data: backup.buffer }, [backup.buffer]);
  await window.rpc({ type: 'editor-close', session: 'restored-editor' });
  await window.rpc({ type: 'editor-close', session });
  return { changedSvg, undoRestored, redoRestored, nativeBackup, point: { x: point.x, y: point.y }, selected: selected.snapshot.selection, changed: changed.snapshot.selection, beforeHistory: selected.snapshot.history, changedHistory: changed.snapshot.history, undoHistory: undone.snapshot.history, redoHistory: redone.snapshot.history, restoredPages: restored.snapshot.pages.length, audioFrames: frames, audioPeak: peak, replacementFrames, uninterruptedFrames, staleRejected };
 }, { base64: (await readFile('tests/fixtures/c_scale.mscz')).toString('base64'), fontBase64: soundfont.toString('base64') });
 const { nativeBackup, ...interactionSummary } = interaction;
 console.log('Native editor and playback:', JSON.stringify(interactionSummary));
 const firstPitch = (data) => Number(execFileSync('python3', ['-c', 'import sys,io,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); n=next(n for n in z.namelist() if n.endswith(".mscx")); print(next(E.fromstring(z.read(n)).iter("pitch")).text)'], { input: data }).toString().trim());
 assert.equal(firstPitch(Buffer.from(nativeBackup, 'base64')), firstPitch(await readFile('tests/fixtures/c_scale.mscz')) + 1, 'Native saved pitch must rise by one semitone.');
 assert.ok(interaction.changedHistory.index > interaction.beforeHistory.index);
 assert.equal(interaction.undoHistory.index, interaction.beforeHistory.index);
 assert.equal(interaction.redoHistory.index, interaction.changedHistory.index);
 assert.equal(interaction.changedSvg, true);
 assert.equal(interaction.undoRestored, true);
 assert.equal(interaction.redoRestored, true);
 assert.equal(interaction.restoredPages, 1);
 assert.ok(interaction.audioFrames > 0);
 assert.ok(interaction.audioPeak > 0.0001, 'Real synthesis must produce audible, non-silent PCM.');
 assert.equal(interaction.staleRejected, true);
 assert.ok(interaction.uninterruptedFrames > 0, 'Reusing the same soundfont must preserve an active stream.');
 assert.ok(interaction.replacementFrames > 0, 'A stale stop must not cancel replacement playback.');
 const bad = await page.evaluate(async () => {
  const data = new Uint8Array([1, 2, 3]).buffer;
  try { await window.rpc({ type: 'render', format: 'mscz', data }, [data]); return false; }
  catch (error) { return error.message; }
 });
 assert.ok(bad, 'Corrupt scores must return an error.');
 const recovery = await page.evaluate(async base64 => {
  const data = window.decodeBytes(base64);
  return window.rpc({ type: 'render', format: 'mscz', data }, [data]);
 }, (await readFile('tests/fixtures/c_scale.mscz')).toString('base64'));
 assert.equal(recovery.pages.length, 1);
 assert.deepEqual(network, [], 'The engine must not contact any HTTP service.');
 assert.deepEqual(errors, []);
 await writeFile('test-results/engine-report.json', JSON.stringify({ report, interaction: interactionSummary, corruptFileError: bad, networkRequests: network, pageErrors: errors }, null, 2));
 console.log('Real WASM worker: compressed/uncompressed/legacy/multipage/corrupt-file checks passed, zero network requests.');
} finally { await browser.close(); }
