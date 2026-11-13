import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { embeddedAssetPlugin } from '../scripts/embedded-assets.mjs';

async function provider(plugin) {
 const output = await build({ entryPoints: ['src/assets/bundled.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [plugin] });
 return (await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)).BundledAssets;
}

test('bundled resources decode without loose runtime files and return transferable independent buffers', async () => {
 const directory = await mkdtemp('/tmp/musescorer-assets-');
 try {
  const binary = Buffer.from([0, 255, 12, 128, 9]);
  await writeFile(`${directory}/binary`, binary);
  await writeFile(`${directory}/license`, 'Score ♪ café — license');
  const Assets = await provider(embeddedAssetPlugin([{ name: 'engine/test.wasm', file: `${directory}/binary` }, { name: 'licenses/example.txt', file: `${directory}/license` }]));
  // The compiled module is self-contained even after its original files have gone.
  await rm(directory, { recursive: true, force: true });
  const assets = new Assets();
  assert.deepEqual(assets.list(), ['engine/test.wasm', 'licenses/example.txt']);
  assert.equal(await assets.read('licenses/example.txt'), 'Score ♪ café — license');
  const first = await assets.readBinary('engine/test.wasm');
  assert.deepEqual(Buffer.from(first), binary);
  structuredClone(first, { transfer: [first] });
  assert.equal(first.byteLength, 0);
  assert.deepEqual(Buffer.from(await assets.readBinary('engine/test.wasm')), binary);
  await assert.rejects(assets.readBinary('../engine/test.wasm'), /Unknown bundled/u);
  await assert.rejects(assets.readBinary('toString'), /Unknown bundled/u);
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('decompression is deferred and corrupted resources fail integrity validation', async () => {
 const payload = Buffer.from('native bytes');
 const records = {
  'broken.wasm': { brotli: brotliCompressSync(payload).toString('base64'), bytes: payload.length, sha256: '0'.repeat(64) },
 };
 const Assets = await provider({ name: 'corrupt-fixture', setup(b) {
  b.onResolve({ filter: /^musescorer:runtime-assets$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const embedded=${JSON.stringify(records)}`, loader: 'js' }));
 } });
 const assets = new Assets();
 assert.deepEqual(assets.list(), ['broken.wasm']);
 await assert.rejects(assets.readBinary('broken.wasm'), /checksum mismatch/u);
});
