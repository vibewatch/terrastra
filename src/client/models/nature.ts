import * as THREE from 'three';
import {
  type Builder, type Paint, type V3, add, mat, ellip, cyl, cone, box, gable, tube, slab, paintFaces, shade, mix, fbm, vnoise, worley, hash3, tree,
} from './prims.ts';
import { pblob } from './animals.ts';

/**
 * Procedural terrain dioramas. Everything natural (mountains, canyons, falls, monoliths, reefs) is built on a
 * polar heightfield "island": a disc of displaced terrain with an earth-strata skirt, coloured per face by
 * altitude, slope and noise. This replaces the old stacked-box approximations with continuous sculpted ground.
 */

export type HFn = (x: number, z: number) => number;
interface IslandOpts { rings?: number; segs?: number; rz?: number; base?: number; side?: (y: number, x: number, z: number) => string }

export const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const ridged = (x: number, z: number, oct = 3) => {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(2 * vnoise(x * f, 3.7 * i, z * f) - 1)); n += a; a *= 0.5; f *= 2.1; }
  return s / n;
};

/** Displaced terrain disc (radius R, optional z squash) with vertical earth skirt down to y=0. */
export function island(gp: THREE.Object3D, R: number, h: HFn, base: string, paint: Paint, o: IslandOpts = {}): void {
  const rings = o.rings ?? 52, segs = o.segs ?? 120, rz = o.rz ?? 1, y0 = o.base ?? 0.035;
  const pos: number[] = [0, y0 + h(0, 0), 0];
  for (let i = 1; i <= rings; i++) {
    const r = (R * i) / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r * rz;
      pos.push(x, y0 + h(x, z), z);
    }
  }
  const vi = (i: number, j: number) => 1 + (i - 1) * segs + (j % segs);
  const idx: number[] = [];
  for (let j = 0; j < segs; j++) idx.push(0, vi(1, j + 1), vi(1, j));
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = vi(i, j), b = vi(i, j + 1), c = vi(i + 1, j), d = vi(i + 1, j + 1);
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  add(gp, paintFaces(geo, base, paint), mat('#ffffff', { flat: false, vc: true, rough: 0.85 }), 0, 0, 0, 1, 1, 1);

  // Skirt: vertical rim from the terrain edge down to the ground, banded like exposed strata
  const sp: number[] = [], si: number[] = [];
  for (let j = 0; j < segs; j++) {
    const k = vi(rings, j) * 3;
    sp.push(pos[k], pos[k + 1], pos[k + 2], pos[k] * 0.985, 0, pos[k + 2] * 0.985);
  }
  for (let j = 0; j < segs; j++) {
    const t = j * 2, b = j * 2 + 1, t2 = ((j + 1) % segs) * 2, b2 = t2 + 1;
    si.push(t, t2, b, t2, b2, b);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setIndex(si);
  sg.computeVertexNormals();
  const side = o.side ?? ((y: number) => (y > y0 * 0.6 ? '#6b4f3a' : '#4a3628'));
  add(gp, paintFaces(sg, '#5b4636', (x, y, z) => side(y, x, z)), mat('#ffffff', { flat: true, vc: true, rough: 0.9 }), 0, 0, 0, 1, 1, 1);
}

export const WATER = '#2d7fb5';
export const ripple = (c: string): Paint => (x, _y, z) => (Math.sin(x * 90 + Math.sin(z * 40) * 2) > 0.93 ? mix(c, '#d6f0ff', 0.45) : hash3(Math.floor(x * 60), 0, Math.floor(z * 60)) > 0.9 ? shade(c, 1.12) : c);
export const strataSide = (pal: string[], scale = 26): IslandOpts['side'] => (y, x, z) => pal[Math.abs(Math.floor(y * scale + fbm(x * 9, y * 3, z * 9) * 1.4)) % pal.length];
export const EARTH = ['#6b4f3a', '#5a4130', '#7a5a40', '#4f3a2b'];

