/**
 * The lesson "blackboard": everything a geography lesson draws on top of the globe. One equirectangular canvas on a
 * sphere just above the ground (zones, hemispheres, continents, oceans, temperature), glowing lines that draw
 * themselves in (parallels, rivers, boundaries, winds), HTML marks that follow the globe, and a lesson clock that
 * moves the Sun (rotation and seasons). The stage owns nothing of the globe: `dispose()` puts every switch back.
 */
import * as THREE from 'three';
import type { Globe } from '../globe/scene.ts';
import { densify, RENDER_ORDER } from '../globe/layers.ts';
import { tracePath, type CountryInfo } from '../globe/painter.ts';
import { latLonToVec, vecToLatLon } from '../../shared/lib/geo.ts';
import { BY_KEY } from '../../shared/data/catalogue.ts';
import { subsolar } from '../../shared/lib/sun.ts';
import type { Continent } from '../../shared/data/iso.ts';
import { BIOMES, CLIMATES, biomeOf, climateAt, coastDistances, inPoly, type Biome, type Climate } from './climate.ts';

export type LL = [lat: number, lon: number];
export type Pair = readonly [en: string, zh: string];

export type Fill =
  /** a latitude band, south edge to north edge */
  | { k: 'band'; s: number; n: number; c: string }
  /** a longitude strip from `w` eastward to `e` (may wrap over 180°) */
  | { k: 'strip'; w: number; e: number; c: string }
  /** a polygon (must not cross 180°); `clip` keeps only the part over these countries (ISO a2) */
  | { k: 'poly'; pts: LL[]; c: string; clip?: string[] }
  /** countries by ISO a2 code and/or continent */
  | { k: 'land'; a2?: string[]; continent?: Continent; c: string }
  /** each continent in its own colour */
  | { k: 'continents'; only?: Continent[] }
  /** the four oceans of the Chinese textbook, in their own colours */
  | { k: 'oceans'; only?: Ocean[] }
  /** an illustrative surface temperature map for the lesson clock's date */
  | { k: 'temp' }
  /** the schematic world climate map (types as in the textbook) */
  | { k: 'climate'; only?: Climate[] }
  /** natural vegetation zones (biomes), following the climate map */
  | { k: 'biome'; only?: Biome[] };
export interface Paint { fill: Fill; /** reveal time (s) */ t?: number; /** opacity */ a?: number }
export interface Line {
  pts: LL[]; c: string; t?: number; /** draw-in seconds */ dur?: number; closed?: boolean;
  /** width multiplier */ w?: number; /** moving dashes (winds, flows) */ flow?: boolean; /** arrow head at the end */ arrow?: boolean;
  /** constant lat/lon steps (parallels) instead of great circles */ rhumb?: boolean;
}
export interface Mark { ll: LL; text?: Pair; c?: string; t?: number; /** pulsing dot */ dot?: boolean; /** bigger heading label */ big?: boolean }
export interface Clock {
  /** day: `rate` hours per second over `span` hours; year: `rate` days per second over `span` days */
  mode: 'day' | 'year'; start: number; rate: number; span?: number;
}
export interface StageScene {
  /** where to look; the stage zooms in further when the step's drawing covers a smaller region (see `fitView`) */
  cam: [lat: number, lon: number, h: number];
  /** keep `cam` as written: the step is about the whole globe even though its drawing is small */
  wide?: boolean;
  /** keep the camera this many degrees east of the sub-solar point (watch the Earth turn under a fixed Sun) */
  follow?: number;
  paint?: Paint[]; lines?: Line[]; marks?: Mark[];
  /** catalogue items to show (nothing else is shown during a lesson) */
  items?: string[];
  clock?: Clock;
  /** day/night shading even if the user turned it off */ night?: boolean;
  /** sub-solar point marker */ sun?: boolean;
  names?: boolean; borders?: boolean; graticule?: boolean; tectonics?: boolean;
}

export type Ocean = 'pacific' | 'atlantic' | 'indian' | 'arctic';
const OCEAN_COLORS: Record<Ocean, string> = { pacific: '#2f80ed', atlantic: '#27ae9f', indian: '#8e6cf0', arctic: '#9fd8ff' };
const CONTINENT_COLORS: Record<Continent, string> = {
  asia: '#f2c94c', europe: '#6fcf97', africa: '#f2994a', 'north-america': '#eb5757', 'south-america': '#bb6bd9', oceania: '#56ccf2', antarctica: '#e0e6ee',
};

const D2R = Math.PI / 180;
const DAY = 864e5;
const HOUR = 36e5;
const FADE = 0.8;
/** Reveal times are counted from when the camera has mostly arrived. */
const LEAD = 0.6;

