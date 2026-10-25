/**
 * Kit "strata": rock layers.
 * - `history`: layers settle one on another through geological time (clock 0 … 1, the first 15 % the Precambrian),
 *   each with its fossils; coal seams, the two great extinctions and the eras. `full` shows the finished pile;
 *   `bare` drops the labels. Pickable eras: `precambrian`, `paleozoic`, `mesozoic`, `cenozoic`.
 * - `fold`: flat layers squeezed into an anticline and a syncline, then worn down until the anticline becomes a valley
 *   and the syncline a mountain. Lab parameters `squeeze` and `erode` (0 … 100), else the options. `res` adds oil and
 *   gas under the anticline and groundwater in the syncline. Pickable: `anticline`, `syncline`.
 * - `fault`: a block cut by two faults; the middle block rises (`horst`) or drops (`graben`). The clock (0 … 100) is
 *   the movement.
 */
import * as THREE from 'three';
import { Arrow, canvasTex, clamp, dirLight, line, ramp, setLine, starfield } from './draw.ts';
import type { KitCtx, KitFactory, Label, LabelOpts, Pair } from './types.ts';
import { foldModel } from '../models.ts';

export interface Opts {
  mode: 'history' | 'fold' | 'fault';
  bare?: boolean;
  /** `history`: show the finished pile (no clock) */
  full?: boolean;
  /** `fold`: oil and gas, groundwater */
  res?: boolean;
  /** `fold` without lab parameters */
  squeeze?: number; erode?: number;
  /** `fault` */
  kind?: 'horst' | 'graben';
}

const num = (ctx: KitCtx, id: string, d: number) => { const v = ctx.param(id); return Number.isFinite(v) ? v : d; };

/**
 * A section slab extruded toward the viewer (−y): the front face grid from `pos(s, t)` → (x, z), the top strip (t = 0)
 * and both end caps. `fill` rewrites it in place.
 */
class Slab {
  readonly geo = new THREE.BufferGeometry();
  private P: Float32Array; private C: Float32Array;
  constructor(private n: number, private m: number, private D: number, private top = true) {
    const nv = (n + 1) * (m + 1) + (top ? 2 * (n + 1) : 0) + 4 * (m + 1), I: number[] = [];
    this.P = new Float32Array(nv * 3); this.C = new Float32Array(nv * 3);
    let b = 0;
    const grid = (cols: number, rows: number) => {
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const k = b + j * (cols + 1) + i, k2 = k + cols + 1; I.push(k, k2, k + 1, k + 1, k2, k2 + 1); }
      b += (cols + 1) * (rows + 1);
    };
    grid(n, m); if (top) grid(n, 1); grid(1, m); grid(1, m);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.P, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.C, 3));
    this.geo.setIndex(I);
  }
  fill(pos: (s: number, t: number) => [number, number], face: (s: number, t: number, out: THREE.Color) => void, topc?: (s: number, out: THREE.Color) => void): void {
    const { n, m, D, P, C } = this, c = new THREE.Color();
    let k = 0;
    const v = (x: number, y: number, z: number) => { P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z; C[k * 3] = c.r; C[k * 3 + 1] = c.g; C[k * 3 + 2] = c.b; k++; };
    for (let j = 0; j <= m; j++) for (let i = 0; i <= n; i++) { const [x, z] = pos(i / n, j / m); face(i / n, j / m, c); v(x, -D / 2, z); }
    if (this.top) for (let j = 0; j <= 1; j++) for (let i = 0; i <= n; i++) { const [x, z] = pos(i / n, 0); if (topc) topc(i / n, c); else face(i / n, 0, c); v(x, -D / 2 + j * D, z); }
    for (const s of [0, 1]) for (let j = 0; j <= m; j++) for (let i = 0; i <= 1; i++) { const [x, z] = pos(s, j / m); face(s, j / m, c); v(x, -D / 2 + i * D, z); }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
const slabMesh = (s: Slab, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.Mesh(s.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, ...o }));
/** An invisible box that answers "tap it" questions. */
function proxy(ctx: KitCtx, tag: string, w: number, h: number, at: THREE.Vector3): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, h), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  m.position.copy(at);
  ctx.root.add(m);
  ctx.pickable(m, tag);
  return m;
}
const grain = (s: number, t: number) => 0.93 + 0.07 * Math.sin(t * 37 + Math.sin(s * 23) * 1.5) * Math.sin(s * 91 + t * 7);