export function pine(gp: THREE.Object3D, x: number, y: number, z: number, s: number, c = '#2f5e3f'): void {
  cyl(gp, '#5b4030', x, y, z, s * 0.12, s * 0.4, 5);
  cone(gp, c, x, y + s * 0.25, z, s * 0.5, s * 0.7, 7);
  cone(gp, shade(c, 1.1), x, y + s * 0.55, z, s * 0.38, s * 0.6, 7);
  cone(gp, shade(c, 1.2), x, y + s * 0.85, z, s * 0.24, s * 0.45, 7);
}
function acacia(gp: THREE.Object3D, x: number, y: number, z: number, s: number): void {
  tube(gp, [[x, y, z], [x + s * 0.05, y + s * 0.5, z], [x + s * 0.15, y + s * 0.85, z + s * 0.05]], s * 0.06, s * 0.035, '#5b4030');
  ellip(gp, '#5f7d3a', x + s * 0.15, y + s * 0.92, z + s * 0.05, s * 0.5, s * 0.11, s * 0.42);
  ellip(gp, '#6f8f45', x + s * 0.1, y + s * 0.99, z, s * 0.34, s * 0.07, s * 0.3);
}
function chalet(gp: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  box(gp, '#f5efe0', x, y, z, s, s * 0.7, s * 0.8, ry);
  gable(gp, s * 1.2, s * 0.45, s * 0.95, '#7c2d12', x, y + s * 0.7, z, ry);
}
export const scatter = (n: number, seed: number, f: (x: number, z: number, i: number) => void, R = 0.42) => {
  for (let i = 0; i < n; i++) {
    const a = hash3(i, seed, 1) * Math.PI * 2, d = Math.sqrt(hash3(i, seed, 2)) * R;
    f(Math.cos(a) * d, Math.sin(a) * d, i);
  }
};
/** Place objects on the terrain surface: samples h(x,z) so trees/houses sit on slopes. */
export const onGround = (h: HFn, y0 = 0.035) => (x: number, z: number) => y0 + h(x, z) - 0.004;

