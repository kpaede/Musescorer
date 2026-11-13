import type { DataAdapter, TFile } from 'obsidian';

export class DraftStore {
 constructor(private adapter: DataAdapter, private dir: string) {}
 private async location(path: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path));
  const name = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${this.dir}/drafts/${name}.json`;
 }
 async read(file: TFile): Promise<{ data: ArrayBuffer; sourceChanged: boolean; sourceMtime: number } | null> {
  const path = await this.location(file.path);
  if (!await this.adapter.exists(path)) return null;
  const value: unknown = JSON.parse(await this.adapter.read(path));
  if (!value || typeof value !== 'object' || !('data' in value) || typeof value.data !== 'string' || !('path' in value) || value.path !== file.path) throw new Error('The saved score draft is invalid.');
  const sourceMtime = 'mtime' in value && typeof value.mtime === 'number' ? value.mtime : 0;
  return { data: Uint8Array.from(atob(value.data), char => char.charCodeAt(0)).buffer, sourceChanged: sourceMtime !== file.stat.mtime, sourceMtime };
 }
 async write(file: TFile, data: Uint8Array, clean: boolean, sourceMtime = file.stat.mtime): Promise<void> {
  const path = await this.location(file.path);
  if (clean) { if (await this.adapter.exists(path)) await this.adapter.remove(path); return; }
  const folder = `${this.dir}/drafts`;
  if (!await this.adapter.exists(folder)) await this.adapter.mkdir(folder);
  let binary = '';
  for (let offset = 0; offset < data.length; offset += 8192) binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
  // One record keeps native score bytes and source identity together.
  await this.adapter.write(path, JSON.stringify({ path: file.path, mtime: sourceMtime, data: btoa(binary) }));
 }
 async remove(file: TFile): Promise<void> {
  const path = await this.location(file.path);
  if (await this.adapter.exists(path)) await this.adapter.remove(path);
 }
}