const kit: KitFactory<Opts> = (ctx, o) => {
  ctx.root.add(starfield(ctx.low ? 700 : 1400, 900, 5));
  if (o.mode === 'history') return history(ctx, o);
  if (o.mode === 'fault') return fault(ctx, o);
  return fold(ctx, o);
};
export default kit;

// ------------------------------------------------------------------------------------------------------ fossils

type Icon = 'stromatolite' | 'trilobite' | 'shell' | 'fish' | 'fern' | 'track' | 'dino' | 'ammonite' | 'flower' | 'mammal' | 'leaf' | 'axe';
function icon(kind: Icon): THREE.CanvasTexture {
  return canvasTex(128, 128, c => {
    c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#3b2f25'; c.fillStyle = '#f3e7cf';
    const both = () => { c.fill(); c.stroke(); };
    c.beginPath();
    switch (kind) {
      case 'stromatolite':
        for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(64, 104, 50 - i * 11, 70 - i * 15, 0, Math.PI, 2 * Math.PI); both(); }
        break;
      case 'trilobite':
        c.ellipse(64, 66, 34, 50, 0, 0, 2 * Math.PI); both();
        c.beginPath(); c.ellipse(64, 30, 34, 18, 0, Math.PI, 2 * Math.PI); c.stroke();
        c.beginPath(); c.moveTo(52, 30); c.lineTo(52, 112); c.moveTo(76, 30); c.lineTo(76, 112); c.stroke();
        for (let y = 44; y < 108; y += 10) { c.beginPath(); c.moveTo(32, y); c.lineTo(96, y); c.stroke(); }
        break;
      case 'shell':
        c.moveTo(64, 108); c.lineTo(14, 52); c.quadraticCurveTo(64, -6, 114, 52); c.closePath(); both();
        for (let a = -2; a <= 2; a++) { c.beginPath(); c.moveTo(64, 104); c.lineTo(64 + a * 22, 30 + Math.abs(a) * 8); c.stroke(); }
        break;
      case 'fish':
        c.ellipse(56, 64, 40, 20, 0, 0, 2 * Math.PI); both();
        c.beginPath(); c.moveTo(94, 64); c.lineTo(122, 40); c.lineTo(122, 88); c.closePath(); both();
        c.beginPath(); c.arc(34, 58, 4, 0, 2 * Math.PI); c.fillStyle = '#3b2f25'; c.fill();
        c.beginPath(); c.moveTo(60, 46); c.lineTo(72, 30); c.lineTo(80, 50); c.stroke();
        break;
      case 'fern':
        c.moveTo(64, 120); c.quadraticCurveTo(58, 60, 76, 8); c.stroke();
        for (let i = 0; i < 9; i++) {
          const y = 108 - i * 11, x = 64 + i * 1.2, l = 34 - i * 3;
          c.beginPath(); c.ellipse(x - l / 2, y, l / 2, 5, -0.4, 0, 2 * Math.PI); both();
          c.beginPath(); c.ellipse(x + l / 2, y - 3, l / 2, 5, 0.4, 0, 2 * Math.PI); both();
        }
        break;
      case 'track':
        c.ellipse(64, 92, 18, 22, 0, 0, 2 * Math.PI); both();
        for (const a of [-0.55, 0, 0.55]) { c.beginPath(); c.ellipse(64 + Math.sin(a) * 40, 70 - Math.cos(a) * 40, 8, 22, a, 0, 2 * Math.PI); both(); }
        break;
      case 'dino':
        c.moveTo(20, 50); c.lineTo(108, 78); c.stroke();
        for (const [x, y] of [[20, 50], [108, 78]]) { c.beginPath(); c.arc(x - 6, y - 8, 12, 0, 2 * Math.PI); both(); c.beginPath(); c.arc(x + 6, y + 8, 12, 0, 2 * Math.PI); both(); }
        c.beginPath(); c.lineWidth = 16; c.strokeStyle = '#f3e7cf'; c.moveTo(24, 51); c.lineTo(104, 77); c.stroke();
        break;
      case 'ammonite':
        c.arc(64, 64, 50, 0, 2 * Math.PI); both();
        c.beginPath();
        for (let a = 0; a < 6 * Math.PI; a += 0.1) { const r = 48 * Math.exp(-a * 0.16); c.lineTo(64 + r * Math.cos(a), 64 + r * Math.sin(a)); }
        c.stroke();
        for (let a = 0; a < 2 * Math.PI; a += 0.45) { c.beginPath(); c.moveTo(64 + 30 * Math.cos(a), 64 + 30 * Math.sin(a)); c.lineTo(64 + 49 * Math.cos(a), 64 + 49 * Math.sin(a)); c.stroke(); }
        break;
      case 'flower':
        c.moveTo(64, 124); c.lineTo(64, 70); c.stroke();
        for (let i = 0; i < 5; i++) { const a = (i / 5) * 2 * Math.PI - Math.PI / 2; c.beginPath(); c.ellipse(64 + 22 * Math.cos(a), 50 + 22 * Math.sin(a), 16, 10, a, 0, 2 * Math.PI); both(); }
        c.beginPath(); c.arc(64, 50, 9, 0, 2 * Math.PI); c.fillStyle = '#e8b04a'; both();
        break;
      case 'mammal':
        c.ellipse(60, 70, 36, 20, 0, 0, 2 * Math.PI); both();
        c.beginPath(); c.arc(104, 56, 14, 0, 2 * Math.PI); both();
        c.beginPath(); c.moveTo(26, 64); c.quadraticCurveTo(8, 50, 12, 36); c.stroke();
        for (const x of [36, 50, 72, 84]) { c.beginPath(); c.moveTo(x, 84); c.lineTo(x, 108); c.stroke(); }
        c.beginPath(); c.moveTo(100, 44); c.lineTo(104, 30); c.lineTo(110, 44); c.stroke();
        break;
      case 'leaf':
        c.moveTo(64, 120); c.quadraticCurveTo(10, 60, 64, 8); c.quadraticCurveTo(118, 60, 64, 120); both();
        c.beginPath(); c.moveTo(64, 120); c.lineTo(64, 16); c.stroke();
        for (let y = 36; y < 108; y += 16) { c.beginPath(); c.moveTo(64, y + 10); c.lineTo(40, y); c.moveTo(64, y + 10); c.lineTo(88, y); c.stroke(); }
        break;
      case 'axe':
        c.moveTo(64, 8); c.quadraticCurveTo(118, 70, 64, 120); c.quadraticCurveTo(10, 70, 64, 8); both();
        for (const [x, y] of [[54, 50], [74, 56], [60, 80], [72, 92]]) { c.beginPath(); c.arc(x, y, 8, 0.2, 2.6); c.stroke(); }
        break;
    }
  });
}

