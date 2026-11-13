import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUpstreams, formatReport } from '../scripts/check-upstream.mjs';

const pin = 'a'.repeat(40);
const head = 'b'.repeat(40);
const engine = { otsRepository: 'https://github.com/OurTextScores/OTS_WebEditor', otsCommit: pin, sampleCommit: pin, museScoreVersion: '4.7.4' };
const editor = { repository: engine.otsRepository, commit: pin };

function fakeGitHub(otsHead = pin, tag = 'v4.7.4') {
 return async path => {
  if (path.endsWith('/releases/latest')) return { tag_name: tag };
  if (path.endsWith('/commits/main')) return { sha: path.includes('/OTS_WebEditor/') ? otsHead : pin };
  return { default_branch: 'main' };
 };
}

test('upstream check distinguishes unchanged pins from changed source and releases', async () => {
 const same = await checkUpstreams(engine, editor, fakeGitHub());
 assert.ok(same.every(source => !source.changed));
 const changed = await checkUpstreams(engine, editor, fakeGitHub(head, 'v4.8.0'));
 assert.deepEqual(changed.map(source => source.changed), [true, false, true]);
 assert.equal(changed[0].url, `https://github.com/OurTextScores/OTS_WebEditor/compare/${pin}...${head}`);
 assert.match(formatReport(changed), /Review changes/);
 assert.match(formatReport(changed), /No dependencies were changed/);
});

test('mismatched editor and engine pins fail before contacting GitHub', async () => {
 let requests = 0;
 await assert.rejects(checkUpstreams(engine, { ...editor, commit: head }, async () => { requests++; }), /same reviewed OTS commit/);
 assert.equal(requests, 0);
});

test('upstream API failures cannot be mistaken for current dependencies', async () => {
 await assert.rejects(checkUpstreams(engine, editor, async () => { throw new Error('API unavailable'); }), /API unavailable/);
 await assert.rejects(checkUpstreams(engine, editor, async () => ({ default_branch: 'main', sha: 'invalid' })), /Invalid upstream commit/);
});
