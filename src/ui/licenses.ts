import { App, Modal, Setting } from 'obsidian';
import type { RuntimeAssets } from '../assets/types';

/** Legal notices ship inside the same three-file distribution and remain readable offline. */
export class LicensesModal extends Modal {
 private generation = 0;
 constructor(app: App, private assets: RuntimeAssets) { super(app); }
 onOpen(): void {
  this.setTitle('Credits and licenses');
  this.contentEl.createEl('p', { text: 'Built on OTS_WebEditor by OurTextScores and its contributors, the MuseScore engine and the Obsidian sample plugin.' });
  this.contentEl.createEl('a', { text: 'Source code and attribution', href: 'https://github.com/kpaede/Musescorer', attr: { target: '_blank', rel: 'noopener noreferrer' } });
  const names = ['THIRD_PARTY_NOTICES.md', 'LICENSE', ...this.assets.list().filter(name => name.startsWith('licenses/'))];
  const text = this.contentEl.createEl('pre', { cls: 'musescorer-license-text' });
  const show = async (name: string): Promise<void> => {
   const generation = ++this.generation;
   try { const value = await this.assets.read(name); if (generation === this.generation) text.setText(value); }
   catch (error) { if (generation === this.generation) text.setText(error instanceof Error ? error.message : 'Could not read the bundled license.'); }
  };
  const setting = new Setting(this.contentEl).setName('Document').addDropdown(dropdown => {
   for (const name of names) dropdown.addOption(name, name);
   dropdown.setValue(names[0]!).onChange(name => { void show(name); });
  });
  text.before(setting.settingEl);
  new Setting(this.contentEl).addButton(button => button.setButtonText('Close').onClick(() => this.close()));
  void show(names[0]!);
 }
 onClose(): void { this.generation++; this.contentEl.empty(); }
}
