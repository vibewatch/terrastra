import { CATALOGUE } from '../../shared/data/catalogue.ts';
import { CITIES, cityName } from '../../shared/data/cities.ts';
import { type GeoKind } from '../../shared/data/gazetteer.ts';
import { CONTINENT_NAMES } from '../../shared/data/iso.ts';
import type { Lang } from '../../shared/data/types.ts';
import { sphericalPolygonAreaKm2 } from '../../shared/lib/geodesic.ts';
import type { CountryInfo } from './painter.ts';

let byCountryCache: Map<string, number> | null = null;
let capitalByCountryCache: Map<string, string> | null = null;
const areaByFeatureId = new Map<string, number>();

export function formatCountryAreaKm2(km2: number, l: Lang): string {
  if (!(km2 > 0) || !Number.isFinite(km2)) return '';
  if (l === 'zh') {
    if (km2 >= 1_000_000) return `${Math.round(km2 / 10_000)}万 km²`;
    if (km2 >= 10_000) return `${+(km2 / 10_000).toFixed(1)}万 km²`;
    return `${Math.round(km2).toLocaleString('zh-CN')} km²`;
  }
  if (km2 >= 1_000_000) return `${+(km2 / 1_000_000).toFixed(2)}M km²`;
  if (km2 >= 10_000) return `${Math.round(km2 / 1_000).toLocaleString('en-US')}k km²`;
  return `${Math.round(km2).toLocaleString('en-US')} km²`;
}

/** Number of Terrastra catalogue items located in ISO alpha-2 country `a2`. */
export function countryCatalogueCount(a2: string): number {
  if (!a2) return 0;
  if (!byCountryCache) {
    byCountryCache = new Map<string, number>();
    for (const it of CATALOGUE) {
      if (!it.country) continue;
      byCountryCache.set(it.country, (byCountryCache.get(it.country) ?? 0) + 1);
    }
  }
  return byCountryCache.get(a2) ?? 0;
}

/** Capital city name (from CITIES) for ISO alpha-2 country `a2`, if present. */
export function countryCapitalCity(a2: string): string | undefined {
  if (!a2) return undefined;
  if (!capitalByCountryCache) {
    capitalByCountryCache = new Map<string, string>();
    for (const [name, code, , , , isCap] of CITIES) {
      if (isCap && !capitalByCountryCache.has(code)) capitalByCountryCache.set(code, name);
    }
  }
  return capitalByCountryCache.get(a2.toUpperCase());
}

export type LabelBox = [number, number, number, number];

export interface MapLabel {
  text: string;
  cls: string;
  x: number;
  y: number;
  pri: number;
  corner?: boolean;
  geoKey?: string;
}

export interface GeoLabelHit {
  key: string;
  box: LabelBox;
  el: HTMLSpanElement;
}

