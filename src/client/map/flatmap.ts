import * as THREE from 'three';
import { GRID_NAMES, OCEANS, type Globe } from '../globe/scene.ts';
import type { CountryInfo } from '../globe/painter.ts';
import type { Quality } from '../globe/quality.ts';
import { countryAt } from '../globe/borders.ts';
import { CATALOGUE } from '../../shared/data/catalogue.ts';
import { TYPE_META } from '../../shared/data/typemeta.ts';
import { CITIES, cityName } from '../../shared/data/cities.ts';
import { CONTINENT_NAMES } from '../../shared/data/iso.ts';
import { tr, type CatalogueItem } from '../../shared/data/types.ts';
import { t, lang, fmtNum, onLang } from '../lib/i18n.ts';
import { load, save } from '../lib/storage.ts';
import { releaseWhenHidden, warmShaders } from '../lib/gpu.ts';
import { loadRelief } from '../lib/relief.ts';
import { url } from '../lib/env.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { EXTENT, PROJ_GLSL, PROJ_IDS, PROJ_INDEX, forward, inverse, phiOf, wrapPi, wraps, xScale, yOf, type ProjId } from './proj.ts';

const D = Math.PI / 180;
const R_KM = 6371;
/** Room kept clear for the top bar and the bottom controls when the whole map is fitted. */
const FIT_PAD_Y = 150, FIT_PAD_X = 40;
const MAX_ZOOM = 14;

export interface MapHost {
  globe: Globe;
  quality: Quality;
  lowfx: boolean;
  /** The painted globe texture (the map samples the same land colours). */
  earthCanvas: () => HTMLCanvasElement;
  /** Border segments `[lon1,lat1, lon2,lat2, …]` in degrees (1:50m once loaded). */
  borders: () => Float32Array;
  /** Countries for name labels and for hover/tap lookups. */
  countries: () => CountryInfo[];
  shapes: () => CountryInfo[];
  selected: () => CatalogueItem | null;
  pick: (it: CatalogueItem) => void;
  hover: (it: CatalogueItem | null, at: { x: number; y: number } | null) => void;
  onView: (zoom: number, lat: number, lon: number) => void;
  /** Opens the "map projections" lesson. */
  learn: () => void;
}

interface View { lon0: number; cy: number; k: number }

const LINE_VERT = /* glsl */ `
  attribute vec4 aSeg;
  #ifdef VCOL
  attribute vec4 aCol;
  varying vec4 vCol;
  #endif
  uniform float uLon0, uCy, uK, uWidth;
  uniform vec2 uView;
  varying float vLam;
  ${PROJ_GLSL}
  void main() {
    #ifdef VCOL
    vCol = aCol;
    #endif
    float la = wrapPi(aSeg.x - uLon0), lb = wrapPi(aSeg.z - uLon0);
    // a segment across the map's edge is drawn on its first point's side (the overhang is clipped below)
    if (lb - la > PI) lb -= 2.0 * PI; else if (la - lb > PI) lb += 2.0 * PI;
    vec2 a = projF(la, aSeg.y), b = projF(lb, aSeg.w);
    a.y -= uCy; b.y -= uCy;
    a *= uK; b *= uK;
    vec2 d = b - a;
    float len = length(d);
    vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
    vec2 n = vec2(-dir.y, dir.x);
    float hw = uWidth * 0.5;
    // quads overlap by half a width at each end, closing the joints of a polyline
    vec2 p = mix(a, b, position.x) + n * position.y * hw + dir * (position.x * 2.0 - 1.0) * hw;
    vLam = mix(la, lb, position.x);
    gl_Position = vec4(p / (uView * 0.5), 0.0, 1.0);
  }
`;
const LINE_FRAG = /* glsl */ `
  uniform int uProj;
  uniform vec4 uColor;
  varying float vLam;
  #ifdef VCOL
  varying vec4 vCol;
  #endif
  void main() {
    if (uProj == 0 && abs(vLam) > 3.14159265) discard;
    vec4 c = uColor;
    #ifdef VCOL
    c *= vCol;
    #endif
    gl_FragColor = c;
  }
`;