// ---------------------------------------------------------------------------------------------------------
const mountain: Builder = (gp, r) => {
  const c = r.color!, peaks = typeof r.peaks === 'number' ? r.peaks : 1;
  const SNOW = '#f4f8fc', SNOWSH = '#dbe7f3';

  if (r.sharp) {
    // Matterhorn: four-faced crooked horn above an alpine meadow, Riffelsee tarn and a Zermatt chalet cluster
    const H = 0.92;
    const hf: HFn = (x, z) => {
      const ca = Math.cos(0.55), sa = Math.sin(0.55);
      const px = (x + 0.02) * ca - (z + 0.06) * sa, pz = (x + 0.02) * sa + (z + 0.06) * ca;
      const d = Math.max(Math.abs(px) * 1.05 + Math.abs(pz) * 0.18, Math.abs(pz) * 1.12 + Math.abs(px) * 0.16);
      let y = H * Math.pow(Math.max(0, 1 - d / 0.4), 1.5);
      y += (0.028 + y * 0.06) * ridged(x * 14, z * 14) * sstep(0, 0.2, y);
      const rr = Math.hypot(x, z);
      const meadow = 0.02 + 0.07 * sstep(0.3, 0.48, rr) * fbm(x * 5, 1, z * 5) + 0.015 * fbm(x * 12, 2, z * 12);
      let out = Math.max(y, meadow);
      const lake = 1 - (((x - 0.2) / 0.1) ** 2 + ((z - 0.27) / 0.06) ** 2);
      if (lake > 0) out = Math.max(0.004, out - lake * 0.05);
      return out;
    };
    island(gp, 0.5, hf, '#5c8a4a', (x, y, z, _nx, ny) => {
      const t = (y - 0.035) / H;
      if (t < 0.012 && ny > 0.97) return ripple('#3a8fc0')(x, y, z, 0, 1, 0);
      if ((t > 0.24 && ny > 0.5) || (t > 0.55 && ny > 0.32) || t > 0.85) return ny > 0.72 ? SNOW : SNOWSH;
      if (t > 0.12) return hash3(Math.floor(x * 70), Math.floor(y * 70), Math.floor(z * 70)) > 0.6 ? '#5f6370' : '#787c88';
      if (t > 0.07) return mix('#6b7258', '#7b7f8a', fbm(x * 20, y * 20, z * 20));
      return hash3(Math.floor(x * 50), 0, Math.floor(z * 50)) > 0.82 ? '#3f6b3a' : mix('#5c8a4a', '#78a05a', fbm(x * 9, 0, z * 9));
    }, { side: strataSide(EARTH) });
    const gy = onGround(hf);
    scatter(16, 7, (x, z) => { if (Math.hypot(x, z) > 0.3 && hf(x, z) < 0.1) pine(gp, x, gy(x, z), z, 0.07); }, 0.46);
    for (const [x, z, a] of [[-0.3, 0.3, 0.3], [-0.22, 0.36, -0.2], [-0.36, 0.2, 0.6]]) chalet(gp, x, gy(x, z), z, 0.035, a);
    return;
  }

  if (r.flat && !r.snow) {
    // Table Mountain: sheer sandstone mesa with Devil's Peak & Lion's Head, Cape Town at its foot, Table Bay in front
    const H = 0.36;
    const hf: HFn = (x, z) => {
      const m = 1 - ((Math.abs(x) / 0.33) ** 4 + (Math.abs(z + 0.08) / 0.15) ** 4);
      let y = 0.05 + 0.08 * sstep(-2.5, 0, m) + (H - 0.13) * sstep(0, 0.12, m);
      y += 0.008 * fbm(x * 30, 0, z * 30) + (m > 0 ? 0 : 0.02 * ridged(x * 12, z * 12));
      const dv = Math.hypot(x + 0.38, z + 0.02), lh = Math.hypot(x - 0.38, z - 0.06);
      y = Math.max(y, 0.38 * Math.max(0, 1 - dv / 0.16) ** 1.2, 0.3 * Math.max(0, 1 - lh / 0.12) ** 1.1);
      const sea = sstep(0.18, 0.28, z);
      return Math.max(0.004, y * (1 - sea) - sea * 0.02);
    };
    island(gp, 0.5, hf, '#5b7d4a', (x, y, z, _nx, ny) => {
      const t = (y - 0.035) / H;
      if (t < 0.02 && ny > 0.97) return ripple(WATER)(x, y, z, 0, 1, 0);
      if (ny < 0.55 && t > 0.3) return Math.sin(y * 160 + fbm(x * 10, y, z * 10) * 3) > 0.4 ? '#8c7b5c' : '#a8977a';
      if (t > 0.85) return hash3(Math.floor(x * 60), 1, Math.floor(z * 60)) > 0.75 ? '#5d6b45' : '#7d8a5a';
      if (t < 0.17 && z > 0.08) return '#c9c2b0';
      return hash3(Math.floor(x * 55), 2, Math.floor(z * 55)) > 0.7 ? '#486b3e' : mix('#5b7d4a', '#6d8a52', fbm(x * 8, 0, z * 8));
    }, { side: strataSide(EARTH) });
    const gy = onGround(hf);
    // Cape Town city blocks along the shore
    for (let i = 0; i < 26; i++) {
      const x = -0.3 + hash3(i, 3, 1) * 0.6, z = 0.1 + hash3(i, 3, 2) * 0.08, hh = 0.015 + hash3(i, 3, 3) * 0.04;
      box(gp, ['#f1f5f9', '#e2e8f0', '#fde68a', '#fecaca', '#cbd5e1'][i % 5], x, gy(x, z), z, 0.018, hh, 0.018, hash3(i, 3, 4));
    }
    // Tablecloth cloud spilling over the rim
    for (let i = -3; i <= 3; i++) {
      ellip(gp, '#f8fafc', i * 0.085, 0.41 + (i % 2) * 0.012, -0.06 + Math.abs(i) * 0.01, 0.1, 0.035, 0.11).material = mat('#f8fafc', { transparent: 0.82 });
    }
    return;
  }

  if (r.flat && r.snow) {
    // Kilimanjaro: broad Kibo dome with flat crater and glacier remnants, jagged Mawenzi, savanna with acacias
    const H = 0.46;
    const hf: HFn = (x, z) => {
      const d = Math.hypot(x + 0.07, z + 0.02), u = d / 0.4;
      let y = u < 1 ? H * (1 - Math.pow(u, 1.7)) : 0;
      if (y > H * 0.86) y = H * 0.86 + (y - H * 0.86) * 0.15;
      if (d < 0.06) y -= 0.02 * (1 - d / 0.06);
      const mw = Math.hypot(x - 0.25, z + 0.08);
      y = Math.max(y, 0.3 * Math.max(0, 1 - mw / 0.15) ** 1.3 * (0.75 + 0.5 * ridged(x * 18, z * 18)));
      y += 0.012 * fbm(x * 18, 0, z * 18) + (0.004 + y * 0.05) * ridged(x * 24, z * 24);
      return Math.max(0.02 + 0.015 * fbm(x * 6, 4, z * 6), y);
    };
    island(gp, 0.5, hf, '#b5a25a', (x, y, z, _nx, ny) => {
      const t = (y - 0.035) / H;
      if (t > 0.8 && ny > 0.75 && fbm(x * 14, 0, z * 14) > 0.42) return SNOW;
      if (t > 0.6) return hash3(Math.floor(x * 70), Math.floor(y * 70), 3) > 0.7 ? '#5e554a' : '#7a6e5e';
      if (t > 0.38) return mix('#857a5a', '#7a6e5e', fbm(x * 12, y * 12, z * 12));
      if (t > 0.14) return hash3(Math.floor(x * 60), 5, Math.floor(z * 60)) > 0.55 ? '#3f6b35' : '#4f7a3c';
      return hash3(Math.floor(x * 70), 6, Math.floor(z * 70)) > 0.88 ? '#7b8a3a' : mix('#c2ab62', '#a8975a', fbm(x * 7, 0, z * 7));
    }, { side: strataSide(['#8a6a45', '#76583a', '#9a7a50']) });
    const gy = onGround(hf);
    for (const [x, z] of [[-0.38, 0.22], [0.3, 0.3], [0.38, 0.12], [-0.2, 0.4], [0.1, 0.42], [-0.42, -0.1]]) if (hf(x, z) < 0.06) acacia(gp, x, gy(x, z), z, 0.1);
    return;
  }

  if (peaks > 1) {
    // Everest massif: Everest, Lhotse & Nuptse with ridged arêtes, Khumbu icefall and base-camp tents
    const H = 0.86;
    const pk: [number, number, number, number][] = [[0.0, -0.08, H, 0.42], [-0.28, 0.04, 0.62, 0.3], [0.28, 0.0, 0.58, 0.3], [0.12, -0.3, 0.46, 0.24]];
    const hf: HFn = (x, z) => {
      let y = 0;
      for (const [px, pz, ph, pr] of pk) {
        const dx = x - px, dz = z - pz;
        const d = Math.max(Math.hypot(dx, dz), (Math.abs(dx) + Math.abs(dz)) * 0.78);
        y = Math.max(y, ph * Math.pow(Math.max(0, 1 - d / pr), 1.45));
      }
      y += (0.03 + y * 0.09) * ridged(x * 11, z * 11, 4) - 0.02;
      const glacier = Math.exp(-(((x - 0.06 - (z - 0.1) * 0.35) / 0.07) ** 2)) * sstep(0.0, 0.3, z);
      y = y * (1 - glacier * 0.5);
      return Math.max(0.02 + 0.02 * fbm(x * 8, 1, z * 8), y);
    };
    island(gp, 0.5, hf, '#7b6f5e', (x, y, z, _nx, ny) => {
      const t = (y - 0.035) / H;
      const glacier = Math.exp(-(((x - 0.06 - (z - 0.1) * 0.35) / 0.07) ** 2)) * sstep(0.0, 0.3, z);
      if (glacier > 0.45 && t < 0.25) return hash3(Math.floor(x * 80), 0, Math.floor(z * 80)) > 0.8 ? '#a5c4dc' : '#e2edf6';
      if ((t > 0.26 && ny > 0.48) || (t > 0.5 && ny > 0.3) || t > 0.8) return ny > 0.7 ? SNOW : SNOWSH;
      if (t > 0.12) return hash3(Math.floor(x * 70), Math.floor(y * 70), Math.floor(z * 70)) > 0.55 ? '#4f5462' : shade(c, 0.85);
      return mix('#7b6f5e', '#8d8272', fbm(x * 14, 0, z * 14));
    }, { side: strataSide(['#5a5048', '#6b6055', '#4d443d']) });
    const gy = onGround(hf);
    const tents = ['#f97316', '#facc15', '#ef4444', '#22c55e', '#3b82f6'];
    tents.forEach((tc, i) => { const x = -0.18 + i * 0.05, z = 0.36 + (i % 2) * 0.03; cone(gp, tc, x, gy(x, z), z, 0.022, 0.03, 4, 0.78); });
    // Prayer-flag line strung between two poles
    const fx0 = -0.22, fx1 = 0.04, fz = 0.42;
    for (const fx of [fx0, fx1]) cyl(gp, '#78350f', fx, gy(fx, fz), fz, 0.003, 0.07, 4);
    for (let i = 0; i < 8; i++) {
      const x = fx0 + ((fx1 - fx0) * (i + 0.5)) / 8;
      box(gp, ['#3b82f6', '#f8fafc', '#ef4444', '#22c55e', '#facc15'][i % 5], x, gy(fx0, fz) + 0.055 - Math.sin((i / 7) * Math.PI) * 0.012, fz, 0.022, 0.016, 0.002);
    }
    return;
  }

  // Mount Fuji: concave stratocone with gullied snow cap, summit crater, forested foothills and Lake Kawaguchi
  const H = 0.68;
  const hf: HFn = (x, z) => {
    const d = Math.hypot(x, z + 0.05), a = Math.atan2(z + 0.05, x), u = d / 0.45;
    let y = u < 1 ? H * Math.pow(1 - u, 1.75) : 0;
    const gully = Math.abs(Math.sin(a * 13 + fbm(x * 6, 0, z * 6) * 3));
    y *= 1 - 0.05 * (1 - gully) * sstep(0.05, 0.5, u);
    if (d < 0.045) y -= 0.035 * (1 - d / 0.045);
    let ground = 0.025 + 0.035 * fbm(x * 7, 2, z * 7);
    const lake = 1 - ((x / 0.3) ** 2 + ((z - 0.35) / 0.1) ** 2);
    if (lake > 0) ground += (0.003 - ground) * sstep(0, 0.3, lake);
    return Math.max(y, ground);
  };
  island(gp, 0.5, hf, '#4d7c4f', (x, y, z, _nx, ny) => {
    const t = (y - 0.035) / H;
    const a = Math.atan2(z + 0.05, x);
    if (t < 0.008 && ny > 0.97) return ripple('#3b8fc4')(x, y, z, 0, 1, 0);
    const line = 0.62 - 0.12 * Math.max(0, Math.sin(a * 13 + fbm(x * 6, 0, z * 6) * 3));
    if (t > line) return ny > 0.7 ? SNOW : SNOWSH;
    if (t > 0.32) return mix(c, '#4b5a78', fbm(x * 18, y * 18, z * 18) * 0.7);
    if (t > 0.12) return mix('#6b6a5a', c, sstep(0.12, 0.32, t));
    return hash3(Math.floor(x * 60), 3, Math.floor(z * 60)) > 0.6 ? '#2f5e3f' : mix('#3f6b45', '#5a8a4f', fbm(x * 9, 0, z * 9));
  }, { side: strataSide(EARTH) });
  const gy = onGround(hf);
  scatter(22, 11, (x, z) => { if (hf(x, z) < 0.07 && hf(x, z) > 0.012) pine(gp, x, gy(x, z), z, 0.055, '#2f5e3f'); }, 0.47);
  // Chureito pagoda on the front-left foothill
  const px = -0.34, pz = 0.2, py = gy(px, pz);
  for (let i = 0; i < 5; i++) {
    box(gp, '#b91c1c', px, py + i * 0.022, pz, 0.026 - i * 0.002, 0.016, 0.026 - i * 0.002);
    box(gp, '#3f3f46', px, py + i * 0.022 + 0.016, pz, 0.042 - i * 0.004, 0.005, 0.042 - i * 0.004);
  }
};

