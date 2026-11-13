import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/MuseScorer', { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css', 'renderer-worker.js', 'engine.js', 'engine', 'full-editor', 'LICENSE', 'licenses', 'THIRD_PARTY_NOTICES.md', 'engine-lock.json', 'editor-lock.json', 'README.md', 'docs', 'patches']) {
 await cp(name, `dist/MuseScorer/${name}`, { recursive: true });
}
execFileSync('zip', ['-q', '-r', 'MuseScorer.zip', 'MuseScorer'], { cwd: 'dist', stdio: 'inherit' });
console.log('Installable archive: dist/MuseScorer.zip');
