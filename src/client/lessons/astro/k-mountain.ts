/**
 * Kit "mountain": vertical natural belts.
 * - `lab`: a mountain on a plain; lab parameters `lat` (latitude of the foot, °) and `height` (m) — or the options.
 *   The belts come from `beltsOf` (the lesson file), so the lab tasks and the picture always agree: the air cools
 *   0.6 °C per 100 m and the belts repeat the zones you would cross going poleward.
 * - `everest`: Qomolangma seen from the east — the wet, low south slope (seven belts) against the dry north slope
 *   rising from the 4300 m Tibetan plateau (four belts, and a higher snowline).
 */
import * as THREE from 'three';
import { clamp, dirLight, line, rng, starfield } from './draw.ts';
import type { KitCtx, KitFactory, Label, LabelOpts, Pair } from './types.ts';
import { BELT_NAME, EVEREST, beltsOf, footTemp, type Belt, type BeltId } from '../models.ts';

export interface Opts {
  mode: 'lab' | 'everest';
  /** `lab` without parameters */
  lat?: number; height?: number;
}

const COL: Record<BeltId, string> = {
  rainforest: '#1f7a3a', evergreen: '#3a9d4a', deciduous: '#8fb43a', mixed: '#5f8f36', conifer: '#2e6650', shrub: '#9a8a4e',
  meadow: '#c6d86a', steppe: '#c9b96e', colddesert: '#a8978a', snow: '#f4f6f8', tundra: '#a3a07a'
};
const FOREST: Partial<Record<BeltId, 'broad' | 'needle' | 'mixed'>> = { rainforest: 'broad', evergreen: 'broad', deciduous: 'broad', mixed: 'mixed', conifer: 'needle' };
const G = 7.5;

const num = (ctx: KitCtx, id: string, d: number) => { const v = ctx.param(id); return Number.isFinite(v) ? v : d; };
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const wobble = (x: number, y: number) => Math.sin(x * 1.7 + Math.sin(y * 1.3)) * 0.5 + Math.sin(y * 2.3 + x * 0.7) * 0.3 + Math.sin(x * 5.1 - y * 4.3) * 0.2;

/** Mountain shape (0 … 1) at (x, y) for a base radius `rb`. */
function shape(x: number, y: number, rb: number): number {
  const r = Math.hypot(x, y), th = Math.atan2(y, x);
  const rr = r / (rb * (1 + 0.13 * Math.sin(3 * th + 0.7) + 0.07 * Math.sin(5 * th + 2)));
  if (rr >= 1) return 0;
  const s = 1 - rr, p = 0.55 * s ** 1.7 + 0.45 * s * s * (3 - 2 * s);
  return p * (1 + 0.12 * Math.sin(6 * th + 1) * Math.sin(Math.PI * rr) + 0.05 * wobble(x * 0.8, y * 0.8) * rr);
}

/** Push sorted label heights apart so neighbours are at least `gap` apart (scene units), keeping them centred on the originals. */
function spread(zs: number[], gap: number, lo = 0.15): number[] {
  // merge neighbours into blocks spaced `gap` apart, each centred on the mean of its originals
  const blocks: { i0: number; n: number; c: number }[] = [];
  for (let i = 0; i < zs.length; i++) {
    blocks.push({ i0: i, n: 1, c: zs[i] });
    for (;;) {
      const B = blocks[blocks.length - 1], A = blocks[blocks.length - 2];
      if (!A || A.c + ((A.n - 1) / 2) * gap + gap <= B.c - ((B.n - 1) / 2) * gap) break;
      const n = A.n + B.n;
      blocks.splice(-2, 2, { i0: A.i0, n, c: zs.slice(A.i0, A.i0 + n).reduce((s, z) => s + z, 0) / n });
    }
  }
  const out = zs.slice();
  for (const B of blocks) for (let k = 0; k < B.n; k++) out[B.i0 + k] = B.c + (k - (B.n - 1) / 2) * gap;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], i ? out[i - 1] + gap : lo);
  return out;
}

