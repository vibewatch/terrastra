/**
 * Figures for the lesson card: the charts and diagrams a geography textbook prints next to its maps. Climate
 * graphs, line and bar charts, donuts and population pyramids are drawn from data; a handful of classic diagrams
 * (the water cycle, contour lines, the rock cycle…) are hand-made SVG. Everything is plain SVG markup with CSS
 * animations (bars grow, lines draw in, flows move), so a figure costs nothing once drawn.
 */
import type { Pair } from './stage.ts';
import { BIOMES, CLIMATES, type Biome, type Climate } from './climate.ts';

export type Lx = (p: Pair) => string;

/** Climate normals (approximate 1991–2020 means): °C and mm per month. */
export const CITIES = {
  singapore: { name: ['Singapore', '新加坡'], cl: 'rainforest', T: [26.5, 27.1, 27.6, 28.0, 28.4, 28.4, 28.0, 27.9, 27.7, 27.6, 27.0, 26.5], P: [222, 105, 170, 165, 165, 135, 155, 170, 165, 160, 255, 290] },
  mumbai: { name: ['Mumbai', '孟买'], cl: 'tmonsoon', T: [24.4, 25.2, 27.0, 28.6, 30.1, 29.0, 27.6, 27.3, 27.7, 28.7, 27.9, 26.0], P: [1, 0, 0, 1, 12, 520, 840, 560, 330, 90, 15, 4] },
  darwin: { name: ['Darwin', '达尔文'], cl: 'savanna', T: [28.4, 28.2, 28.2, 28.0, 26.6, 24.9, 24.6, 25.4, 27.4, 28.8, 29.2, 28.9], P: [425, 375, 320, 100, 20, 2, 1, 5, 15, 70, 140, 250] },
  cairo: { name: ['Cairo', '开罗'], cl: 'desert', T: [14.0, 15.2, 17.6, 21.3, 24.8, 27.2, 27.9, 28.1, 26.3, 23.5, 19.3, 15.5], P: [5, 4, 4, 1, 1, 0, 0, 0, 0, 1, 3, 6] },
  rome: { name: ['Rome', '罗马'], cl: 'med', T: [7.6, 8.5, 11.0, 13.7, 18.0, 22.0, 24.9, 25.2, 21.5, 17.2, 12.1, 8.6], P: [67, 73, 58, 81, 53, 34, 19, 37, 73, 113, 111, 81] },
  capetown: { name: ['Cape Town', '开普敦'], cl: 'med', T: [21.3, 21.6, 20.4, 18.0, 15.8, 13.9, 13.1, 13.4, 14.7, 16.6, 18.6, 20.2], P: [14, 17, 20, 42, 68, 93, 82, 77, 40, 30, 14, 15] },
  guangzhou: { name: ['Guangzhou', '广州'], cl: 'smonsoon', T: [13.6, 14.9, 17.9, 22.0, 25.5, 27.6, 28.8, 28.7, 27.6, 24.9, 20.6, 15.5], P: [53, 51, 97, 184, 292, 342, 260, 268, 189, 62, 38, 33] },
  shanghai: { name: ['Shanghai', '上海'], cl: 'smonsoon', T: [4.8, 6.3, 10.0, 15.4, 20.6, 24.5, 28.7, 28.4, 24.6, 19.6, 13.6, 7.3], P: [75, 63, 103, 90, 103, 192, 149, 214, 105, 58, 55, 44] },
  sydney: { name: ['Sydney', '悉尼'], cl: 'smonsoon', T: [23.5, 23.4, 22.1, 19.5, 16.6, 14.2, 13.4, 14.5, 17.0, 19.0, 20.4, 22.1], P: [92, 130, 115, 110, 100, 120, 70, 75, 60, 75, 85, 75] },
  london: { name: ['London', '伦敦'], cl: 'maritime', T: [5.2, 5.3, 7.6, 9.9, 13.3, 16.5, 18.7, 18.5, 15.7, 12.0, 8.0, 5.5], P: [55, 41, 42, 44, 49, 45, 45, 50, 49, 69, 59, 55] },
  beijing: { name: ['Beijing', '北京'], cl: 'tmonsoon2', T: [-3.1, 0.3, 6.7, 14.8, 20.8, 24.9, 26.7, 25.5, 20.8, 13.7, 5.0, -0.9], P: [3, 6, 9, 26, 35, 78, 185, 160, 46, 22, 10, 3] },
  harbin: { name: ['Harbin', '哈尔滨'], cl: 'tmonsoon2', T: [-17.6, -12.6, -3.3, 7.3, 15.1, 21.1, 23.5, 21.8, 15.4, 6.1, -5.1, -14.6], P: [5, 7, 15, 25, 45, 95, 160, 130, 60, 25, 12, 7] },
  moscow: { name: ['Moscow', '莫斯科'], cl: 'continental', T: [-6.2, -5.9, -0.7, 6.9, 13.2, 17.0, 19.2, 17.0, 11.3, 5.6, -0.4, -4.4], P: [52, 41, 35, 37, 49, 80, 85, 82, 68, 71, 55, 52] },
  urumqi: { name: ['Ürümqi', '乌鲁木齐'], cl: 'continental', T: [-12.6, -9.7, -0.7, 10.4, 17.4, 22.4, 24.4, 23.0, 16.7, 7.8, -2.2, -9.6], P: [11, 10, 18, 30, 33, 36, 25, 23, 20, 23, 17, 13] },
  newyork: { name: ['New York', '纽约'], cl: 'smonsoon', T: [0.5, 1.8, 5.7, 11.8, 17.3, 22.4, 25.5, 24.9, 21.0, 14.9, 9.3, 3.8], P: [92, 80, 110, 105, 105, 110, 117, 107, 100, 104, 92, 102] },
  yakutsk: { name: ['Yakutsk', '雅库茨克'], cl: 'subarctic', T: [-38.6, -33.8, -20.1, -4.8, 7.5, 16.4, 19.5, 15.2, 6.1, -7.8, -27.0, -37.6], P: [8, 7, 6, 9, 21, 35, 41, 39, 24, 17, 13, 9] },
  utqiagvik: { name: ['Utqiaġvik (Alaska)', '乌特恰维克（阿拉斯加）'], cl: 'tundra', T: [-25.4, -26.9, -25.6, -17.4, -6.4, 1.8, 4.9, 3.4, -0.4, -9.2, -18.0, -23.1], P: [4, 4, 3, 4, 4, 10, 26, 25, 17, 11, 6, 4] },
  lhasa: { name: ['Lhasa', '拉萨'], cl: 'highland', T: [-0.3, 2.6, 6.2, 9.2, 13.2, 16.5, 16.3, 15.4, 13.8, 9.3, 3.7, 0.1], P: [1, 1, 3, 6, 26, 78, 129, 128, 57, 9, 2, 1] },
} satisfies Record<string, { name: Pair; cl: Climate; T: number[]; P: number[] }>;
export type CityId = keyof typeof CITIES;

