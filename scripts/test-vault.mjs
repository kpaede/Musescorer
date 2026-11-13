import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const vault = process.env.OBSIDIAN_TEST_VAULT || 'KP_entwicklungskopie';
async function cli(command, ...args) {
 const { stdout } = await exec('obsidian', [`vault=${vault}`, command, ...args], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
 return stdout.trim();
}
async function evaluate(code) {
 const program = code.includes('return ') ? `(()=>{${code}})()` : code;
 const output = await cli('eval', `code=${program}`);
 if (!output.startsWith('=> ')) throw new Error(`Unexpected Obsidian CLI response: ${output}`);
 return JSON.parse(output.slice(3));
}
async function until(code, accept, timeout = 90000) {
 const start = Date.now();
 while (Date.now() - start < timeout) {
  const value = await evaluate(code);
  if (accept(value)) return value;
  await new Promise(resolve => setTimeout(resolve, 350));
 }
 throw new Error('Obsidian integration check timed out');
}
await mkdir('test-results', { recursive: true });
const state = await evaluate('JSON.stringify({vault:app.vault.getName(),plugin:!!app.plugins.getPlugin("musescorer"),file:app.workspace.getMostRecentLeaf().view.getState().file,dark:document.body.classList.contains("theme-dark")})');
assert.equal(state.vault, vault);
assert.equal(state.plugin, true, 'Enable the built MuseScorer plugin first.');
assert.equal(state.file, '_MuseScorer-Test/MuseScorer-Test.md', 'Open the dedicated test note before running this test.');
const view = 'app.workspace.getMostRecentLeaf().view.containerEl.querySelector(".markdown-preview-view")';
const statusCode = `JSON.stringify([...${view}.querySelectorAll('.musescorer-status')].map(el=>el.textContent))`;
const scrollTop = `const el=${view}; el.scrollTop=0; return JSON.stringify(true)`;
await evaluate(scrollTop);
const topStatuses = await until(statusCode, statuses => statuses.some(text => text.includes('3 pages')));
const loaded = await until(`JSON.stringify([...${view}.querySelectorAll('.musescorer-page')].every(image=>image.complete&&image.naturalWidth>0))`, value => value === true);
assert.equal(loaded, true);
const before = await until(`JSON.stringify(${view}.querySelector('.musescorer-page').getBoundingClientRect().width)`, value => value > 0);
await evaluate(`const el=${view}.querySelector('.musescorer'); el.querySelector('button[aria-label="Zoom in"]').click(); return JSON.stringify(el.querySelector('.musescorer-zoom').textContent)`);
const zoomed = await evaluate(`JSON.stringify(${view}.querySelector('.musescorer-page').getBoundingClientRect().width)`);
assert.ok(zoomed > before * 1.15);
const label = await evaluate(`const el=${view}.querySelector('.musescorer'); el.querySelector('button[aria-label="Fit to width"]').click(); return JSON.stringify(el.querySelector('.musescorer-zoom').textContent)`);
assert.equal(label, '100 %');
await cli('dev:screenshot', `path=${path.resolve('test-results/obsidian-current-theme.png')}`);
// Only toggle DOM theme classes temporarily; the user's saved theme setting is untouched.
await evaluate(`document.body.classList.toggle('theme-dark',${!state.dark}); document.body.classList.toggle('theme-light',${state.dark}); return JSON.stringify(true)`);
try { await cli('dev:screenshot', `path=${path.resolve('test-results/obsidian-other-theme.png')}`); }
finally { await evaluate(`document.body.classList.toggle('theme-dark',${state.dark}); document.body.classList.toggle('theme-light',${!state.dark}); return JSON.stringify(true)`); }
await evaluate(`const el=${view}; el.scrollTop=el.scrollHeight; return JSON.stringify(true)`);
const bottomStatuses = await until(statusCode, statuses => statuses.some(text => text.includes('File not found')) && statuses.some(text => !text.includes('Loading') && !text.includes('page') && !text.includes('File not found')));
assert.ok(bottomStatuses.some(text => text.includes('Über den Flügel.mscz · 1 page')), 'The second instance must render.');
await cli('dev:screenshot', `path=${path.resolve('test-results/obsidian-error-cases.png')}`);
await evaluate(scrollTop);
await writeFile('test-results/obsidian-report.json', JSON.stringify({ vault, state, topStatuses, bottomStatuses, allVisibleImagesLoaded: loaded, fitWidth: before, zoomWidth: zoomed }, null, 2));
console.log(JSON.stringify({ vault, topStatuses, bottomStatuses, zoom: 'passed', themes: 'passed' }, null, 2));
