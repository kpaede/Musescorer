import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: ['src/score-path.ts'], bundle: true, write: false, format: 'esm' });
const { parseScorePath } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('accepts documented formats, whitespace, Unicode, single quotes and literal #', () => {
 for (const input of ['Noten/Chopin/Nocturne.mscz', 'path: "Noten/Chopin/Nocturne.mscz"']) {
  assert.equal(parseScorePath(input), 'Noten/Chopin/Nocturne.mscz');
 }
 assert.equal(parseScorePath('\npath: "Noten/Über den Flügel #1.mscx"\n'), 'Noten/Über den Flügel #1.mscx');
 assert.equal(parseScorePath("path: 'Noten/L''été.MSCZ'"), "Noten/L'été.MSCZ");
 assert.equal(parseScorePath('./Noten//Stück.mscz'), 'Noten/Stück.mscz');
});

test('rejects missing paths, malformed properties and paths outside the vault', () => {
 for (const input of ['', 'path:', 'path: "x.mscz', 'a.mscz\nb.mscz', '../x.mscz', 'Noten/../../x.mscz', '/tmp/x.mscz', 'C:/x.mscz', 'https://example.com/x.mscz', 'file:///x.mscz', 'Noten\\x.mscz', 'x.musicxml', 'x.mscz\u0000']) {
  assert.throws(() => parseScorePath(input), undefined, input);
 }
});
