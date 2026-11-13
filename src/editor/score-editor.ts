import { ItemView, Modal, Notice, Setting, TFile, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type { EngineClient } from '../engine/client';
import type { PlaybackController } from '../playback/controller';
import { FullEditorHost } from '../full-editor/host';
import { iconButton } from '../ui/icon-button';
import { openInMuseScore } from '../ui/open-native';
import { DraftStore } from './drafts';
import type { RuntimeAssets } from '../assets/types';

export const SCORE_EDITOR_TYPE = 'musescorer-editor';
/** The complete upstream OTS notation editor, hosted locally inside an Obsidian leaf. */
export class ScoreEditor extends ItemView {
 private path = '';
 private file?: TFile;
 private host?: FullEditorHost;
 private status?: HTMLElement;
 private frame?: HTMLIFrameElement;
 private closing = false;
 constructor(leaf: WorkspaceLeaf, private client: EngineClient, private player: PlaybackController, private drafts: DraftStore, private assets: RuntimeAssets) { super(leaf); }
 getViewType(): string { return SCORE_EDITOR_TYPE; }
 getDisplayText(): string { return this.file ? `${this.file.basename} – Score editor` : 'Score editor'; }
 getIcon(): string { return 'music-4'; }
 getState(): Record<string, unknown> { return { path: this.path }; }
 async setState(state: unknown, result: ViewStateResult): Promise<void> {
  await super.setState(state, result);
  if (state && typeof state === 'object' && 'path' in state && typeof state.path === 'string' && state.path !== this.path) { this.path = state.path; await this.openScore(); }
 }
 onOpen(): Promise<void> {
  this.contentEl.empty(); this.contentEl.addClass('musescorer-full-editor');
  const toolbar = this.contentEl.createDiv({ cls: 'musescorer-editor-toolbar' });
  iconButton(this, toolbar, 'save', 'Save a new score copy to the vault', () => { void this.host?.save().catch(error => this.fail(error)); });
  iconButton(this, toolbar, 'external-link', 'Open in MuseScore', () => { if (this.file) void openInMuseScore(this.app, this.file); });
  iconButton(this, toolbar, 'rotate-ccw', 'Reload original', () => {
   const modal = new Modal(this.app); modal.setTitle('Reload original?');
   modal.contentEl.createEl('p', { text: 'This discards the local draft. The source file and saved copies are kept.' });
   new Setting(modal.contentEl).addButton(button => button.setButtonText('Cancel').onClick(() => modal.close())).addButton(button => button.setButtonText('Discard draft').setWarning().onClick(async () => {
    modal.close(); await this.host?.dispose(); this.host = undefined;
    if (this.file) await this.drafts.remove(this.file);
    await this.openScore();
   })); modal.open();
  });
  this.status = toolbar.createSpan({ cls: 'musescorer-full-editor-status', attr: { role: 'status', 'aria-live': 'polite' } });
  this.frame = this.contentEl.createEl('iframe', { cls: 'musescorer-full-editor-frame', attr: { title: 'Full score editor', sandbox: 'allow-scripts allow-same-origin allow-downloads allow-modals allow-forms', allow: 'autoplay; clipboard-read; clipboard-write' } });
  this.registerDomEvent(window, 'message', event => this.host?.receive(event));
  return Promise.resolve();
 }
 private async openScore(): Promise<void> {
  try {
   await this.host?.dispose(); this.host = undefined;
   if (this.closing || !this.frame) return;
   const file = this.app.vault.getAbstractFileByPath(this.path);
   if (!(file instanceof TFile)) throw new Error(`File not found: ${this.path}`);
   this.file = file; this.status?.setText('Opening score editor …');
   this.host = new FullEditorHost(this.app, this.client, this.player, this.drafts, this.frame, file, this.assets, message => this.status?.setText(message));
   await this.host.start();
  } catch (error) { this.fail(error); }
 }
 stopPlayback(): void { this.host?.stopAudio(); }
 private fail(error: unknown): void { const text = error instanceof Error ? error.message : 'Could not open the editor.'; this.status?.setText(text); new Notice(text); }
 async onClose(): Promise<void> { this.closing = true; await this.host?.dispose(); this.host = undefined; this.contentEl.empty(); }
}
