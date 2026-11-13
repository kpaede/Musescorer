import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/embed-options.ts'], bundle: true, write: false, format: 'esm' });
const { parseEmbedOptions } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('page is the default for existing embeds; full is explicit and preserves Unicode paths', () => {
 assert.deepEqual(parseEmbedOptions('Noten/Über den Flügel.mscz'), { path: 'Noten/Über den Flügel.mscz', view: 'page' });
 assert.deepEqual(parseEmbedOptions('path: "Noten/Über den Flügel.mscz"'), { path: 'Noten/Über den Flügel.mscz', view: 'page' });
 assert.deepEqual(parseEmbedOptions('path: "Noten/Über den Flügel.mscz"\nview: full'), { path: 'Noten/Über den Flügel.mscz', view: 'full' });
 assert.deepEqual(parseEmbedOptions('view: "page"\npath: a.mscx'), { path: 'a.mscx', view: 'page' });
});
test('rejects misspelled, duplicate and malformed options rather than silently ignoring them', () => {
 for (const source of ['view: full', 'path: a.mscz\nview: entire', 'path: a.mscz\nview: full\nview: page', 'path: a.mscz\npath: b.mscz', 'path: ../a.mscz\nview: full', 'path: a.mscz\nunknown: full', 'a.mscz\nview: full']) assert.throws(() => parseEmbedOptions(source), undefined, source);
});