/** Pacific / Atlantic dividing meridian by latitude (it runs over land between the two coasts). */
const PA: [number, number][] = [[-90, -67], [-56, -67], [-50, -71], [-30, -68], [-18, -65], [0, -70], [8.5, -78], [12, -85], [15, -90], [18, -97], [25, -103], [30, -100], [90, -100]];
function interp(tab: [number, number][], x: number): number {
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
    const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  }
  return tab[tab.length - 1][1];
}
function indianPacific(lat: number, lon: number): number {
  if (lat < -39) return 146.9;
  if (lat < -18) return 142;
  if (lat < -9) return 135;
  if (lat < -7.8 && lon < 116) return 999; // south of Java: Indian Ocean
  if (lat < -8.5) return 127;
  if (lat < 1.5) return 104.5;
  if (lat < 7) return 102;
  if (lat < 10) return 99.5;
  return lat < 22 ? 99 : 100;
}
/** Which of the four oceans (as taught in Chinese schools) a sea point belongs to. Illustrative boundaries. */
export function oceanAt(lat: number, lon: number): Ocean {
  if (lat >= 66) return 'arctic';
  const pa = interp(PA, lat), ai = lat < 30 ? 20 : 45, ip = indianPacific(lat, lon);
  if (lon >= pa && lon < ai) return 'atlantic';
  if (lon >= ai && lon < ip) return 'indian';
  return 'pacific';
}

/** An illustrative surface temperature (°C): zonal, land swings more than sea, high ground and ice sheets colder. */
export function tempAt(lat: number, lon: number, land: boolean, sunLat: number): number {
  const s = (sunLat / 23.44) * Math.sign(lat || 1);
  const c = Math.cos(lat * D2R);
  let T = land ? -22 + 50 * Math.pow(c, 1.4) + Math.min(26, 0.42 * Math.abs(lat)) * s : -2 + 30 * Math.pow(c, 1.3) + 0.12 * Math.abs(lat) * s;
  if (land) {
    const g = (la: number, lo: number, sl: number, so: number) => Math.exp(-(((lat - la) / sl) ** 2) - (((lon - lo) / so) ** 2));
    T -= 16 * g(33, 88, 4.5, 11) + 14 * g(74, -40, 7, 14) + 6 * g(-3, -77, 14, 3) + 5 * g(40, -110, 6, 6);
    if (lat < -62) T -= 22;
  }
  return T;
}
const TEMP_STOPS: [number, [number, number, number]][] = [[-40, [92, 40, 160]], [-20, [60, 100, 230]], [-5, [120, 190, 250]], [0, [235, 245, 250]], [10, [250, 225, 110]], [20, [250, 150, 60]], [35, [215, 40, 40]]];
function tempColour(T: number): [number, number, number] {
  // 5 °C steps, so the bands read like isotherms
  const q = Math.max(-40, Math.min(35, Math.floor(T / 5) * 5 + 2.5));
  for (let i = 1; i < TEMP_STOPS.length; i++) if (q <= TEMP_STOPS[i][0]) {
    const [a, ca] = TEMP_STOPS[i - 1], [b, cb] = TEMP_STOPS[i], t = (q - a) / (b - a);
    return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

// ---------- land mask (shared by the oceans and temperature fills) ----------
let maskCache: { W: number; data: Uint8Array; sea: Uint8Array } | null = null;
let coastCache: { W: number; dw: Float32Array; de: Float32Array } | null = null;
function coasts(countries: readonly CountryInfo[], W: number): { dw: Float32Array; de: Float32Array } {
  if (coastCache?.W === W) return coastCache;
  coastCache = { W, ...coastDistances(landMask(countries, W).data, W) };
  return coastCache;
}
const hexRgb = (v: string): [number, number, number] => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
function landMask(countries: readonly CountryInfo[], W: number): { data: Uint8Array; sea: Uint8Array } {
  if (maskCache?.W === W) return maskCache;
  const H = W / 2;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  for (const c of countries) { tracePath(ctx, c.feature, W, c.a2 === 'AQ'); ctx.fill('evenodd'); }
  const px = ctx.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) data[i] = px[i * 4 + 3] > 110 ? 1 : 0;
  // The open sea is what a flood from mid-ocean reaches; enclosed lakes (Caspian, Great Lakes, Victoria…) stay out.
  const sea = new Uint8Array(W * H);
  const stack: number[] = [];
  const seed = (lat: number, lon: number) => { const i = Math.floor(((90 - lat) / 180) * H) * W + Math.floor(((lon + 180) / 360) * W); if (!data[i]) stack.push(i); };
  seed(0, -140); seed(0, -30); seed(-20, 80); seed(80, 0); seed(-60, 0);
  while (stack.length) {
    const i = stack.pop()!;
    if (sea[i] || data[i]) continue;
    sea[i] = 1;
    const x = i % W, y = (i - x) / W;
    stack.push(y * W + ((x + 1) % W), y * W + ((x + W - 1) % W));
    if (y > 0) stack.push(i - W);
    if (y < H - 1) stack.push(i + W);
  }
  maskCache = { W, data, sea };
  return maskCache;
}

// ---------- lines ----------
const LINE_VERT = `
  attribute vec3 aSide;
  attribute float aEdge;
  attribute float aAlong;
  uniform float uWidth;
  varying float vEdge;
  varying float vAlong;
  void main() {
    vEdge = aEdge; vAlong = aAlong;
    vec3 p = position + aSide * aEdge * uWidth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const LINE_FRAG = `
  uniform vec3 uColor;
  uniform float uProgress;
  uniform float uTotal;
  uniform float uTime;
  uniform float uFlow;
  uniform float uOpacity;
  varying float vEdge;
  varying float vAlong;
  void main() {
    float head = uProgress * uTotal;
    if (vAlong > head) discard;
    float core = smoothstep(1.0, 0.4, abs(vEdge));
    float halo = (1.0 - vEdge * vEdge) * 0.35;
    float dash = 1.0;
    if (uFlow > 0.0) dash = 0.3 + 0.7 * smoothstep(0.15, 0.75, fract(vAlong / 2.5 - uTime * uFlow));
    float a = max(core, halo) * dash * uOpacity;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.22), a);
  }