const MAP_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// The globe's surface colouring, drawn flat: painted land, sea-floor tints, rock and snow, and hill shading lit from
// the north-west (the map-maker's convention).
const MAP_FRAG = /* glsl */ `
  uniform sampler2D uLand;
  uniform sampler2D uRelief;
  uniform sampler2D uSea;
  uniform vec2 uReliefTexel;
  uniform float uReliefMix, uLandMix, uLon0, uCy, uK, uDpr;
  uniform vec2 uView;
  uniform vec3 uOceanDeep, uOceanMid, uBg, uRim;
  ${PROJ_GLSL}
  void main() {
    vec2 px = gl_FragCoord.xy / uDpr - uView * 0.5;
    float X = px.x / uK, Y = uCy + px.y / uK;
    float phi = phiOf(Y);
    float xs = xScale(phi);
    float lam = X / xs;
    float edge = (halfH() - abs(Y)) * uK;
    if (uProj == 0) edge = min(edge, (PI - abs(lam)) * xs * uK);
    vec2 uv = vec2((lam + uLon0) / (2.0 * PI) + 0.5, phi / PI + 0.5);

    vec4 ls = texture2D(uLand, uv);
    float landMask = smoothstep(0.08, 0.55, ls.a);
    float rel = clamp(uReliefMix, 0.0, 1.0);
    float r0 = texture2D(uRelief, uv).r;
    float hLand = r0 * r0;
    float depth = 1.0 - texture2D(uSea, uv).r;

    vec3 ocean = mix(uOceanDeep, uOceanMid, 0.8);
    vec3 shelf = mix(vec3(0.10, 0.36, 0.48), vec3(0.08, 0.26, 0.42), (1.0 - uLandMix) * 0.6);
    ocean = mix(ocean, shelf, (1.0 - smoothstep(0.0, 0.09, depth)) * 0.75 * rel);
    ocean *= 1.0 - smoothstep(0.45, 0.95, depth) * 0.4 * rel;
    vec3 minimalLand = vec3(0.13, 0.27, 0.45);
    vec3 land = ls.rgb * 1.18 + vec3(0.02, 0.04, 0.07);
    float latd = abs(phi) * 57.2957795;
    land = mix(land, vec3(0.46, 0.41, 0.36), smoothstep(0.22, 0.55, hLand) * 0.5 * rel);
    float snowLine = mix(0.86, 0.14, smoothstep(26.0, 68.0, latd));
    land = mix(land, vec3(0.93, 0.95, 0.98), smoothstep(snowLine, snowLine + 0.1, hLand) * 0.85 * rel);
    vec3 col = mix(ocean, mix(minimalLand, land, uLandMix), landMask);

    if (rel > 0.001) {
      // slope from central differences at least a texel (or a screen pixel) apart, in km per km, exaggerated
      vec2 st = max(uReliefTexel, abs(dFdx(uv)) + abs(dFdy(uv)));
      float e = texture2D(uRelief, uv + vec2(st.x, 0.0)).r, w = texture2D(uRelief, uv - vec2(st.x, 0.0)).r;
      float n = texture2D(uRelief, uv + vec2(0.0, st.y)).r, s = texture2D(uRelief, uv - vec2(0.0, st.y)).r;
      vec2 g = vec2((e * e - w * w) / (2.0 * st.x), (n * n - s * s) / (2.0 * st.y));
      vec2 slope = vec2(g.x / (40030.0 * max(cos(phi), 0.12)), g.y / 20015.0) * 6.4 * 14.0;
      vec3 N = normalize(vec3(-slope, 1.0));
      vec3 L = normalize(vec3(-0.55, 0.65, 0.8));
      float shade = dot(N, L) - L.z;
      col *= 1.0 + (shade / (1.0 + abs(shade) * 1.6)) * 1.6 * rel * mix(0.4, 1.0, landMask);
    }

    // anti-aliased edge of the map, with a thin bright rim
    col = mix(uBg, col, smoothstep(-0.6, 0.6, edge));
    col = mix(col, uRim, (1.0 - smoothstep(0.0, 1.4, abs(edge))) * 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const QUAD = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
})();

function lineGeometry(seg: Float32Array, col?: Float32Array): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  // own copies: disposing a geometry frees its attributes' GPU buffers, which must not take the next one's with it
  g.setAttribute('position', QUAD.getAttribute('position').clone());
  g.setIndex(QUAD.getIndex()!.clone());
  const rad = new Float32Array(seg.length);
  for (let i = 0; i < seg.length; i++) rad[i] = seg[i] * D;
  g.setAttribute('aSeg', new THREE.InstancedBufferAttribute(rad, 4));
  if (col) g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 4));
  g.instanceCount = seg.length / 4;
  return g;
}

/** Graticule every `step`° plus the named circles, as segments with a colour each. */
function graticule(step: number): { seg: Float32Array; col: Float32Array } {
  const seg: number[] = [], col: number[] = [];
  const add = (lo1: number, la1: number, lo2: number, la2: number, c: [number, number, number, number]) => { seg.push(lo1, la1, lo2, la2); col.push(...c); };
  const plain: [number, number, number, number] = [0.85, 0.93, 1, 0.16];
  for (let lo = -180; lo < 180; lo += step) {
    const c: [number, number, number, number] = lo === 0 ? [0.49, 0.83, 0.99, 0.5] : plain;
    for (let la = -90; la < 90; la += 2) add(lo, la, lo, la + 2, c);
  }
  const named: [number, [number, number, number, number]][] = [
    [0, [0.98, 0.75, 0.14, 0.6]], [23.436, [0.99, 0.73, 0.45, 0.42]], [-23.436, [0.99, 0.73, 0.45, 0.42]],
    [66.564, [0.65, 0.95, 0.99, 0.42]], [-66.564, [0.65, 0.95, 0.99, 0.42]],
  ];
  for (let la = -90 + step; la < 90; la += step) if (la !== 0) for (let lo = -180; lo < 180; lo += 1) add(lo, la, lo + 1, la, plain);
  for (const [la, c] of named) for (let lo = -180; lo < 180; lo += 1) add(lo, la, lo + 1, la, c);
  return { seg: new Float32Array(seg), col: new Float32Array(col) };
}

const gridStep = (z: number) => (z < 2 ? 30 : z < 4.5 ? 15 : z < 9 ? 10 : 5);
/** Countries come from two resolutions (labels vs hit-testing), so match them by ISO code. */
const countryKey = (c: CountryInfo) => c.a2 || c.name;
const textW = (s: string, px: number) => (s.length + (s.match(/[\u3000-\u9fff]/g)?.length ?? 0) * 0.8) * px + 10;

export class FlatMap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera();
  private U = {
    uProj: { value: 0 }, uLon0: { value: 0 }, uCy: { value: 0 }, uK: { value: 100 }, uView: { value: new THREE.Vector2(1, 1) },
  };
  private mapU: Record<string, THREE.IUniform>;
  private borderLine: THREE.Mesh;
  private borderCase: THREE.Mesh;
  private grid: THREE.Mesh;
  private gridStepNow = 0;
  private borderSrc: Float32Array | null = null;
  private texSrc: HTMLCanvasElement | null = null;
  private reliefLoaded = false;

  private proj: ProjId = PROJ_IDS.includes(load<ProjId>('mapProj', 'equalearth')) ? load<ProjId>('mapProj', 'equalearth') : 'equalearth';
  private v: View = { lon0: 0, cy: 0, k: 100 };
  private W = 1;
  private H = 1;
  private sized = false;
  private anim: { from: View; to: View; t0: number; dur: number } | null = null;
  private fling: { vx: number; vy: number; phi: number; t: number } | null = null;
  private dirty = true;
  private lastLayout = 0;
  private raf = 0;
  private shown = false;

  private labelsEl = h('div', { class: 'labels fm-labels', 'aria-hidden': 'true' });
  private labelPool: HTMLSpanElement[] = [];
  private pinsEl = h('div', { class: 'fm-pins' });
  private pins = new Map<string, HTMLButtonElement>();
  private hl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private hlCase = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  private hlLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  private tag = h('div', { class: 'country-tag', 'data-testid': 'map-country-tag', hidden: true });
  private tagFor = '';
  private hoverC: CountryInfo | null = null;
  private picked: { c: CountryInfo; lat: number; lon: number } | null = null;
  private cursor: { x: number; y: number } | null = null;
  /** Quiz mode: country and city names stay hidden until a country is tapped. */
  private quiz = load<boolean>('mapQuiz', false);
  private revealed = new Set<string>();
  private bar = h('div', { class: 'fm-bar', 'data-occludes': true });
  private scaleEl = h('div', { class: 'fm-scale', 'aria-hidden': 'true' });

  constructor(private host: MapHost) {
    this.canvas = h('canvas', { class: 'fm-canvas', 'data-testid': 'map-canvas', tabindex: 0, 'aria-label': t('flatMapLabel') });
    this.hl.setAttribute('class', 'fm-hl');
    this.hl.setAttribute('aria-hidden', 'true');
    this.hlCase.setAttribute('class', 'fm-hl-case');
    this.hlLine.setAttribute('class', 'fm-hl-line');
    this.hl.append(this.hlCase, this.hlLine);
    this.el = h('div', { class: 'flatmap hidden', 'data-testid': 'flatmap', role: 'region', 'aria-label': t('flatMapLabel') },
      this.canvas, this.hl, this.labelsEl, this.pinsEl, this.tag, this.scaleEl, this.bar);

    const q = host.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q.msaa && !host.lowfx, powerPreference: 'high-performance' });
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dprMax));
    const flat = (v: number) => { const tx = new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1); tx.needsUpdate = true; return tx; };
    this.mapU = {
      ...this.U,
      uLand: { value: flat(0) }, uRelief: { value: flat(0) }, uSea: { value: flat(255) },
      uReliefTexel: { value: new THREE.Vector2(1 / q.reliefW, 2 / q.reliefW) },
      uReliefMix: { value: 0 }, uLandMix: { value: 1 }, uDpr: { value: this.renderer.getPixelRatio() },
      uOceanDeep: { value: new THREE.Color('#0c2340') }, uOceanMid: { value: new THREE.Color('#163a63') },
      uBg: { value: new THREE.Color('#050b16') }, uRim: { value: new THREE.Color('#7dd3fc') },
    };
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: MAP_VERT, fragmentShader: MAP_FRAG, uniforms: this.mapU, depthTest: false, depthWrite: false }));
    quad.frustumCulled = false;
    quad.renderOrder = 0;
    const lineMat = (color: string, alpha: number, vcol = false) => new THREE.ShaderMaterial({
      vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      defines: vcol ? { VCOL: '' } : {},
      uniforms: { ...this.U, uWidth: { value: 1 }, uColor: { value: new THREE.Vector4(...new THREE.Color(color).toArray(), alpha) } },
    });
    const empty = lineGeometry(new Float32Array(4));
    this.grid = new THREE.Mesh(empty, lineMat('#ffffff', 1, true));
    this.borderCase = new THREE.Mesh(empty, lineMat('#020617', 0.5));
    this.borderLine = new THREE.Mesh(empty, lineMat('#f1f5f9', 0.85));
    [this.grid, this.borderCase, this.borderLine].forEach((m, i) => { m.frustumCulled = false; m.renderOrder = i + 1; });
    this.scene.add(quad, this.grid, this.borderCase, this.borderLine);
    void warmShaders(this.renderer, this.scene, this.cam).then(() => { this.shadersReady = true; });

    this.renderBar();
    onLang(() => { this.renderBar(); this.canvas.setAttribute('aria-label', t('flatMapLabel')); this.tagFor = ''; this.dirty = true; });
    new ResizeObserver(() => this.resize()).observe(this.el);
    this.bindInput();
  }

  get isOpen(): boolean { return this.shown; }

  /** Shows the map centred on (lat, lon); the zoom is kept from last time. */
  open(lat: number, lon: number): void {
    if (this.shown) return;
    this.shown = true;
    this.el.classList.remove('hidden');
    this.resize();
    this.syncSources();
    this.v.lon0 = wrapPi(lon * D);
    this.v.cy = yOf(this.proj, lat * D);
    this.clamp(this.v);
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
    this.canvas.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.el.classList.add('hidden');
    this.anim = null; this.fling = null;
    this.hoverC = null; this.picked = null; this.cursor = null;
    this.tag.hidden = true;
    this.host.hover(null, null);
    releaseWhenHidden(this.renderer, () => !this.shown);
  }

  /** [lat, lon] at the centre of the screen. */
  center(): [number, number] {
    const ll = this.toLatLon(this.W / 2, this.H / 2);
    return ll ?? [this.v.cy / D, this.v.lon0 / D];
  }

  get zoom(): number { return this.v.k / this.kMin(); }

  zoomBy(f: number): void {
    const to = { ...this.target() };
    to.k = Math.max(this.kMin(), Math.min(this.kMin() * MAX_ZOOM, to.k * f));
    this.clamp(to);
    this.tween(to, 320);
  }

  /** Centres an item (beside the info card on wide screens), zooming in far enough for its marker to show. */
  focus(it: CatalogueItem): void {
    const to = { ...this.target() };
    const need = it.tier >= 3 ? 3.6 : it.tier === 2 ? 2.1 : 1;
    to.k = Math.max(to.k, this.kMin() * need);
    to.k = Math.min(to.k, this.kMin() * MAX_ZOOM);
    const off = this.W > 900 ? 190 : 0;
    to.cy = yOf(this.proj, it.lat * D);
    to.lon0 = wrapPi(it.lon * D - off / (to.k * xScale(this.proj, it.lat * D)));
    this.clamp(to);
    this.tween(to, 650);
  }

  /** A JPEG of the map as it is now (for photo mode). */
  capture(): string {
    this.draw();
    return this.canvas.toDataURL('image/jpeg', 0.9);
  }

  /** Screen point (px from the map's top-left) of a lat/lon. */
  toScreen(lat: number, lon: number): [number, number] {
    const [x, y] = forward(this.proj, wrapPi(lon * D - this.v.lon0), lat * D);
    return [this.W / 2 + x * this.v.k, this.H / 2 - (y - this.v.cy) * this.v.k];
  }

  toLatLon(sx: number, sy: number): [number, number] | null {
    const X = (sx - this.W / 2) / this.v.k, Y = this.v.cy + (this.H / 2 - sy) / this.v.k;
    const r = inverse(this.proj, X, Y);
    if (!r) return null;
    return [r[1] / D, wrapPi(r[0] + this.v.lon0) / D];
  }

  // ---------- view ----------
  private kMin(p = this.proj): number {
    const [xm, ym] = EXTENT[p];
    const fit = Math.min((this.W - FIT_PAD_X) / (2 * xm), (this.H - FIT_PAD_Y) / (2 * ym));
    // cylindrical maps always fill the width (they wrap), so there is never a gap at the sides
    return Math.max(1, wraps(p) ? Math.max(this.W / (2 * Math.PI), fit) : fit);
  }

  private clamp(v: View): void {
    const kMin = this.kMin();
    v.k = Math.max(kMin, Math.min(kMin * MAX_ZOOM, v.k));
    const ym = EXTENT[this.proj][1], half = this.H / 2 / v.k;
    // keep a little sea above and below so the poles can clear the top bar and bottom controls
    const pad = 60 / v.k;
    v.cy = ym + pad <= half ? 0 : Math.max(-ym - pad + half, Math.min(ym + pad - half, v.cy));
    v.lon0 = wrapPi(v.lon0);
  }

  private target(): View { return this.anim ? { ...this.anim.to } : { ...this.v }; }

  private tween(to: View, dur: number): void {
    this.fling = null;
    if (this.host.lowfx) { this.v = to; this.anim = null; this.dirty = true; return; }
    this.anim = { from: { ...this.v }, to, t0: performance.now(), dur };
    this.dirty = true;
  }

  /** Pans by screen pixels; sideways pans turn the central meridian at the latitude under the pointer. */
  private panBy(dx: number, dy: number, phi: number): void {
    this.v.lon0 -= dx / (this.v.k * xScale(this.proj, phi));
    this.v.cy += dy / this.v.k;
    this.clamp(this.v);
    this.dirty = true;
  }

  /** Zooms by `f` keeping the point under (sx, sy) still. */
  private zoomAt(sx: number, sy: number, f: number): void {
    this.anim = null; this.fling = null;
    const px = sx - this.W / 2, py = this.H / 2 - sy;
    const Y = this.v.cy + py / this.v.k;
    const phi = phiOf(this.proj, Y);
    const lon = this.v.lon0 + px / (this.v.k * xScale(this.proj, phi));
    this.v.k = Math.max(this.kMin(), Math.min(this.kMin() * MAX_ZOOM, this.v.k * f));
    this.v.cy = Y - py / this.v.k;
    this.v.lon0 = lon - px / (this.v.k * xScale(this.proj, phi));
    this.clamp(this.v);
    this.dirty = true;
  }

  private setProj(p: ProjId): void {
    if (p === this.proj) return;
    const [lat, lon] = this.center();
    const z = this.zoom;
    this.proj = p;
    save('mapProj', p);
    this.anim = null; this.fling = null;
    this.v = { lon0: lon * D, cy: yOf(p, lat * D), k: this.kMin(p) * z };
    this.clamp(this.v);
    this.renderBar();
    this.dirty = true;
  }

  private resize(): void {
    const w = this.el.clientWidth, hh = this.el.clientHeight;
    if (!w || !hh) return;
    const r = this.el.getBoundingClientRect();
    this.rect = { left: r.left, top: r.top };
    const z = this.sized ? this.zoom : 1;
    this.W = w; this.H = hh;
    this.renderer.setSize(w, hh, false);
    this.mapU.uDpr.value = this.renderer.getPixelRatio();
    this.v.k = this.kMin() * z;
    this.clamp(this.v);
    this.sized = true;
    this.dirty = true;
  }

  // ---------- data ----------
  private syncSources(): void {
    const cv = this.host.earthCanvas();
    if (cv !== this.texSrc) {
      this.texSrc = cv;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      (this.mapU.uLand.value as THREE.Texture).dispose();
      this.mapU.uLand.value = tex;
      this.dirty = true;
    }
    const b = this.host.borders();
    if (b !== this.borderSrc) {
      this.borderSrc = b;
      const g = lineGeometry(b);
      if (this.borderLine.geometry !== this.borderCase.geometry) this.borderCase.geometry.dispose();
      this.borderLine.geometry.dispose();
      this.borderLine.geometry = g;
      this.borderCase.geometry = g;
      this.dirty = true;
    }
    if (!this.reliefLoaded) {
      this.reliefLoaded = true;
      const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      Promise.all([
        loadRelief(url(`data/relief/land-${this.host.quality.reliefW}.webp`), { repeatX: true, anisotropy }),
        loadRelief(url('data/relief/sea-1024.webp'), { repeatX: true }),
      ]).then(([land, sea]) => {
        this.mapU.uRelief.value = land;
        this.mapU.uSea.value = sea;
        this.reliefReady = true;
        this.dirty = true;
      }, () => { /* the painted map alone still works */ });
    }
  }
  private reliefReady = false;
  /** Shaders compile in the background; the map draws once they are linked. */
  private shadersReady = false;
  /** The latest mouse position to hit-test, handled once per frame. */
  private hoverReq: { x: number; y: number } | null = null;
  private pinBoxes: [number, number, number, number][] = [];
  private rect: { left: number; top: number } = { left: 0, top: 0 };

  // ---------- frame ----------
  private loop = (now: number): void => {
    if (!this.shown) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(this.loop);
    if (!this.shadersReady) return;
    this.step(now);
    if (this.hoverReq) { const q = this.hoverReq; this.hoverReq = null; this.hoverAt(q.x, q.y); }
    if (this.dirty) {
      this.dirty = false;
      this.draw();
      this.layout();
      this.lastLayout = now;
    } else if (now - this.lastLayout > 500) {
      // settings, language, the selection or the time machine may have changed what is shown
      this.syncSources();
      this.layout();
      this.lastLayout = now;
    }
  };

  private step(now: number): void {
    const a = this.anim;
    if (a) {
      const u = Math.min(1, (now - a.t0) / a.dur), e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      this.v = {
        lon0: a.from.lon0 + wrapPi(a.to.lon0 - a.from.lon0) * e,
        cy: a.from.cy + (a.to.cy - a.from.cy) * e,
        k: a.from.k * (a.to.k / a.from.k) ** e,
      };
      if (u >= 1) { this.v = { ...a.to }; this.anim = null; }
      this.clamp(this.v);
      this.dirty = true;
    }
    const f = this.fling;
    if (f) {
      const dt = Math.min(48, now - f.t);
      f.t = now;
      this.panBy(f.vx * dt, f.vy * dt, f.phi);
      const decay = 0.93 ** (dt / 16);
      f.vx *= decay; f.vy *= decay;
      if (Math.hypot(f.vx, f.vy) < 0.02) this.fling = null;
    }
  }

  private draw(): void {
    const s = this.host.globe.settings, U = this.U;
    U.uProj.value = PROJ_INDEX[this.proj];
    U.uLon0.value = this.v.lon0;
    U.uCy.value = this.v.cy;
    U.uK.value = this.v.k;
    U.uView.value.set(this.W, this.H);
    const mode = s.surfaceMode;
    this.mapU.uLandMix.value = mode === 'minimal' ? 0 : 1;
    this.mapU.uReliefMix.value = !this.reliefReady ? 0 : mode === 'realistic' ? 1 : 0.6;
    const z = this.zoom;
    const step = gridStep(z);
    if (step !== this.gridStepNow) {
      this.gridStepNow = step;
      const g = graticule(step);
      this.grid.geometry.dispose();
      this.grid.geometry = lineGeometry(g.seg, g.col);
    }
    this.grid.visible = s.graticule;
    const bw = 0.9 + 0.32 * Math.log2(z);
    this.borderLine.visible = this.borderCase.visible = s.borders;
    const lm = this.borderLine.material as THREE.ShaderMaterial, cm = this.borderCase.material as THREE.ShaderMaterial;
    lm.uniforms.uWidth.value = bw;
    cm.uniforms.uWidth.value = bw + 1.8;
    (lm.uniforms.uColor.value as THREE.Vector4).set(...(mode === 'minimal' ? [0.49, 0.83, 0.99] : [0.95, 0.96, 0.98]) as [number, number, number], mode === 'political' ? 0.9 : 0.8);
    (this.grid.material as THREE.ShaderMaterial).uniforms.uWidth.value = 1;
    this.renderer.render(this.scene, this.cam);
  }

  // ---------- overlay ----------
  private layout(): void {
    const s = this.host.globe.settings, z = this.zoom;
    this.layoutLabels(s.names, s.graticule, z);
    this.drawHighlight();
    this.updateTag();
    this.updateScale();
    const [lat, lon] = this.center();
    this.host.onView(z, lat, lon);
  }

  private onScreen(x: number, y: number, m = 0): boolean { return x >= -m && y >= -m && x <= this.W + m && y <= this.H + m; }

  /** Whether longitude `lon` is on the drawn map (the equal-earth oval's edge depends only on longitude). */
  private onMap(lon: number): boolean {
    return !(this.proj === 'equalearth' && Math.abs(wrapPi(lon * D - this.v.lon0)) > Math.PI - 1e-6);
  }

  private layoutLabels(names: boolean, grid: boolean, z: number): void {
    type L = { text: string; cls: string; x: number; y: number; pri: number; corner?: boolean };
    const out: L[] = [];
    const l = lang();
    const push = (text: string, cls: string, lat: number, lon: number, pri: number, corner = false) => {
      const [x, y] = this.toScreen(lat, lon);
      if (this.onScreen(x, y, 20)) out.push({ text, cls, x, y, pri, corner });
    };
    if (grid) this.pushGridLabels(push, l);
    if (this.quiz) {
      for (const c of this.host.countries()) {
        if (this.revealed.has(countryKey(c))) push(this.host.globe.countryLabel(c), 'lb-country lb-revealed', c.lat, c.lon, 1e6 + c.area);
      }
    }
    if (names) {
      const kd = this.v.k * D;
      for (const c of this.quiz ? [] : this.host.countries()) {
        if (!c.a2) continue;
        // projected area in px² (area is in square degrees of ground)
        const phi = c.lat * D, hs = xScale(this.proj, phi) / Math.max(0.05, Math.cos(phi));
        const vs = (yOf(this.proj, phi + 0.01) - yOf(this.proj, phi - 0.01)) / 0.02;
        if (c.area * kd * kd * hs * vs < 700) continue;
        push(this.host.globe.countryLabel(c), 'lb-country', c.lat, c.lon, 1000 + c.area);
      }
      const minPop = z < 1.4 ? 14 : z < 2.2 ? 6 : z < 3.5 ? 2.5 : z < 6 ? 1 : 0;
      for (const [name, , la, lo, pop, cap] of this.quiz ? [] : CITIES) {
        if (pop < minPop && !(cap && z >= 2.6)) continue;
        push(cityName(name, l), cap ? 'lb-city lb-cap' : 'lb-city', la, lo, pop + (cap ? 5 : 0));
      }
      if (z < 5) for (const [, n, la, lo] of OCEANS) push(n[l] ?? n.en, 'lb-ocean', la, lo, 2000);
    }
    const isC = (lb: L) => (lb.cls.startsWith('lb-country') ? 1 : 0);
    out.sort((a, b) => isC(b) - isC(a) || b.pri - a.pri);
    // country names first, then the pins around them, then every other label in the gaps
    const boxes: [number, number, number, number][] = [];
    let used = 0;
    let pinsDone = false;
    for (const lb of out) {
      if (!pinsDone && !isC(lb)) { pinsDone = true; this.layoutPins(z, boxes); boxes.push(...this.pinBoxes); }
      const w = textW(lb.text, isC(lb) ? 8 : 6.5), hh = 16;
      const cx = lb.corner ? lb.x + w / 2 + 2 : lb.x, cy = lb.corner ? lb.y - hh / 2 - 1 : lb.y;
      const bx: [number, number, number, number] = [cx - w / 2, cy - hh / 2, cx + w / 2, cy + hh / 2];
      if (boxes.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) continue;
      boxes.push(bx);
      let el = this.labelPool[used];
      if (!el) { el = document.createElement('span'); this.labelsEl.append(el); this.labelPool.push(el); }
      if (el.textContent !== lb.text) el.textContent = lb.text;
      if (el.className !== lb.cls) el.className = lb.cls;
      el.style.display = '';
      el.style.transform = `translate(${lb.x.toFixed(1)}px,${lb.y.toFixed(1)}px) ` + (lb.corner ? 'translate(3px,-100%)' : 'translate(-50%,-50%)');
      used++;
      if (used > 160) break;
    }
    if (!pinsDone) this.layoutPins(z, boxes);
    for (let i = used; i < this.labelPool.length; i++) this.labelPool[i].style.display = 'none';
  }

  private pushGridLabels(push: (text: string, cls: string, lat: number, lon: number, pri: number, corner?: boolean) => void, l: 'en' | 'zh'): void {
    const step = gridStep(this.zoom);
    const [clat, clon] = this.center();
    const snap = (v: number) => Math.round(v / step) * step;
    const lonC = ((snap(clon) + 540) % 360) - 180;
    const latC = Math.abs(clat) < step * 2.5 ? 0 : Math.max(-75, Math.min(75, snap(clat)));
    const fmt = (v: number, pos: string, neg: string) => (v === 0 ? '0°' : `${Math.abs(v)}°${v > 0 ? pos : neg}`);
    for (let la = -90 + step; la < 90; la += step) if (la !== latC) push(fmt(la, 'N', 'S'), 'lb-grid', la, lonC, 40, true);
    for (let lo = -180; lo < 180; lo += step) if (this.onMap(lo)) push(Math.abs(lo) === 180 ? '180°' : fmt(lo, 'E', 'W'), 'lb-grid', latC, lo, 40, true);
    const named: [string, number][] = [['equator', 0], ['tropicN', 23.436], ['tropicS', -23.436], ['arcticC', 66.564], ['antarcticC', -66.564]];
    for (const [k, la] of named) push(GRID_NAMES[k][l] ?? GRID_NAMES[k].en, 'lb-grid lb-gridname g-' + k, la, lonC + step * 0.5, 600, true);
    if (this.onMap(0)) push(GRID_NAMES.prime[l] ?? GRID_NAMES.prime.en, 'lb-grid lb-gridname g-prime', Math.max(-60, Math.min(60, clat + step * 0.5)), 0, 600, true);
  }

  private layoutPins(z: number, avoid: readonly [number, number, number, number][]): void {
    const sel = this.host.selected();
    const maxTier = z >= 3.5 ? 3 : z >= 2 ? 2 : 1;
    const cand: { it: CatalogueItem; x: number; y: number }[] = [];
    const g = this.host.globe;
    if (!g.gameMode) {
      for (const it of CATALOGUE) {
        const isSel = sel?.key === it.key;
        if (!isSel && (it.tier > maxTier || !g.listed(it))) continue;
        if (!this.onMap(it.lon)) continue;
        const [x, y] = this.toScreen(it.lat, it.lon);
        if (!this.onScreen(x, y, 16)) continue;
        cand.push({ it, x, y });
      }
    }
    cand.sort((a, b) => (b.it.key === sel?.key ? 1 : 0) - (a.it.key === sel?.key ? 1 : 0) || a.it.tier - b.it.tier);
    const cell = z < 1.6 ? 34 : z < 3 ? 30 : 26, taken = new Set<string>(), live = new Set<string>();
    this.pinBoxes.length = 0;
    for (const c of cand) {
      const isSel = c.it.key === sel?.key;
      const gk = Math.floor(c.x / cell) + ',' + Math.floor(c.y / cell);
      if (!isSel && (taken.has(gk) || avoid.some(b => c.x + 9 > b[0] && c.x - 9 < b[2] && c.y + 9 > b[1] && c.y - 9 < b[3]))) continue;
      taken.add(gk);
      if (live.size >= 240 && !isSel) continue;
      live.add(c.it.key);
      const el = this.pin(c.it);
      el.classList.toggle('sel', isSel);
      el.style.transform = `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px) translate(-50%,-50%)`;
      this.pinBoxes.push([c.x - 11, c.y - 11, c.x + 11, c.y + 11]);
      if (el.hidden) el.hidden = false;
    }
    for (const [k, el] of this.pins) if (!live.has(k) && !el.hidden) el.hidden = true;
  }

  private pin(it: CatalogueItem): HTMLButtonElement {
    let el = this.pins.get(it.key);
    if (el) {
      const name = tr(it.name, lang());
      if (el.getAttribute('aria-label') !== name) el.setAttribute('aria-label', name);
      return el;
    }
    const meta = TYPE_META[it.type];
    el = h('button', {
      class: 'fm-pin', 'data-key': it.key, 'data-testid': 'map-pin', 'aria-label': tr(it.name, lang()), style: `--c:${meta.color}`,
      onclick: () => { this.host.hover(null, null); this.host.pick(it); },
      onpointerenter: () => { const r = el!.getBoundingClientRect(), o = this.el.getBoundingClientRect(); this.host.hover(it, { x: r.left + r.width / 2 - o.left, y: r.top - o.top + 4 }); },
      onpointerleave: () => this.host.hover(null, null),
    }, it.emoji || meta.emoji);
    el.hidden = true;
    this.pins.set(it.key, el);
    this.pinsEl.append(el);
    return el;
  }

  private countryUi(): boolean { return (this.host.globe.settings.borders || this.quiz) && !this.host.globe.gameMode; }

  private shownCountry(): CountryInfo | null {
    return this.countryUi() ? this.hoverC ?? this.picked?.c ?? null : null;
  }

  /** The outline of the hovered or tapped country, as an SVG path re-projected every frame. */
  private drawHighlight(): void {
    const c = this.shownCountry();
    if (!c) { this.hl.style.display = 'none'; return; }
    const f = c.feature;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let d = '';
    let broken = false;
    for (const rings of polys) {
      for (const ring of rings) {
        let pl = 0, px = 0, py = 0, open = false;
        for (let i = 0; i < ring.length; i++) {
          const [lo, la] = ring[i];
          const lam = wrapPi(lo * D - this.v.lon0);
          const [x, y] = this.toScreen(la, lo);
          const jump = open && Math.abs(lam - pl) > Math.PI;
          if (!open || jump) { d += `M${x.toFixed(1)} ${y.toFixed(1)}`; open = true; if (jump) broken = true; }
          else if (Math.abs(x - px) + Math.abs(y - py) > 0.8 || i === ring.length - 1) d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
          else continue;
          pl = lam; px = x; py = y;
        }
      }
    }
    this.hlCase.setAttribute('d', d);
    this.hlLine.setAttribute('d', d);
    this.hl.classList.toggle('broken', broken);
    this.hl.style.display = '';
  }

  private updateTag(): void {
    const c = this.shownCountry(), tag = this.tag;
    let p: { x: number; y: number } | null = null;
    if (c && c === this.hoverC && this.cursor) p = this.cursor;
    else if (c && this.picked?.c === c) { const [x, y] = this.toScreen(this.picked.lat, this.picked.lon); p = { x, y }; }
    // in quiz mode hovering only outlines the country; its name waits for a tap
    if (!c || !p || (this.quiz && !this.revealed.has(countryKey(c)))) { if (!tag.hidden) tag.hidden = true; return; }
    const l = lang(), key = l + c.id;
    if (this.tagFor !== key) {
      this.tagFor = key;
      let name = c.name;
      if (c.a2 && c.a2 !== 'XK') try { name = new Intl.DisplayNames([l], { type: 'region' }).of(c.a2) ?? c.name; } catch { /* keep the English name */ }
      tag.replaceChildren(document.createTextNode(name));
      const cont = CONTINENT_NAMES[c.continent];
      if (cont && c.a2 !== 'AQ') tag.append(h('small', {}, cont[l] ?? cont.en));
    }
    tag.style.transform = `translate(${p.x.toFixed(1)}px,${(p.y - 14).toFixed(1)}px) translate(-50%,-100%)`;
    tag.hidden = false;
  }

  private updateScale(): void {
    const [lat] = this.center();
    const phi = lat * D;
    const kmPerPx = (R_KM * Math.cos(phi)) / (this.v.k * xScale(this.proj, phi));
    if (!(kmPerPx > 0) || !isFinite(kmPerPx)) { this.scaleEl.hidden = true; return; }
    const raw = kmPerPx * 110, p10 = 10 ** Math.floor(Math.log10(raw));
    const nice = [5, 2, 1].map(m => m * p10).find(n => n <= raw) ?? p10;
    const w = nice / kmPerPx;
    this.scaleEl.hidden = false;
    this.scaleEl.replaceChildren(h('i', { style: `width:${w.toFixed(1)}px` }), h('span', {}, t('kmN', { n: fmtNum(nice) })));
  }

  private renderBar(): void {
    const names: Record<ProjId, string> = { equalearth: t('projEqualEarth'), mercator: t('projMercator'), plate: t('projPlate') };
    const notes: Record<ProjId, string> = { equalearth: t('projEqualEarthNote'), mercator: t('projMercatorNote'), plate: t('projPlateNote') };
    this.bar.replaceChildren(
      h('p', { class: 'fm-note' }, notes[this.proj],
        h('button', { class: 'fm-learn', 'data-testid': 'map-learn', html: icon('bulb', 14), onclick: () => this.host.learn() }, h('span', {}, t('mapLearn')))),
      ...!this.quiz ? []
        : this.revealed.size
          ? [h('button', { class: 'pill pill-sm fm-quiz-reset', 'data-testid': 'map-quiz-reset', onclick: () => this.hideRevealed() }, t('mapQuizReset', { n: this.revealed.size }))]
          : [h('span', { class: 'fm-quiz-hint' }, t('mapQuizHint'))],
      h('div', { class: 'fm-row' },
        h('label', { class: 'fm-switch' },
          h('input', { type: 'checkbox', role: 'switch', 'data-testid': 'map-names', checked: !this.quiz, onchange: (e: Event) => this.setQuiz(!(e.target as HTMLInputElement).checked) }),
          h('span', { class: 'fm-track', 'aria-hidden': 'true' }),
          h('span', {}, t('mapNames'))),
        h('div', { class: 'seg fm-proj', role: 'radiogroup', 'aria-label': t('mapProjection') },
          ...PROJ_IDS.map(p => h('button', {
            class: p === this.proj ? 'on' : '', role: 'radio', 'aria-checked': String(p === this.proj), 'data-testid': 'proj-' + p,
            onclick: () => this.setProj(p),
          }, names[p])))));
  }

  private setQuiz(on: boolean): void {
    this.quiz = on;
    save('mapQuiz', on);
    this.hideRevealed();
    this.bar.querySelector<HTMLInputElement>('[data-testid="map-names"]')?.focus();
  }

  private hideRevealed(): void {
    this.revealed.clear();
    this.picked = null;
    this.renderBar();
    this.drawHighlight(); this.updateTag();
    this.dirty = true;
  }

  // ---------- input ----------
  private bindInput(): void {
    const c = this.canvas;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; t: number } | null = null;
    let moved = false, pinch = 0, dragPhi = 0;
    let last: { x: number; y: number; t: number } | null = null, vel = { x: 0, y: 0 };
    // the map covers #app; its rect is cached (re-read on resize) so pointer moves never force a layout
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => { const r = this.rect; return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const phiAt = (y: number) => phiOf(this.proj, this.v.cy + (this.H / 2 - y) / this.v.k);

    c.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      c.setPointerCapture(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, p);
      this.anim = null; this.fling = null;
      if (pts.size === 1) { start = { ...p, t: performance.now() }; moved = false; dragPhi = phiAt(p.y); last = { ...start }; vel = { x: 0, y: 0 }; }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
    });
    c.addEventListener('pointermove', e => {
      const p = local(e);
      if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') this.hoverReq = p; return; }
      const prev = pts.get(e.pointerId)!;
      pts.set(e.pointerId, p);
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && d > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        this.panBy((p.x - prev.x) / 2, (p.y - prev.y) / 2, phiAt((a.y + b.y) / 2));
        pinch = d;
        return;
      }
      if (!start) return;
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 5) return;
      if (!moved) { moved = true; this.el.classList.add('dragging'); this.clearHover(); }
      this.panBy(p.x - prev.x, p.y - prev.y, dragPhi);
      const now = performance.now();
      if (last) { const dt = Math.max(1, now - last.t); vel = { x: (p.x - last.x) / dt, y: (p.y - last.y) / dt }; }
      last = { ...p, t: now };
    });
    const end = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.delete(e.pointerId);
      if (pts.size > 0) { pinch = 0; const q = [...pts.values()][0]; start = { ...q, t: performance.now() }; last = { ...start }; dragPhi = phiAt(q.y); return; }
      this.el.classList.remove('dragging');
      if (!moved && e.type === 'pointerup') this.tapAt(p.x, p.y);
      else if (moved && last && performance.now() - last.t < 60 && !this.host.lowfx && Math.hypot(vel.x, vel.y) > 0.15) {
        this.fling = { vx: vel.x, vy: vel.y, phi: dragPhi, t: performance.now() };
      }
      start = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', e => { if (!pts.has(e.pointerId)) this.clearHover(); });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const p = local(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      this.zoomAt(p.x, p.y, Math.exp(-dy * 0.0016));
    }, { passive: false });
    c.addEventListener('dblclick', e => {
      const p = local(e);
      const to = { ...this.v };
      const px = p.x - this.W / 2, py = this.H / 2 - p.y;
      const Y = this.v.cy + py / this.v.k, phi = phiOf(this.proj, Y);
      const lon = this.v.lon0 + px / (this.v.k * xScale(this.proj, phi));
      to.k = Math.min(this.kMin() * MAX_ZOOM, to.k * 2);
      to.cy = Y; to.lon0 = lon;
      this.clamp(to);
      this.tween(to, 380);
    });
    c.addEventListener('keydown', e => {
      const k = e.key, step = 90;
      if (k === 'ArrowLeft') this.panBy(step, 0, phiAt(this.H / 2));
      else if (k === 'ArrowRight') this.panBy(-step, 0, phiAt(this.H / 2));
      else if (k === 'ArrowUp') this.panBy(0, step, 0);
      else if (k === 'ArrowDown') this.panBy(0, -step, 0);
      else if (k === '+' || k === '=') this.zoomBy(1.6);
      else if (k === '-' || k === '_') this.zoomBy(1 / 1.6);
      else return;
      e.preventDefault();
    });
  }

  private clearHover(): void {
    this.hoverReq = null;
    if (!this.hoverC && !this.cursor) return;
    this.hoverC = null; this.cursor = null;
    this.drawHighlight(); this.updateTag();
  }

  private hoverAt(x: number, y: number): void {
    if (!this.countryUi()) return;
    const ll = this.toLatLon(x, y);
    const c = ll ? countryAt(this.host.shapes(), ll[0], ll[1]) : null;
    this.cursor = { x, y };
    if (c !== this.hoverC) { this.hoverC = c; this.drawHighlight(); }
    this.updateTag();
  }

  private tapAt(x: number, y: number): void {
    this.host.hover(null, null);
    if (!this.countryUi()) return;
    const ll = this.toLatLon(x, y);
    const c = ll ? countryAt(this.host.shapes(), ll[0], ll[1]) : null;
    this.picked = c && ll ? { c, lat: ll[0], lon: ll[1] } : null;
    if (this.quiz && c) {
      // a tap flips the country: hidden names are revealed, revealed ones go back into hiding
      const k = countryKey(c);
      if (!this.revealed.delete(k)) this.revealed.add(k);
      this.renderBar();
      this.dirty = true;
    }
    // on touch there is no hover: the tap is what shows the outline
    if (this.hoverC && this.hoverC !== c) this.hoverC = null;
    this.drawHighlight(); this.updateTag();
  }
}