/** Population by age (% of all people in each 10-year band, men and women), about 2020–2023. */
export const PYRAMIDS = {
  niger: { name: ['Niger', '尼日尔'], m: [16.6, 11.6, 7.4, 5.4, 3.7, 2.5, 1.5, 0.8, 0.3], f: [16.2, 11.4, 7.6, 5.6, 3.8, 2.5, 1.5, 0.9, 0.4] },
  india: { name: ['India', '印度'], m: [8.8, 9.4, 9.0, 7.9, 6.3, 4.7, 3.0, 1.4, 0.5], f: [8.1, 8.6, 8.5, 7.6, 6.2, 4.8, 3.1, 1.6, 0.6] },
  china: { name: ['China', '中国'], m: [6.4, 6.0, 6.6, 7.9, 7.4, 8.1, 5.2, 2.4, 1.1], f: [5.7, 5.2, 6.1, 7.5, 7.2, 7.9, 5.4, 2.7, 1.5] },
  usa: { name: ['USA', '美国'], m: [6.0, 6.6, 6.9, 6.9, 6.3, 6.3, 5.8, 3.5, 1.6], f: [5.8, 6.3, 6.7, 6.8, 6.3, 6.4, 6.2, 4.0, 2.4] },
  japan: { name: ['Japan', '日本'], m: [3.5, 4.3, 5.1, 5.5, 7.1, 7.0, 6.0, 6.2, 3.7], f: [3.4, 4.1, 4.9, 5.3, 6.9, 7.0, 6.2, 7.2, 6.3] },
} satisfies Record<string, { name: Pair; m: number[]; f: number[] }>;
export type PyramidId = keyof typeof PYRAMIDS;

export const DIAGRAMS = ['watercycle', 'contour', 'rockcycle', 'river', 'coast', 'greenhouse', 'scale', 'compass', 'weather', 'earth', 'valleys'] as const;
export type DiagramId = (typeof DIAGRAMS)[number];

