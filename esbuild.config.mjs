import esbuild from 'esbuild';
import process from 'node:process';
import { builtinModules } from 'node:module';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { verifyEngine } from './scripts/verify-engine.mjs';
import { embeddedAssetPlugin, runtimeInputs } from './scripts/embedded-assets.mjs';

const prod = process.argv[2] === 'production';
await verifyEngine();
// These folders are build/test intermediates only. Installed plugins never read them.
await rm('engine', { recursive: true, force: true });
await mkdir('engine', { recursive: true });
for (const name of ['webmscore.lib.wasm', 'webmscore.lib.data', 'soundfont.sf3', 'resources.json', 'resources']) {
 await cp(`vendor/webmscore/${name}`, `engine/${name}`, { recursive: true });
}
const shared = { bundle: true, target: 'es2021', logLevel: 'info', sourcemap: false, minify: prod };
const workers = await Promise.all([
 esbuild.context({ ...shared, entryPoints: ['src/engine/worker.ts'], outfile: 'renderer-worker.js', format: 'iife' }),
 esbuild.context({
  ...shared, entryPoints: ['vendor/webmscore/src/index.js'], outfile: 'engine.js',
  format: 'iife', globalName: 'MuseScoreEngine', external: builtinModules,
  define: { process: 'undefined', 'import.meta.url': '""' },
  plugins: [{
   name: 'local-emscripten-assets',
   setup(build) {
    build.onLoad({ filter: /vendor[\\/]webmscore[\\/]src[\\/]helper\.js$/ }, async args => {
     const original = await readFile(args.path, 'utf8');
     const marker = 'let Module = moduleOptions';
     if (!original.includes(marker)) throw new Error('OTS helper.js changed: review the local asset injection.');
     return { contents: original.replace(marker, 'Object.assign(moduleOptions, globalThis.MUSESCORER_MODULE_OPTIONS || {});\n' + marker), loader: 'js' };
    });
   },
  }],
 }),
]);
await Promise.all(workers.map(context => context.rebuild()));
const main = await esbuild.context({
 ...shared, entryPoints: ['src/main.ts'], outfile: 'main.js', format: 'cjs',
 external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
 banner: { js: '/* MuseScorer. GPL-3.0-only. Local runtime assets are Brotli/Base64 bundled below, decoded on demand. Source and original licenses: github.com/kpaede/Musescorer. Use Show credits and licenses in Obsidian for the bundled legal notices. */' },
 plugins: [embeddedAssetPlugin(await runtimeInputs())],
});
await main.rebuild();
if (prod) {
 await Promise.all([...workers, main].map(context => context.dispose()));
} else {
 await Promise.all([...workers, main].map(context => context.watch()));
}
