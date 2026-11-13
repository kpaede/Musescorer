import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { parseScorePath } from '../score-path';

/** Save only a new native file; the source is never overwritten by this editor foundation. */
export class SaveCopyModal extends Modal {
 constructor(app: App, private file: Pick<TFile, 'basename' | 'parent'>, private data: Uint8Array) { super(app); }
 onOpen(): void {
  this.setTitle('Save score copy');
  let path = `${this.file.parent?.path ? `${this.file.parent.path}/` : ''}${this.file.basename} (edited).mscz`;
  new Setting(this.contentEl).setName('File path in vault').addText(text => text.setValue(path).onChange(value => { path = value; }));
  const error = this.contentEl.createDiv({ cls: 'musescorer-error', attr: { role: 'alert' } });
  new Setting(this.contentEl).addButton(button => button.setButtonText('Save copy').setCta().onClick(async () => {
   button.setDisabled(true);
   try {
    const target = parseScorePath(path);
    if (!target.toLowerCase().endsWith('.mscz')) throw new Error('Save the copy as a native .mscz file.');
    if (this.app.vault.getAbstractFileByPath(target) || await this.app.vault.adapter.exists(target)) throw new Error('This file already exists. Choose a new name.');
    const bytes = Uint8Array.from(this.data).buffer;
    await this.app.vault.createBinary(target, bytes);
    new Notice(`Score copy saved: ${target}`);
    this.close();
   } catch (failure) { error.setText(failure instanceof Error ? failure.message : 'Could not save the copy.'); }
   finally { button.setDisabled(false); }
  }));
 }
 onClose(): void { this.contentEl.empty(); }
}