export function pickGeoLabel(hits: readonly GeoLabelHit[], x: number, y: number, pad = 2): GeoLabelHit | null {
  let best: GeoLabelHit | null = null;
  let bestDist = Infinity;
  for (const h of hits) {
    const [x0, y0, x1, y1] = h.box;
    if (x < x0 - pad || x > x1 + pad || y < y0 - pad || y > y1 + pad) continue;
    const d = Math.hypot(x - (x0 + x1) * 0.5, y - (y0 + y1) * 0.5);
    if (d < bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
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
  const cap = c.a2 !== 'AQ' ? countryCapitalCity(c.a2) : undefined;
  const capLabel = cap ? `🏛️ ${cityName(cap, l)}` : '';
  let areaTxt = '';
  if (c.a2 && c.a2 !== 'AQ' && c.feature?.geometry) {
    let km2 = areaByFeatureId.get(c.id);
    if (km2 === undefined) {
      km2 = sphericalPolygonAreaKm2(c.feature.geometry);
      areaByFeatureId.set(c.id, km2);
    }
    if (km2 >= 500) areaTxt = formatCountryAreaKm2(km2, l);
  }
  const count = countryCatalogueCount(c.a2);
  const countLabel = count > 0 ? (l === 'zh' ? `${count} 处发现` : `${count} ${count === 1 ? 'place' : 'places'}`) : '';
  const subText = [cont, capLabel, areaTxt, countLabel].filter(Boolean).join(' · ');
  if (subText) {
    const sub = document.createElement('small');
    sub.textContent = subText;
    tag.append(sub);
  }
}

const WATER_KINDS = new Set<GeoKind>(['ocean', 'sea', 'trench', 'strait', 'canal', 'river', 'lake']);

export function geoLabelClass(kind: GeoKind): string {
  return WATER_KINDS.has(kind) ? 'lb-geo lb-geo-water' : 'lb-geo lb-geo-land';
}

export function labelRank(lb: MapLabel): number {
  if (lb.cls.includes('lb-geo-focus')) return 4;
  return lb.cls.includes('lb-provcap') ? 3 : lb.cls.startsWith('lb-country') ? 2 : lb.cls.startsWith('lb-admin') ? 1 : 0;
}

export function textWidthPx(s: string, perChar: number): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e80 ? 1.8 : 1;
  return w * perChar + 10;
}

export function labelBox(lb: MapLabel): LabelBox {
  const perChar = lb.cls.includes('lb-geo-focus') ? 8.2 : lb.cls.startsWith('lb-country') ? 8 : 6.5;
  const w = textWidthPx(lb.text, perChar) + (lb.cls.includes('lb-geo-focus') ? 12 : 0), hh = lb.cls.includes('lb-geo-focus') ? 22 : 16;
  const cx = lb.corner ? lb.x + w / 2 + 2 : lb.x, cy = lb.corner ? lb.y - hh / 2 - 1 : lb.y;
  return [cx - w / 2, cy - hh / 2, cx + w / 2, cy + hh / 2];
}

export function overlapsBox(boxes: readonly LabelBox[], bx: LabelBox): boolean {
  return boxes.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1]);
}

const GEO_NUDGES: readonly (readonly [number, number])[] = [[0, 0], [0, 18], [0, -18], [22, 10], [-22, -10]];

export function renderLabelPool(
  container: HTMLElement,
  pool: HTMLSpanElement[],
  labels: readonly MapLabel[],
  maxLabels: number,
  beforeLowRank?: (boxes: LabelBox[]) => void,
  outGeoHits?: GeoLabelHit[],
): void {
  const boxes: LabelBox[] = [];
  if (outGeoHits) outGeoHits.length = 0;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  let used = 0;
  let lowRankDone = !beforeLowRank;
  for (const lb of labels) {
    if (!lowRankDone && !labelRank(lb)) {
      lowRankDone = true;
      beforeLowRank!(boxes);
    }
    const base = labelBox(lb);
    let bx: LabelBox | null = null;
    let dxUsed = 0;
    let dyUsed = 0;
    if (lb.geoKey && !lb.corner) {
      for (const [dx, dy] of GEO_NUDGES) {
        const cand: LabelBox = dx || dy ? [base[0] + dx, base[1] + dy, base[2] + dx, base[3] + dy] : base;
        if ((dx || dy) && (cand[0] < 4 || (cw > 0 && cand[2] > cw - 4) || cand[1] < 4 || (ch > 0 && cand[3] > ch - 4))) continue;
        if (!overlapsBox(boxes, cand)) {
          bx = cand;
          dxUsed = dx;
          dyUsed = dy;
          break;
        }
      }
    } else if (!overlapsBox(boxes, base)) {
      bx = base;
    }
    if (!bx) continue;
    boxes.push(bx);
    let el = pool[used];
    if (!el) {
      el = document.createElement('span');
      container.append(el);
      pool.push(el);
    }
    if (el.textContent !== lb.text) el.textContent = lb.text;
    if (el.className !== lb.cls) el.className = lb.cls;
    if (lb.geoKey) {
      el.dataset.geoKey = lb.geoKey;
      outGeoHits?.push({ key: lb.geoKey, box: bx, el });
    } else if (el.dataset.geoKey) {
      delete el.dataset.geoKey;
    }
    el.style.display = '';
    el.style.transform = `translate(${(lb.x + dxUsed).toFixed(1)}px,${(lb.y + dyUsed).toFixed(1)}px) ` + (lb.corner ? 'translate(3px,-100%)' : 'translate(-50%,-50%)');
    used++;
    if (used > maxLabels) break;
  }
  if (!lowRankDone) beforeLowRank!(boxes);
  for (let i = used; i < pool.length; i++) {
    pool[i].style.display = 'none';
    if (pool[i].dataset.geoKey) delete pool[i].dataset.geoKey;
  }
}
