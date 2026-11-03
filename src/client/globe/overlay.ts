import { CONTINENT_NAMES } from '../../shared/data/iso.ts';
import type { Lang } from '../../shared/data/types.ts';
import type { CountryInfo } from './painter.ts';

export type LabelBox = [number, number, number, number];

export interface MapLabel {
  text: string;
  cls: string;
  x: number;
  y: number;
  pri: number;
  corner?: boolean;
}

export const NAMED_PARALLELS: readonly [string, number][] = [
  ['equator', 0],
  ['tropicN', 23.436],
  ['tropicS', -23.436],
  ['arcticC', 66.564],
  ['antarcticC', -66.564],
];

export function formatDeg(v: number, pos: string, neg: string): string {
  return v === 0 ? '0°' : `${Math.abs(v)}°${v > 0 ? pos : neg}`;
}

export function countryDisplayName(c: CountryInfo, l: Lang): string {
  if (!c.a2 || c.a2 === 'XK') return c.name;
  try { return new Intl.DisplayNames([l], { type: 'region' }).of(c.a2) ?? c.name; } catch { return c.name; }
}

export function countryMapLabel(c: CountryInfo, l: Lang, cache: Map<string, string>): string {
  const k = l + c.a2;
  let s = cache.get(k);
  if (!s) {
    s = countryDisplayName(c, l);
    if (l === 'en') s = s.toUpperCase();
    cache.set(k, s);
  }
  return s;
}

export function fillCountryTag(tag: HTMLElement, c: CountryInfo, l: Lang): void {
  tag.replaceChildren(document.createTextNode(countryDisplayName(c, l)));
  const cont = c.a2 !== 'AQ' ? CONTINENT_NAMES[c.continent]?.[l] ?? CONTINENT_NAMES[c.continent]?.en : '';
  if (cont) {
    const sub = document.createElement('small');
    sub.textContent = cont;
    tag.append(sub);
  }
}

export function labelRank(lb: MapLabel): number {
  return lb.cls.includes('lb-provcap') ? 3 : lb.cls.startsWith('lb-country') ? 2 : lb.cls.startsWith('lb-admin') ? 1 : 0;
}

export function textWidthPx(s: string, perChar: number): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e80 ? 1.8 : 1;
  return w * perChar + 10;
}

export function labelBox(lb: MapLabel): LabelBox {
  const w = textWidthPx(lb.text, lb.cls.startsWith('lb-country') ? 8 : 6.5), hh = 16;
  const cx = lb.corner ? lb.x + w / 2 + 2 : lb.x, cy = lb.corner ? lb.y - hh / 2 - 1 : lb.y;
  return [cx - w / 2, cy - hh / 2, cx + w / 2, cy + hh / 2];
}

export function overlapsBox(boxes: readonly LabelBox[], bx: LabelBox): boolean {
  return boxes.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1]);
}

export function renderLabelPool(
  container: HTMLElement,
  pool: HTMLSpanElement[],
  labels: readonly MapLabel[],
  maxLabels: number,
  beforeLowRank?: (boxes: LabelBox[]) => void,
): void {
  const boxes: LabelBox[] = [];
  let used = 0;
  let lowRankDone = !beforeLowRank;
  for (const lb of labels) {
    if (!lowRankDone && !labelRank(lb)) {
      lowRankDone = true;
      beforeLowRank!(boxes);
    }
    const bx = labelBox(lb);
    if (overlapsBox(boxes, bx)) continue;
    boxes.push(bx);
    let el = pool[used];
    if (!el) {
      el = document.createElement('span');
      container.append(el);
      pool.push(el);
    }
    if (el.textContent !== lb.text) el.textContent = lb.text;
    if (el.className !== lb.cls) el.className = lb.cls;
    el.style.display = '';
    el.style.transform = `translate(${lb.x.toFixed(1)}px,${lb.y.toFixed(1)}px) ` + (lb.corner ? 'translate(3px,-100%)' : 'translate(-50%,-50%)');
    used++;
    if (used > maxLabels) break;
  }
  if (!lowRankDone) beforeLowRank!(boxes);
  for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
}