// ---------------------------------------------------------------------------------------------------------
const canyon: Builder = (gp, r) => {
  const c = r.color!, H = 0.32;
  const pal = ['#8c3b1f', '#b4532a', c, '#d9894f', '#e8b27a', '#c96a3a', '#f1d2a0', '#a6462a'];
  const xc = (z: number) => 0.09 * Math.sin(z * 7 + 0.6) + 0.03 * Math.sin(z * 17);
  const hf: HFn = (x, z) => {
    const dd = Math.abs(x - xc(z)) + 0.02 * fbm(x * 10, 0, z * 10);
    let carve = 1 - sstep(0.025, 0.46, dd);
    const butte = Math.hypot(x + 0.2, z + 0.16), butte2 = Math.hypot(x - 0.22, z - 0.18);
    carve *= sstep(0.03, 0.09, butte) * sstep(0.025, 0.07, butte2) * 0.6 + 0.4 * (butte > 0.09 && butte2 > 0.07 ? 1 : 0.2);
    const s = carve * 6, fl = Math.floor(s), fr = s - fl;
    const terr = (fl + sstep(0.55, 0.95, fr)) / 6;
    let y = H * (1 - terr) + 0.012 * fbm(x * 22, 0, z * 22);
    if (dd < 0.035) y = 0.004;
    return Math.max(0.004, y);
  };
  island(gp, 0.5, hf, c, (x, y, z, _nx, ny) => {
    if (y < 0.042 && ny > 0.96) return ripple('#2aa198')(x, y, z, 0, 1, 0);
    if (ny > 0.9 && y > 0.035 + H * 0.95) return hash3(Math.floor(x * 70), 0, Math.floor(z * 70)) > 0.85 ? '#4d5a2a' : '#9a8a5a';
    const band = pal[Math.abs(Math.floor(y * 30 + fbm(x * 6, y * 2, z * 6) * 1.2)) % pal.length];
    return ny > 0.85 ? mix(band, '#c8a070', 0.35) : band;
  }, { side: strataSide(pal, 30), rings: 60, segs: 140 });
};

