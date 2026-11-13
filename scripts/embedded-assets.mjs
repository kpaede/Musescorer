import { readFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';
import path from 'node:path';
const compress = promisify(brotliCompress);

export async function runtimeInputs() {
 const resources = JSON.parse(await readFile('vendor/webmscore/resources.json', 'utf8'));
 if (!Array.isArray(resources) || !resources.every(name => typeof name === 'string' && /^fonts\/[\w/.-]+$/u.test(name) && !name.includes('..'))) throw new Error('Invalid pinned engine resource manifest.');
 const files = ['renderer-worker.js', 'engine.js', 'full-editor/editor.js', 'full-editor/editor.css', 'full-editor/data/templates.json', 'full-editor/data/clefs.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md'].map(name => ({ name, file: name }));
 for (const name of ['webmscore.lib.wasm', 'webmscore.lib.data', 'soundfont.sf3', 'resources.json', ...resources.map(name => `resources/${name}`)]) files.push({ name: `engine/${name}`, file: `vendor/webmscore/${name}` });
 async function licenses(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
   const file = path.join(directory, item.name);
   if (item.isDirectory()) await licenses(file);
   else if (item.isFile() && item.name !== '.DS_Store') files.push({ name: file.split(path.sep).join('/'), file });
  }
 }
 await licenses('licenses');
 return files.sort((a, b) => a.name.localeCompare(b.name));
}

export function embeddedAssetPlugin(files) {
 const cache = new Map();
 return { name: 'bundled-offline-runtime', setup(build) {
  build.onResolve({ filter: /^musescorer:runtime-assets$/ }, () => ({ path: 'runtime', namespace: 'musescorer-embedded' }));
  build.onLoad({ filter: /.*/, namespace: 'musescorer-embedded' }, async () => {
   const entries = await Promise.all(files.map(async ({ name, file }) => {
    const info = await stat(file), previous = cache.get(name);
    if (previous?.mtime === info.mtimeMs && previous?.size === info.size) return [name, previous.asset];
    const bytes = await readFile(file);
    const encoded = await compress(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
    const asset = { brotli: encoded.toString('base64'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    cache.set(name, { mtime: info.mtimeMs, size: info.size, asset });
    return [name, asset];
   }));
   if (new Set(entries.map(([name]) => name)).size !== entries.length) throw new Error('Duplicate embedded runtime asset name.');
   console.log(`Bundling ${entries.length} local runtime assets and legal notices; decoding is deferred until use.`);
   return { contents: `export const embedded = ${JSON.stringify(Object.fromEntries(entries))};`, loader: 'js', watchFiles: files.map(item => path.resolve(item.file)) };
  });
 } };
}
