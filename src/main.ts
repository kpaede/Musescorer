import { FuzzySuggestModal, Notice, Plugin, TFile } from 'obsidian';
import { EngineClient } from './engine/client';
import { ScoreRenderer } from './engine/renderer';
import { ScoreView } from './viewer/score-view';
import { PlaybackController } from './playback/controller';
import { DraftStore } from './editor/drafts';
import { SCORE_EDITOR_TYPE, ScoreEditor } from './editor/score-editor';
import { BundledAssets } from './assets/bundled';
import { LicensesModal } from './ui/licenses';

export default class MuseScorerPlugin extends Plugin {
 onload(): void {
  const dir = this.manifest.dir;
  if (!dir) throw new Error('Could not determine the plugin folder.');
  const assets = new BundledAssets();
  const client = new EngineClient(assets);
  const renderer = new ScoreRenderer(client);
  const player = new PlaybackController(client, this.app.vault);
  const drafts = new DraftStore(this.app.vault.adapter, dir);
  this.registerView(SCORE_EDITOR_TYPE, leaf => new ScoreEditor(leaf, client, player, drafts, assets));
  const openEditor = (file: TFile): void => {
   void (async () => {
    const existing = this.app.workspace.getLeavesOfType(SCORE_EDITOR_TYPE).find(leaf => leaf.view.getState().path === file.path);
    const leaf = existing ?? this.app.workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type: SCORE_EDITOR_TYPE, state: { path: file.path }, active: true });
    await this.app.workspace.revealLeaf(leaf);
   })().catch((error: unknown) => new Notice(error instanceof Error ? error.message : 'Could not open the score editor.'));
  };
  this.registerMarkdownCodeBlockProcessor('musescore', (source, element, context) => {
   context.addChild(new ScoreView(element, this.app, renderer, source, openEditor, player));
  });
  this.addCommand({ id: 'open-score-editor', name: 'Open score editor', callback: () => new ScorePicker(this.app, openEditor).open() });
  this.addCommand({ id: 'show-credits-and-licenses', name: 'Show credits and licenses', callback: () => {
   const modal = new LicensesModal(this.app, assets); modal.open(); this.register(() => modal.close());
  } });
  this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
   if (file instanceof TFile && /^(?:mscz|mscx)$/iu.test(file.extension)) menu.addItem(item => item.setTitle('Open in score editor').setIcon('pencil').onClick(() => openEditor(file)));
  }));
  this.register(() => { player.dispose(); renderer.dispose(); client.dispose(); });
 }
}
class ScorePicker extends FuzzySuggestModal<TFile> {
 constructor(app: import('obsidian').App, private choose: (file: TFile) => void) { super(app); this.setPlaceholder('Select a score …'); }
 getItems(): TFile[] { return this.app.vault.getFiles().filter(file => /^(?:mscz|mscx)$/iu.test(file.extension)); }
 getItemText(file: TFile): string { return file.path; }
 onChooseItem(file: TFile): void { this.choose(file); }
}