// ---------------------------------------------------------------------------------------------------------
const waterfall: Builder = (gp, r) => {
  const ice = Boolean(r.ice), wide = Boolean(r.wide);
  const W = wide ? 0.32 : 0.2, top = 0.4, wc = r.color!;
  const zl = (x: number) => (Math.abs(x) < W ? -0.06 - 0.12 * (1 - (x / W) ** 2) : -0.06 + (Math.abs(x) - W) * 1.25);
  const hf: HFn = (x, z) => {
    const s = sstep(-0.006, 0.03, z - zl(x) + 0.012 * (fbm(x * 20, 0, z * 20) - 0.5));
    const inRiver = Math.abs(x) < W * 0.9 && z < zl(x) && z > zl(x) - 0.22;
    const plateau = inRiver ? top - 0.012 : top + 0.018 * fbm(x * 9, 1, z * 9);
    const pool = 1 - ((x / (W + 0.08)) ** 2 + ((z - zl(0) - 0.24) / 0.22) ** 2);
    const floor = pool > 0 ? 0.004 : 0.03 + 0.02 * fbm(x * 9, 4, z * 9);
    let y = plateau * (1 - s) + floor * s;
    return Math.max(0.004, y);
  };
  const rock = ice ? '#94a3b8' : '#5d564f', moss = ice ? '#eef4fa' : '#4f7a46';
  island(gp, 0.5, hf, moss, (x, y, z, _nx, ny) => {
    if (ny > 0.97 && y < 0.042) return ripple(ice ? '#7f1d1d' : '#3b8fc4')(x, y, z, 0, 1, 0);
    if (ny > 0.97 && Math.abs(x) < W * 0.9 && z < zl(x) && Math.abs(y - (0.035 + top - 0.012)) < 0.002) return ripple(ice ? '#e0eef8' : wc)(x, y, z, 0, 1, 0);
    if (ny < 0.6) return Math.sin(y * 140 + fbm(x * 12, y * 4, z * 12) * 4) > 0.3 ? rock : shade(rock, 1.18);
    if (ice) return hash3(Math.floor(x * 50), 0, Math.floor(z * 50)) > 0.8 ? '#cfe0ee' : '#f1f6fb';
    return hash3(Math.floor(x * 60), 1, Math.floor(z * 60)) > 0.7 ? '#3a6b3a' : mix(moss, '#6b9a55', fbm(x * 10, 0, z * 10));
  }, { side: strataSide(ice ? ['#cbd5e1', '#94a3b8', '#e2e8f0'] : EARTH) });

  // Falling water curtain following the horseshoe lip, bowing outward as it drops; white foam streaks
  const nx = 44, ny = 14, pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = -W * 0.95 + (2 * W * 0.95 * i) / nx, v = j / ny;
    pos.push(x, top + 0.04 - v * (top + 0.02), zl(x) - 0.006 + 0.05 * Math.sin(v * Math.PI * 0.5) * (1 - v * 0.3));
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c2 = a + nx + 1, d = c2 + 1;
    idx.push(a, c2, b, b, c2, d);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wg.setIndex(idx);
  wg.computeVertexNormals();
  const foam = ice ? '#e8b4a0' : '#f8fafc';
  add(gp, paintFaces(wg, wc, (x, y) => {
    const streak = hash3(Math.floor(x * 140), 0, 0);
    if (y < 0.09) return foam;
    return streak > 0.62 ? foam : streak > 0.35 ? mix(wc, foam, 0.45) : null;
  }), mat('#ffffff', { flat: false, vc: true, rough: 0.25 }), 0, 0, 0, 1, 1, 1);

  // Mist plumes rising from the plunge pool
  for (let i = 0; i < 9; i++) {
    const x = -W + (2 * W * i) / 8;
    ellip(gp, '#f8fafc', x, 0.05 + (i % 3) * 0.02, zl(x) + 0.07, 0.07, 0.04, 0.05).material = mat('#f8fafc', { transparent: 0.32 });
  }
  if (!ice) {
    add(gp, new THREE.TorusGeometry(0.22, 0.01, 6, 28, Math.PI), mat('#fbbf24', { emissive: '#f59e0b', transparent: 0.55 }), 0, 0.08, 0.16, 1, 1, 1, 0.25);
    const gy = onGround(hf);
    scatter(26, 5, (x, z, i) => {
      if (hf(x, z) > top - 0.03 && !(Math.abs(x) < W && z < zl(x) && z > zl(x) - 0.2)) (i % 3 ? tree : pine)(gp, x, gy(x, z), z, 0.06, i % 2 ? '#2f6b45' : '#3f7a4e');
    }, 0.47);
  }
};