// ------------------------------------------------------------------------------------------------------ history

interface Period { name: Pair; from: number; to: number; h: number; col: string; era: 0 | 1 | 2 | 3; life: Pair; icons: Icon[]; coal?: boolean }
const PERIODS: Period[] = [
  { name: ['Precambrian', '前寒武纪'], from: 4600, to: 541, h: 1.0, col: '#a86a7c', era: 0, life: ['Bacteria and algae', '蓝细菌、藻类'], icons: ['stromatolite'] },
  { name: ['Cambrian', '寒武纪'], from: 541, to: 485, h: 0.36, col: '#7fa36f', era: 1, life: ['Trilobites: life bursts out in the sea', '三叶虫：海洋生命大爆发'], icons: ['trilobite', 'trilobite'] },
  { name: ['Ordovician–Silurian', '奥陶纪—志留纪'], from: 485, to: 419, h: 0.36, col: '#55a88f', era: 1, life: ['Marine invertebrates', '海洋无脊椎动物'], icons: ['shell', 'trilobite'] },
  { name: ['Devonian', '泥盆纪'], from: 419, to: 359, h: 0.36, col: '#c98b4a', era: 1, life: ['Age of fishes; plants reach land', '鱼类繁盛；植物登陆'], icons: ['fish', 'fish'] },
  { name: ['Carboniferous', '石炭纪'], from: 359, to: 299, h: 0.42, col: '#6f9a9a', era: 1, life: ['Fern forests, amphibians', '蕨类森林、两栖动物'], icons: ['fern', 'fern'], coal: true },
  { name: ['Permian', '二叠纪'], from: 299, to: 252, h: 0.34, col: '#c96550', era: 1, life: ['Ferns; reptiles appear', '蕨类；爬行动物出现'], icons: ['fern'], coal: true },
  { name: ['Triassic', '三叠纪'], from: 252, to: 201, h: 0.34, col: '#9a68a6', era: 2, life: ['Reptiles, first dinosaurs', '爬行动物、早期恐龙'], icons: ['track'] },
  { name: ['Jurassic', '侏罗纪'], from: 201, to: 145, h: 0.42, col: '#4aa6c4', era: 2, life: ['Dinosaurs, gymnosperm forests', '恐龙、裸子植物森林'], icons: ['dino', 'track'], coal: true },
  { name: ['Cretaceous', '白垩纪'], from: 145, to: 66, h: 0.38, col: '#86bf62', era: 2, life: ['Dinosaurs, ammonites; first flowers', '恐龙、菊石；被子植物出现'], icons: ['ammonite', 'flower'] },
  { name: ['Paleogene–Neogene', '古近纪—新近纪'], from: 66, to: 2.6, h: 0.38, col: '#e9ad58', era: 3, life: ['Mammals, flowering plants', '哺乳动物、被子植物'], icons: ['mammal', 'leaf'] },
  { name: ['Quaternary', '第四纪'], from: 2.6, to: 0, h: 0.22, col: '#e6d9a0', era: 3, life: ['Humans', '人类出现'], icons: ['axe'] },
];
const ERAS: { tag: string; name: Pair }[] = [
  { tag: 'precambrian', name: ['Precambrian (Archean, Proterozoic)', '前寒武纪（太古宙、元古宙）'] },
  { tag: 'paleozoic', name: ['Paleozoic', '古生代'] },
  { tag: 'mesozoic', name: ['Mesozoic', '中生代'] },
  { tag: 'cenozoic', name: ['Cenozoic', '新生代'] },
];
/** clock (0 … 1) → age in millions of years: the Precambrian takes the first 15 % */
const ageAt = (v: number) => (v < 0.15 ? 4600 - (4600 - 541) * (v / 0.15) : 541 * (1 - (v - 0.15) / 0.85));
const fmtAge = (a: number): Pair => a >= 100
  ? [`${Math.round(a)} million years ago`, `${(a / 100).toFixed(a >= 1000 ? 1 : 2)} 亿年前`]
  : a >= 1 ? [`${a.toFixed(a < 10 ? 1 : 0)} million years ago`, `${Math.round(a * 100)} 万年前`] : [`today`, `今天`];

