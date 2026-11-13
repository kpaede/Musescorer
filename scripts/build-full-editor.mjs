import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const root = path.resolve('vendor/ots-editor');
const require = createRequire(path.join(root, 'package.json'));
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
await mkdir('full-editor', { recursive: true });
await build({
 entryPoints: ['editor-app/entry.tsx'], bundle: true, platform: 'browser', format: 'iife', target: 'es2021', minify: true, jsx: 'automatic', outfile: 'full-editor/editor.js',
 alias: { '@': root, 'next/navigation': path.resolve('editor-app/navigation.ts'), 'next/image': path.resolve('editor-app/next-image.tsx'), 'react': path.dirname(require.resolve('react/package.json')), 'react-dom': path.dirname(require.resolve('react-dom/package.json')) },
 define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_BUILD_MODE': '"embed"', 'process.env.NEXT_PUBLIC_SOUNDFONT_CDN_URL': '""', 'process.env.NEXT_PUBLIC_WEBMSCORE_RESOURCE_BASE_URL': '""', 'process.env.NEXT_PUBLIC_ANALYTICS_EVENTS_PATH': '""', 'process.env.NEXT_PUBLIC_SCORE_EDITOR_API_BASE': '"/api/offline"' },
 loader: { '.woff2': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' },
 plugins: [{ name: 'obsidian-native-host', setup(b) {
  b.onResolve({ filter: /webmscore-(?:worker|in-process-browser|in-process-node)-runtime\.js$/ }, () => ({ path: path.resolve('editor-app/engine-adapter.ts') }));
  b.onLoad({filter:/editor-analytics\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace("typeof window === 'undefined' ||",'true ||'),loader:'ts'}));
 }}], logLevel: 'info',
});
const moduleCss = await readFile('full-editor/editor.css','utf8').catch(()=> '');
let css = await readFile(path.join(root,'app/globals.css'),'utf8');
const font = await readFile(path.join(root,'webmscore-fork/fonts/bravura/Bravura.woff2'));
css = css.replace("url('../webmscore-fork/fonts/bravura/Bravura.woff2')", `url('data:font/woff2;base64,${font.toString('base64')}')`);
css += '\n@source "../components";\n@source "../lib";\n';
const result = await postcss([tailwind({base:root,optimize:true})]).process(css,{from:path.join(root,'app/globals.css')});
await writeFile('full-editor/editor.css', result.css + '\n' + moduleCss);
console.log('Full original OTS notation editor bundled locally.');

await cp(path.join(root,'public/data'), 'full-editor/data', {recursive:true});