// ---------------------------------------------------------------------------------------------------------
const rock: Builder = (gp, r) => {
  const c = r.color!;
  const loaf = (x: number, z: number) => {
    const ca = Math.cos(0.25), sa = Math.sin(0.25);
    const px = x * ca - z * sa, pz = x * sa + z * ca;
    return { m: 1 - ((Math.abs(px) / 0.35) ** 2.4 + (Math.abs(pz + 0.02) / 0.17) ** 2.4), a: Math.atan2(pz, px) };
  };
  const hf: HFn = (x, z) => {
    const { m, a } = loaf(x, z);
    let y = 0.012 + 0.012 * fbm(x * 9, 0, z * 9);
    if (m > -0.05) {
      const body = 0.26 * Math.pow(sstep(-0.05, 0.4, m), 0.55);
      const flute = 1 - 0.09 * Math.abs(Math.sin(a * 34 + fbm(x * 8, 0, z * 8) * 2)) * (1 - sstep(0.2, 0.7, m));
      y = Math.max(y, body * flute + 0.015 * fbm(x * 14, 1, z * 14) * sstep(0.3, 0.8, m));
    }
    return y;
  };
  island(gp, 0.5, hf, '#d68a3c', (x, y, z, _nx, ny) => {
    const { m } = loaf(x, z);
    if (m > 0 && y > 0.06) {
      if (ny < 0.7 && hash3(Math.floor(Math.atan2(z, x) * 60), 0, 0) > 0.72) return '#7f321c';
      if (ny > 0.85) return mix(shade(c, 1.12), '#d97a45', fbm(x * 12, 0, z * 12));
      return mix(c, shade(c, 0.85), fbm(x * 20, y * 30, z * 20));
    }
    if (hash3(Math.floor(x * 80), 0, Math.floor(z * 80)) > 0.93) return '#8a8a3a';
    return mix('#d68a3c', '#c2703a', fbm(x * 8, 0, z * 8));
  }, { side: strataSide(['#a0451f', '#b8562a', '#8a3a1c']) });
  const gy = onGround(hf);
  scatter(18, 9, (x, z, i) => {
    if (loaf(x, z).m < -0.4) {
      if (i % 3 === 0) tree(gp, x, gy(x, z), z, 0.05, '#6b7d3a');
      else ellip(gp, i % 2 ? '#8a9a3a' : '#9aa24a', x, gy(x, z) + 0.008, z, 0.022, 0.014, 0.022);
    }
  }, 0.47);
};

