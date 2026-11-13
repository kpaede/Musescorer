import { shell } from 'electron';
import { FileSystemAdapter, Notice, type App, type TFile } from 'obsidian';

export async function openInMuseScore(app: App, file: TFile): Promise<void> {
 try {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) throw new Error('This file is not available as a local desktop file.');
  // Same native-file handoff as the user's Verovio plugin; MuseScore owns .mscz/.mscx associations.
  const error = await shell.openPath(adapter.getFullPath(file.path));
  if (error) throw new Error(error);
 } catch (error) { new Notice(`Could not open the file in MuseScore: ${error instanceof Error ? error.message : String(error)}`); }
}
