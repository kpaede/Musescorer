import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/MuseScorer', { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css', 'renderer-worker.js', 'engine.js', 'LICENSE', 'licenses', 'THIRD_PARTY_NOTICES.md', 'engine-lock.json', 'editor-lock.json', 'README.md', 'docs', 'patches']) {
 await cp(name, `dist/MuseScorer/${name}`, { recursive: true });
}
// Copy only runtime inputs, so local duplicate/stale files cannot bloat the installation.
const resources = JSON.parse(await readFile('engine/resources.json', 'utf8'));
if (!Array.isArray(resources) || !resources.every(name => typeof name === 'string' && /^fonts\/[\w/.-]+$/u.test(name) && !name.includes('..'))) throw new Error('Invalid engine resource manifest.');
const runtime = [
 ...['webmscore.lib.wasm', 'webmscore.lib.data', 'soundfont.sf3', 'resources.json', ...resources.map(name => `resources/${name}`)].map(name => `engine/${name}`),
 ...['editor.js', 'editor.css', 'data/templates.json', 'data/clefs.json'].map(name => `full-editor/${name}`),
];
for (const name of runtime) {
 const target = path.join('dist/MuseScorer', name);
 await mkdir(path.dirname(target), { recursive: true });
 await cp(name, target);
}
execFileSync('zip', ['-q', '-r', 'MuseScorer.zip', 'MuseScorer'], { cwd: 'dist', stdio: 'inherit' });
console.log('Installable archive: dist/MuseScorer.zip');
