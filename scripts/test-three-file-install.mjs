import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { obsidianCli } from './obsidian-cli.mjs';

const vault = process.env.OBSIDIAN_TEST_VAULT || 'KP_entwicklungskopie';
const releaseManifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const originalId = releaseManifest.id;
const distribution = path.join('dist', releaseManifest.id);
const suffix = Array.from(String(Date.now()), digit => String.fromCharCode(97 + Number(digit))).join('');
const testId = `musescorer-three-file-test-${suffix}`;
const files = ['main.js', 'manifest.json', 'styles.css'];
const cli = (command, ...args) => obsidianCli(vault, command, ...args);
async function evaluate(code) {
 const output = await cli('eval', `code=(async()=>{${code}})()`);
 if (!output.startsWith('=> ')) throw new Error(output);
 return JSON.parse(output.slice(3));
}
async function until(code, accepts, ms = 10000) {
 const start = performance.now();
 while (performance.now() - start < ms) {
  const value = await evaluate(code);
  if (accepts(value)) return value;
  await new Promise(resolve => setTimeout(resolve, 100));
 }
 throw new Error('Three-file test timed out.');
}
async function run(script) {
 await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [script], { stdio: 'inherit', env: { ...process.env, OBSIDIAN_TEST_VAULT: vault, OBSIDIAN_TEST_PLUGIN_ID: testId } });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)));
 });
}

const original = await evaluate(`const leaf=app.workspace.getMostRecentLeaf();return JSON.stringify({base:app.vault.adapter.getBasePath(),config:app.vault.configDir,loaded:!!app.plugins.plugins[${JSON.stringify(originalId)}],enabled:app.plugins.enabledPlugins.has(${JSON.stringify(originalId)}),view:leaf.getViewState(),editors:app.workspace.getLeavesOfType('musescorer-editor').map(l=>({id:l.id,state:l.getViewState()}))});`);
const directory = path.join(original.base, original.config, 'plugins', testId);
const report = { distributionFiles: files, codeHashes: {}, installedFolder: testId };
let created = false;
try {
 await mkdir(directory); created = true;
 for (const file of files) await cp(path.join(distribution, file), path.join(directory, file));
 // Only the identity is changed so the candidate and development plugin cannot register views simultaneously.
 const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
 manifest.id = testId; manifest.name += ' (three-file test)';
 await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
 assert.deepEqual((await readdir(directory)).sort(), [...files].sort());
 for (const file of ['main.js', 'styles.css']) {
  const expected = createHash('sha256').update(await readFile(path.join(distribution, file))).digest('hex');
  const actual = createHash('sha256').update(await readFile(path.join(directory, file))).digest('hex');
  assert.equal(actual, expected); report.codeHashes[file] = actual;
 }
 report.load = await evaluate(`await app.plugins.disablePlugin(${JSON.stringify(originalId)});await app.plugins.loadManifests();const start=performance.now();await app.plugins.enablePlugin(${JSON.stringify(testId)});if(!app.plugins.plugins[${JSON.stringify(testId)}])throw new Error('Clean plugin did not load');return JSON.stringify({milliseconds:performance.now()-start,dir:app.plugins.manifests[${JSON.stringify(testId)}].dir});`);
 await evaluate(`app.commands.executeCommandById(${JSON.stringify(`${testId}:show-credits-and-licenses`)});return JSON.stringify(true);`);
 await until(`return JSON.stringify(document.querySelector('.musescorer-license-text')?.textContent);`, value => value?.includes('MuseScore'));
 report.licenses = await evaluate(`const pre=document.querySelector('.musescorer-license-text');const modal=pre.closest('.modal-container');const options=[...modal.querySelectorAll('option')].map(o=>o.value);const select=modal.querySelector('select');select.value='LICENSE';select.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify(options);`);
 assert.ok(report.licenses.includes('LICENSE'));
 assert.ok(report.licenses.some(name => name.startsWith('licenses/fonts/')));
 await until(`return JSON.stringify(document.querySelector('.musescorer-license-text')?.textContent);`, value => value?.includes('GNU GENERAL PUBLIC LICENSE'));
 await evaluate(`const modal=document.querySelector('.musescorer-license-text').closest('.modal-container');[...modal.querySelectorAll('button')].find(button=>button.textContent==='Close').click();return JSON.stringify(true);`);
 await run('scripts/test-features.mjs');
 await run('scripts/test-embed-follow.mjs');
 const remaining = await readdir(directory);
 assert.ok(remaining.every(name => files.includes(name) || name === 'drafts'), 'No engine, fonts, editor or other program files may be extracted to the installation.');
 report.additionalProgramFiles = false;
 report.features = JSON.parse(await readFile('test-results/features-report.json', 'utf8'));
 report.follow = JSON.parse(await readFile('test-results/embed-follow-report.json', 'utf8'));
 await mkdir('test-results', { recursive: true });
 await writeFile('test-results/three-file-install-report.json', JSON.stringify(report, null, 2));
 console.log('Isolated three-file install passed:', JSON.stringify({ load: report.load, notices: report.licenses.length, additionalProgramFiles: false }));
} finally {
 await evaluate(`await app.plugins.disablePlugin(${JSON.stringify(testId)});return JSON.stringify(true);`).catch(() => {});
 if (created) await rm(directory, { recursive: true, force: true });
 await evaluate(`await app.plugins.loadManifests();if(${original.loaded})await app.plugins.enablePlugin(${JSON.stringify(originalId)});if(${original.enabled})app.plugins.enabledPlugins.add(${JSON.stringify(originalId)});else app.plugins.enabledPlugins.delete(${JSON.stringify(originalId)});for(const record of ${JSON.stringify(original.editors)}){let target;app.workspace.iterateAllLeaves(l=>{if(l.id===record.id)target=l});if(target)await target.setViewState(record.state);}const leaf=app.workspace.getLeaf(false);await leaf.setViewState(${JSON.stringify(original.view)});app.workspace.setActiveLeaf(leaf,{focus:true});return JSON.stringify(true);`).catch(error => { console.error('Restore the development plugin:', error.message); process.exitCode = 1; });
}