/** Labels that keep their left (or right) edge at the anchor. */
function edgeLabel(ctx: KitCtx, at: THREE.Vector3, text: Pair | string, c: string, side: 1 | -1, big = false): { L: Label; fit(): void } {
  const o: LabelOpts = { c, big, dx: 0 };
  const L = ctx.label(at, text, o);
  return { L, fit: () => { o.dx = side * (L.el.offsetWidth / 2 + 8); } };
}

const kit: KitFactory<Opts> = (ctx, o) => {
  const root = ctx.root, N = ctx.low ? 110 : 180, everest = o.mode === 'everest';
  const ZS = (everest ? 0.62 : 0.8) / 1000; // scene units per metre of height (vertical exaggeration)
  root.add(starfield(ctx.low ? 700 : 1400, 900, 3));
  root.add(dirLight(everest ? [0.8, -0.9, 1.1] : [0.5, -1, 1.15], 2.4, 0.5));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ color: '#0d1b2a', side: THREE.BackSide, transparent: true, opacity: 0.5, depthWrite: false }));
  root.add(sky);

  // the terrain grid and its skirt
  const geo = new THREE.PlaneGeometry(2 * G, 2 * G, N, N);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3), 3));
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: false }));
  const skirtGeo = new THREE.BufferGeometry();
  const SK = 4 * (N + 1) * 2, skP = new Float32Array(SK * 3), skI: number[] = [];
  for (let s = 0; s < 4; s++) for (let i = 0; i < N; i++) { const b = s * (N + 1) * 2 + i * 2; skI.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  skirtGeo.setAttribute('position', new THREE.BufferAttribute(skP, 3)); skirtGeo.setIndex(skI);
  const skirt = new THREE.Mesh(skirtGeo, new THREE.MeshStandardMaterial({ color: '#5b4636', roughness: 1, side: THREE.DoubleSide }));
  root.add(terrain, skirt);
  const BOT = -0.45;

  // trees: cones for needle-leaf forest, round crowns for broadleaf forest
  const R = rng(17), M = ctx.low ? 900 : 2200, spots = Array.from({ length: M }, () => [(R() * 2 - 1) * (G - 0.2), (R() * 2 - 1) * (G - 0.2), R()]);
  const cone = new THREE.ConeGeometry(0.075, 0.3, 7); cone.rotateX(Math.PI / 2); cone.translate(0, 0, 0.15);
  const crown = new THREE.IcosahedronGeometry(0.1, 1); crown.scale(1, 1, 1.15); crown.translate(0, 0, 0.11);
  const needles = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ roughness: 0.9 }), M);
  const broads = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ roughness: 0.9 }), M);
  root.add(needles, broads);

  // the altitude scale(s)
  const scale = (x: number, y: number) => {
    root.add(line([[x, y, 0], [x, y, 9000 * ZS]], '#ced4da', { opacity: 0.7 }));
    for (let h = 0; h <= 9000; h += 1000) root.add(line([[x - 0.12, y, h * ZS], [x, y, h * ZS]], '#ced4da', { opacity: 0.7 }));
  };
  const tick = (x: number, y: number, side: 1 | -1) => {
    for (const h of [0, 2000, 4000, 6000, 8000]) edgeLabel(ctx, new THREE.Vector3(x, y, h * ZS), `${h} m`, '#9aa7b4', side);
  };
  const tmp = new THREE.Object3D(), c = new THREE.Color();
  const beltOf = (bs: Belt[], h: number): Belt => bs.find(b => h < b.to) ?? bs[bs.length - 1];

  /** Rebuild the terrain for a height function and a belt list per point. */
  const build = (hAt: (x: number, y: number) => number, beltsAt: (x: number, y: number) => Belt[]) => {
    const p = geo.getAttribute('position') as THREE.BufferAttribute, col = geo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), h = hAt(x, y);
      p.setZ(i, h * ZS);
      const b = beltOf(beltsAt(x, y), h + 70 * wobble(x * 3, y * 3));
      c.set(COL[b.id]).multiplyScalar(0.92 + 0.08 * wobble(x * 9, y * 9));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    p.needsUpdate = col.needsUpdate = true;
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    // the skirt around the four edges
    let k = 0;
    const edge = (x: number, y: number) => { const z = hAt(x, y) * ZS; skP.set([x, y, z, x, y, BOT], k * 6); k++; };
    for (let i = 0; i <= N; i++) edge(-G + (2 * G * i) / N, -G);
    for (let i = 0; i <= N; i++) edge(G, -G + (2 * G * i) / N);
    for (let i = 0; i <= N; i++) edge(G - (2 * G * i) / N, G);
    for (let i = 0; i <= N; i++) edge(-G, G - (2 * G * i) / N);
    skirtGeo.attributes.position.needsUpdate = true; skirtGeo.computeVertexNormals(); skirtGeo.computeBoundingSphere();
    // the trees
    let nn = 0, nb = 0;
    for (const [x, y, r] of spots) {
      const h = hAt(x, y), b = beltOf(beltsAt(x, y), h), kind = FOREST[b.id];
      if (!kind) continue;
      const needle = kind === 'needle' || (kind === 'mixed' && r < 0.5);
      // fewer trees near the belt's upper edge: the tree line is ragged
      if (b.to - h < 120 * r) continue;
      const s = (b.id === 'rainforest' ? 1.35 : 1) * (0.8 + 0.45 * r);
      tmp.position.set(x, y, h * ZS - 0.01); tmp.scale.setScalar(s); tmp.rotation.set(0, 0, r * 6.28); tmp.updateMatrix();
      c.set(COL[b.id]).multiplyScalar(needle ? 0.75 + 0.25 * r : 0.85 + 0.3 * r);
      if (b.id === 'deciduous' && r > 0.75) c.set('#c9a227');
      if (needle) { needles.setMatrixAt(nn, tmp.matrix); needles.setColorAt(nn++, c); }
      else { broads.setMatrixAt(nb, tmp.matrix); broads.setColorAt(nb++, c); }
    }
    needles.count = nn; broads.count = nb;
    for (const m of [needles, broads]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
  };

  if (everest) {
    const H = 8848, rb = 5.6;
    const base = (y: number) => 1000 + 3300 * smooth(-1.2, 2.8, y) + 120 * wobble(y, 1);
    const hAt = (x: number, y: number) => { const b = base(y); return b + (H - b) * shape(x * 1.05, y, rb); };
    build(hAt, (x, y) => (y + 0.35 * wobble(x * 2, y) < 0 ? EVEREST.south : EVEREST.north));
    scale(0, -G - 0.4); scale(0, G + 0.4);
    tick(0, -G - 0.4, -1);
    const col = (bs: Belt[], y: number, side: 1 | -1) => {
      const zs = spread(bs.map(b => b.id === 'snow' ? Math.min(H - 600, b.from + 900) : (b.from + Math.min(b.to, H)) / 2).map(m => m * ZS), 0.52);
      for (const [i, b] of bs.entries()) {
        const l = edgeLabel(ctx, new THREE.Vector3(0, y, zs[i]), b.to >= H ? [`${BELT_NAME[b.id][0]} above ${b.from} m`, `${BELT_NAME[b.id][1]} ${b.from} 米以上`] : [`${BELT_NAME[b.id][0]} ${b.from}–${b.to} m`, `${BELT_NAME[b.id][1]} ${b.from}～${b.to} 米`], COL[b.id] === '#f4f6f8' ? '#ffffff' : COL[b.id], side);
        fits.push(l.fit);
      }
    };
    const fits: (() => void)[] = [];
    col(EVEREST.south, -G - 0.4, 1); col(EVEREST.north, G + 0.4, -1);
    const head = (y: number, t: Pair, side: 1 | -1) => fits.push(edgeLabel(ctx, new THREE.Vector3(0, y, 10400 * ZS), t, '#ffffff', side, true).fit);
    head(-G - 0.4, ['South slope: wet, from 1000 m · 7 belts', '南坡：湿润，从 1000 米起 · 7 个带'], 1);
    head(G + 0.4, ['North slope: dry, from the 4300 m plateau · 4 belts', '北坡：干燥，从 4300 米高原起 · 4 个带'], -1);
    ctx.label(new THREE.Vector3(0, 0, H * ZS + 0.25), ['Qomolangma 8848 m', '珠穆朗玛峰 8848 米'], { c: '#ffffff', big: true });
    ctx.label(new THREE.Vector3(0, -G + 1, 0.3), ['← to the Indian Ocean monsoon', '← 迎印度洋季风'], { c: '#a5d8ff', dx: 0, t: 1 });
    ctx.label(new THREE.Vector3(4.5, G - 2.5, 4300 * ZS + 0.3), ['Tibetan Plateau', '青藏高原'], { c: '#ffd8a8', t: 1 });
    ctx.view([1, -0.05, 0.38], 21, [0, 0, 2.7], true);
    return { update() { for (const f of fits) f(); } };
  }

  // the lab
  const SX = G + 0.4;
  scale(SX, 0); tick(SX, 0, -1);
  const pool = Array.from({ length: 12 }, () => edgeLabel(ctx, new THREE.Vector3(), '', '#ffffff', 1));
  const foot = ctx.label(new THREE.Vector3(-2.5, -G + 0.6, 0.15), '', { c: '#ffffff', big: true });
  const top = ctx.label(new THREE.Vector3(), '', { c: '#ffffff', big: true, dy: -14 });
  let last = '';
  ctx.view([0.18, -1, 0.42], 19.5, [1.6, 0, 2.7], true);
  return {
    update() {
      for (const p of pool) p.fit();
      const lat = clamp(num(ctx, 'lat', o.lat ?? 40), 0, 90), H = clamp(num(ctx, 'height', o.height ?? 2000), 200, 9000);
      const key = `${lat}|${H}`;
      if (key === last) return;
      last = key;
      const bs = beltsOf(lat, H), rb = 2.3 + 0.42 * (H / 1000);
      const zs = spread(bs.map(b => ((b.from + Math.min(b.to, H)) / 2) * ZS), 0.44);
      build((x, y) => H * shape(x, y, rb), () => bs);
      for (const [i, p] of pool.entries()) {
        const b = bs[i];
        p.L.on = !!b;
        if (!b) continue;
        const to = Math.min(b.to, H);
        p.L.pos.set(SX + 0.1, 0, zs[i]);
        p.L.set([`${BELT_NAME[b.id][0]} ${Math.round(b.from)}–${Math.round(to)} m`, `${BELT_NAME[b.id][1]} ${Math.round(b.from)}～${Math.round(to)} 米`]);
        p.L.el.style.setProperty('--c', b.id === 'snow' ? '#ffffff' : COL[b.id]);
      }
      const T0 = footTemp(lat), T1 = T0 - 0.6 * (H / 100), f = (t: number) => `${t.toFixed(1)} °C`;
      foot.set([`Foot: ${Math.round(lat)}° · ${f(T0)} · ${BELT_NAME[bs[0].id][0]}`, `山麓：纬度 ${Math.round(lat)}° · ${f(T0)} · ${BELT_NAME[bs[0].id][1]}`]);
      top.pos.set(0, 0, H * ZS + 0.2);
      top.set([`Summit ${Math.round(H)} m · ${f(T1)} · ${bs.length} belts`, `山顶 ${Math.round(H)} 米 · ${f(T1)} · ${bs.length} 个带`]);
    },
  };
};
export default kit;
