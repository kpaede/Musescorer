import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateReleaseIdentity } from '../scripts/manifest.mjs';

test('the release manifest uses a valid canonical plugin ID', async () => {
 const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
 assert.equal(validateReleaseIdentity(manifest).id, 'musescorer');
});

test('invalid IDs and non-Obsidian version formats fail before packaging', () => {
 for (const id of ['MuseScorer', 'musescorer-plugin', 'obsidian-musescorer', 'musescorer_foo', 'musescorer2', 'musescorer-', '']) {
  assert.throws(() => validateReleaseIdentity({ id, version: '0.0.1' }), /Plugin ID/u);
 }
 for (const version of ['v0.0.1', '0.0.1-beta', '0.1', '01.0.0']) assert.throws(() => validateReleaseIdentity({ id: 'musescorer', version }), /version/u);
 assert.equal(validateReleaseIdentity({ id: 'music-score', version: '0.0.1' }).id, 'music-score');
});
