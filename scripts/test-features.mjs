import { obsidianCli } from './obsidian-cli.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const vault = process.env.OBSIDIAN_TEST_VAULT || 'KP_entwicklungskopie';
const pluginId = process.env.OBSIDIAN_TEST_PLUGIN_ID || 'MuseScorer';
const returnNote = '_MuseScorer-Test/MuseScorer-Ansichten.md';
const comparisonStamp = Date.now();
const note = `_MuseScorer-Test/Features-${comparisonStamp}.md`;
const comparisonScore = `_MuseScorer-Test/Features-${comparisonStamp}.mscz`;
const comparisonData = await readFile('tests/fixtures/bach_orig.mscz');
const comparisonText = ['# Embed comparison', '', '```musescore', comparisonScore, '```', '', '```musescore', `path: "${comparisonScore}"`, 'view: full', '```', ''].join('\n');
const cli = (command, ...args) => obsidianCli(vault, command, ...args);
async function evaluate(code) {
 const output = await cli('eval', `code=${code}`);
 if (!output.startsWith('=> ')) throw new Error(output);
 return JSON.parse(output.slice(3));
}
async function statement(code) { return evaluate(`(async()=>{${code}})()`); }
async function until(code, accepts, ms = 90000) {
 const start = Date.now();
 while (Date.now() - start < ms) {
  const result = await evaluate(code);
  if (accepts(result)) return result;
  await new Promise(resolve => setTimeout(resolve, 250));
 }
 throw new Error(`Test timeout: ${code.slice(0, 160)}`);
}
const view = 'app.workspace.getMostRecentLeaf().view';
const preview = `${view}.containerEl.querySelector('.markdown-preview-view')`;
const first = `${preview}.querySelector('.musescorer')`;
await mkdir('test-results', { recursive: true });
await cli('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
try {
await statement(`if(!app.vault.getAbstractFileByPath('_MuseScorer-Test'))await app.vault.createFolder('_MuseScorer-Test');const data=Uint8Array.from(atob(${JSON.stringify(comparisonData.toString('base64'))}),c=>c.charCodeAt(0));await app.vault.createBinary(${JSON.stringify(comparisonScore)},data.buffer);await app.vault.create(${JSON.stringify(note)},${JSON.stringify(comparisonText)});return JSON.stringify(true);`);
await statement(`const leaf=app.workspace.getMostRecentLeaf(); await leaf.setViewState({type:'markdown',state:{file:${JSON.stringify(note)},mode:'preview'}}); app.workspace.setActiveLeaf(leaf,{focus:true});await app.workspace.revealLeaf(leaf); ${preview}.scrollTop=0; return JSON.stringify(true);`);
await until(`JSON.stringify(${first}?.querySelectorAll('.musescorer-page').length)`, count => count === 3);
await until(`JSON.stringify(${first}?.clientWidth)`, width => width > 0);
await statement(`document.activeElement?.blur(); return JSON.stringify(true);`);
await cli('dev:cdp', 'method=Input.dispatchMouseEvent', `params=${JSON.stringify({ type: 'mouseMoved', x: 10, y: 80 })}`);
const quiet = await until(`JSON.stringify((()=>{const el=${first};return {mode:el.dataset.view,border:getComputedStyle(el).borderWidth,toolbar:getComputedStyle(el.querySelector('.musescorer-toolbar')).opacity,height:el.querySelector('.musescorer-viewport').clientHeight,scroll:el.querySelector('.musescorer-viewport').scrollHeight}})())`, value => value.toolbar === '0');
assert.equal(quiet.border, '0px'); assert.equal(quiet.mode, 'page'); assert.ok(quiet.scroll > quiet.height * 2);
await cli('dev:screenshot', `path=${path.resolve('test-results/embed-quiet.png')}`);
const point = await statement(`const r=${first}.getBoundingClientRect(); return JSON.stringify({x:r.left+r.width-30,y:Math.max(100,r.top+20)});`);
await cli('dev:cdp', 'method=Input.dispatchMouseEvent', `params=${JSON.stringify({ type: 'mouseMoved', ...point })}`);
await until(`JSON.stringify(getComputedStyle(${first}.querySelector('.musescorer-toolbar')).opacity)`, opacity => Number(opacity) > 0.8);
await cli('dev:screenshot', `path=${path.resolve('test-results/embed-hover.png')}`);
await statement(`${first}.querySelector('button[aria-label="Next page"]').click(); return JSON.stringify(true);`);
await until(`JSON.stringify(${first}.querySelector('.musescorer-viewport').scrollTop)`, top => top > 100);
await statement(`${first}.querySelector('button[aria-label="Previous page"]').click(); return JSON.stringify(true);`);
await until(`JSON.stringify(${first}.querySelector('.musescorer-viewport').scrollTop)`, top => top < 5);
await statement(`${first}.querySelector('button[aria-label="Show all pages"]').click(); return JSON.stringify(true);`);
const expanded = await until(`JSON.stringify((()=>{const el=${first};const p=el.querySelector('.musescorer-viewport');const pages=el.querySelectorAll('.musescorer-page-wrap');return {mode:el.dataset.view,height:p.clientHeight,scroll:p.scrollHeight,gap:pages[1].getBoundingClientRect().top-pages[0].getBoundingClientRect().bottom}})())`, value => value.mode === 'full' && Math.abs(value.height - value.scroll) < 3);
assert.ok(Math.abs(expanded.gap - 12) < 1, 'Full view must separate score pages by 12 px.');
await statement(`${first}.querySelector('button[aria-label="Show scrollable page view"]').click(); return JSON.stringify(true);`);
await statement(`const el=${preview};el.scrollTop=el.scrollHeight;return JSON.stringify(true);`);
await until(`JSON.stringify([...${preview}.querySelectorAll('.musescorer')].some(el=>el.dataset.view==='full'&&el.querySelectorAll('.musescorer-page').length===3))`, Boolean);
const source = await readFile('tests/fixtures/c_scale.mscz');
const sourceHash = createHash('sha256').update(source).digest('hex');
const stamp = Date.now();
const scorePath = `_MuseScorer-Test/Automation-${stamp}.mscz`;
const automationNote = `_MuseScorer-Test/Automation-${stamp}.md`;
const copyPath = `_MuseScorer-Test/Automation-${stamp}-edited.mscz`;
const embedText = ['```musescore', scorePath, '```', ''].join(String.fromCharCode(10));
const draftHash = createHash('sha256').update(scorePath).digest('hex');
const pluginDir = await evaluate(`JSON.stringify(app.plugins.manifests[${JSON.stringify(pluginId)}].dir)`);
const draftPath = `${pluginDir}/drafts/${draftHash}.json`;
let output = { quiet, expanded };
const frame = `${view}.contentEl.querySelector('iframe')`;
const doc = `${frame}.contentDocument`;
async function clickAt(targetExpression) {
 await statement(`await ${doc}.fonts.ready;const el=${targetExpression};if(!el)throw new Error('UI element missing');el.scrollIntoView({block:'nearest',inline:'nearest'});return JSON.stringify(true);`);
 let previous;
 let stable = 0;
 const point = await until(`JSON.stringify((()=>{const r=(${targetExpression}).getBoundingClientRect();const f=${frame}.getBoundingClientRect();return {x:f.left+r.left+r.width/2,y:f.top+r.top+r.height/2}})())`, current => {
  stable = previous && Math.abs(previous.x-current.x)<0.5 && Math.abs(previous.y-current.y)<0.5 ? stable+1 : 0;
  previous = current;
  return stable >= 3;
 }, 15000);
 for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cli('dev:cdp', 'method=Input.dispatchMouseEvent', `params=${JSON.stringify({type,...point,button:'left',clickCount:1})}`);
}
try {
 await statement(`const data=Uint8Array.from(atob(${JSON.stringify(source.toString('base64'))}),c=>c.charCodeAt(0));await app.vault.createBinary(${JSON.stringify(scorePath)},data.buffer);const file=await app.vault.create(${JSON.stringify(automationNote)},${JSON.stringify(embedText)});const leaf=app.workspace.getLeaf('tab');await leaf.openFile(file,{state:{mode:'preview'}});app.workspace.setActiveLeaf(leaf,{focus:true});await app.workspace.revealLeaf(leaf);return JSON.stringify(true);`);
 await until(`JSON.stringify(${first}?.querySelectorAll('.musescorer-page').length)`, count => count === 1);
 await until(`JSON.stringify(${view}.getState().file)`, value=>value===automationNote);
 console.log('Embed modes and test document: passed.');
 // Verify external-open wiring without launching another application during automation.
 await statement(`window.__musescorerShell=require('electron').shell;window.__musescorerOriginalOpen=window.__musescorerShell.openPath;window.__musescorerExternalPath=null;window.__musescorerShell.openPath=async path=>{window.__musescorerExternalPath=path;return ''};${first}.querySelector('button[aria-label="Open in MuseScore"]').click();return JSON.stringify(true);`);
 await until('JSON.stringify(window.__musescorerExternalPath)', value => typeof value==='string'&&value.endsWith(scorePath));
 console.log('Native file handoff: passed.');
 await statement(`window.__musescorerTestAudio={starts:0,frames:0,peak:0};window.__musescorerOriginalSource=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(...args){window.__musescorerEmbedContext=this;const source=window.__musescorerOriginalSource.apply(this,args);const start=source.start;source.start=function(...args){const data=source.buffer?.getChannelData(0);window.__musescorerTestAudio.starts++;window.__musescorerTestAudio.frames+=data?.length??0;if(data)for(const sample of data)window.__musescorerTestAudio.peak=Math.max(window.__musescorerTestAudio.peak,Math.abs(sample));return start.apply(this,args)};return source};${first}.querySelector('button[aria-label="Play score"]').click();return JSON.stringify(true);`);
 const audio = await until('JSON.stringify(window.__musescorerTestAudio)', value => value.starts > 0 && value.peak > 0.0001);
 const highlightedNotes = await until(`JSON.stringify(${first}.querySelectorAll('.musescorer-playing-note.is-active').length)`, count=>count>0);
 await cli('dev:screenshot', `path=${path.resolve('test-results/embed-note-highlighting.png')}`);
 await statement(`${first}.querySelector('button[aria-label="Pause playback"]').click();return JSON.stringify(true);`);
 await until('JSON.stringify(window.__musescorerEmbedContext.state)', state=>state==='suspended');
 const paused = await statement(`return JSON.stringify({time:window.__musescorerEmbedContext.currentTime,notes:[...${first}.querySelectorAll('.musescorer-playing-note.is-active')].map(el=>el.getAttribute('d'))});`);
 await new Promise(resolve=>setTimeout(resolve,350));
 const held = await statement(`return JSON.stringify({time:window.__musescorerEmbedContext.currentTime,notes:[...${first}.querySelectorAll('.musescorer-playing-note.is-active')].map(el=>el.getAttribute('d'))});`);
 assert.deepEqual(held,paused,'Pause must freeze the audio clock and retain the current note highlights.');
 await statement(`${first}.querySelector('button[aria-label="Resume playback"]').click();return JSON.stringify(true);`);
 await until('JSON.stringify(window.__musescorerEmbedContext.currentTime)', time=>time>paused.time+0.1);
 assert.equal(await evaluate(`JSON.stringify(!!${first}.querySelector('button[aria-label="Pause playback"]'))`),true);
 await statement(`${first}.querySelector('button[aria-label="Stop playback"]').click();return JSON.stringify(true);`);
 await until(`JSON.stringify(${first}.querySelectorAll('.musescorer-playing-note.is-active').length)`, count=>count===0);
 console.log('Embed audio, pause/resume and highlighting: passed.');
 await statement(`${first}.querySelector('button[aria-label="Open in score editor"]').click();return JSON.stringify(true);`);
 await until(`JSON.stringify({type:${view}.getViewType(),notes:${doc}?.querySelectorAll('svg .Note').length})`, value => value.type==='musescorer-editor'&&value.notes>0);
 console.log('Full original editor loaded.');
 const menus = await evaluate(`JSON.stringify([...${doc}.querySelectorAll('button[data-testid^="menu-"]')].map(el=>el.textContent))`);
 for (const name of ['File','Edit','View','Add','Format','Tools','Help']) assert.ok(menus.includes(name), `Missing original menu ${name}`);
 assert.equal(await evaluate(`JSON.stringify(!!${doc}.querySelector('[data-testid="btn-note-input"]'))`), true);
 await clickAt(`${doc}.querySelector('[data-testid="menu-file"]')`);
 const performanceMode = await until(`JSON.stringify((()=>{const item=${doc}.querySelector('[data-testid*="file.perform"]');return item?{label:item.textContent,disabled:item.getAttribute('aria-disabled')==='true'||item.hasAttribute('data-disabled')}:null})())`,Boolean);
 assert.match(performanceMode.label,/unavailable in Obsidian/u); assert.equal(performanceMode.disabled,true);
 for(const type of ['keyDown','keyUp'])await cli('dev:cdp','method=Input.dispatchKeyEvent',`params=${JSON.stringify({type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27})}`);

 await clickAt(`${doc}.querySelector('svg .Note')`);
 await until(`(async()=>JSON.stringify(await ${view}.host.native(${view}.host.active,'getSelectedElementProperties')))()`, result => result.selectionCount>0);
 await cli('dev:cdp','method=Input.dispatchKeyEvent',`params=${JSON.stringify({type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38})}`);
 await cli('dev:cdp','method=Input.dispatchKeyEvent',`params=${JSON.stringify({type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38})}`);
 await until(`JSON.stringify(${view}.contentEl.querySelector('.musescorer-full-editor-status')?.textContent)`, text => text?.includes('Draft saved locally'));
 assert.equal(await evaluate(`JSON.stringify(await app.vault.adapter.exists(${JSON.stringify(draftPath)}))`), true);
 await cli('dev:screenshot', `path=${path.resolve('test-results/full-editor-selection.png')}`);
 await clickAt(`${doc}.querySelector('[data-testid="btn-undo"]')`);
 await until(`(async()=>JSON.stringify(await app.vault.adapter.exists(${JSON.stringify(draftPath)})))()`, value=>value===false);
 await clickAt(`${doc}.querySelector('[data-testid="btn-redo"]')`);
 await until(`(async()=>JSON.stringify(await app.vault.adapter.exists(${JSON.stringify(draftPath)})))()`, Boolean);
 console.log('Original editor selection/undo/redo: passed.');
 await statement(`window.__musescorerFrameWindow=${frame}.contentWindow;const w=window.__musescorerFrameWindow;window.__musescorerFrameSource=w.AudioContext.prototype.createBufferSource;window.__musescorerFrameAudio={starts:0,peak:0};w.AudioContext.prototype.createBufferSource=function(...args){const source=window.__musescorerFrameSource.apply(this,args);const start=source.start;source.start=function(...args){window.__musescorerFrameAudio.starts++;for(const sample of source.buffer?.getChannelData(0)??[])window.__musescorerFrameAudio.peak=Math.max(window.__musescorerFrameAudio.peak,Math.abs(sample));return start.apply(this,args)};return source};return JSON.stringify(true);`);
 await until(`JSON.stringify(${doc}.querySelector('[data-testid="btn-play"]').disabled)`, value=>value===false);
 await clickAt(`${doc}.querySelector('[data-testid="btn-play"]')`);
 const editorAudio = await until('JSON.stringify(window.__musescorerFrameAudio)', value=>value.starts>0&&value.peak>0.0001);
 const editorHighlights = await until(`JSON.stringify(${doc}.querySelectorAll('.ots-playback-notehead').length)`, count=>count>0);
 await cli('dev:screenshot',`path=${path.resolve('test-results/full-editor-playback.png')}`);
 await clickAt(`${doc}.querySelector('[data-testid="btn-stop"]')`);
 await until(`JSON.stringify(${doc}.querySelectorAll('.ots-playback-notehead').length)`, count=>count===0);
 console.log('Original editor audio/highlighting: passed.');
 await statement(`${view}.contentEl.querySelector('button[aria-label="Save a new score copy to the vault"]').click();return JSON.stringify(true);`);
 await until(`JSON.stringify(!!document.querySelector('.modal input'))`, Boolean);
 await statement(`const modal=document.querySelector('.modal-container:last-of-type');const input=modal.querySelector('input');input.value=${JSON.stringify(copyPath)};input.dispatchEvent(new Event('input',{bubbles:true}));[...modal.querySelectorAll('button')].find(button=>button.textContent==='Save copy').click();return JSON.stringify(true);`);
 await until(`JSON.stringify(!!app.vault.getAbstractFileByPath(${JSON.stringify(copyPath)}))`, Boolean);
 const savedBytes = await statement(`const data=new Uint8Array(await app.vault.readBinary(app.vault.getAbstractFileByPath(${JSON.stringify(copyPath)})));let s='';for(let i=0;i<data.length;i+=8192)s+=String.fromCharCode(...data.subarray(i,i+8192));return JSON.stringify(btoa(s));`);
 assert.equal(Buffer.from(savedBytes,'base64').subarray(0,2).toString(),'PK');
 console.log('Native copy saving: passed.');
 await statement(`const leaf=${view}.leaf;await leaf.view.onClose();leaf.detach();return JSON.stringify(true);`);
 await statement(`const file=app.vault.getAbstractFileByPath(${JSON.stringify(automationNote)});const leaf=app.workspace.getLeaf('tab');await leaf.openFile(file,{state:{mode:'preview'}});app.workspace.setActiveLeaf(leaf,{focus:true});await app.workspace.revealLeaf(leaf);return JSON.stringify(true);`);
 await until(`JSON.stringify(${first}?.querySelectorAll('.musescorer-page').length)`, count=>count===1);
 await statement(`${first}.querySelector('button[aria-label="Open in score editor"]').click();return JSON.stringify(true);`);
 await until(`JSON.stringify(${view}.contentEl.querySelector('.musescorer-full-editor-status')?.textContent)`, text=>text?.toLowerCase().includes('draft'));
 assert.equal(await evaluate(`JSON.stringify(${view}.host?.recovered)`), true, 'The reopened editor must load its native recovery snapshot.');
 await until(`JSON.stringify(${doc}?.querySelectorAll('svg .Note').length)`, count=>count>0);
 const original=await statement(`const data=new Uint8Array(await app.vault.readBinary(app.vault.getAbstractFileByPath(${JSON.stringify(scorePath)})));let s='';for(let i=0;i<data.length;i+=8192)s+=String.fromCharCode(...data.subarray(i,i+8192));return JSON.stringify(btoa(s));`);
 assert.equal(createHash('sha256').update(Buffer.from(original,'base64')).digest('hex'),sourceHash);
 output={...output,audio,highlightedNotes,pauseResume:'audio clock and highlight frozen, then continued',performanceMode,menus,editorAudio,editorHighlights,editor:'complete original OTS editor',nativeCopy:'saved',draftRecovery:'passed',originalUnchanged:true,externalOpen:'native file path verified without launching the external app'};
} finally {
 await statement(`if(window.__musescorerOriginalSource)AudioContext.prototype.createBufferSource=window.__musescorerOriginalSource;if(window.__musescorerFrameWindow&&window.__musescorerFrameSource)window.__musescorerFrameWindow.AudioContext.prototype.createBufferSource=window.__musescorerFrameSource;if(window.__musescorerOriginalOpen)window.__musescorerShell.openPath=window.__musescorerOriginalOpen;for(const leaf of app.workspace.getLeavesOfType('musescorer-editor'))if(leaf.view.getState().path===${JSON.stringify(scorePath)}){await leaf.view.onClose();leaf.detach();}delete window.__musescorerEmbedContext;delete window.__musescorerTestAudio;delete window.__musescorerFrameAudio;delete window.__musescorerFrameWindow;delete window.__musescorerFrameSource;delete window.__musescorerOriginalSource;delete window.__musescorerOriginalOpen;delete window.__musescorerExternalPath;delete window.__musescorerShell;return JSON.stringify(true);`).catch(()=>{});
 await statement(`if(await app.vault.adapter.exists(${JSON.stringify(draftPath)}))await app.vault.adapter.remove(${JSON.stringify(draftPath)});for(const path of ${JSON.stringify([copyPath,automationNote,scorePath])}){const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.delete(file);}const file=app.vault.getAbstractFileByPath(${JSON.stringify(note)});const leaf=app.workspace.getLeaf(false);await leaf.openFile(file,{state:{mode:'preview'}});app.workspace.setActiveLeaf(leaf,{focus:true});await app.workspace.revealLeaf(leaf);return JSON.stringify(true);`).catch(()=>{});
}
await writeFile('test-results/features-report.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
} finally {
 await statement(`for(const leaf of app.workspace.getLeavesOfType('markdown'))if(leaf.view.getState().file===${JSON.stringify(note)})leaf.detach();for(const path of ${JSON.stringify([note,comparisonScore])}){const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.delete(file);}const file=app.vault.getAbstractFileByPath(${JSON.stringify(returnNote)});if(file){const leaf=app.workspace.getLeaf(false);await leaf.openFile(file,{state:{mode:'preview'}});app.workspace.setActiveLeaf(leaf,{focus:true});}return JSON.stringify(true);`).catch(()=>{});
 await cli('dev:cdp','method=Emulation.setFocusEmulationEnabled','params={"enabled":false}').catch(()=>{});
}