function history(ctx: KitCtx, o: Opts) {
  const root = ctx.root, W = 8.4, D = 2.6, x0 = -W / 2;
  root.add(dirLight([0.6, -1, 1.1], 2.3, 0.55));
  // labels kept clear of the block: their right (or left) edge at the anchor
  const fits: (() => void)[] = [];
  const edge = (at: THREE.Vector3, text: Pair, c: string, side: 1 | -1, big = false) => {
    const op: LabelOpts = { c, big, dx: 0 }, L = ctx.label(at, text, op);
    fits.push(() => { op.dx = side * (L.el.offsetWidth / 2 + 10); });
    return L;
  };
  const front = -D / 2 - 0.01;
  let z = 0;
  const layers: { g: THREE.Group; p: Period; z0: number; icons: THREE.Mesh[]; labels: Label[] }[] = [];
  const eraZ: [number, number][] = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  for (const [i, p] of PERIODS.entries()) {
    const g = new THREE.Group(), base = new THREE.Color(p.col), dark = base.clone().multiplyScalar(0.72);
    const s = new Slab(ctx.low ? 40 : 80, 8, D);
    // a gently wavy bed; the scale grows it as it is laid down
    s.fill((u, t) => [x0 + W * u, p.h * (1 - t)], (u, t, out) => out.copy(base).lerp(dark, t * 0.5).multiplyScalar(grain(u + i, t)));
    g.add(slabMesh(s));
    if (p.coal) {
      const c = new Slab(20, 1, D + 0.03);
      c.fill((u, t) => [x0 + W * u, p.h * (0.55 - 0.13 * t)], (_u, _t, out) => out.set('#1d1d1f'));
      g.add(slabMesh(c, { roughness: 0.35, metalness: 0.2 }));
    }
    g.position.z = z;
    root.add(g);
    const icons = p.icons.map((k, j) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: icon(k), transparent: true, depthWrite: false }));
      m.rotation.x = Math.PI / 2;
      m.position.set(x0 + W * (j ? 0.78 : 0.12 + 0.05 * (i % 3)), front - 0.005, z + p.h * (p.coal ? 0.78 : 0.5));
      root.add(m);
      return m;
    });
    const labels: Label[] = [];
    if (!o.bare) {
      labels.push(edge(new THREE.Vector3(x0, front, z + p.h / 2), p.name, p.col, -1));
      labels.push(ctx.label(new THREE.Vector3(x0 + W * (0.17 + 0.05 * (i % 3)) + 0.1, front, z + p.h * 0.5), p.life, { c: '#f8f9fa', dx: 70 }));
    }
    layers.push({ g, p, z0: z, icons, labels });
    eraZ[p.era] = [Math.min(eraZ[p.era][0], z), Math.max(eraZ[p.era][1], z + p.h)];
    z += p.h;
  }
  // the eras: brackets on the right and pick boxes over the front face
  const bx = -x0 + 0.3;
  const eraLines: THREE.Line[] = [], eraLabels: Label[] = [];
  for (const [e, [a, b]] of eraZ.entries()) {
    const l = line([[bx - 0.12, front, a + 0.03], [bx, front, a + 0.03], [bx, front, b - 0.03], [bx - 0.12, front, b - 0.03]], '#dee2e6');
    root.add(l); eraLines.push(l);
    if (!o.bare) eraLabels.push(edge(new THREE.Vector3(bx + 0.05, front, (a + b) / 2), ERAS[e].name, '#ffffff', 1, true));
    proxy(ctx, ERAS[e].tag, W * 0.9, b - a - 0.04, new THREE.Vector3(0, front - 0.12, (a + b) / 2));
  }
  // the two great extinctions
  const ext: { l: THREE.Line; lab?: Label; at: number }[] = [];
  for (const [k, txt] of [[5, ['End-Permian extinction · 252 Ma', '二叠纪末生物大灭绝 · 2.52 亿年前']], [8, ['Dinosaurs die out · 66 Ma', '白垩纪末恐龙灭绝 · 6600 万年前']]] as [number, Pair][]) {
    const zz = layers[k].z0 + PERIODS[k].h;
    const l = line([[x0, front - 0.01, zz], [-x0, front - 0.01, zz]], '#ff4d4f');
    l.renderOrder = 4;
    root.add(l);
    ext.push({ l, at: PERIODS[k].to, lab: o.bare ? undefined : ctx.label(new THREE.Vector3(x0 + W * 0.62, front, zz), txt, { c: '#ff8787' }) });
  }
  const now = (v: number) => (o.full ? 0 : ageAt(clamp(v)));
  ctx.view([0.12, -1, 0.3], 11.5, [0.4, 0, z / 2], true);
  return {
    update(v: number) {
      for (const f of fits) f();
      const age = now(v);
      for (const L of layers) {
        const f = clamp((L.p.from - age) / (L.p.from - L.p.to));
        L.g.visible = f > 0.002;
        L.g.scale.z = Math.max(0.002, f);
        const show = f > 0.55;
        for (const m of L.icons) { m.visible = show; m.scale.setScalar(ramp(f, 0.55, 0.3) || 0.001); }
        for (const l of L.labels) l.on = f > 0.05;
        (L.labels[1] ?? { on: false }).on = show;
      }
      for (const e of ext) { e.l.visible = age <= e.at; if (e.lab) e.lab.on = age <= e.at; }
      for (const [i, l] of eraLines.entries()) {
        const first = layers.find(L => L.p.era === i)!;
        l.visible = age < first.p.from;
        if (eraLabels[i]) eraLabels[i].on = l.visible;
      }
    },
    readout(v: number): Pair {
      const age = now(v), p = PERIODS.find(q => age > q.to) ?? PERIODS[PERIODS.length - 1], a = fmtAge(age);
      return [`${a[0]} · ${p.name[0]}`, `${a[1]} · ${p.name[1]}`];
    },
  };
}

