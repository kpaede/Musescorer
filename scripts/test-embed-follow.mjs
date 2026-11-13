import { obsidianCli } from './obsidian-cli.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const vault = process.env.OBSIDIAN_TEST_VAULT || 'KP_entwicklungskopie';
const cli = (command, ...args) => obsidianCli(vault, command, ...args);
async function evaluate(code) {
 const output = await cli('eval', `code=(async()=>{${code}})()`);
 if (!output.startsWith('=> ')) throw new Error(output);
 return JSON.parse(output.slice(3));
}
async function until(code, accepts, ms = 20000) {
 const start = Date.now();
 while (Date.now() - start < ms) {
  const result = await evaluate(code);
  if (accepts(result)) return result;
  await new Promise(resolve => setTimeout(resolve, 100));
 }
 throw new Error(`Follow test timeout: ${code.slice(0, 140)}`);
}
const stamp = Date.now();
const scorePath = `_MuseScorer-Test/Follow-${stamp}.mscx`;
const notePath = `_MuseScorer-Test/Follow-${stamp}.md`;
const note = ['# Playback following', '', '```musescore', scorePath, '```', '', 'End of test note.', ''].join('\n');
const source = await readFile('tests/fixtures/page-turns.mscx', 'utf8');
const view = 'app.workspace.getMostRecentLeaf().view';
const preview = `${view}.containerEl.querySelector('.markdown-preview-view')`;
const embed = `${preview}.querySelector('.musescorer')`;
const active = `${embed}.querySelector('.musescorer-playing-note.is-active')`;
const observation = `const el=${embed};const note=${active};const p=note?.closest('.musescorer-page-wrap');const pages=[...el.querySelectorAll('.musescorer-page-wrap')];const n=note?.getBoundingClientRect();const inner=el.querySelector('.musescorer-viewport');const outer=${preview};const bounds=(el.dataset.view==='full'?outer:inner).getBoundingClientRect();return JSON.stringify({page:pages.indexOf(p),inner:inner.scrollTop,outer:outer.scrollTop,visible:!!n&&n.top>=bounds.top&&n.bottom<=bounds.bottom});`;
const report = {};
await mkdir('test-results', { recursive: true });
await cli('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
try {
 await evaluate(`await app.vault.create(${JSON.stringify(scorePath)},${JSON.stringify(source)});const file=await app.vault.create(${JSON.stringify(notePath)},${JSON.stringify(note)});const leaf=app.workspace.getLeaf('tab');await leaf.openFile(file,{state:{mode:'preview'}});app.workspace.setActiveLeaf(leaf,{focus:true});return JSON.stringify(true);`);
 await until(`return JSON.stringify(${embed}?.querySelectorAll('img').length);`, count => count === 3);
 await evaluate(`${embed}.querySelector('button[aria-label="Play score"]').click();return JSON.stringify(true);`);
 report.page = await until(observation, value => value.page === 1 && value.inner > 100 && value.visible);
 await cli('dev:screenshot', `path=${path.resolve('test-results/embed-page-follow.png')}`);
 await evaluate(`${embed}.querySelector('button[aria-label="Stop playback"]').click();${embed}.querySelector('button[aria-label="Show all pages"]').click();return JSON.stringify(true);`);
 await evaluate(`${embed}.querySelector('button[aria-label="Play score"]').click();return JSON.stringify(true);`);
 report.full = await until(observation, value => value.page === 1 && value.outer > 100 && value.visible);
 assert.equal(report.full.inner, 0, 'Full view must follow in the surrounding note, not an inner vertical viewport.');
 const pausePoint = await evaluate(`const button=${embed}.querySelector('button[aria-label="Pause playback"]');const r=button.getBoundingClientRect();const p=${preview}.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,visible:r.top>=p.top&&r.bottom<=p.bottom});`);
 assert.equal(pausePoint.visible,true,'Hover playback controls must stay reachable after the document follows to another page.');
 for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cli('dev:cdp','method=Input.dispatchMouseEvent',`params=${JSON.stringify({type,x:pausePoint.x,y:pausePoint.y,button:'left',clickCount:1})}`);
 await until(`return JSON.stringify(!!${embed}.querySelector('button[aria-label="Resume playback"]'));`,Boolean);
 report.full.pauseReachable = true;
 await cli('dev:screenshot', `path=${path.resolve('test-results/embed-full-follow.png')}`);
 await evaluate(`${embed}.querySelector('button[aria-label="Stop playback"]').click();return JSON.stringify(true);`);
 await writeFile('test-results/embed-follow-report.json', JSON.stringify(report, null, 2));
 console.log('Native playback page following:', JSON.stringify(report));
} finally {
 await evaluate(`for(const leaf of app.workspace.getLeavesOfType('markdown'))if(leaf.view.getState().file===${JSON.stringify(notePath)})leaf.detach();for(const path of ${JSON.stringify([notePath, scorePath])}){const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.delete(file);}const file=app.vault.getAbstractFileByPath('_MuseScorer-Test/MuseScorer-Ansichten.md');const leaf=app.workspace.getLeaf(false);await leaf.openFile(file,{state:{mode:'preview'}});app.workspace.setActiveLeaf(leaf,{focus:true});return JSON.stringify(true);`).catch(() => {});
 await cli('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}').catch(() => {});
}
