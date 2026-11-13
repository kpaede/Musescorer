import { App, MarkdownRenderChild, TFile, setIcon } from 'obsidian';
import type { ScoreRenderer } from '../engine/renderer';
import { parseEmbedOptions, type EmbedMode } from '../embed-options';
import { iconButton } from '../ui/icon-button';
import type { PlaybackController } from '../playback/controller';
import { openInMuseScore } from '../ui/open-native';
import { NoteOverlay } from '../playback/note-overlay';
import { followScore } from '../playback/follow-score';

export class ScoreView extends MarkdownRenderChild {
 private generation = 0;
 private controller = new AbortController();
 private urls: string[] = [];
 private path = '';
 private zoom = 1;
 private mode: EmbedMode = 'page';
 private pageContainer?: HTMLElement;
 private viewport?: HTMLElement;
 private status?: HTMLElement;
 private counter?: HTMLElement;
 private zoomLabel?: HTMLElement;
 private modeButton?: HTMLButtonElement;
 private previous?: HTMLButtonElement;
 private next?: HTMLButtonElement;
 private debounce?: number;
 private overlays: NoteOverlay[] = [];
 private playbackOwner = `embed-${crypto.randomUUID()}`;

 constructor(element: HTMLElement, private app: App, private renderer: ScoreRenderer, private source: string, private openEditor: (file: TFile) => void, private player: PlaybackController) { super(element); }