`;
const blend = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: false, depthWrite: false } as const;

function lineGeometry(P: THREE.Vector3[], closed: boolean, r: number): { g: THREE.BufferGeometry; total: number } {
  const n = P.length;
  const pos = new Float32Array(n * 6), side = new Float32Array(n * 6), edge = new Float32Array(n * 2), along = new Float32Array(n * 2);
  const idx: number[] = [];
  const tan = new THREE.Vector3(), sv = new THREE.Vector3();
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const prev = P[i > 0 ? i - 1 : closed ? n - 2 : 0], next = P[i < n - 1 ? i + 1 : closed ? 1 : n - 1];
    tan.subVectors(next, prev);
    if (tan.lengthSq() < 1e-14) tan.set(0, 1, 0);
    sv.crossVectors(P[i], tan).normalize();
    if (i > 0) acc += P[i].angleTo(P[i - 1]) / D2R;
    for (let k = 0; k < 2; k++) {
      const vi = i * 2 + k;
      pos.set([P[i].x * r, P[i].y * r, P[i].z * r], vi * 3);
      side.set([sv.x, sv.y, sv.z], vi * 3);
      edge[vi] = k ? 1 : -1; along[vi] = acc;
    }
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 3));
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { g, total: acc };
}

/** Points along a constant-step lat/lon path (parallels are not great circles). */
function rhumb(pts: LL[], step = 1): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step));
    for (let k = i ? 1 : 0; k <= n; k++) out.push(new THREE.Vector3(...latLonToVec(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n)));
  }
  return out;
}

interface LiveLine { def: Line; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; head: THREE.Mesh | null }
interface LiveMark { def: Mark; v: THREE.Vector3; el: HTMLElement }
interface LiveLayer { def: Paint; cv: HTMLCanvasElement | null; shown: number }

interface StageOpts {
  low?: boolean; lang: () => 'en' | 'zh';
  /** the part of the viewport (px) left free for the globe, i.e. not under the lesson card */
  frame?: () => { left: number; top: number; width: number; height: number } | null;
}

/**
 * The camera that fits a set of places into a free area of `fw` × `fh` px (screen height `H`, vertical field of view
 * `fov` degrees), looking straight down: [lat, lon, height above the surface in Earth radii]. Null when the places are
 * spread over too much of the globe to frame (then the step keeps its whole-globe view).
 */
export function fitView(pts: LL[], fw: number, fh: number, H: number, fov: number, fill = 0.72): [number, number, number] | null {
  if (!pts.length) return null;
  const v = pts.map(([la, lo]) => latLonToVec(la, lo));
  let c = v.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
  const n0 = Math.hypot(...c);
  if (n0 / v.length < 0.4) return null;
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const basis = (cc: number[]) => {
    const [la, lo] = vecToLatLon(cc[0], cc[1], cc[2]), p = la * Math.PI / 180, l = lo * Math.PI / 180;
    return { la, lo, c: latLonToVec(la, lo), e: [Math.cos(l), 0, -Math.sin(l)], n: [-Math.sin(p) * Math.sin(l), Math.cos(p), -Math.sin(p) * Math.cos(l)] };
  };
  let b = basis(c);
  // re-centre on the middle of the bounding box (the mean leans toward densely sampled outlines)
  for (let it = 0; it < 3; it++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of v) {
      const z = dot(p, b.c);
      if (z < 0.2) return null;
      const x = dot(p, b.e) / z, y = dot(p, b.n) / z;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    c = [b.c[0] + b.e[0] * mx + b.n[0] * my, b.c[1] + b.e[1] * mx + b.n[1] * my, b.c[2] + b.e[2] * mx + b.n[2] * my];
    b = basis(c);
  }
  const t = Math.tan((fov * Math.PI) / 360) * fill, tx = (t * fw) / H, ty = (t * fh) / H;
  // a place at p shows at angle atan(p·e / (d − p·c)) from the view axis, for a camera at distance d from the centre
  let d = 1, minZ = 1;
  for (const p of v) {
    const z = dot(p, b.c);
    minZ = Math.min(minZ, z);
    d = Math.max(d, z + Math.abs(dot(p, b.e)) / tx, z + Math.abs(dot(p, b.n)) / ty);
  }
  if (minZ < 0.42) return null; // wider than about 65° from the centre
  d = Math.max(d, 1.05 / minZ);
  return [b.la, b.lo, Math.max(0.8, d - 1)]; // closer than this the base map turns soft and loses its context
}

/** A country's main outline (its biggest polygon), thinned. */
function outline(c: CountryInfo): LL[] {
  const g = c.feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let ring = polys[0][0];
  for (const p of polys) if (p[0].length > ring.length) ring = p[0];
  const step = Math.max(1, Math.floor(ring.length / 60));
  return ring.filter((_, i) => i % step === 0).map(([lo, la]) => [la, lo] as LL);
}

export class LessonStage {
  private root = new THREE.Group();
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private sphere: THREE.Mesh;
  private W: number;
  private layers: LiveLayer[] = [];
  private lines: LiveLine[] = [];
  private marks: LiveMark[] = [];
  private marksEl: HTMLDivElement;
  private sunEl: HTMLDivElement;
  private scene: StageScene | null = null;
  private elapsed = 0;
  private time = 0;
  private uTime = { value: 0 };
  private tempKey = '';
  private lastSunLon: number | null = null;
  /** Wall-clock time of the last tick: the globe caps its frame step at 0.1 s, but on a slow device a lesson
   * must still finish drawing on time, so the stage keeps its own clock. */
  private lastTick = 0;
  private hook = () => this.tick();
  /** Lesson clock: fraction of the span played (0 … 1), and whether it runs. */
  frac = 0;
  playing = true;
  /** Called when the clock moves (to update the player's slider and readout). */
  onClock: (() => void) | null = null;

  constructor(private globe: Globe, private opts: StageOpts) {
    this.W = opts.low ? 1024 : 2048;
    globe.flatView = true;
    this.cv = document.createElement('canvas');
    this.cv.width = this.W; this.cv.height = this.W / 2;
    this.ctx = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const seg = opts.low ? 64 : 128;
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1.0025, seg, seg / 2), new THREE.MeshBasicMaterial({ map: this.tex, ...blend }));
    this.sphere.rotation.y = -Math.PI / 2;
    this.sphere.renderOrder = RENDER_ORDER.overlay;
    this.sphere.visible = false;
    this.root.add(this.sphere);
    this.root.name = 'lesson-stage';
    globe.scene.add(this.root);
    this.marksEl = document.createElement('div');
    this.marksEl.className = 'lesson-marks';
    this.marksEl.setAttribute('aria-hidden', 'true');
    this.sunEl = document.createElement('div');
    this.sunEl.className = 'lesson-sun';
    this.sunEl.dataset.testid = 'lesson-sun';
    this.marksEl.append(this.sunEl);
    // inside the app layer, so the top bar, settings and info panels stay above the globe's labels
    (document.getElementById('app') ?? document.body).append(this.marksEl);
    globe.frameHooks.add(this.hook);
  }

  /** Shows one lesson step. */
  show(s: StageScene): void {
    this.clear();
    this.scene = s;
    this.elapsed = 0;
    this.lastTick = 0;
    this.frac = 0;
    this.playing = true;
    this.lastSunLon = null;
    const g = this.globe;
    g.setLayerOverride({ clouds: false, aurora: false, names: s.names ?? false, borders: s.borders ?? true, graticule: s.graticule ?? false, tectonics: s.tectonics ?? false });
    g.setLessonItems(s.items ?? []);
    g.forceNight = !!s.night;
    this.time = s.clock ? s.clock.start : Date.now();
    g.simTime = s.clock ? this.time : null;
    // aim once the caller has laid out its card, so the free area is known
    queueMicrotask(() => { if (this.scene === s) this.aim(s); });
    this.layers = (s.paint ?? []).map(def => ({ def, cv: null, shown: -1 }));
    for (const def of s.lines ?? []) this.lines.push(this.buildLine(def));
    for (const def of s.marks ?? []) {
      const el = document.createElement('div');
      el.className = 'lesson-mark' + (def.dot ? ' dot' : '') + (def.big ? ' big' : '');
      if (def.c) el.style.setProperty('--c', def.c);
      el.dataset.testid = 'lesson-mark';
      this.marks.push({ def, v: new THREE.Vector3(...latLonToVec(def.ll[0], def.ll[1])).multiplyScalar(1.004), el });
      this.marksEl.append(el);
    }
    this.relabel();
    this.tempKey = '';
    this.repaint();
    g.markDirty();
  }

  /** What the lesson maps say about one place: its country (if on land), climate type and natural vegetation. */
  here(lat: number, lon: number): { a2?: string; climate?: Climate; biome?: Biome } {
    const countries = this.globe.countryShapes(), w = 512, hh = w / 2;
    const { data } = landMask(countries, w);
    const x = Math.max(0, Math.min(w - 1, Math.floor(((lon + 180) / 360) * w))), y = Math.max(0, Math.min(hh - 1, Math.floor(((90 - lat) / 180) * hh)));
    const ix = y * w + x;
    const inFeat = (c: CountryInfo) => {
      const g = c.feature.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      return polys.some(rings => inPoly(lat, lon, rings[0].map(([o, a]) => [a, o] as LL)) && !rings.slice(1).some(r => inPoly(lat, lon, r.map(([o, a]) => [a, o] as LL))));
    };
    const country = countries.find(inFeat);
    if (!data[ix] && !country) return {};
    const cd = coasts(countries, w);
    const climate = climateAt(lat, lon, cd.dw[ix], cd.de[ix]);
    return { a2: country?.a2 || undefined, climate, biome: biomeOf(climate, lat, lon, cd.dw[ix], cd.de[ix]) };
  }

  relabel(): void {
    const zh = this.opts.lang() === 'zh';
    for (const m of this.marks) m.el.textContent = m.def.text ? m.def.text[zh ? 1 : 0] : '';
    this.onClock?.();
  }

  /** Moves the lesson clock (slider). */
  seek(frac: number): void {
    this.frac = Math.max(0, Math.min(1, frac));
    this.applyClock();
    this.globe.markDirty();
  }

  get clock(): Clock | undefined { return this.scene?.clock; }
  /** The lesson clock's instant (UTC ms). */
  get now(): number { return this.time; }
  get sunLat(): number { return subsolar(this.time)[0]; }
  /** Whether the overlay sphere has anything painted (tests). */
  get painted(): boolean { return this.sphere.visible; }
  get lineCount(): number { return this.lines.length; }

  /** Readout for the clock: Beijing time for a day, the date for a year. */
  clockText(): string {
    const c = this.scene?.clock;
    if (!c) return '';
    const zh = this.opts.lang() === 'zh';
    if (c.mode === 'day') {
      const f = new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' });
      return (zh ? '北京时间 ' : 'Beijing ') + f.format(this.time);
    }
    return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(this.time);
  }

  private applyClock(): void {
    const c = this.scene?.clock;
    if (!c) return;
    if (c.mode === 'day') this.time = c.start + this.frac * (c.span ?? 24) * HOUR;
    // whole days at the same hour: the day/night line keeps its place and only the seasons move
    else this.time = c.start + Math.floor(this.frac * (c.span ?? 365)) * DAY;
    this.globe.simTime = this.time;
    this.onClock?.();
  }

  private buildLine(def: Line): LiveLine {
    const pts = def.rhumb ? rhumb(def.pts) : densify(def.pts, !!def.closed, 0.75);
    const { g, total } = lineGeometry(pts, !!def.closed, 1.004);
    const mat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(def.c) }, uProgress: { value: 0 }, uTotal: { value: total }, uTime: this.uTime,
        uFlow: { value: def.flow ? 0.9 : 0 }, uOpacity: { value: 0.95 }, uWidth: { value: 0.004 },
      },
      ...blend, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = RENDER_ORDER.overlay + 0.5;
    mesh.frustumCulled = false;
    let head: THREE.Mesh | null = null;
    if (def.arrow && pts.length > 1) {
      // a flat triangle in the tangent plane at the end point, scaled each frame with the line width
      const P = pts[pts.length - 1], Q = pts[Math.max(0, pts.length - 3)];
      const T = P.clone().sub(Q).normalize(), S = new THREE.Vector3().crossVectors(P, T).normalize();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...T.clone().multiplyScalar(2.2).toArray(), ...S.toArray(), ...S.clone().negate().toArray()], 3));
      head = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: def.c, ...blend, side: THREE.DoubleSide }));
      head.position.copy(P).multiplyScalar(1.0045);
      head.renderOrder = RENDER_ORDER.overlay + 0.6;
      head.visible = false;
      head.frustumCulled = false;
      this.root.add(head);
    }
    this.root.add(mesh);
    return { def, mesh, mat, head };
  }

  private paintLayer(L: LiveLayer): HTMLCanvasElement {
    const W = this.W, H = W / 2;
    const cv = L.cv ?? document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const X = (lon: number) => ((lon + 180) / 360) * W, Y = (lat: number) => ((90 - lat) / 180) * H;
    const countries = this.globe.countryShapes();
    const f = L.def.fill;
    const fillCountries = (pick: (c: CountryInfo) => boolean, colour: (c: CountryInfo) => string) => {
      for (const c of countries) if (pick(c)) { ctx.fillStyle = colour(c); tracePath(ctx, c.feature, W, c.a2 === 'AQ'); ctx.fill('evenodd'); }
    };
    switch (f.k) {
      case 'band': ctx.fillStyle = f.c; ctx.fillRect(0, Y(f.n), W, Y(f.s) - Y(f.n)); break;
      case 'strip': {
        ctx.fillStyle = f.c;
        if (f.e > f.w) ctx.fillRect(X(f.w), 0, X(f.e) - X(f.w), H);
        else { ctx.fillRect(X(f.w), 0, W - X(f.w), H); ctx.fillRect(0, 0, X(f.e), H); }
        break;
      }
      case 'poly': {
        if (f.clip) {
          const set = new Set(f.clip);
          fillCountries(c => set.has(c.a2), () => f.c);
          ctx.globalCompositeOperation = 'destination-in';
        }
        ctx.fillStyle = f.c;
        ctx.beginPath();
        f.pts.forEach(([la, lo], i) => (i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la))));
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'land': {
        const set = f.a2 ? new Set(f.a2) : null;
        fillCountries(c => (!set || set.has(c.a2)) && (!f.continent || c.continent === f.continent), () => f.c);
        break;
      }
      case 'continents': {
        const only = f.only ? new Set(f.only) : null;
        fillCountries(c => c.a2 !== 'RU' && (!only || only.has(c.continent)), c => CONTINENT_COLORS[c.continent]);
        // Russia spans two continents: west of the Urals (≈60°E) is Europe, east of it Asia
        const ru = countries.find(c => c.a2 === 'RU');
        for (const part of ['europe', 'asia'] as const) {
          if (!ru || (only && !only.has(part))) continue;
          ctx.save();
          ctx.beginPath();
          // (Chukotka wraps past 180°, to the far left of the canvas)
          if (part === 'europe') ctx.rect(X(19), 0, X(60) - X(19), H); else { ctx.rect(X(60), 0, W - X(60), H); ctx.rect(0, 0, X(19), H); }
          ctx.clip();
          ctx.fillStyle = CONTINENT_COLORS[part];
          tracePath(ctx, ru.feature, W); ctx.fill('evenodd');
          ctx.restore();
        }
        break;
      }
      case 'oceans': case 'temp': case 'climate': case 'biome': {
        // per-pixel fills are computed on a coarser grid and scaled up smoothly
        const w = Math.min(512, W / 2), hh = w / 2;
        const { data, sea } = landMask(countries, w);
        const img = ctx.createImageData(w, hh);
        const sunLat = this.sunLat;
        const only = f.k === 'oceans' && f.only ? new Set(f.only) : null;
        const rgb = {} as Record<Ocean, [number, number, number]>;
        for (const [k, v] of Object.entries(OCEAN_COLORS) as [Ocean, string][]) rgb[k] = hexRgb(v);
        const zoned = f.k === 'climate' || f.k === 'biome';
        const cd = zoned ? coasts(countries, w) : null;
        const pick = zoned && f.only ? new Set<string>(f.only) : null;
        const pal = new Map<string, [number, number, number]>();
        for (const [k, v] of Object.entries(f.k === 'biome' ? BIOMES : CLIMATES)) pal.set(k, hexRgb(v.c));
        for (let y = 0; y < hh; y++) {
          const lat = 90 - ((y + 0.5) / hh) * 180;
          for (let x = 0; x < w; x++) {
            const i = y * w + x, lon = ((x + 0.5) / w) * 360 - 180;
            let c: [number, number, number] | null = null;
            if (f.k === 'oceans') {
              if (sea[i]) { const o = oceanAt(lat, lon); if (!only || only.has(o)) c = rgb[o]; }
            } else if (cd) {
              if (data[i]) {
                const cl = climateAt(lat, lon, cd.dw[i], cd.de[i]);
                const z = f.k === 'biome' ? biomeOf(cl, lat, lon, cd.dw[i], cd.de[i]) : cl;
                if (!pick || pick.has(z)) c = pal.get(z)!;
              }
            } else c = tempColour(tempAt(lat, lon, !!data[i], sunLat));
            if (c) img.data.set([c[0], c[1], c[2], 255], i * 4);
          }
        }
        const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = hh;
        tmp.getContext('2d')!.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(tmp, 0, 0, W, H);
        break;
      }
    }
    return cv;
  }

  private reveal(t: number | undefined): number {
    return Math.max(0, Math.min(1, (this.elapsed - LEAD - (t ?? 0)) / FADE));
  }

  /** Composites the fill layers; only when something changed. */
  private repaint(): void {
    let changed = false;
    const tk = this.layers.some(l => l.def.fill.k === 'temp') ? String(Math.round(this.sunLat)) : '';
    if (tk !== this.tempKey) {
      this.tempKey = tk;
      for (const l of this.layers) if (l.def.fill.k === 'temp' && l.cv) { l.cv = this.paintLayer(l); changed = true; }
    }
    for (const l of this.layers) {
      const r = this.reveal(l.def.t);
      if (r !== l.shown) { changed = true; l.shown = r; }
      if (r > 0 && !l.cv) { l.cv = this.paintLayer(l); changed = true; }
    }
    if (!changed) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.W / 2);
    let any = false;
    for (const l of this.layers) {
      if (l.shown <= 0 || !l.cv) continue;
      ctx.globalAlpha = l.shown * (l.def.a ?? 0.55);
      ctx.drawImage(l.cv, 0, 0);
      any = true;
    }
    ctx.globalAlpha = 1;
    this.sphere.visible = any;
    this.tex.needsUpdate = true;
  }

  private tick(): void {
    const s = this.scene;
    if (!s) return;
    const g = this.globe;
    const t = performance.now();
    const sec = this.lastTick ? Math.min(0.5, (t - this.lastTick) / 1000) : 0;
    this.lastTick = t;
    this.elapsed += sec;
    this.uTime.value += sec;
    let busy = this.elapsed < 8;
    // the lesson clock starts once the camera has arrived
    if (s.clock && this.playing && this.elapsed > LEAD + 0.9) {
      const span = s.clock.span ?? (s.clock.mode === 'day' ? 24 : 365);
      this.frac += (sec * s.clock.rate) / span;
      if (this.frac >= 1) this.frac -= 1;
      this.applyClock();
      busy = true;
    }
    if (s.follow !== undefined) {
      const lon = subsolar(this.time)[1];
      if (this.lastSunLon !== null && this.elapsed > 1.6) {
        let d = lon - this.lastSunLon;
        if (d > 180) d -= 360; else if (d < -180) d += 360;
        g.lon += d;
      }
      this.lastSunLon = lon;
    }
    this.repaint();
    const alt = g.camera.position.length() - 1;
    const w = Math.min(0.012, Math.max(0.0007, alt * 0.0025));
    for (const L of this.lines) {
      const p = Math.max(0, Math.min(1, (this.elapsed - LEAD - (L.def.t ?? 0)) / (L.def.dur ?? 1.6)));
      L.mat.uniforms.uProgress.value = p;
      L.mat.uniforms.uWidth.value = w * (L.def.w ?? 1);
      L.mesh.visible = p > 0;
      if (L.def.flow) busy = true;
      if (L.head) {
        L.head.visible = p >= 1;
        L.head.scale.setScalar(w * (L.def.w ?? 1) * 2.4);
      }
    }
    this.placeMarks();
    if (busy || s.follow !== undefined) g.markDirty();
  }

  private placeMarks(): void {
    const g = this.globe;
    const rect = g.renderer.domElement.getBoundingClientRect();
    // labels are centred on their point; a dotted label or the Sun has its dot on the point
    const put = (el: HTMLElement, v: THREE.Vector3, on: boolean, dot = false) => {
      const p = on ? g.project(v) : null;
      if (!p) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = 'visible';
      el.style.transform = `translate(${(rect.left + p.x).toFixed(1)}px, ${(rect.top + p.y).toFixed(1)}px) translate(${dot ? '-6px' : '-50%'}, -50%)`;
    };
    for (const m of this.marks) {
      const r = this.reveal(m.def.t);
      m.el.style.opacity = String(r);
      put(m.el, m.v, r > 0, !!m.def.dot);
    }
    if (this.scene?.sun) {
      const [la, lo] = subsolar(this.time);
      const zh = this.opts.lang() === 'zh';
      const txt = `${zh ? '太阳直射 ' : 'Overhead Sun '}${Math.abs(la).toFixed(1)}°${la >= 0 ? 'N' : 'S'}`;
      if (this.sunEl.dataset.label !== txt) this.sunEl.dataset.label = txt;
      put(this.sunEl, new THREE.Vector3(...latLonToVec(la, lo)).multiplyScalar(1.004), true, true);
    } else this.sunEl.style.visibility = 'hidden';
  }

  private clear(): void {
    for (const L of this.lines) {
      this.root.remove(L.mesh); L.mesh.geometry.dispose(); L.mat.dispose();
      if (L.head) { this.root.remove(L.head); L.head.geometry.dispose(); (L.head.material as THREE.Material).dispose(); }
    }
    this.lines = [];
    for (const m of this.marks) m.el.remove();
    this.marks = [];
    this.layers = [];
    this.sphere.visible = false;
  }

  /** Flies to the step's view: centred in the area the card leaves free, zoomed to what the step draws. */
  private aim(s: StageScene): void {
    const g = this.globe;
    const W = innerWidth, H = innerHeight;
    const fr = this.opts.frame?.();
    const a = fr && fr.width > 160 && fr.height > 160 ? fr : { left: 0, top: 0, width: W, height: H };
    g.setViewShift(a.left + a.width / 2 - W / 2, a.top + a.height / 2 - H / 2);
    let [lat, lon, h] = s.cam;
    if (s.follow !== undefined) lon = subsolar(this.time)[1] + s.follow;
    else if (!s.wide) {
      const pts = this.extent(s);
      const f = pts && fitView(pts, a.width, a.height, H, g.camera.fov);
      if (f && f[2] < h) [lat, lon, h] = f;
    }
    // the learner may look closer or wider, but the step's scene stays in view (and zooming out never leaves Earth)
    g.zoomRange = [h * 0.4, Math.max(h * 2.5, 1.2)];
    g.flyTo(lat, lon, h, 1500);
  }

  /** Every place a step draws or shows; null when it paints the whole globe (bands, climate maps…). */
  private extent(s: StageScene): LL[] | null {
    const pts: LL[] = [];
    for (const p of s.paint ?? []) {
      const f = p.fill;
      if (f.k === 'poly') pts.push(...f.pts);
      else if (f.k === 'land') {
        const set = f.a2 ? new Set(f.a2) : null;
        for (const c of this.globe.countryShapes()) if ((!set || set.has(c.a2)) && (!f.continent || c.continent === f.continent)) pts.push(...outline(c));
      } else return null;
    }
    for (const l of s.lines ?? []) {
      if (l.pts.length > 1 && !fitView(l.pts, 1, 1, 1, 90)) continue; // a parallel or meridian round the globe is only a reference
      pts.push(...l.pts);
      for (let i = 1; i < l.pts.length; i++) { // great-circle midpoints bulge poleward
        const a = latLonToVec(...l.pts[i - 1]), b = latLonToVec(...l.pts[i]);
        pts.push(vecToLatLon(a[0] + b[0], a[1] + b[1], a[2] + b[2]));
      }
    }
    for (const m of s.marks ?? []) pts.push(m.ll);
    for (const k of s.items ?? []) {
      const it = BY_KEY.get(k);
      if (!it) continue;
      if (it.route?.kind === 'orbit') return null;
      if (it.route) pts.push(...(it.route.pts as LL[])); else pts.push([it.lat, it.lon]);
    }
    return pts.length ? pts : null;
  }

  /** Removes the stage and gives the globe back exactly as it was. */
  dispose(): void {
    this.clear();
    const g = this.globe;
    g.frameHooks.delete(this.hook);
    g.scene.remove(this.root);
    this.sphere.geometry.dispose();
    (this.sphere.material as THREE.Material).dispose();
    this.tex.dispose();
    this.marksEl.remove();
    g.setLayerOverride(null);
    g.setLessonItems(null);
    g.forceNight = false;
    g.simTime = null;
    g.flatView = false;
    g.setViewShift(0, 0);
    g.zoomRange = null;
    g.markDirty();
    this.scene = null;
  }
}