// --------------------------------------------------------------------------------------------------------- fold

const BED = ['#e7c98f', '#b5654a', '#d9b26f', '#7f8f6a', '#c98f5a', '#8b6f5a'];
function fold(ctx: KitCtx, o: Opts) {
  const root = ctx.root, D = 3, N = ctx.low ? 90 : 170, NB = BED.length, TH = 0.42, TOP = 0.9, BOT = -3.2;
  root.add(dirLight([0.4, -1, 1.2], 2.3, 0.55));
  const k = (2 * Math.PI) / 6.4, xa = -1.6, xs = 1.6;
  // the beds, the basement, the eroded ground surface
  const beds = BED.map(() => new Slab(N, 3, D, false));
  const base = new Slab(N, 4, D, false), ground = new Slab(N, 1, D, true);
  const group = new THREE.Group();
  for (const s of beds) group.add(slabMesh(s));
  group.add(slabMesh(base), slabMesh(ground));
  root.add(group);
  const cols = BED.map(c => new THREE.Color(c)), baseC = new THREE.Color('#6d5a6e');
  // oil and gas under the anticline's crest, groundwater in the syncline's trough
  const lens = (c: string, e: string) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 })); root.add(m); return m; };
  const oil = o.res ? lens('#2b2b2b', '#5c940d') : null, water = o.res ? lens('#4dabf7', '#1c7ed6') : null;
  const arrows = [new Arrow('#ff8787', 0.06), new Arrow('#ff8787', 0.06)];
  root.add(...arrows);
  const front = -D / 2 - 0.02;
  const L = (t: Pair, c: string, big = false) => ctx.label(new THREE.Vector3(), t, { c, big });
  const aLab = o.bare ? null : L(['Anticline', '背斜'], '#ffd8a8', true), sLab = o.bare ? null : L(['Syncline', '向斜'], '#a5d8ff', true);
  const oLab = o.res && !o.bare ? L(['Oil and gas: trapped in the arch', '石油、天然气：聚集在背斜顶部'], '#d8f5a2') : null;
  const wLab = o.res && !o.bare ? L(['Groundwater: collects in the trough', '地下水：汇集在向斜槽部'], '#a5d8ff') : null;
  const fLab = o.bare ? null : L(['Squeeze →', '挤压 →'], '#ff8787');
  const pa = proxy(ctx, 'anticline', 2.6, 2.6, new THREE.Vector3(xa, front - 0.12, 0)), ps = proxy(ctx, 'syncline', 2.6, 2.6, new THREE.Vector3(xs, front - 0.12, 0));
  const old = o.bare ? null : L(['Oldest rock in the core', '核部岩层老'], '#f8f9fa'), young = o.bare ? null : L(['Youngest rock in the core', '核部岩层新'], '#f8f9fa');
  let last = '';
  const build = (sq: number, er: number) => {
    const { A, E, a, b } = foldModel(sq, er), W = 10 * (1 - 0.12 * (sq / 100)), X = (u: number) => -W / 2 + W * u;
    const f = (x: number) => A * Math.cos(k * (x - xa)), w = (x: number) => 0.5 + 0.5 * Math.cos(k * (x - xa));
    const zb = (i: number, x: number) => TOP - TH * i + f(x);
    const S = (x: number) => zb(0, x) - E * (a + b * w(x));
    for (const [i, s] of beds.entries()) {
      s.fill((u, t) => { const x = X(u), top = Math.min(zb(i, x), S(x)), bot = Math.min(zb(i + 1, x), S(x)); return [x, top + (bot - top) * t]; },
        (u, t, out) => out.copy(cols[i]).multiplyScalar(grain(u * 3, t + i)));
    }
    base.fill((u, t) => { const x = X(u), top = Math.min(zb(NB, x), S(x)); return [x, top + (BOT - top) * t]; }, (u, t, out) => out.copy(baseC).multiplyScalar(grain(u * 3, t * 2) * (1 - 0.25 * t)));
    ground.fill((u, t) => { const x = X(u); return [x, S(x) - t * 0.0]; }, () => {}, (u, out) => {
      const x = X(u), s = S(x);
      let i = 0;
      while (i < NB && s < zb(i + 1, x)) i++;
      out.copy(i < NB ? cols[i] : baseC).lerp(new THREE.Color('#7fa35a'), er < 3 ? 0.55 : 0.18);
    });
    // labels and pick boxes follow the axes
    const sa = S(xa), ss = S(xs), inv = sa < ss - 0.15 && sq >= 30;
    aLab?.pos.set(xa, front, sa + 0.5);
    sLab?.pos.set(xs, front, ss + 0.5);
    if (sq < 25) { aLab?.set(['Flat-lying beds', '水平岩层']); if (sLab) sLab.on = false; }
    else { aLab?.set(inv ? ['Anticline → valley', '背斜成谷'] : ['Anticline: beds arch up', '背斜：岩层向上拱起']); if (sLab) { sLab.on = true; sLab.set(inv ? ['Syncline → mountain', '向斜成山'] : ['Syncline: beds bend down', '向斜：岩层向下弯曲']); } }
    if (aLab && sq < 25) aLab.pos.set(0, front, TOP + 0.5);
    if (old && young) {
      old.on = young.on = sq >= 25 && er >= 35;
      old.pos.set(xa, front, (sa + zb(NB, xa)) / 2 - 0.2); young.pos.set(xs, front, Math.min(ss, zb(0, xs)) - 0.35);
    }
    pa.position.z = (Math.min(sa, zb(0, xa)) + BOT) / 2 + 0.6; ps.position.z = (Math.min(ss, zb(0, xs)) + BOT) / 2 + 0.6;
    if (oil && water) {
      const res = 3, z0 = zb(res, xa) - TH * 0.5, z1 = zb(res, xs) - TH * 0.5;
      const on = sq >= 35;
      oil.visible = on && z0 < sa; water.visible = on && z1 < ss;
      oil.position.set(xa, front + 0.25, z0 + 0.05); oil.scale.set(0.9 * (sq / 100) + 0.2, 0.25, 0.2);
      water.position.set(xs, front + 0.25, z1 - 0.05); water.scale.set(0.9 * (sq / 100) + 0.2, 0.25, 0.2);
      if (oLab) { oLab.on = oil.visible; oLab.pos.set(xa, front, z0 - 0.3); }
      if (wLab) { wLab.on = water.visible; wLab.pos.set(xs, front, z1 - 0.32); }
    }
    halfW = W / 2;
    if (fLab) { fLab.pos.set(-W / 2 - 1.4, front, -0.15); fLab.on = sq > 0; }
  };
  let halfW = 5;
  const push = (sq: number, el: number) => {
    const p = 0.6 + 1.2 * (sq / 100) * (0.7 + 0.3 * Math.sin(el * 2.5) ** 2);
    arrows[0].set([-halfW - 0.4 - p, front, -0.6], [p, 0, 0]);
    arrows[1].set([halfW + 0.4 + p, front, -0.6], [-p, 0, 0]);
    for (const a of arrows) a.visible = sq > 0;
  };
  ctx.view([0.08, -1, 0.42], 12.5, [0, 0, -0.9], true);
  return {
    update(_v: number, _dt: number, el: number) {
      const sq = clamp(num(ctx, 'squeeze', o.squeeze ?? 70), 0, 100), er = clamp(num(ctx, 'erode', o.erode ?? 0), 0, 100);
      const key = `${sq}|${er}`;
      if (key !== last) { last = key; build(sq, er); }
      push(sq, el);
    },
  };
}

