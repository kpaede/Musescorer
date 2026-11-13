import type { ScorePosition } from '../engine/protocol';
import type { EmbedMode } from '../embed-options';

/** Keep the audible segment visible without scrolling unrelated leaves or the application window. */
export function followScore(box: ScorePosition, viewport: HTMLElement, pages: HTMLElement, mode: EmbedMode): void {
 if (box.geometryAvailable === false) return;
 const page = pages.children.item(box.page);
 const svg = page?.querySelector('svg');
 if (!(page instanceof HTMLElement) || !svg) return;
 const paper = page.getBoundingClientRect();
 const units = svg.viewBox.baseVal;
 if (!paper.width || !paper.height || !units.width || !units.height) return;
 const scaleX = paper.width / units.width, scaleY = paper.height / units.height;
 const left = paper.left + (box.x - units.x) * scaleX;
 const top = paper.top + (box.y - units.y) * scaleY;
 const right = left + (box.width ?? box.sx) * scaleX;
 const bottom = top + (box.height ?? box.sy) * scaleY;
 if (![left, top, right, bottom].every(Number.isFinite)) return;

 const vertical = mode === 'page' ? viewport : documentScroller(viewport);
 if (vertical) {
  const bounds = vertical.getBoundingClientRect();
  const margin = Math.min(48, vertical.clientHeight * 0.1);
  if (top < bounds.top + margin || bottom > bounds.top + vertical.clientHeight - margin) {
   const lead = Math.min(160, vertical.clientHeight * 0.25);
   vertical.scrollTo({ top: vertical.scrollTop + top - bounds.top - lead, behavior: 'auto' });
  }
 }
 // Zoom can require horizontal following even in full view; horizontal overflow stays inside the embed.
 const bounds = viewport.getBoundingClientRect();
 if (left < bounds.left || right > bounds.left + viewport.clientWidth) {
  viewport.scrollTo({ left: viewport.scrollLeft + left - bounds.left - viewport.clientWidth * 0.15, behavior: 'auto' });
 }
}

function documentScroller(viewport: HTMLElement): HTMLElement | null {
 for (let parent = viewport.parentElement; parent; parent = parent.parentElement) {
  if (parent.matches('.workspace-leaf-content')) break;
  if (/^(?:auto|scroll)$/u.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight + 1) return parent;
 }
 return null;
}
