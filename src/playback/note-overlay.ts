import type { ScorePosition } from '../engine/protocol';

const NS = 'http://www.w3.org/2000/svg';
/** Only safe glyph path data is copied. The original score remains an isolated SVG image. */
export class NoteOverlay {
 private notes: { element: SVGPathElement; x: number; y: number }[] = [];
 private active: SVGPathElement[] = [];
 private key = '';
 constructor(parent: HTMLElement, svgText: string, private page: number) {
  const source = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
  const overlay = document.createElementNS(NS, 'svg');
  overlay.setAttribute('viewBox', source.getAttribute('viewBox') ?? '0 0 2977 4208');
  overlay.setAttribute('class', 'musescorer-note-overlay'); overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.add('is-measuring'); parent.append(overlay);
  for (const original of Array.from(source.querySelectorAll<SVGPathElement>('path.Note, path.Rest'))) {
   const path = document.createElementNS(NS, 'path');
   const data = original.getAttribute('d'); if (!data) continue;
   path.setAttribute('d', data);
   let current: Element | null = original;
   const ancestors: Element[] = [];
   while (current && current !== source) { ancestors.unshift(current); current = current.parentElement; }
   let matrix = new DOMMatrix();
   for (const ancestor of ancestors) {
    const transform = (ancestor as SVGGraphicsElement).transform?.baseVal.consolidate()?.matrix;
    if (transform) matrix = matrix.multiply(new DOMMatrix([transform.a, transform.b, transform.c, transform.d, transform.e, transform.f]));
   }
   path.setAttribute('transform', `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`);
   path.setAttribute('class', 'musescorer-playing-note is-measuring'); overlay.append(path);
   try {
    const box = path.getBBox();
    const centre = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(matrix);
    this.notes.push({ element: path, x: centre.x, y: centre.y });
   } catch { path.remove(); }
   path.classList.remove('is-measuring');
  }
  overlay.classList.remove('is-measuring');
 }
 show(box: ScorePosition | null): void {
  const key = box?.page === this.page ? `${box.id}:${box.x}:${box.y}:${box.sx}:${box.sy}` : '';
  if (key === this.key) return;
  this.key = key;
  for (const element of this.active) element.classList.remove('is-active');
  this.active = [];
  if (!box || box.page !== this.page || box.geometryAvailable === false) return;
  const width = box.width ?? box.sx, height = box.height ?? box.sy;
  // The same ledger-line margin as OTS lib/playback/note-box-match.ts.
  const margin = height * 0.75;
  for (const note of this.notes) if (note.x >= box.x && note.x <= box.x + width && note.y >= box.y - margin && note.y <= box.y + height + margin) {
   note.element.classList.add('is-active'); this.active.push(note.element);
  }
 }
}