// ---------------------------------------------------------------------------------------------------------
function staghorn(gp: THREE.Object3D, x: number, y: number, z: number, s: number, c: string, seed: number): void {
  const grow = (p: V3, dir: V3, len: number, rad: number, depth: number) => {
    const e: V3 = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
    tube(gp, [p, e], rad, rad * 0.7, depth ? c : mix(c, '#fff7ed', 0.5));
    if (depth <= 0) { ellip(gp, mix(c, '#fff7ed', 0.6), e[0], e[1], e[2], rad * 0.8); return; }
    for (let k = 0; k < 2; k++) {
      const a = hash3(seed, depth, k) * Math.PI * 2;
      const nd: V3 = [dir[0] * 0.6 + Math.cos(a) * 0.45, Math.max(0.35, dir[1] * 0.75), dir[2] * 0.6 + Math.sin(a) * 0.45];
      const l = Math.hypot(...nd);
      grow(e, [nd[0] / l, nd[1] / l, nd[2] / l], len * 0.72, rad * 0.72, depth - 1);
    }
  };
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + seed;
    grow([x, y, z], [Math.cos(a) * 0.35, 0.93, Math.sin(a) * 0.35], s * 0.4, s * 0.06, 2);
  }
}
function brain(gp: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  pblob(gp, c, x, y, z, s, s * 0.62, s, (px, py, pz) => (Math.sin(fbm(px * 30, py * 30, pz * 30) * 40) > 0.2 ? shade(c, 0.72) : null), [0, 0, 0], 30);
}
function tableCoral(gp: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  cyl(gp, shade(c, 0.8), x, y, z, s * 0.12, s * 0.5, 8);
  pblob(gp, c, x, y + s * 0.55, z, s, s * 0.12, s * 0.9, (px, _py, pz) => (worley(px * 60, 0, pz * 60)[0] < 0.25 ? mix(c, '#fff7ed', 0.4) : null), [0, 0, 0], 28);
}
function fan(gp: THREE.Object3D, x: number, y: number, z: number, s: number, c: string, ry: number): void {
  const m = slab(gp, [[0, 0], [-0.4, 0.35], [-0.45, 0.75], [-0.2, 1], [0.15, 1], [0.42, 0.8], [0.45, 0.4]].map(([a, b]) => [a * s, b * s] as [number, number]), 0.006, c, 0.002);
  m.position.set(x, y, z); m.rotation.y = ry;
  tube(gp, [[x, y, z], [x, y + s * 0.4, z]], s * 0.04, s * 0.03, shade(c, 0.7));
}
function anemone(gp: THREE.Object3D, x: number, y: number, z: number, s: number, c: string): void {
  ellip(gp, shade(c, 0.75), x, y + s * 0.15, z, s * 0.35, s * 0.2, s * 0.35);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, rr = s * (0.12 + (i % 2) * 0.12);
    const bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
    tube(gp, [[bx, y + s * 0.25, bz], [bx + Math.cos(a) * s * 0.18, y + s * 0.6, bz + Math.sin(a) * s * 0.18], [bx + Math.cos(a) * s * 0.3, y + s * 0.75, bz + Math.sin(a) * s * 0.3]], s * 0.045, s * 0.03, c);
  }
}
function clownfish(gp: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): void {
  const g0 = new THREE.Group();
  g0.position.set(x, y, z); g0.rotation.y = ry; gp.add(g0);
  pblob(g0, '#f97316', 0, 0, 0, s * 0.45, s * 0.55, s, (_x, _y, pz) => (Math.abs(pz - s * 0.35) < s * 0.12 || Math.abs(pz + s * 0.25) < s * 0.1 ? '#ffffff' : null), [0, 0, 0], 20);
  const t = slab(g0, [[0, 0], [-0.5, 0.5], [-0.5, -0.5]].map(([a, b]) => [a * s, b * s] as [number, number]), s * 0.08, '#f97316', 0, false);
  t.position.set(0, 0, -s * 0.9); t.rotation.y = Math.PI / 2;
  for (const sx of [-1, 1]) ellip(g0, '#111827', sx * s * 0.3, s * 0.15, s * 0.65, s * 0.1);
}