export interface Series { name: Pair; c: string; y: (number | null)[] }
export type Fig =
  /** a climate graph (monthly temperature line, rainfall bars); `b` puts a second one beside it */
  | { k: 'climo'; city: CityId; b?: CityId; /** hide the city and type, for "which climate is this?" */ blind?: boolean }
  /** a line chart over numeric x (years…) */
  | { k: 'line'; title: Pair; unit: Pair; x: number[]; series: Series[]; notes?: { x: number; text: Pair }[]; min?: number; max?: number }
  /** horizontal bars */
  | { k: 'bars'; title: Pair; unit: Pair; rows: { name: Pair; v: number; c?: string }[] }
  /** a donut of shares */
  | { k: 'pie'; title: Pair; parts: { name: Pair; v: number; c: string }[] }
  /** one or two population pyramids */
  | { k: 'pyramid'; a: PyramidId; b?: PyramidId }
  /** a map key: the climate or biome palette, or custom swatches */
  | { k: 'key'; set: 'climate'; only?: Climate[] }
  | { k: 'key'; set: 'biome'; only?: Biome[] }
  | { k: 'key'; set: 'custom'; title?: Pair; items: { c: string; name: Pair }[] }
  /** a hand-drawn diagram */
  | { k: 'dia'; id: DiagramId }
  /** a custom diagram drawn by the lesson file; `id` is unique per figure (for marker/gradient ids) */
  | { k: 'svg'; draw: (L: Lx, id: string) => string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (v: number) => Math.round(v * 10) / 10;
let uid = 0;

/** SVG text. `a`: anchor (s, m, e); `c`: class. */
/** Wraps SVG so it fades in after `d` seconds (the figure's build-up order). */
export const fade = (d: number, s: string) => `<g class="f-fade" style="--d:${d}s">${s}</g>`;
/** A small filled marker at (x, y). */
export const dot = (x: number, y: number, c = '#f1f3f5', r = 2.4) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${c}"/>`;
export const tx = (x: number, y: number, s: string, c = '', a: 's' | 'm' | 'e' = 's', extra = '') =>
  `<text x="${r1(x)}" y="${r1(y)}" class="${c}" text-anchor="${a === 's' ? 'start' : a === 'm' ? 'middle' : 'end'}"${extra}>${esc(s)}</text>`;
export const svg = (w: number, h: number, body: string, label: string) =>
  `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="fig-svg">${body}</svg>`;
export const arrowDef = (id: string, c = 'currentColor') =>
  `<defs><marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker></defs>`;

/** Round, readable axis steps. */
function niceTicks(lo: number, hi: number, n = 4): { lo: number; hi: number; step: number } {
  const raw = (hi - lo) / n || 1, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(r1(v)));

// ---------------------------------------------------------------- climate graph
function climoPanel(L: Lx, id: CityId, ox: number, w: number, blind: boolean, compact: boolean): string {
  const c = CITIES[id];
  const x0 = ox + 26, x1 = ox + w - 26, y0 = 40, y1 = 136, mw = (x1 - x0) / 12;
  const tmin = Math.min(-10, Math.floor(Math.min(...c.T) / 10) * 10), tmax = Math.max(30, Math.ceil(Math.max(...c.T) / 10) * 10);
  const pmax = Math.max(100, Math.ceil(Math.max(...c.P) / 100) * 100);
  const ty = (t: number) => y1 - ((t - tmin) / (tmax - tmin)) * (y1 - y0), py = (p: number) => y1 - (p / pmax) * (y1 - y0);
  let o = '';
  for (let t = tmin; t <= tmax; t += 10) {
    o += `<line x1="${x0}" x2="${x1}" y1="${r1(ty(t))}" y2="${r1(ty(t))}" class="${t === 0 ? 'fg-zero' : 'fg-grid'}"/>`;
    o += tx(x0 - 3, ty(t) + 3, String(t), 'fg-tick', 'e');
  }
  for (let k = 0; k <= 4; k++) o += tx(x1 + 3, py((pmax * k) / 4) + 3, String((pmax * k) / 4), 'fg-tick fg-p', 's');
  c.P.forEach((p, m) => {
    const y = py(p);
    o += `<rect x="${r1(x0 + m * mw + mw * 0.15)}" y="${r1(y)}" width="${r1(mw * 0.7)}" height="${r1(y1 - y)}" class="fg-bar f-grow" style="--d:${m * 0.04}s"/>`;
  });
  const pts = c.T.map((t, m) => `${r1(x0 + (m + 0.5) * mw)},${r1(ty(t))}`).join(' ');
  o += `<polyline points="${pts}" class="fg-temp f-draw" pathLength="1"/>`;
  c.T.forEach((t, m) => { o += `<circle cx="${r1(x0 + (m + 0.5) * mw)}" cy="${r1(ty(t))}" r="1.8" class="fg-tdot f-fade" style="--d:${0.6 + m * 0.05}s"/>`; });
  for (let m = 0; m < 12; m++) if (!compact || m % 2 === 0) o += tx(x0 + (m + 0.5) * mw, y1 + 10, String(m + 1), 'fg-tick', 'm');
  o += tx(x0 - 3, y0 - 5, '°C', 'fg-tick fg-t', 'e') + tx(x1 + 3, y0 - 5, 'mm', 'fg-tick fg-p', 's');
  const mean = c.T.reduce((a, b) => a + b, 0) / 12, sum = c.P.reduce((a, b) => a + b, 0);
  const head = blind ? L(['Mystery place', '某地']) : `${L(c.name)} · ${L(CLIMATES[c.cl].name)}`;
  o += tx(ox + (compact ? 4 : 6), 12, head, 'fg-title');
  o += tx(ox + (compact ? 4 : 6), 23, L([`mean ${r1(mean)} °C · ${fmt(Math.round(sum))} mm a year`, `年均温 ${r1(mean)} °C · 年降水 ${fmt(Math.round(sum))} 毫米`]), 'fg-sub');
  return o;
}
function climo(L: Lx, f: Extract<Fig, { k: 'climo' }>): string {
  const label = L(['Climate graph', '气候资料图']);
  if (!f.b) return svg(320, 152, climoPanel(L, f.city, 0, 320, !!f.blind, false), label);
  return svg(340, 152, climoPanel(L, f.city, 0, 170, !!f.blind, true) + climoPanel(L, f.b, 170, 170, !!f.blind, true), label);
}

// ---------------------------------------------------------------- line chart
function line(L: Lx, f: Extract<Fig, { k: 'line' }>): string {
  const x0 = 34, x1 = 300, y0 = f.series.length > 1 ? 38 : 28, y1 = 128;
  const all = f.series.flatMap(s => s.y.filter((v): v is number => v !== null));
  const { lo, hi, step } = niceTicks(f.min ?? Math.min(0, ...all), f.max ?? Math.max(...all));
  const xa = f.x[0], xb = f.x[f.x.length - 1];
  const X = (v: number) => x0 + ((v - xa) / (xb - xa || 1)) * (x1 - x0), Y = (v: number) => y1 - ((v - lo) / (hi - lo || 1)) * (y1 - y0);
  let o = tx(4, 12, L(f.title), 'fg-title') + tx(4, 23, L(f.unit), 'fg-sub');
  for (let v = lo; v <= hi + 1e-9; v += step) o += `<line x1="${x0}" x2="${x1}" y1="${r1(Y(v))}" y2="${r1(Y(v))}" class="fg-grid"/>` + tx(x0 - 3, Y(v) + 3, fmt(v), 'fg-tick', 'e');
  const every = Math.max(1, Math.ceil(f.x.length / 6));
  f.x.forEach((v, i) => { if (i % every === 0 || i === f.x.length - 1) o += tx(X(v), y1 + 11, String(v), 'fg-tick', 'm'); });
  for (const n of f.notes ?? []) o += `<line x1="${r1(X(n.x))}" x2="${r1(X(n.x))}" y1="${y0}" y2="${y1}" class="fg-note f-fade" style="--d:1s"/>` + tx(X(n.x) + 2, y0 + 8, L(n.text), 'fg-sub f-fade', 's', ' style="--d:1.1s"');
  f.series.forEach((s, k) => {
    const pts = f.x.map((v, i) => (s.y[i] === null ? null : `${r1(X(v))},${r1(Y(s.y[i]!))}`)).filter(Boolean).join(' ');
    o += `<polyline points="${pts}" class="fg-line f-draw" pathLength="1" style="stroke:${s.c};--d:${k * 0.3}s"/>`;
    if (f.series.length > 1) o += `<rect x="${x0 + k * 96}" y="${y0 - 12}" width="10" height="3" fill="${s.c}"/>` + tx(x0 + 13 + k * 96, y0 - 8, L(s.name), 'fg-sub');
  });
  return svg(320, 140, o, L(f.title));
}

// ---------------------------------------------------------------- bars and donut
function bars(L: Lx, f: Extract<Fig, { k: 'bars' }>): string {
  const top = 30, rh = 17, x0 = 112, x1 = 272, max = Math.max(...f.rows.map(r => r.v));
  let o = tx(4, 12, L(f.title), 'fg-title') + tx(4, 23, L(f.unit), 'fg-sub');
  f.rows.forEach((r, i) => {
    const y = top + i * rh, w = Math.max(1, (r.v / max) * (x1 - x0));
    o += tx(x0 - 5, y + 10, L(r.name), 'fg-label', 'e');
    o += `<rect x="${x0}" y="${y + 2}" width="${r1(w)}" height="${rh - 6}" rx="2" class="f-growx" style="fill:${r.c ?? '#4dabf7'};--d:${i * 0.08}s"/>`;
    o += tx(x0 + w + 4, y + 10, fmt(r.v), 'fg-tick f-fade', 's', ` style="--d:${0.5 + i * 0.08}s"`);
  });
  return svg(320, top + f.rows.length * rh + 4, o, L(f.title));
}
function pie(L: Lx, f: Extract<Fig, { k: 'pie' }>): string {
  const total = f.parts.reduce((a, p) => a + p.v, 0), R = 38, C = 2 * Math.PI * R;
  let o = tx(4, 12, L(f.title), 'fg-title'), acc = 0;
  f.parts.forEach((p, i) => {
    const len = (p.v / total) * C;
    o += `<circle cx="66" cy="${86}" r="${R}" fill="none" stroke="${p.c}" stroke-width="22" stroke-dasharray="${r1(len)} ${r1(C - len)}" stroke-dashoffset="${r1(-acc)}" transform="rotate(-90 66 86)" class="f-fade" style="--d:${i * 0.12}s"/>`;
    acc += len;
    const y = 34 + i * 16;
    o += `<rect x="128" y="${y - 8}" width="10" height="10" rx="2" fill="${p.c}"/>` + tx(143, y + 1, `${L(p.name)}  ${r1((p.v / total) * 100)}%`, 'fg-label');
  });
  return svg(320, Math.max(140, 34 + f.parts.length * 16), o, L(f.title));
}

// ---------------------------------------------------------------- population pyramid
const BANDS = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80+'];
function pyramidPanel(L: Lx, id: PyramidId, ox: number, w: number, max: number): string {
  const p = PYRAMIDS[id], cx = ox + w / 2, half = w / 2 - 18, top = 30, rh = 11;
  let o = tx(cx, 12, L(p.name), 'fg-title', 'm') + tx(cx - 14, 24, L(['Male', '男']), 'fg-sub', 'e') + tx(cx + 14, 24, L(['Female', '女']), 'fg-sub', 's');
  for (let i = 0; i < 9; i++) {
    const y = top + (8 - i) * rh, wm = (p.m[i] / max) * half, wf = (p.f[i] / max) * half;
    o += `<rect x="${r1(cx - 12 - wm)}" y="${y}" width="${r1(wm)}" height="${rh - 2}" class="fg-male f-growx f-rtl" style="--d:${i * 0.05}s"/>`;
    o += `<rect x="${cx + 12}" y="${y}" width="${r1(wf)}" height="${rh - 2}" class="fg-female f-growx" style="--d:${i * 0.05}s"/>`;
    o += tx(cx, y + 7.5, BANDS[i], 'fg-band', 'm');
  }
  const old = [...p.m.slice(6), ...p.f.slice(6)].reduce((a, b) => a + b, 0);
  const kids = p.m[0] + p.f[0] + (p.m[1] + p.f[1]) / 2;
  o += tx(cx, top + 9 * rh + 11, L([`under 15 ≈ ${Math.round(kids)}% · 60+ ≈ ${Math.round(old)}%`, `15 岁以下约 ${Math.round(kids)}% · 60 岁以上约 ${Math.round(old)}%`]), 'fg-sub', 'm');
  return o;
}
function pyramid(L: Lx, f: Extract<Fig, { k: 'pyramid' }>): string {
  const ids = f.b ? [f.a, f.b] : [f.a];
  const max = Math.max(...ids.flatMap(id => [...PYRAMIDS[id].m, ...PYRAMIDS[id].f]));
  const w = f.b ? 170 : 320;
  return svg(f.b ? 340 : 320, 142, ids.map((id, i) => pyramidPanel(L, id, i * w, w, max)).join(''), L(['Population pyramid', '人口金字塔']));
}

// ---------------------------------------------------------------- map key
function key(L: Lx, f: Extract<Fig, { k: 'key' }>): string {
  const items = f.set === 'custom' ? f.items
    : f.set === 'climate' ? (f.only ?? (Object.keys(CLIMATES) as Climate[])).map(k => CLIMATES[k])
      : (f.only ?? (Object.keys(BIOMES) as Biome[])).map(k => BIOMES[k]);
  const title = f.set === 'custom' ? f.title : undefined;
  return `<div class="fig-key">${title ? `<strong>${esc(L(title))}</strong>` : ''}${items.map((it, i) => `<span class="f-fade" style="--d:${i * 0.05}s"><i style="background:${it.c}"></i>${esc(L(it.name))}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- diagrams
const cloud = (x: number, y: number, s = 1, c = 'fg-cloud') => `<g class="${c}" transform="translate(${x} ${y}) scale(${s})"><circle cx="-12" cy="4" r="9"/><circle cx="0" cy="-2" r="12"/><circle cx="13" cy="4" r="9"/><rect x="-21" y="4" width="43" height="9" rx="4"/></g>`;

const DIA: Record<DiagramId, (L: Lx, id: string) => string> = {
  watercycle: (L, id) => svg(320, 160, arrowDef(id, '#a5d8ff') + `
    <path d="M0 132 Q20 127 40 132 T80 132 T120 132 T150 134 L150 160 L0 160 Z" class="fg-sea"/>
    <path d="M140 160 L140 138 L180 130 L215 96 L245 64 L262 56 L282 72 L320 92 L320 160 Z" class="fg-land"/>
    <path d="M245 64 L262 56 L282 72 L270 70 L258 64 Z" fill="#f8f9fa" opacity=".9"/>
    <circle cx="28" cy="24" r="11" class="fg-sun"/>
    ${cloud(92, 34)}${cloud(232, 28, 1.1)}
    <path d="M55 124 q-5 -10 0 -20 t0 -20 t0 -18" class="fg-flowline f-flow" marker-end="url(#${id})"/>
    <path d="M95 124 q-5 -10 0 -20 t0 -20 t0 -18" class="fg-flowline f-flow" marker-end="url(#${id})"/>
    <path d="M118 30 L196 26" class="fg-flowline f-flow" marker-end="url(#${id})"/>
    <g class="fg-rain">${[214, 224, 234, 244, 254].map((x, i) => `<line x1="${x}" y1="${46 + (i % 2) * 3}" x2="${x - 4}" y2="${60 + (i % 2) * 3}"/>`).join('')}</g>
    <path d="M168 126 l0 -8 M168 118 a7 7 0 1 1 0.1 0" class="fg-tree"/>
    <path d="M168 104 q-4 -6 0 -12 t0 -12" class="fg-flowline f-flow" marker-end="url(#${id})"/>
    <path d="M262 78 Q240 100 214 112 T170 134 T132 138" class="fg-river f-flow" marker-end="url(#${id})"/>
    <path d="M232 140 L232 152 L150 152 L118 150" class="fg-ground f-flow" marker-end="url(#${id})"/>
    ${tx(64, 96, L(['Evaporation', '蒸发']), 'fg-label', 's')}
    ${tx(157, 18, L(['Water vapour carried by wind', '水汽输送']), 'fg-label', 'm')}
    ${tx(262, 54, L(['Precipitation', '降水']), 'fg-label', 's')}
    ${tx(160, 86, L(['Transpiration', '植物蒸腾']), 'fg-label', 'e')}
    ${tx(222, 122, L(['Surface runoff', '地表径流']), 'fg-label', 's')}
    ${tx(238, 154, L(['Infiltration · groundwater', '下渗 · 地下径流']), 'fg-sub', 's')}
    ${tx(8, 152, L(['Ocean', '海洋']), 'fg-label', 's')}`, L(['The water cycle', '水循环示意图'])),

  contour: (L, id) => {
    const A = [[40, 62, 40], [44, 50, 31], [48, 38, 22], [52, 24, 13], [56, 11, 6]] as const; // left edge, rx, ry
    const B = [[190, 40, 30], [204, 26, 20], [218, 12, 9]] as const;
    let o = arrowDef(id) + `<ellipse cx="150" cy="52" rx="128" ry="46" class="fg-contour"/>`;
    A.forEach(([l, rx, ry], i) => { o += `<ellipse cx="${l + rx}" cy="52" rx="${rx}" ry="${ry}" class="fg-contour f-fade" style="--d:${0.1 + i * 0.12}s"/>`; });
    B.forEach(([l, rx, ry], i) => { o += `<ellipse cx="${l + rx}" cy="54" rx="${rx}" ry="${ry}" class="fg-contour f-fade" style="--d:${0.1 + i * 0.12}s"/>`; });
    o += tx(28, 50, '100', 'fg-tick', 'm') + tx(150, 102, L(['contour interval 100 m', '等高距 100 米']), 'fg-sub', 'm');
    o += `<path d="M66 52 l-3 5 h6 z" fill="#ffd24a"/>` + tx(66, 47, L(['Peak 560 m', '山顶 560 米']), 'fg-label', 'm');
    o += `<path d="M230 54 l-3 5 h6 z" fill="#ffd24a"/>` + tx(230, 47, L(['Peak 440 m', '山顶 440 米']), 'fg-label', 'm');
    o += `<circle cx="177" cy="53" r="2.5" fill="#ff922b"/>` + tx(177, 76, L(['Saddle', '鞍部']), 'fg-label', 'm');
    o += tx(36, 22, L(['lines close: steep', '等高线密：坡陡']), 'fg-sub', 's') + tx(120, 22, L(['far apart: gentle', '等高线稀：坡缓']), 'fg-sub', 's');
    o += `<line x1="14" y1="52" x2="290" y2="52" class="fg-note"/>` + tx(10, 55, 'A', 'fg-label', 'e') + tx(294, 55, 'B', 'fg-label', 's');
    const hy = (m: number) => 156 - m * 0.075;
    const prof: [number, number][] = [[14, 0], [22, 100], [40, 200], [44, 300], [48, 400], [52, 500], [66, 560], [84, 500], [110, 400], [136, 300], [162, 200], [177, 160], [190, 200], [204, 300], [218, 400], [230, 440], [242, 400], [256, 300], [270, 200], [278, 100], [294, 0]];
    o += `<path d="M14 156 ${prof.map(([x, m]) => `L${x} ${r1(hy(m))}`).join(' ')} L294 156 Z" class="fg-landfill f-fade" style="--d:.8s"/>`;
    o += `<polyline points="${prof.map(([x, m]) => `${x},${r1(hy(m))}`).join(' ')}" class="fg-profile f-draw" pathLength="1" style="--d:.8s"/>`;
    for (const x of [44, 48, 52, 110, 136, 162]) o += `<line x1="${x}" y1="56" x2="${x}" y2="${r1(hy(prof.find(p => p[0] === x)![1]))}" class="fg-guide f-fade" style="--d:1.4s"/>`;
    o += tx(300, 150, L(['Cross-section A–B', 'A–B 剖面图']), 'fg-sub', 'e');
    return svg(320, 160, o, L(['Contour lines and a cross-section', '等高线地形图和剖面图']));
  },

  rockcycle: (L, id) => {
    const n = (x: number, y: number, c: string, name: Pair, eg: Pair, d: number) =>
      `<g class="f-fade" style="--d:${d}s"><circle cx="${x}" cy="${y}" r="22" fill="${c}" opacity=".85"/>${tx(x, y + 1, L(name), 'fg-node', 'm')}${tx(x, y + 34, L(eg), 'fg-sub', 'm')}</g>`;
    const arc = (d: string, label: Pair, lx: number, ly: number, a: 's' | 'm' | 'e', dl: number) =>
      `<path d="${d}" class="fg-arrow f-draw" pathLength="1" style="--d:${dl}s" marker-end="url(#${id})"/>${tx(lx, ly, L(label), 'fg-label f-fade', a, ` style="--d:${dl + 0.3}s"`)}`;
    return svg(320, 165, arrowDef(id, '#ffd24a') +
      n(160, 128, '#e8590c', ['Magma', '岩浆'], ['molten rock deep down', '地下熔融的岩石'], 0) +
      n(56, 66, '#495057', ['Igneous', '岩浆岩'], ['granite, basalt', '花岗岩、玄武岩'], 0.2) +
      n(160, 30, '#c9a36a', ['Sedimentary', '沉积岩'], ['sandstone, limestone', '砂岩、石灰岩'], 0.4) +
      n(264, 66, '#7048e8', ['Metamorphic', '变质岩'], ['marble, slate', '大理岩、板岩'], 0.6) +
      arc('M136 132 Q80 124 60 92', ['cools and hardens', '冷却凝固'], 86, 138, 'e', 0.6) +
      arc('M66 44 Q90 22 136 26', ['weathered, carried, laid down', '风化、侵蚀、沉积'], 62, 18, 's', 0.9) +
      arc('M184 26 Q232 22 256 44', ['heat and pressure', '高温高压'], 236, 22, 's', 1.2) +
      arc('M262 92 Q244 126 184 132', ['melts', '熔化'], 240, 128, 's', 1.5),
    L(['The rock cycle', '岩石循环示意图']));
  },

  river: (L) => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, x = 14 + t * 280;
      let y = 16 + 70 * (1 - (1 - t) ** 3);
      if (t > 0.17) y += 6; // a waterfall's step
      pts.push(`${r1(x)},${r1(y)}`);
    }
    const sec = (x: number, label: Pair, sub: Pair) => tx(x, 10, L(label), 'fg-title', 'm') + tx(x, 112, L(sub), 'fg-sub', 'm');
    return svg(320, 160, `
      <path d="M296 92 L320 92 L320 100 L296 100 Z" class="fg-sea"/>
      <polyline points="${pts.join(' ')}" class="fg-river-l f-draw" pathLength="1"/>
      <line x1="107" y1="14" x2="107" y2="104" class="fg-note"/><line x1="201" y1="14" x2="201" y2="104" class="fg-note"/>
      ${sec(60, ['Upper course', '上游'], ['steep · erodes down', '落差大 · 下切侵蚀'])}${sec(154, ['Middle course', '中游'], ['wider · meanders', '河谷展宽 · 曲流'])}${sec(250, ['Lower course', '下游'], ['flat · deposits mud', '平缓 · 泥沙沉积'])}
      ${tx(70, 52, L(['waterfall', '瀑布']), 'fg-label', 's')}
      ${tx(300, 88, L(['mouth', '河口']), 'fg-sub', 'e')}${tx(16, 30, L(['source', '源头']), 'fg-sub', 's')}
      <path d="M38 122 L52 152 L66 122" class="fg-valley f-fade" style="--d:.6s"/>
      <path d="M124 122 Q132 150 154 150 Q176 150 184 122" class="fg-valley f-fade" style="--d:.8s"/>
      <path d="M128 128 q8 6 0 12 q-8 6 0 12" class="fg-meander f-fade" style="--d:1s"/>
      <path d="M216 140 L284 140" class="fg-valley f-fade" style="--d:1s"/><path d="M234 140 l16 18 l16 -18" class="fg-delta f-fade" style="--d:1.2s"/>
      ${tx(52, 158, L(['V-shaped valley', 'V 形谷']), 'fg-sub', 'm')}${tx(250, 134, L(['floodplain · delta', '冲积平原 · 三角洲']), 'fg-sub', 'm')}`,
    L(['A river from source to mouth', '河流从源头到河口']));
  },

  coast: (L, id) => svg(320, 160, arrowDef(id, '#a5d8ff') + `
    <rect x="0" y="112" width="320" height="48" class="fg-sea"/>
    <path d="M0 40 L112 40 L112 120 L0 120 Z" class="fg-rock"/>
    <path d="M70 40 L74 70 L70 100" class="fg-crack f-draw" pathLength="1"/>
    <path d="M88 120 L88 104 Q100 90 112 104 L112 120 Z" class="fg-hole f-fade" style="--d:.3s"/>
    <path d="M130 46 L184 46 L184 120 L174 120 L174 92 Q157 74 140 92 L140 120 L130 120 Z" class="fg-rock f-fade" style="--d:.5s"/>
    <path d="M206 54 L226 54 L228 120 L204 120 Z" class="fg-rock f-fade" style="--d:.8s"/>
    <path d="M258 98 L278 98 L280 120 L256 120 Z" class="fg-rock f-fade" style="--d:1.1s"/>
    ${[20, 120, 200, 250].map(x => `<path d="M${x} 116 q6 -5 12 0 t12 0" class="fg-wave"/>`).join('')}
    <path d="M316 132 L250 132" class="fg-flowline f-flow" marker-end="url(#${id})"/>${tx(316, 146, L(['waves attack the headland', '海浪不断侵蚀岬角']), 'fg-sub', 'e')}
    <path d="M14 24 L300 24" class="fg-arrow" marker-end="url(#${id})"/>${tx(14, 18, L(['over thousands of years →', '经过数千年 →']), 'fg-sub', 's')}
    ${tx(66, 34, L(['Crack', '裂隙']), 'fg-label', 'm')}${tx(100, 136, L(['Cave', '海蚀洞']), 'fg-label', 'm')}
    ${tx(157, 40, L(['Arch', '海蚀拱桥']), 'fg-label', 'm')}${tx(216, 48, L(['Stack', '海蚀柱']), 'fg-label', 'm')}${tx(268, 92, L(['Stump', '残柱']), 'fg-label', 'm')}`,
  L(['How the sea shapes a headland', '海浪塑造岬角的过程'])),

  greenhouse: (L, id) => svg(320, 160, arrowDef(id + 'y', '#ffd24a') + arrowDef(id + 'r', '#ff8787') + `
    <rect x="0" y="40" width="320" height="44" class="fg-air"/>
    ${Array.from({ length: 16 }, (_, i) => `<circle cx="${12 + i * 19 + (i % 3) * 3}" cy="${50 + (i % 4) * 9}" r="2.4" class="fg-gas"/>`).join('')}
    <path d="M0 132 Q80 124 160 132 T320 130 L320 160 L0 160 Z" class="fg-land"/>
    <circle cx="26" cy="20" r="12" class="fg-sun"/>
    <path d="M44 28 L118 124" class="fg-sunray f-draw" pathLength="1" marker-end="url(#${id}y)"/>
    <path d="M64 24 L138 124" class="fg-sunray f-draw" pathLength="1" style="--d:.2s" marker-end="url(#${id}y)"/>
    <path d="M168 126 Q172 104 180 88 T196 52" class="fg-heat f-draw" pathLength="1" style="--d:.8s" marker-end="url(#${id}r)"/>
    <path d="M200 52 Q214 74 222 96 T236 124" class="fg-heat f-draw" pathLength="1" style="--d:1.4s" marker-end="url(#${id}r)"/>
    <path d="M262 124 Q266 90 276 60 T292 8" class="fg-heat f-draw" pathLength="1" style="--d:1s" marker-end="url(#${id}r)"/>
    ${tx(86, 66, L(['Sunlight passes through', '阳光穿过大气']), 'fg-label', 'e')}
    ${tx(160, 34, L(['Greenhouse gases (CO₂, methane…) trap heat', '温室气体（二氧化碳等）留住热量']), 'fg-label', 'm')}
    ${tx(238, 112, L(['sent back down', '返回地面']), 'fg-sub', 's')}${tx(296, 20, L(['some escapes', '部分散失']), 'fg-sub', 'e')}
    ${tx(160, 148, L(['the ground warms and gives off heat', '地面增温，向外辐射热量']), 'fg-label', 'm')}`,
  L(['The greenhouse effect', '温室效应示意图'])),

  scale: (L) => {
    let bar = '';
    for (let i = 0; i < 4; i++) bar += `<rect x="${24 + i * 40}" y="78" width="40" height="7" class="${i % 2 ? 'fg-bw' : 'fg-bb'} f-fade" style="--d:${0.6 + i * 0.1}s"/>` + tx(24 + i * 40, 98, String(i), 'fg-tick', 'm');
    bar += tx(184, 98, '4 km', 'fg-tick', 'm');
    const city = `<rect x="190" y="112" width="44" height="40" class="fg-mapbox"/>${[120, 130, 140].map(y => `<line x1="192" y1="${y}" x2="232" y2="${y + 2}" class="fg-street"/>`).join('')}${[200, 214, 226].map(x => `<line x1="${x}" y1="114" x2="${x - 2}" y2="150" class="fg-street"/>`).join('')}`;
    const world = `<rect x="252" y="112" width="44" height="40" class="fg-mapbox"/><circle cx="274" cy="132" r="15" class="fg-globe"/><path d="M264 126 q6 -4 10 2 t8 6 M270 138 q4 4 10 0" class="fg-street"/>`;
    return svg(320, 160, `
      ${tx(10, 16, L(['Three ways to write a scale', '比例尺的三种表示方法']), 'fg-title')}
      ${tx(14, 36, L(['Ratio:', '数字式：']), 'fg-label')}${tx(110, 36, '1 : 100 000', 'fg-title f-fade')}
      ${tx(14, 56, L(['In words:', '文字式：']), 'fg-label')}${tx(110, 56, L(['1 cm on the map = 1 km on the ground', '图上 1 厘米代表实地距离 1 千米']), 'fg-label f-fade', 's', ' style="--d:.3s"')}
      ${tx(14, 74, L(['Scale bar:', '线段式：']), 'fg-label')}${bar}
      ${tx(14, 122, L(['Larger scale: smaller area,', '比例尺越大：范围越小，']), 'fg-sub')}${tx(14, 134, L(['more detail', '内容越详细']), 'fg-sub')}
      ${tx(14, 148, L(['Smaller scale: bigger area, less detail', '比例尺越小：范围越大，内容越简略']), 'fg-sub')}
      ${city}${world}${tx(212, 108, L(['town plan', '城市图']), 'fg-sub', 'm')}${tx(274, 108, L(['world map', '世界地图']), 'fg-sub', 'm')}`,
    L(['Map scale', '比例尺']));
  },

  compass: (L, id) => {
    const cx = 74, cy = 84, dirs: [number, Pair][] = [[0, ['N', '北']], [45, ['NE', '东北']], [90, ['E', '东']], [135, ['SE', '东南']], [180, ['S', '南']], [225, ['SW', '西南']], [270, ['W', '西']], [315, ['NW', '西北']]];
    let o = arrowDef(id, '#ffd24a');
    for (const [deg, name] of dirs) {
      const a = (deg * Math.PI) / 180, long = deg % 90 === 0, r = long ? 48 : 34;
      o += `<line x1="${cx}" y1="${cy}" x2="${r1(cx + Math.sin(a) * r)}" y2="${r1(cy - Math.cos(a) * r)}" class="${long ? 'fg-rose' : 'fg-rose2'}"/>`;
      o += tx(cx + Math.sin(a) * (r + 11), cy - Math.cos(a) * (r + 11) + 4, L(name), long ? 'fg-title' : 'fg-sub', 'm');
    }
    o += `<path d="M${cx} ${cy - 48} l-6 14 h12 z" fill="#ff6b6b"/>`;
    o += `<path d="M168 70 L168 28" class="fg-arrow" marker-end="url(#${id})"/>${tx(168, 22, L(['N', '北']), 'fg-title', 'm')}${tx(180, 54, L(['north arrow: points north', '指向标：箭头指向北方']), 'fg-label')}`;
    o += tx(160, 92, L(['No arrow, no grid:', '没有指向标和经纬网时：']), 'fg-label') + tx(160, 106, L(['up is north, down is south,', '上北下南，']), 'fg-sub') + tx(160, 118, L(['left is west, right is east', '左西右东']), 'fg-sub');
    o += tx(160, 138, L(['With a grid: meridians run north–south,', '有经纬网时：经线指示南北方向，']), 'fg-sub') + tx(160, 150, L(['parallels run east–west', '纬线指示东西方向']), 'fg-sub');
    return svg(320, 160, o, L(['Directions on a map', '地图上的方向']));
  },

  weather: (L) => {
    const cell = (i: number, art: string, name: Pair) => {
      const x = (i % 4) * 80, y = Math.floor(i / 4) * 78;
      return `<g transform="translate(${x} ${y})" class="f-fade" style="--d:${i * 0.08}s">${art}${tx(40, 70, L(name), 'fg-label', 'm')}</g>`;
    };
    const sun = (x: number, y: number, r = 10) => `<circle cx="${x}" cy="${y}" r="${r}" class="fg-wsun"/>`;
    const cl = (x: number, y: number, fill = false) => `<path d="M${x - 18} ${y + 8} a8 8 0 0 1 4 -15 a11 11 0 0 1 21 -2 a8 8 0 0 1 11 9 a8 8 0 0 1 -4 8 z" class="${fill ? 'fg-wcloudf' : 'fg-wcloud'}"/>`;
    const drops = (x: number, y: number, n: number) => Array.from({ length: n }, (_, k) => `<line x1="${x - 8 + k * 8}" y1="${y}" x2="${x - 11 + k * 8}" y2="${y + 9}" class="fg-wrain"/>`).join('');
    return svg(320, 156, [
      cell(0, sun(40, 30, 12), ['Sunny', '晴']),
      cell(1, sun(30, 24) + cl(46, 36), ['Partly cloudy', '多云']),
      cell(2, cl(40, 32, true), ['Overcast', '阴']),
      cell(3, cl(40, 26) + drops(40, 40, 3), ['Rain', '雨']),
      cell(4, cl(40, 24) + `<path d="M40 36 l-6 10 h7 l-5 11" class="fg-bolt"/>`, ['Thunderstorm', '雷阵雨']),
      cell(5, cl(40, 24) + `<text x="40" y="54" class="fg-snow" text-anchor="middle">* *</text>`, ['Snow', '雪']),
      cell(6, `<path d="M28 20 q16 0 12 10 t12 10 M24 42 L56 18" class="fg-wind"/><path d="M52 18 l4 0 l-1 4" class="fg-wind"/>`, ['Sandstorm', '沙尘暴']),
      cell(7, `<path d="M18 46 L58 20 M58 20 l-6 -8 M52 24 l-6 -8" class="fg-wind"/>${tx(40, 58, L(['NE wind, force 4', '东北风 4 级']), 'fg-sub', 'm')}`, ['Wind', '风向风力']),
    ].join(''), L(['Weather symbols', '常用天气符号']));
  },

  earth: (L) => {
    const cx = 92, cy = 150, ring = (r: number, c: string, d: number) => `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z" fill="${c}" class="f-fade" style="--d:${d}s"/>`;
    const lead = (y: number, x: number, name: Pair, sub: Pair, d: number) =>
      `<g class="f-fade" style="--d:${d}s"><line x1="${x}" y1="${y}" x2="196" y2="${y}" class="fg-guide"/>${tx(200, y - 1, L(name), 'fg-label')}${tx(200, y + 11, L(sub), 'fg-sub')}</g>`;
    return svg(320, 156, ring(140, '#8c6d46', 0) + ring(136, '#e8590c', 0.1) + ring(76, '#f59f00', 0.2) + ring(40, '#ffe066', 0.3) +
      lead(14, 120, ['Crust', '地壳'], ['5–70 km thick, rocky', '厚 5–70 千米，岩石'], 0.4) +
      lead(48, 160, ['Mantle', '地幔'], ['hot rock that slowly flows', '炽热、缓慢流动的岩石'], 0.6) +
      lead(92, 150, ['Outer core', '外核'], ['liquid iron and nickel', '液态的铁和镍'], 0.8) +
      lead(128, 120, ['Inner core', '内核'], ['solid; about 6371 km down', '固态；距地表约 6371 千米'], 1),
    L(['Inside the Earth', '地球的内部结构']));
  },

  valleys: (L) => svg(320, 150, `
    <path d="M10 30 L60 30 L100 120 L140 30 L150 30 L150 140 L10 140 Z" class="fg-rock f-fade"/>
    <path d="M92 112 L100 120 L108 112 Z" class="fg-water"/>
    <path d="M170 30 L196 30 Q198 112 240 118 Q282 112 284 30 L310 30 L310 140 L170 140 Z" class="fg-rock f-fade" style="--d:.3s"/>
    <path d="M200 40 Q206 104 240 108 Q274 104 280 40 Z" class="fg-ice f-fade" style="--d:.6s"/>
    ${tx(80, 16, L(['River valley: V-shaped', '河流侵蚀：V 形谷']), 'fg-title', 'm')}
    ${tx(240, 16, L(['Glacial valley: U-shaped', '冰川侵蚀：U 形谷']), 'fg-title', 'm')}
    ${tx(80, 134, L(['a river cuts down', '流水向下切割']), 'fg-sub', 'm')}${tx(240, 134, L(['ice scrapes the sides and floor', '冰川刨蚀谷底和谷壁']), 'fg-sub', 'm')}
    ${tx(240, 76, L(['glacier', '冰川']), 'fg-label', 'm')}`,
  L(['V-shaped and U-shaped valleys', 'V 形谷和 U 形谷'])),
};

/** Markup for a figure (inline SVG, or a small HTML key). */
export function renderFig(f: Fig, L: Lx): string {
  switch (f.k) {
    case 'climo': return climo(L, f);
    case 'line': return line(L, f);
    case 'bars': return bars(L, f);
    case 'pie': return pie(L, f);
    case 'pyramid': return pyramid(L, f);
    case 'key': return key(L, f);
    case 'dia': return DIA[f.id](L, `fg${++uid}`);
    case 'svg': return f.draw(L, `fg${++uid}`);
  }
}