 onload(): void {
  this.containerEl.empty();
  this.containerEl.addClass('musescorer');
  this.containerEl.setAttribute('aria-label', 'Score');
  const controls = this.containerEl.createDiv({ cls: 'musescorer-controls' });
  const toolbar = controls.createDiv({ cls: 'musescorer-toolbar' });
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Score controls');
  this.previous = iconButton(this, toolbar, 'chevron-left', 'Previous page', () => this.turnPage(-1));
  this.next = iconButton(this, toolbar, 'chevron-right', 'Next page', () => this.turnPage(1));
  const play = iconButton(this, toolbar, 'play', 'Play score', () => {
   const file = this.app.vault.getAbstractFileByPath(this.path);
   if (file instanceof TFile) void this.player.toggleFile(file, this.playbackOwner);
  });
  const stop = iconButton(this, toolbar, 'square', 'Stop playback', () => { void this.player.stop(this.playbackOwner); });
  this.register(this.player.subscribeHighlights((owner, box) => {
   const active = owner === this.playbackOwner ? box : null;
   for (const overlay of this.overlays) overlay.show(active);
   if (active && this.viewport && this.pageContainer) followScore(active, this.viewport, this.pageContainer, this.mode);
  }));
  this.register(this.player.subscribe(state => {
   const own = state.owner === this.playbackOwner;
   play.disabled = own && state.status === 'loading';
   const playing = own && state.status === 'playing';
   const label = playing ? 'Pause playback' : own && state.status === 'paused' ? 'Resume playback' : 'Play score';
   setIcon(play, playing ? 'pause' : 'play');
   play.setAttribute('aria-label', label); play.title = label;
   play.setAttribute('aria-pressed', String(playing));
   stop.disabled = !own || state.status === 'idle';
   if (own && state.error) { this.status?.addClass('musescorer-error'); this.status?.setText(`Playback failed: ${state.error}`); }
  }));
  toolbar.createSpan({ cls: 'musescorer-toolbar-separator' });
  iconButton(this, toolbar, 'zoom-out', 'Zoom out', () => this.setZoom(this.zoom / 1.2));
  this.zoomLabel = toolbar.createSpan({ cls: 'musescorer-zoom', text: '100 %' });
  iconButton(this, toolbar, 'zoom-in', 'Zoom in', () => this.setZoom(this.zoom * 1.2));
  iconButton(this, toolbar, 'maximize', 'Fit to width', () => this.setZoom(1));
  this.modeButton = iconButton(this, toolbar, 'rows-3', 'Show all pages', () => this.setMode(this.mode === 'page' ? 'full' : 'page'));
  toolbar.createSpan({ cls: 'musescorer-toolbar-separator' });
  iconButton(this, toolbar, 'pencil', 'Open in score editor', () => {
   const file = this.app.vault.getAbstractFileByPath(this.path);
   if (file instanceof TFile) this.openEditor(file);
  });
  iconButton(this, toolbar, 'external-link', 'Open in MuseScore', () => {
   const file = this.app.vault.getAbstractFileByPath(this.path);
   if (file instanceof TFile) void openInMuseScore(this.app, file);
  });
  iconButton(this, toolbar, 'refresh-cw', 'Reload score', () => { void this.render(); });
  this.viewport = this.containerEl.createDiv({ cls: 'musescorer-viewport', attr: { tabindex: '0', 'aria-label': 'Score pages' } });
  this.pageContainer = this.viewport.createDiv({ cls: 'musescorer-pages' });
  this.status = this.containerEl.createDiv({ cls: 'musescorer-status', attr: { role: 'status', 'aria-live': 'polite' } });
  this.counter = this.containerEl.createDiv({ cls: 'musescorer-page-counter', attr: { 'aria-hidden': 'true' } });
  this.registerDomEvent(this.viewport, 'scroll', () => this.updatePageCounter());
  const observer = new ResizeObserver(() => { this.updatePageHeight(); this.updatePageCounter(); });
  observer.observe(this.viewport);
  this.register(() => observer.disconnect());
  const changed = (file: import('obsidian').TAbstractFile): void => { if (file.path === this.path) { void this.player.stop(this.playbackOwner); this.scheduleRender(); } };
  this.registerEvent(this.app.vault.on('modify', changed));
  this.registerEvent(this.app.vault.on('create', changed));
  this.registerEvent(this.app.vault.on('delete', changed));
  this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { if (oldPath === this.path || file.path === this.path) this.scheduleRender(); }));
  this.register(() => {
   this.generation++;
   this.controller.abort();
   void this.player.stop(this.playbackOwner);
   if (this.debounce) window.clearTimeout(this.debounce);
   this.releasePages();
   this.containerEl.empty();
  });
  void this.render();
 }

 private scheduleRender(): void {
  if (this.debounce) window.clearTimeout(this.debounce);
  this.debounce = window.setTimeout(() => { void this.render(); }, 250);
 }
 private async render(): Promise<void> {
  const generation = ++this.generation;
  this.controller.abort();
  this.controller = new AbortController();
  this.status?.removeClass('musescorer-error');
  this.status?.setText('Loading score …');
  this.containerEl.setAttribute('aria-busy', 'true');
  try {
   const options = parseEmbedOptions(this.source);
   this.path = options.path;
   this.setMode(options.view);
   const file = this.app.vault.getAbstractFileByPath(this.path);
   if (!(file instanceof TFile)) throw new Error(`File not found: ${this.path}`);
   const score = await this.renderer.render(file, () => this.app.vault.readBinary(file), this.controller.signal);
   if (generation !== this.generation) return;
   this.releasePages();
   for (const [index, svg] of score.pages.entries()) {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    this.urls.push(url);
    const wrapper = this.pageContainer?.createDiv({ cls: 'musescorer-page-wrap' });
    const image = wrapper?.createEl('img', { cls: 'musescorer-page', attr: { src: url, alt: `${file.basename} – Page ${index + 1} of ${score.pages.length}`, decoding: 'async' } });
    if (image) {
     image.draggable = false;
     if (wrapper) this.overlays.push(new NoteOverlay(wrapper, svg, index));
     if (index === 0) this.registerDomEvent(image, 'load', () => {
      this.viewport?.style.setProperty('--musescorer-page-ratio', `${image.naturalWidth} / ${image.naturalHeight}`);
      this.updatePageHeight();
      this.updatePageCounter();
     });
    }
   }
   this.setZoom(this.zoom);
   this.status?.setText(`${file.name} · ${score.pages.length} ${score.pages.length === 1 ? 'page' : 'pages'}`);
   this.updatePageCounter();
  } catch (error) {
   if (generation !== this.generation) return;
   this.releasePages();
   this.status?.addClass('musescorer-error');
   const message = error instanceof Error ? error.message : 'Could not load the score.';
   this.status?.setText(message.includes('WebMscore Err') ? 'Could not read the MuseScore file. It is damaged or uses an unsupported format.' : message);
  } finally {
   if (generation === this.generation) this.containerEl.setAttribute('aria-busy', 'false');
  }
 }
 private setMode(mode: EmbedMode): void {
  this.mode = mode;
  this.containerEl.dataset.view = mode;
  if (this.modeButton) {
   setIcon(this.modeButton, mode === 'page' ? 'rows-3' : 'panel-top');
   const label = mode === 'page' ? 'Show all pages' : 'Show scrollable page view';
   this.modeButton.setAttribute('aria-label', label);
   this.modeButton.title = label;
  }
  if (this.previous) this.previous.hidden = mode === 'full';
  if (this.next) this.next.hidden = mode === 'full';
  this.updatePageCounter();
 }
 private currentPage(): number {
  if (!this.viewport || !this.pageContainer) return 0;
  const images = Array.from(this.pageContainer.children) as HTMLElement[];
  const top = this.viewport.getBoundingClientRect().top;
  return Math.max(0, images.findIndex(image => image.getBoundingClientRect().bottom > top + 8));
 }
 private turnPage(direction: number): void {
  const images = this.pageContainer?.children;
  if (!images || !this.viewport) return;
  const target = images.item(Math.max(0, Math.min(images.length - 1, this.currentPage() + direction)));
  if (target) this.viewport.scrollTo({ top: this.viewport.scrollTop + target.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top, behavior: 'auto' });
  this.updatePageCounter();
 }
 private updatePageHeight(): void {
  const image = this.pageContainer?.querySelector('img');
  const height = image?.getBoundingClientRect().height ?? 0;
  if (height > 0) this.viewport?.style.setProperty('--musescorer-page-height', `${height}px`);
 }
 private updatePageCounter(): void {
  const count = this.pageContainer?.children.length ?? 0;
  const page = this.currentPage();
  this.counter?.setText(count ? (this.mode === 'full' ? `${count} ${count === 1 ? 'page' : 'pages'}` : `${page + 1} / ${count}`) : '');
  if (this.previous) this.previous.disabled = page === 0;
  if (this.next) this.next.disabled = page >= count - 1;
 }
 private setZoom(zoom: number): void {
  this.zoom = Math.max(0.25, Math.min(4, zoom));
  this.pageContainer?.style.setProperty('--musescorer-zoom', String(this.zoom));
  this.zoomLabel?.setText(`${Math.round(this.zoom * 100)} %`);
  this.updatePageHeight();
 }
 private releasePages(): void {
  this.overlays = [];
  this.pageContainer?.empty();
  for (const url of this.urls) URL.revokeObjectURL(url);
  this.urls = [];
 }
}