const reef: Builder = (gp, r) => {
  const c = r.color!;
  const hf: HFn = (x, z) => 0.03 + 0.035 * fbm(x * 6, 0, z * 6) + 0.006 * Math.sin(x * 70 + Math.sin(z * 20));
  island(gp, 0.5, hf, '#f3dfa6', (x, _y, z) => (hash3(Math.floor(x * 70), 0, Math.floor(z * 70)) > 0.92 ? '#e6c98a' : mix('#f6e7b8', '#e9d29a', fbm(x * 10, 0, z * 10))),
    { side: strataSide(['#e8d29a', '#d9be80', '#c9ab6a']) });
  const gy = onGround(hf);
  const cs = [c, '#f59e0b', '#c084fc', '#fb7185', '#2dd4bf', '#a3e635'];
  brain(gp, -0.16, gy(-0.16, 0.05) + 0.02, 0.05, 0.1, '#e5b45a');
  brain(gp, 0.22, gy(0.22, -0.1) + 0.02, -0.1, 0.08, '#a3c45a');
  tableCoral(gp, 0.05, gy(0.05, -0.22), -0.22, 0.17, '#5eead4');
  tableCoral(gp, -0.3, gy(-0.3, -0.18), -0.18, 0.12, '#c084fc');
  staghorn(gp, 0.12, gy(0.12, 0.14), 0.14, 0.3, cs[0], 1);
  staghorn(gp, -0.08, gy(-0.08, -0.06), -0.06, 0.34, '#f472b6', 2);
  staghorn(gp, 0.32, gy(0.32, 0.12), 0.12, 0.22, '#fbbf24', 3);
  fan(gp, -0.04, gy(-0.04, -0.34), -0.34, 0.26, '#a855f7', 0.2);
  fan(gp, 0.3, gy(0.3, -0.26), -0.26, 0.18, '#f43f5e', -0.6);
  anemone(gp, -0.26, gy(-0.26, 0.26), 0.26, 0.14, '#4ade80');
  anemone(gp, 0.04, gy(0.04, 0.34), 0.34, 0.11, '#fb7185');
  for (let i = 0; i < 18; i++) {
    const a = hash3(i, 1, 9) * Math.PI * 2, d = 0.15 + hash3(i, 2, 9) * 0.3;
    ellip(gp, cs[i % cs.length], Math.cos(a) * d, gy(Math.cos(a) * d, Math.sin(a) * d) + 0.01, Math.sin(a) * d, 0.022, 0.016, 0.022);
  }
  clownfish(gp, -0.2, 0.3, 0.2, 0.05, 0.8);
  clownfish(gp, -0.12, 0.34, 0.24, 0.04, 1.1);
  clownfish(gp, 0.2, 0.36, -0.02, 0.045, -0.5);
  // Translucent lagoon surface
  add(gp, new THREE.CylinderGeometry(0.5, 0.5, 0.01, 64), mat('#38bdf8', { transparent: 0.22, rough: 0.1 }), 0, 0.15, 0, 1, 1, 1);
};

export const NATURE_BUILDERS: Record<string, Builder> = { mountain, canyon, waterfall, rock, reef };