// -------------------------------------------------------------------------------------------------------- fault

function fault(ctx: KitCtx, o: Opts) {
  const root = ctx.root, D = 3, horst = o.kind === 'horst', NB = 5, TH = 0.4, TOP = 0.6, BOT = TOP - TH * NB - 1.0, H = TOP - BOT;
  root.add(dirLight([0.4, -1, 1.2], 2.3, 0.55));
  // fault lines (x at the top, x at the bottom): a horst's faults lean outward, a graben's inward
  const F = horst ? [[-1.3, -2.4], [1.3, 2.4]] : [[-2.1, -1.0], [2.1, 1.0]];
  const fx = (j: number, z: number) => F[j][0] + (F[j][1] - F[j][0]) * ((TOP - z) / H);
  const dip = Math.abs(F[0][1] - F[0][0]) / H;
  const bounds = [(z: number) => (void z, -5), (z: number) => fx(0, z), (z: number) => fx(1, z), (z: number) => (void z, 5)];
  const blocks = [0, 1, 2].map(j => {
    const g = new THREE.Group();
    for (let i = 0; i <= NB; i++) {
      const s = new Slab(12, i < NB ? 3 : 4, D, i === 0);
      const zt = TOP - TH * i, zbt = i < NB ? zt - TH : BOT, c = new THREE.Color(i < NB ? BED[i] : '#6d5a6e');
      s.fill((u, t) => { const z = zt + (zbt - zt) * t; const l = bounds[j](z), r = bounds[j + 1](z); return [l + (r - l) * u, z]; },
        (u, t, out) => out.copy(c).multiplyScalar(grain(u * 2 + j, t + i)), i === 0 ? (_u, out) => out.copy(c).lerp(new THREE.Color('#7fa35a'), 0.5) : undefined);
      g.add(slabMesh(s));
    }
    root.add(g);
    return g;
  });
  const front = -D / 2 - 0.02;
  const fl = [0, 1].map(j => { const l = line([[fx(j, TOP), front, TOP], [fx(j, BOT), front, BOT]], '#ff4d4f'); l.renderOrder = 4; root.add(l); return l; });
  const arrows = [new Arrow('#ff8787', 0.06), new Arrow('#ff8787', 0.06), new Arrow('#ffe066', 0.05), new Arrow('#ffe066', 0.05), new Arrow('#ffe066', 0.05)];
  root.add(...arrows);
  if (!o.bare) {
    ctx.label(new THREE.Vector3(fx(0, BOT + 0.3), front, BOT + 0.3), ['Fault', '断层'], { c: '#ff8787', dx: horst ? -30 : 30 });
    ctx.label(new THREE.Vector3(-5.6, front, TOP + 0.9), ['Pulled apart', '张力拉伸'], { c: '#ff8787', t: 0.5 });
  }
  const mid = o.bare ? null : ctx.label(new THREE.Vector3(0, front, TOP + 0.6), horst ? ['Horst: block-mountain (Mt Hua, Mt Lu, Mt Tai)', '地垒：块状山（华山、庐山、泰山）'] : ['Graben: rift valley or basin (Wei He plain, East African Rift)', '地堑：谷地或盆地（渭河平原、东非大裂谷）'], { c: '#ffe066', big: true });
  ctx.view([0.1, -1, 0.42], 12.8, [0, 0, -0.8], true);
  const MAX = 1.4;
  return {
    update(v: number) {
      const f = clamp(v / 100), s = MAX * f, hx = s * dip;
      // the hanging walls slide down the faults and the ground stretches
      if (horst) { blocks[0].position.set(-hx, 0, -s); blocks[2].position.set(hx, 0, -s); blocks[1].position.set(0, 0, 0); }
      else { blocks[0].position.set(-hx, 0, 0); blocks[2].position.set(hx, 0, 0); blocks[1].position.set(0, 0, -s); }
      // the fault runs along the middle block's sides
      const mz = blocks[1].position.z;
      for (const [j, l] of fl.entries()) setLine(l, [[fx(j, TOP - mz), front, TOP], [fx(j, BOT - mz), front, BOT]]);
      arrows[0].set([-5.1, front, TOP + 0.5], [-0.7 - f * 0.3, 0, 0]);
      arrows[1].set([5.1, front, TOP + 0.5], [0.7 + f * 0.3, 0, 0]);
      const mv = horst ? [blocks[0], blocks[2]] : [blocks[1]];
      for (const [i, a] of arrows.slice(2).entries()) {
        const b = mv[i];
        a.visible = !!b && f > 0.05 && f < 0.98;
        if (b) a.set([b === blocks[1] ? 0 : b === blocks[0] ? -3.6 : 3.6, front - 0.1, TOP + b.position.z - 0.3], [0, 0, -0.7]);
      }
      if (mid) { mid.on = f > 0.6; mid.pos.set(0, front, TOP + (horst ? 0.5 : -s + 0.5)); }
    },
    readout(v: number): Pair {
      const f = clamp(v / 100);
      return f < 0.05 ? ['the faults are about to move', '断层即将错动'] : horst ? ['the blocks either side drop: the middle stands high', '两侧岩块下降，中间岩块相对上升'] : ['the middle block drops', '中间岩块相对下降'];
    },
  };
}
