import * as THREE from 'three';
import {
  type Builder, type Paint, type V3, num, mat, add, box, cyl, ball, ellip, rbox, rod, skin, prism, slab, sweep, lathe, shade, hash3,
} from './prims.ts';

// Scale-model vehicles: lofted displacement hulls with sheer and flare, stepped deckhouses with glazing bands,
// raked funnels, swept-wing airliners with nacelles, streamlined train sets with bogies and pantographs, and a
// gored hot-air balloon. Front is +z, ~1 unit long, base at y=0.

interface HullSpec { L: number; B: number; D: number; z0?: number; y0?: number; fine?: number; paint?: Paint; deck?: string; wl?: number }

/** Displacement hull: superellipse sections, bow flare & forefoot, sheer line, transom stern, separate flat deck. */
export function hull(p: THREE.Object3D, c: string, s: HullSpec): { deckY: (z: number) => number; halfB: (z: number) => number } {
  const { L, B, D } = s, z0 = s.z0 ?? 0, y0 = s.y0 ?? 0, fine = s.fine ?? 0.38;
  const NZ = 36, NS = 9;
  const halfB = (u: number) => {
    const bowStart = 1 - fine;
    if (u > bowStart) return (B / 2) * Math.max(0.012, Math.sqrt(Math.max(0, 1 - ((u - bowStart) / fine) ** 2)));
    if (u < 0.12) return (B / 2) * (0.84 + 0.16 * Math.sin((u / 0.12) * Math.PI / 2));
    return B / 2;
  };
  const sheer = (u: number) => D * (1 + 0.2 * Math.max(0, (u - 0.6) / 0.4) ** 2 + 0.05 * Math.max(0, (0.12 - u) / 0.12));
  const keel = (u: number) => (u > 0.86 ? D * 0.45 * ((u - 0.86) / 0.14) ** 2 : u < 0.1 ? D * 0.35 * ((0.1 - u) / 0.1) ** 1.5 : 0);
  const rings: V3[][] = [], deckL: V3[] = [], deckR: V3[] = [];
  for (let i = 0; i <= NZ; i++) {
    const u = i / NZ, z = z0 - L / 2 + u * L, w = halfB(u), top = sheer(u), kb = keel(u);
    const pw = 1.5 + 2.6 * (1 - Math.max(0, (u - 0.5) / 0.5));
    const side: V3[] = [];
    // Rows are distributed so one row lies exactly on the waterline (crisp boot-topping edge)
    const wl = Math.max(kb + 0.002, Math.min(s.wl ?? D * 0.3, top - 0.01)), K = 3;
    for (let k = 0; k <= NS; k++) {
      const t = k / NS, y = k <= K ? kb + (wl - kb) * (k / K) : wl + (top - wl) * ((k - K) / (NS - K));
      const flare = 1 + 0.08 * t * Math.max(0, (u - 0.7) / 0.3);
      side.push([w * flare * Math.pow(1 - Math.pow(1 - t, pw), 1 / pw), y0 + y, z]);
    }
    const ring: V3[] = [];
    for (let k = NS; k >= 1; k--) ring.push(side[k]);
    ring.push([0, side[0][1], z]);
    for (let k = 1; k <= NS; k++) ring.push([-side[k][0], side[k][1], z]);
    rings.push(ring);
    deckR.push(side[NS]); deckL.push([-side[NS][0], side[NS][1], z]);
  }
  skin(p, rings, c, { closed: false, caps: true, paint: s.paint, flat: false });
  // Flat deck with a slight camber, built as its own crisp surface
  const dk: V3[][] = deckR.map((r, i) => [r, [0, r[1] + D * 0.03, r[2]], deckL[i]]);
  const dp: number[] = [];
  for (let i = 0; i < dk.length - 1; i++) for (let j = 0; j < 2; j++) {
    const a = dk[i][j], b = dk[i][j + 1], c2 = dk[i + 1][j], d = dk[i + 1][j + 1];
    dp.push(...a, ...c2, ...b, ...b, ...c2, ...d);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  dg.computeVertexNormals();
  add(p, dg, mat(s.deck ?? '#b98b5e'), 0, 0, 0, 1, 1, 1);
  return {
    deckY: (z: number) => y0 + sheer(Math.min(1, Math.max(0, (z - z0 + L / 2) / L))),
    halfB: (z: number) => halfB(Math.min(1, Math.max(0, (z - z0 + L / 2) / L))),
  };
}

/** Rounded-front deckhouse tier with a dark glazing band. */
function deckhouse(p: THREE.Object3D, w: number, z0: number, z1: number, y: number, h: number, c: string, glass = '#1e3a5f', round = 0.6): void {
  const hw = w / 2, len = z1 - z0, nose = Math.min(len * 0.35, hw * round * 1.6);
  const plan: [number, number][] = [[-hw, z0], [hw, z0], [hw, z1 - nose], [hw * 0.72, z1 - nose * 0.25], [0, z1], [-hw * 0.72, z1 - nose * 0.25], [-hw, z1 - nose]];
  prism(p, plan, y, h, c, Math.min(0.004, h * 0.12), true);
  const gp = plan.map(([x, z]) => [x * 1.025, z0 + (z - z0) * 1.006 - len * 0.003] as [number, number]);
  prism(p, gp, y + h * 0.42, h * 0.32, glass, 0, true);
}

function funnel(p: THREE.Object3D, x: number, y: number, z: number, h: number, w: number, c: string, top = '#111827'): void {
  sweep(p, [
    { p: [x, y, z], w, h: w * 1.5 }, { p: [x, y + h * 0.5, z - h * 0.06], w: w * 0.98, h: w * 1.45 }, { p: [x, y + h, z - h * 0.14], w: w * 0.94, h: w * 1.38 },
  ], c, { radial: 18, sub: 3, up: [0, 0, 1], paint: (_x, py) => (py > y + h * 0.8 ? top : null) });
  ellip(p, '#0b0f17', x, y + h + 0.002, z - h * 0.14, w * 0.85, 0.004, w * 1.25);
}

const ship: Builder = (gp, r) => {
  if (r.variant === 'ferry') return roro(gp, r);
  const c = r.color!, a = r.accent ?? '#dc2626';
  const isContainer = !!r.containers;
  const L = 0.98, Bm = isContainer ? 0.2 : 0.19, D = 0.115;
  const boot = isContainer ? '#9b2c2c' : '#b3202a', wl = isContainer ? 0.034 : 0.04;
  const H = hull(gp, c, {
    L, B: Bm, D, wl, fine: isContainer ? 0.3 : 0.4, deck: isContainer ? '#7a4a3a' : '#c49a6c',
    paint: (_x, y) => (y < wl ? boot : null),
  });
  if (isContainer) {
    // Aft bridge block, then container bays stacked forward
    const zb = -0.36, dy = H.deckY(zb);
    rbox(gp, '#f8fafc', 0, dy, zb, 0.17, 0.2, 0.09, 0.006);
    box(gp, '#1e3a5f', 0, dy + 0.16, zb + 0.046, 0.172, 0.022, 0.004);
    box(gp, '#f8fafc', 0, dy + 0.2, zb, 0.22, 0.012, 0.05);
    funnel(gp, 0, dy, zb - 0.07, 0.17, 0.028, a);
    const pal = ['#c0392b', '#2563eb', '#e0a526', '#16803c', '#e2e8f0', '#0e7490', '#9a3412', '#475569'];
    for (let bay = 0; bay < 9; bay++) {
      const z = -0.26 + bay * 0.062, hw = H.halfB(z) * 0.92, cols = Math.max(2, Math.floor((hw * 2) / 0.034)), tiers = bay > 6 ? 2 : 3;
      for (let k = 0; k < cols; k++) for (let t = 0; t < tiers; t++) {
        const x = -hw + (k + 0.5) * ((hw * 2) / cols);
        const col = pal[Math.floor(hash3(bay, k, t) * pal.length)];
        rbox(gp, col, x, H.deckY(z) + t * 0.031, z, (hw * 2) / cols - 0.004, 0.029, 0.056, 0.003);
      }
    }
    rod(gp, [0, H.deckY(0.42), 0.42], [0, H.deckY(0.42) + 0.08, 0.42], 0.004, '#f8fafc');
    return;
  }
  // Ocean liner (Queen Mary 2 style): long tall white superstructure terraced down at the stern, bridge with
  // full-beam wings, a long row of orange lifeboats low on the superstructure and one red Cunard funnel
  const dy = H.deckY(0), th = 0.024, tiers = 5;
  for (let t = 0; t < tiers; t++) {
    const w = Bm * (0.95 - t * 0.045), z0 = -0.43 + t * 0.05, z1 = 0.2 - t * 0.02;
    deckhouse(gp, w, z0, z1, dy + t * th, th, '#f8fafc', '#16324f', 0.9);
  }
  const topY = dy + tiers * th;
  // Bridge with wings spanning the beam
  box(gp, '#f8fafc', 0, dy + 3 * th, 0.12, Bm * 1.04, th * 0.9, 0.03);
  box(gp, '#0f2a44', 0, dy + 3 * th + th * 0.35, 0.1355, Bm * 1.0, th * 0.35, 0.002);
  // Lifeboats in a long row along both sides
  for (const sx of [-1, 1]) for (let i = 0; i < 11; i++) {
    const z = -0.29 + i * 0.038, x = sx * (Bm * 0.475 + 0.006);
    ball(gp, '#f97316', x, dy + th * 1.5, z, 0.0105, 0.0095, 0.017);
    box(gp, '#f8fafc', x, dy + th * 1.5 + 0.006, z, 0.014, 0.003, 0.028);
  }
  // Aft terraces: pool and deck furniture
  box(gp, '#38bdf8', 0, dy + 2 * th, -0.31, 0.06, 0.003, 0.05).material = mat('#38bdf8', { emissive: '#0369a1' });
  box(gp, '#38bdf8', 0, dy + th, -0.37, 0.07, 0.003, 0.03).material = mat('#38bdf8', { emissive: '#0369a1' });
  funnel(gp, 0, topY, -0.13, 0.085, 0.036, a);
  rod(gp, [0, topY, 0.05], [0, topY + 0.075, 0.04], 0.003, '#e2e8f0');
  box(gp, '#e2e8f0', 0, topY + 0.055, 0.042, 0.05, 0.003, 0.004);
  ball(gp, '#f8fafc', 0, topY + 0.012, 0.0, 0.026, 0.026, 0.026);
};

// ---------------------------------------------------------------------------------------------------------
/** Ro-ro car & passenger ferry: high boxy white hull with a blue band, blunt bow visor, tall flat-fronted
 *  superstructure, twin side-by-side funnels and a stern car ramp. */
const roro: Builder = (gp, r) => {
  const a = r.accent ?? '#1d4f9a', white = '#f7f8fa', glass = '#1b2a3c';
  const L = 0.96, B = 0.21, D = 0.15;
  // Boxy ro-ro hull lofted with gridSkin so the livery bands follow ring rows exactly: flat sides, tight bilge,
  // full blunt bow with a raked stem, wide transom stern and only a slight sheer forward
  const Ys = [D, 0.13, 0.111, 0.09, 0.05, 0.035, 0.03, 0.018, 0.008, 0];
  const bandC = ['#f7f8fa', '#f7f8fa', a, '#f7f8fa', '#f7f8fa', '#1f2937', '#8a1f24', '#8a1f24', '#8a1f24'];
  const hb = (u: number) => {
    if (u > 0.78) return (B / 2) * Math.max(0.01, Math.pow(Math.max(0, 1 - ((u - 0.78) / 0.22) ** 2.3), 0.55));
    if (u < 0.05) return (B / 2) * (0.9 + 0.1 * Math.sin((u / 0.05) * Math.PI / 2));
    return B / 2;
  };
  const sheer = (u: number) => 0.014 * Math.max(0, (u - 0.72) / 0.28) ** 2;
  const hx = (u: number, y: number) => {
    const ue = Math.min(1, u + 0.06 * (1 - y / D) ** 1.5), bil = y < 0.03 ? 0.72 + 0.28 * Math.sqrt(y / 0.03) : 1;
    return hb(ue) * bil * (1 + 0.05 * (y / D) * Math.max(0, (u - 0.75) / 0.25));
  };
  const rings: V3[][] = [];
  for (let i = 0; i <= 44; i++) {
    const t = i / 44, u = t < 0.6 ? t * (0.7 / 0.6) : 0.7 + (t - 0.6) / 0.4 * 0.3, z = -L / 2 + u * L;
    const stb: V3[] = Ys.map((y, k) => [hx(u, y), k === 0 ? y + sheer(u) : y, z]);
    rings.push([...stb, ...stb.slice().reverse().map(([x, y, zz]) => [-x, y, zz] as V3)]);
  }
  gridSkin(gp, rings, (_i, j) => (j < 9 ? bandC[j] : j === 9 ? '#8a1f24' : j <= 18 ? bandC[18 - j] : '#c7ced6'));
  const dk = D;
  // Bow visor seam (curving down from the forecastle to the stem) and hawse pipes
  for (const sx of [-1, 1]) {
    const pts: [number, number][] = [[0.33, D + sheer(0.83) - 0.002], [0.36, D * 0.82], [0.395, D * 0.62], [0.43, D * 0.47], [0.455, D * 0.4]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [z0, y0] = pts[k], [z1, y1] = pts[k + 1];
      rod(gp, [sx * (hx((z0 + L / 2) / L, y0) + 0.001), y0, z0], [sx * (hx((z1 + L / 2) / L, y1) + 0.001), y1, z1], 0.0014, '#475569', 4);
    }
    ball(gp, '#1f2937', sx * (hx(0.89, D * 0.86) + 0.0005), D * 0.86, -L / 2 + 0.89 * L, 0.005, 0.005, 0.003);
  }
  // Forecastle bulwark
  box(gp, '#e5e7eb', 0, dk, 0.275, B * 0.9, 0.01, 0.004);
  // Superstructure: two passenger decks with window bands, an upper accommodation deck and a flat bridge front
  const zA = -0.4, zF = 0.23, w0 = B * 0.98;
  const blk = (y: number, h: number, z0: number, z1: number, w: number, rows: number[]) => {
    rbox(gp, white, 0, y, (z0 + z1) / 2, w, h, z1 - z0, 0.004);
    for (const ry of rows) for (const sx of [-1, 1]) box(gp, glass, sx * (w / 2 + 0.0005), y + h * ry, (z0 + z1) / 2, 0.002, h * 0.22, (z1 - z0) * 0.92);
    for (const ry of rows) box(gp, glass, 0, y + h * ry, z1 + 0.0005, w * 0.9, h * 0.22, 0.002);
  };
  blk(dk, 0.05, zA, zF, w0, [0.25, 0.65]);
  blk(dk + 0.05, 0.034, zA + 0.04, zF - 0.02, w0 * 0.97, [0.4]);
  blk(dk + 0.084, 0.026, zA + 0.16, zF - 0.03, w0 * 0.86, [0.4]);
  // Bridge with wings spanning the full beam
  const by = dk + 0.11;
  rbox(gp, white, 0, by, zF - 0.06, B * 1.08, 0.022, 0.05, 0.003);
  box(gp, glass, 0, by + 0.008, zF - 0.035 + 0.0005, B * 1.0, 0.009, 0.002);
  box(gp, '#e2e8f0', 0, by + 0.022, zF - 0.06, B * 0.9, 0.004, 0.05);
  // Mast with radar
  rod(gp, [0, by + 0.026, zF - 0.07], [0, by + 0.07, zF - 0.075], 0.003, '#e2e8f0', 6);
  box(gp, '#e2e8f0', 0, by + 0.055, zF - 0.074, 0.05, 0.003, 0.004);
  box(gp, '#334155', 0, by + 0.04, zF - 0.06, 0.035, 0.003, 0.006);
  // Twin side-by-side funnels (squared, raked) aft on the top deck with blue tops
  for (const sx of [-1, 1]) {
    const fx = sx * 0.042, fz = -0.27, fy = dk + 0.11;
    prism(gp, [[-0.013, -0.028], [0.013, -0.028], [0.013, 0.022], [0, 0.03], [-0.013, 0.022]].map(([x, z]) => [fx + x, fz + z] as [number, number]), fy, 0.06, white, 0.002);
    prism(gp, [[-0.0135, -0.0285], [0.0135, -0.0285], [0.0135, 0.0225], [0, 0.0305], [-0.0135, 0.0225]].map(([x, z]) => [fx + x, fz + z] as [number, number]), fy + 0.042, 0.018, a, 0.001);
    box(gp, '#111827', fx, fy + 0.06, fz, 0.018, 0.003, 0.04);
  }
  // Lifeboats in davits along the upper deck sides & life-raft canisters
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = -0.2 + i * 0.075;
      ball(gp, '#f97316', sx * (w0 * 0.5 + 0.004), dk + 0.073, z, 0.009, 0.007, 0.024);
      box(gp, '#f8fafc', sx * (w0 * 0.5 + 0.004), dk + 0.079, z, 0.016, 0.003, 0.03);
    }
    for (let i = 0; i < 3; i++) cyl(gp, '#e2e8f0', sx * (w0 * 0.44), dk + 0.084, -0.3 + i * 0.02, 0.006, 0.008, 8);
  }
  // Stern: flat transom with the big car ramp (raised) and its hinge
  const sz = -L / 2 + 0.004;
  box(gp, '#4b5563', 0, 0.045, sz - 0.004, B * 0.62, 0.07, 0.006);
  box(gp, '#6b7280', 0, 0.042, sz - 0.008, B * 0.66, 0.006, 0.006);
  for (const sx of [-1, 1]) rod(gp, [sx * B * 0.3, 0.115, sz - 0.004], [sx * B * 0.36, dk + 0.05, sz + 0.01], 0.0018, '#94a3b8', 4);
};

// ---------------------------------------------------------------------------------------------------------
// Shared helpers for the type-specific airliners and trains
const sst = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const tab = (T: [number, number][], u: number) => {
  for (let i = 1; i < T.length; i++) if (u <= T[i][0]) { const [a, va] = T[i - 1], [b, vb] = T[i]; return va + (vb - va) * ((u - a) / (b - a)); }
  return T[T.length - 1][1];
};

/** Skin through closed rings with per-quad colours chosen by (ring row i, ring segment j); caps get i = -1 / rings-1. */
function gridSkin(p: THREE.Object3D, rings: V3[][], col: (i: number, j: number) => string, caps = true): THREE.Mesh {
  const m = rings.length, n = rings[0].length, pos: number[] = [], idx: number[] = [];
  for (const r of rings) for (const v of r) pos.push(v[0], v[1], v[2]);
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
    idx.push(a, b, c, b, d, c);
  }
  const cen = (r: V3[]): V3 => { let x = 0, y = 0, z = 0; for (const v of r) { x += v[0]; y += v[1]; z += v[2]; } return [x / n, y / n, z / n]; };
  let wi = 0, best = -1;
  for (let i = 0; i < m; i++) { const c = cen(rings[i]); const s = Math.hypot(rings[i][0][0] - c[0], rings[i][0][1] - c[1]); if (s > best) { best = s; wi = i; } }
  const ri = Math.min(wi, m - 2), ct = cen(rings[wi]);
  let score = 0;
  const A = new THREE.Vector3(), Bv = new THREE.Vector3(), C = new THREE.Vector3();
  for (let j = 0; j < n; j++) {
    const t = (ri * n + j) * 6;
    A.fromArray(pos, idx[t] * 3); Bv.fromArray(pos, idx[t + 1] * 3); C.fromArray(pos, idx[t + 2] * 3);
    const nrm = Bv.clone().sub(A).cross(C.clone().sub(A));
    score += nrm.dot(A.clone().add(Bv).add(C).divideScalar(3).sub(new THREE.Vector3(...ct)));
  }
  const flip = score < 0;
  if (flip) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  const side = idx.length / 3;
  if (caps) for (const ring of [0, m - 1]) {
    const cc = cen(rings[ring]), ci = pos.length / 3;
    pos.push(...cc);
    for (let j = 0; j < n; j++) {
      const a = ring * n + j, b = ring * n + ((j + 1) % n);
      if ((ring > 0) !== flip) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ng = geo.toNonIndexed(), cols = new Float32Array(ng.getAttribute('position').count * 3);
  const cache = new Map<string, THREE.Color>();
  const tris = ng.getAttribute('position').count / 3;
  for (let t = 0; t < tris; t++) {
    let hex: string;
    if (t < side) { const q = t >> 1; hex = col(Math.floor(q / n), q % n); } else { const k = t - side; hex = col(k < n ? -1 : m - 1, k % n); }
    let cc = cache.get(hex);
    if (!cc) { cc = new THREE.Color(hex); cache.set(hex, cc); }
    for (let k = 0; k < 3; k++) { cols[(t * 3 + k) * 3] = cc.r; cols[(t * 3 + k) * 3 + 1] = cc.g; cols[(t * 3 + k) * 3 + 2] = cc.b; }
  }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return add(p, ng, mat('#ffffff', { flat: false, vc: true, rough: 0.45 }), 0, 0, 0, 1, 1, 1);
}

/** Lens-shaped aerofoil section: leading edge `le`, chord running aft (-z), thickness along `th`. */
function aerofoil(le: V3, c: number, t: number, th: V3): V3[] {
  const yt = (f: number) => 5 * t * c * (0.2969 * Math.sqrt(f) - 0.126 * f - 0.3516 * f * f + 0.2843 * f ** 3 - 0.1015 * f ** 4);
  const pt = (f: number, s: number): V3 => [le[0] + th[0] * s * yt(f), le[1] + th[1] * s * yt(f), le[2] - f * c + th[2] * s * yt(f)];
  return [pt(1, 0), ...[0.62, 0.3, 0.1, 0.02, 0].map(f => pt(f, 1.2)), ...[0.02, 0.1, 0.3, 0.62].map(f => pt(f, -0.8))];
}

interface WSt { x: number; z: number; c: number; t: number }
const wAt = (st: WSt[], x: number): WSt => {
  for (let i = 1; i < st.length; i++) if (x <= st[i].x + 1e-9) {
    const a = st[i - 1], b = st[i], k = (x - a.x) / (b.x - a.x);
    return { x, z: a.z + (b.z - a.z) * k, c: a.c + (b.c - a.c) * k, t: a.t + (b.t - a.t) * k };
  }
  return st[st.length - 1];
};

/** Half-wing lofted through planform stations with dihedral and (optional) quadratic up-flex. */
function jetWing(p: THREE.Object3D, side: number, st: WSt[], y0: number, dih: number, flex: number, c: string, samples = 7) {
  const b = st[st.length - 1].x, xs = new Set<number>(st.map(s => s.x));
  for (let i = 1; i < samples; i++) xs.add(st[0].x + (b - st[0].x) * (i / samples));
  const yAt = (x: number) => y0 + x * dih + flex * (x / b) ** 2;
  const rings = [...xs].sort((a, b2) => a - b2).map(x => { const s = wAt(st, x); return aerofoil([side * x, yAt(x), s.z], s.c, s.t, [0, 1, 0]); });
  skin(p, rings, c, { caps: true });
  return { yAt, at: (x: number) => wAt(st, x) };
}

/** Turbofan nacelle hung from (x, y, zf) pointing +z, with fan face, spinner, core plug and optional chevrons. */
function turbofan(p: THREE.Object3D, x: number, y: number, zf: number, r: number, len: number, c: string, chev = false, lip = '#cbd2da'): void {
  const prof: [number, number][] = [[r * 0.8, 0], [r * 0.95, len * 0.03], [r, len * 0.2], [r * 0.95, len * 0.62], [r * 0.8, len],
    [r * 0.56, len * 1.01], [r * 0.5, len * 1.22], [r * 0.32, len * 1.38], [r * 0.12, len * 1.47], [0, len * 1.49]];
  const m = lathe(p, prof, c, 0, 0, 0, 16);
  m.position.set(x, y, zf);
  m.rotation.x = -Math.PI / 2;
  cyl(p, lip, x, y, zf - 0.003, r * 0.9, 0.006, 16).rotation.x = Math.PI / 2;
  const fan = cyl(p, '#1f2733', x, y, zf - 0.006, r * 0.8, 0.004, 16);
  fan.rotation.x = Math.PI / 2;
  fan.position.set(x, y, zf - 0.008);
  ball(p, '#e5e7eb', x, y, zf - 0.008, r * 0.5, r * 0.5, r * 0.6);
  if (chev) {
    // Serrated (chevron) trailing edge of the fan cowl — the 787's signature noise-reducing sawtooth
    const n = 14, pos: number[] = [], zr = zf - len, r0 = r * 0.8, r1 = r * 0.72, l = r * 0.45;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const A: V3 = [x + Math.cos(a0) * r0, y + Math.sin(a0) * r0, zr + 0.001], B: V3 = [x + Math.cos(a1) * r0, y + Math.sin(a1) * r0, zr + 0.001];
      const T: V3 = [x + Math.cos(am) * r1, y + Math.sin(am) * r1, zr - l];
      pos.push(...A, ...B, ...T, ...A, ...T, ...B);
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g2.computeVertexNormals();
    add(p, g2, mat(shade(c, 0.78)), 0, 0, 0, 1, 1, 1);
  }
}

type JetKind = 'b747' | 'b787' | 'a380';
interface JetDef { Y: number; R: number; H: number; e: number; uN: number; uNt: number; uT: number; np: number; drop: number; hump: number; humpU: [number, number] }

function jetProf(d: JetDef, u: number) {
  let cy = d.Y, w = d.R, ht = d.H, hb = d.H, hump = d.hump * sst(d.humpU[0], d.humpU[1], u);
  // The crown starts curving down earlier (uNt) than the chin (uN), so the cockpit sits low on the nose
  if (u > d.uNt) {
    const k = (u - d.uNt) / (1 - d.uNt), s = Math.pow(Math.max(0, 1 - Math.pow(k, d.np)), 0.5);
    ht *= s; hump *= Math.pow(s, 0.8);
  }
  if (u > d.uN) {
    const k = (u - d.uN) / (1 - d.uN), s = Math.pow(Math.max(0, 1 - Math.pow(k, d.np)), 0.5);
    w *= s; hb *= s;
    cy -= d.drop * d.H * k * k;
  }
  if (u < d.uT) {
    const k = (d.uT - u) / d.uT;
    const top = cy + ht * (1 - 0.38 * k * k), bot = cy - hb + (hb + ht * 0.45) * Math.pow(k, 1.25);
    cy = (top + bot) / 2; ht = hb = Math.max(0.002, (top - bot) / 2);
    w = Math.max(0.003, d.R * (1 - 0.86 * Math.pow(k, 1.3)));
  }
  return { cy, w, ht, hb, hump };
}

/** Airliner after a specific type: Boeing 747-400, Boeing 787 Dreamliner or Airbus A380. */
function airliner(gp: THREE.Group, r: { color?: string; accent?: string }, v: JetKind): void {
  const is747 = v === 'b747', is787 = v === 'b787', is380 = v === 'a380';
  const d: JetDef = is380 ? { Y: 0.12, R: 0.05, H: 0.06, e: 2.25, uN: 0.925, uNt: 0.845, uT: 0.23, np: 2.2, drop: 0.5, hump: 0, humpU: [0, 1] }
    : is747 ? { Y: 0.11, R: 0.048, H: 0.048, e: 2, uN: 0.9, uNt: 0.9, uT: 0.22, np: 2, drop: 0.28, hump: 0.031, humpU: [0.57, 0.71] }
      : { Y: 0.11, R: 0.045, H: 0.046, e: 2, uN: 0.9, uNt: 0.875, uT: 0.24, np: 1.6, drop: 0.22, hump: 0, humpU: [0, 1] };
  const white = '#f5f6f8', belly = '#cdd3db', win = '#18222f';
  const acc = r.accent ?? '#2a5ac0';
  const sky = '#8fcde4', silver = '#c9ced5', qred = '#d71e2b';
  const body = is787 ? sky : white;
  // Ring stations along the fuselage: tail cone, uniform cabin (window pitch), elliptical nose
  const N = 36, P = 0.0125, us: number[] = [];
  for (let i = 0; i < 10; i++) us.push(d.uT * Math.pow(i / 10, 0.85));
  const iCab = us.length;
  const uN0 = Math.min(d.uN, d.uNt);
  for (let u = d.uT; u < uN0 - 1e-6; u += P) us.push(u);
  const iNose = us.length;
  for (let i = 0; i <= 16; i++) us.push(uN0 + (1 - uN0) * Math.sin((i / 16) * Math.PI / 2));
  const ex = 2 / d.e;
  const rings: V3[][] = us.map(u => {
    const pr = jetProf(d, u), z = u - 0.5, ring: V3[] = [];
    for (let j = 0; j < N; j++) {
      const t = (j / N) * Math.PI * 2, ct = Math.cos(t), stt = Math.sin(t);
      const x = pr.w * Math.sign(ct) * Math.abs(ct) ** ex;
      let y = stt >= 0 ? pr.ht * Math.abs(stt) ** ex : -pr.hb * Math.abs(stt) ** ex;
      if (pr.hump > 0 && stt > 0) { const q = Math.abs(x) / (pr.w * 0.72 + 1e-6); if (q < 1) y += pr.hump * Math.sqrt(1 - q ** 4); }
      ring.push([x, pr.cy + y, z]);
    }
    return ring;
  });
  const mirror = (j: number) => (((N / 2 - 1 - j) % N) + N) % N;
  const rowIn = (j: number, rows: number[]) => rows.includes(j) || rows.includes(mirror(j));
  const mainRows = is380 ? [34, 2] : [1];
  // Windscreen: nose ring range (u) × upper-half segment range
  const cock = is747 ? { u: [0.934, 0.958], j: [5, 12] } : is787 ? { u: [0.925, 0.952], j: [3, 14] } : { u: [0.935, 0.96], j: [2, 15] };
  gridSkin(gp, rings, (i, j) => {
    if (i < 0 || i >= rings.length - 1) return i < 0 ? (is380 ? qred : body) : body;
    const v0 = rings[i][j], v1 = rings[i + 1][(j + 1) % N];
    const y = (v0[1] + v1[1]) / 2, z = (v0[2] + v1[2]) / 2;
    const k = i - iCab, cab = i >= iCab + 1 && i < iNose - 1, dash = k % 2 === 0;
    // Windscreen
    const um = (us[i] + us[i + 1]) / 2;
    if (um > cock.u[0] && um < cock.u[1] && j >= cock.j[0] && j <= cock.j[1]) return j === 8 || j === 9 ? (is787 ? '#2a3442' : body) : win;
    // Passenger windows (dashed by ring parity)
    if (cab && dash && rowIn(j, mainRows) && !(k % 18 === 0)) return win;
    if (is747 && dash && i >= iCab && i < iNose && us[i] > 0.73 && rowIn(j, [5])) return win;
    if (is380) {
      if (z < -0.27 - 0.6 * (y - (d.Y - d.H))) return qred;
      if (rowIn(j, [24, 25, 26])) return belly;
      return white;
    }
    if (is787) return (j < N / 2 || j === N - 1 || j === N / 2) ? sky : silver;
    if (rowIn(j, [0]) && i >= iCab - 4 && i < iNose + 3) return acc;
    if (rowIn(j, [23, 24, 25, 26])) return belly;
    return white;
  });

  // Wings (low-mounted), engines, tailplane, fin
  const wy = d.Y - d.H * 0.62;
  const W: WSt[] = is747 ? [{ x: 0.02, z: 0.135, c: 0.235, t: 0.13 }, { x: 0.15, z: 0.04, c: 0.155, t: 0.11 }, { x: 0.455, z: -0.195, c: 0.056, t: 0.09 }]
    : is787 ? [{ x: 0.02, z: 0.125, c: 0.18, t: 0.13 }, { x: 0.13, z: 0.056, c: 0.13, t: 0.11 }, { x: 0.43, z: -0.133, c: 0.042, t: 0.09 }, { x: 0.48, z: -0.192, c: 0.013, t: 0.09 }]
      : [{ x: 0.02, z: 0.14, c: 0.26, t: 0.13 }, { x: 0.2, z: 0.022, c: 0.17, t: 0.11 }, { x: 0.545, z: -0.205, c: 0.055, t: 0.09 }];
  const wingC = '#dfe3e8', dih = is747 ? 0.12 : is787 ? 0.08 : 0.095, flex = is787 ? 0.05 : 0.008;
  const tipX = W[W.length - 1].x;
  for (const s of [-1, 1]) {
    const wg = jetWing(gp, s, W, wy, dih, flex, wingC, is787 ? 10 : 7);
    const tip = wg.at(tipX), ty = wg.yAt(tipX);
    if (is747) {
      // Canted winglet
      const cant = 0.42, h = 0.036, rs: V3[][] = [];
      for (let k = 0; k <= 2; k++) {
        const f = k / 2, le: V3 = [s * (tipX + Math.sin(cant) * h * f), ty + Math.cos(cant) * h * f, tip.z - 0.004 - 0.03 * f];
        rs.push(aerofoil(le, tip.c * (0.95 - 0.5 * f), 0.1, [s, 0, 0]));
      }
      skin(gp, rs, wingC, { caps: true });
    } else if (is380) {
      // Wingtip fence: small arrowhead plate above & below the tip
      const rs: V3[][] = [];
      for (const [dy, dz, cc] of [[-0.016, -0.012, 0.02], [0, 0.01, tip.c * 0.95], [0.026, -0.03, 0.022]] as const) rs.push(aerofoil([s * (tipX + 0.002), ty + dy, tip.z + dz], cc, 0.12, [s, 0, 0]));
      skin(gp, rs, qred, { caps: true });
    }
    const engs = is747 ? [0.165, 0.3] : is787 ? [0.155] : [0.2, 0.345];
    const er = is747 ? 0.019 : is787 ? 0.026 : 0.023, el = is747 ? 0.068 : is787 ? 0.082 : 0.078;
    for (const ex2 of engs) {
      const ws = wg.at(ex2), wyy = wg.yAt(ex2), ey = wyy - er - 0.008, ez = ws.z + el * 0.62;
      turbofan(gp, s * ex2, ey, ez, er, el, is787 ? '#e9ecef' : '#eef0f3', is787);
      box(gp, wingC, s * ex2, ey + er * 0.6, ez - el * 0.55, 0.006, wyy - ey - er * 0.4, el * 0.95);
    }
    // Flap-track fairings under the wing
    for (const fx of [0.1, 0.24, 0.36]) {
      if (fx > tipX - 0.05) continue;
      const ws = wg.at(fx);
      box(gp, wingC, s * fx, wg.yAt(fx) - 0.008, ws.z - ws.c * 0.85, 0.006, 0.009, ws.c * 0.5);
    }
    // Horizontal stabiliser
    const hs: WSt[] = is380 ? [{ x: 0.01, z: -0.27, c: 0.115, t: 0.1 }, { x: 0.215, z: -0.43, c: 0.04, t: 0.09 }]
      : is747 ? [{ x: 0.01, z: -0.3, c: 0.1, t: 0.1 }, { x: 0.16, z: -0.435, c: 0.036, t: 0.09 }]
        : [{ x: 0.01, z: -0.31, c: 0.088, t: 0.1 }, { x: 0.152, z: -0.43, c: 0.032, t: 0.09 }];
    jetWing(gp, s, hs, jetProf(d, 0.17).cy, 0.1, 0, is380 ? white : is787 ? sky : wingC, 3);
  }
  // Belly wing-to-body fairing
  ball(gp, belly, 0, d.Y - d.H * 0.7, 0.03, d.R * 1.9, d.H * 0.75, 0.2);

  // Vertical fin
  const fin: [number, number][] = is747 ? [[-0.25, 0], [-0.46, 0], [-0.505, 0.18], [-0.45, 0.18]]
    : is787 ? [[-0.26, 0], [-0.465, 0], [-0.5, 0.165], [-0.445, 0.165]]
      : [[-0.21, 0], [-0.455, 0], [-0.497, 0.205], [-0.425, 0.205]];
  const fy = d.Y + d.H * 0.55, finC = is380 ? qred : is787 ? sky : acc, ft = 0.011;
  const fm = slab(gp, fin.map(([z, y]) => [-z, y] as [number, number]), ft, finC, 0.003, false);
  fm.rotation.y = Math.PI / 2;
  fm.position.y = fy;
  const finPt = (a: number, b: number): [number, number] => {
    const zl = fin[0][0] + (fin[3][0] - fin[0][0]) * b, zt = fin[1][0] + (fin[2][0] - fin[1][0]) * b;
    return [-(zl + (zt - zl) * a), fin[0][1] + (fin[3][1] - fin[0][1]) * b];
  };
  for (const sx of [-1, 1]) {
    if (is380) {
      // Stylised white flying kangaroo (facing forward, leaping up)
      const roo: [number, number][] = [[0, 0.02], [0.3, 0.3], [0.38, 0.5], [0.55, 0.68], [0.72, 0.8], [0.76, 0.98], [0.82, 0.86], [0.9, 0.9],
        [1, 0.83], [0.86, 0.75], [0.8, 0.66], [0.93, 0.57], [0.76, 0.57], [0.63, 0.42], [0.6, 0.25], [0.44, 0.02], [0.37, 0.05], [0.43, 0.24], [0.3, 0.18]];
      const k = slab(gp, roo.map(([fx2, fy2]) => finPt(0.86 - fx2 * 0.62, 0.36 + fy2 * 0.56)), 0.0015, '#ffffff', 0, false);
      k.rotation.y = Math.PI / 2;
      k.position.set(sx * (ft / 2 + 0.0035), fy, 0);
    } else if (is787) {
      // Taeguk-style red/blue roundel
      const [cz, cy] = finPt(0.5, 0.6), rr = 0.032, pts: [number, number][] = [];
      for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI; pts.push([cz + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      for (let k = 1; k <= 6; k++) { const a = Math.PI + (k / 6) * Math.PI; pts.push([cz - rr / 2 + Math.cos(a) * rr / 2, cy + Math.sin(a) * rr / 2]); }
      for (let k = 1; k < 6; k++) { const a = Math.PI - (k / 6) * Math.PI; pts.push([cz + rr / 2 + Math.cos(a) * rr / 2, cy + Math.sin(a) * rr / 2]); }
      const blue = cyl(gp, '#1f4ea8', sx * (ft / 2 + 0.0015), fy + cy, -cz, rr, 0.0016, 18);
      blue.rotation.z = Math.PI / 2;
      blue.position.y = fy + cy;
      const red = slab(gp, pts, 0.0015, '#d42f3a', 0, false);
      red.rotation.y = Math.PI / 2;
      red.position.set(sx * (ft / 2 + 0.003), fy, 0);
      blue.position.x = sx * (ft / 2 + 0.0016);
    }
  }
  // APU exhaust, nav & beacon lights
  ball(gp, '#4b5563', 0, jetProf(d, 0.002).cy, -0.5, 0.006, 0.006, 0.006);
  const nav = (c: string, x: number) => { const s2 = W[W.length - 1]; ball(gp, c, x, wy + Math.abs(x) * dih + flex + 0.002, s2.z - s2.c * 0.4, 0.006).material = mat(c, { emissive: c }); };
  nav('#ef4444', -tipX - 0.002); nav('#22c55e', tipX + 0.002);
  ball(gp, '#ef4444', 0, d.Y + d.H + jetProf(d, 0.55).hump + 0.002, 0.05, 0.005).material = mat('#ef4444', { emissive: '#ef4444' });
}

// ---------------------------------------------------------------------------------------------------------
function wing(p: THREE.Object3D, side: number, rootZ: number, rootC: number, span: number, sweepZ: number, tipC: number, y: number, c: string, dih = 0.07, th = 0.014, winglet = true): void {
  const g = new THREE.Group();
  g.position.set(0, y, 0);
  g.rotation.z = side * dih;
  p.add(g);
  const x0 = 0.05, x1 = x0 + span;
  const out: [number, number][] = [[x0, -rootZ], [x1, -(rootZ - sweepZ)], [x1, -(rootZ - sweepZ - tipC)], [x0, -(rootZ - rootC)]];
  const m = slab(g, out.map(([x, zz]) => [side * x, zz] as [number, number]), th, c, th * 0.35, false);
  m.rotation.x = -Math.PI / 2;
  if (!winglet) return;
  // Blended winglet
  const wl = slab(g, [[0, 0], [-tipC * 0.25, 0.032], [-tipC * 0.55, 0.036], [-tipC * 0.8, 0]].map(([zz, yy]) => [zz, yy] as [number, number]), 0.006, c, 0.002, false);
  wl.rotation.y = -Math.PI / 2;
  wl.position.set(side * x1, 0, rootZ - sweepZ - tipC * 0.1);
}

function nacelle(p: THREE.Object3D, x: number, y: number, z: number, r: number, accent: string): void {
  const m = lathe(p, [[0, -0.005], [r * 0.82, 0], [r, 0.02], [r * 1.02, r * 1.6], [r * 0.82, r * 3.2], [r * 0.45, r * 3.6], [0, r * 3.7]], '#e5e7eb', 0, 0, 0, 18);
  m.position.set(x, y, z + r * 1.8);
  m.rotation.x = -Math.PI / 2;
  ellip(p, '#1f2937', x, y, z + r * 1.82, r * 0.82, r * 0.82, 0.004);
  cyl(p, accent, x, y - 0.002, z + r * 0.9, r * 1.04, 0.004, 14).rotation.x = Math.PI / 2;
}

const plane: Builder = (gp, r) => {
  if (r.variant === 'b747' || r.variant === 'b787' || r.variant === 'a380') return airliner(gp, r, r.variant);
  const c = r.color!, a = r.accent ?? '#2563eb', hump = !!r.hump;
  const Y = 0.12, R = 0.066;
  const st = [
    { p: [0, Y - 0.012, 0.5] as V3, w: 0.006, h: 0.006 },
    { p: [0, Y - 0.006, 0.475] as V3, w: R * 0.55, h: R * 0.5 },
    { p: [0, Y - 0.002, 0.43] as V3, w: R * 0.86, h: R * 0.84 },
    { p: [0, hump ? Y + 0.018 : Y, 0.35] as V3, w: R, h: hump ? R * 1.3 : R },
    { p: [0, hump ? Y + 0.016 : Y, 0.2] as V3, w: R, h: hump ? R * 1.26 : R },
    { p: [0, Y, 0.05] as V3, w: R, h: R },
    { p: [0, Y, -0.2] as V3, w: R, h: R },
    { p: [0, Y + 0.012, -0.34] as V3, w: R * 0.78, h: R * 0.78 },
    { p: [0, Y + 0.03, -0.45] as V3, w: R * 0.38, h: R * 0.42 },
    { p: [0, Y + 0.042, -0.5] as V3, w: 0.01, h: 0.012 },
  ];
  sweep(gp, st, c, {
    radial: 26, sub: 6,
    paint: (_x, y, z) => (y < Y - R * 0.55 ? '#cbd5e1' : (y > Y - R * 0.38 && y < Y - R * 0.24 && z < 0.44 && z > -0.42) ? a : null),
  });
  // Cockpit glazing & window rows (thin dark capsules hugging the cylinder)
  ellip(gp, '#0f172a', 0, Y + 0.02, 0.458, 0.026, 0.008, 0.013, 0, -0.55);
  for (const sx of [-1, 1]) {
    ellip(gp, '#1e293b', sx * R * 0.965, Y + 0.016, 0.03, 0.006, 0.0075, 0.33);
    box(gp, '#f8fafc', sx * R * 0.99, Y - 0.012, 0.35, 0.002, 0.03, 0.016);
    if (hump) ellip(gp, '#1e293b', sx * R * 0.86, Y + 0.068, 0.29, 0.006, 0.006, 0.07);
  }
  // Wings, tailplane & fin
  wing(gp, 1, 0.16, 0.24, 0.42, 0.28, 0.07, Y - 0.04, c);
  wing(gp, -1, 0.16, 0.24, 0.42, 0.28, 0.07, Y - 0.04, c);
  wing(gp, 1, -0.33, 0.12, 0.15, 0.11, 0.05, Y + 0.02, c, 0.1, 0.01, false);
  wing(gp, -1, -0.33, 0.12, 0.15, 0.11, 0.05, Y + 0.02, c, 0.1, 0.01, false);
  const fin = slab(gp, [[-0.3, 0], [-0.43, 0], [-0.52, 0.2], [-0.45, 0.2]].map(([zz, yy]) => [-zz, yy] as [number, number]), 0.012, a, 0.004, false);
  fin.rotation.y = Math.PI / 2;
  fin.position.set(0, Y + 0.04, 0);
  ellip(gp, shade(a, 1.25), 0, Y + 0.17, -0.47, 0.007, 0.03, 0.03);
  // Engines (four on the jumbo) on pylons
  const engines = hump ? [0.16, 0.3] : [0.18];
  for (const sx of [-1, 1]) for (const ex of engines) {
    const ez = 0.16 - ((ex - 0.05) / 0.42) * 0.28 + 0.05;
    nacelle(gp, sx * ex, Y - 0.075 + (ex * 0.07), ez - 0.02, 0.026, a);
    box(gp, c, sx * ex, Y - 0.06 + ex * 0.07, ez - 0.06, 0.008, 0.03, 0.08);
  }
  // Nav lights
  ellip(gp, '#ef4444', -0.47, Y - 0.005, -0.12, 0.007).material = mat('#ef4444', { emissive: '#ef4444' });
  ellip(gp, '#22c55e', 0.47, Y - 0.005, -0.12, 0.007).material = mat('#22c55e', { emissive: '#22c55e' });
};

// ---------------------------------------------------------------------------------------------------------
/** Rounded-rect car section (superellipse) — w half-width, h height, base y. */
function carRing(z: number, w: number, h: number, y: number, n = 28, e = 4.5, dropTop = 0): V3[] {
  const ring: V3[] = [];
  for (let j = 0; j < n; j++) {
    const t = (j / n) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
    const x = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / e) * w;
    const yy = Math.sign(st) * Math.pow(Math.abs(st), 2 / e);
    ring.push([x, y + h / 2 + yy * (h / 2) - (yy > 0 ? dropTop * yy : 0), z]);
  }
  return ring;
}

function bogie(p: THREE.Object3D, z: number, w: number): void {
  box(p, '#1f2937', 0, 0.012, z, w * 1.5, 0.022, 0.06);
  for (const dz of [-0.02, 0.02]) for (const sx of [-1, 1]) {
    const wh = cyl(p, '#374151', sx * w * 0.8, 0.012, z + dz, 0.012, 0.008, 10);
    wh.rotation.z = Math.PI / 2;
    wh.position.y = 0.012;
  }
}

const train: Builder = (gp, r) => {
  if (r.variant === 'n700') return n700(gp, r);
  if (r.variant === 'tgv') return tgv(gp, r);
  const cars = num(r.cars, 4), c = r.color!, a = r.accent ?? '#dc2626', bullet = !!r.nose;
  const W = 0.072, Hh = bullet ? 0.115 : 0.135, Y0 = 0.03, CL = bullet ? 0.25 : 0.22, GAP = 0.012;
  const stripe: Paint = (_x, y, _z, nx) => {
    const t = (y - Y0) / Hh;
    if (Math.abs(nx) > 0.5 && t > 0.48 && t < 0.66) return '#0f172a';
    if (Math.abs(nx) > 0.5 && t > 0.3 && t < 0.4) return a;
    if (t < 0.12) return shade(c, 0.6);
    return null;
  };
  for (let i = 0; i < cars; i++) {
    const zf = 0.5 - i * (CL + GAP), zb = zf - CL;
    const rings: V3[][] = [];
    const lead = i === 0;
    if (lead && bullet) {
      // Long duck-bill nose: height collapses faster than width
      const NL = 0.15;
      for (let k = 0; k <= 10; k++) {
        const u = k / 10, z = zb + (CL - NL) + u * NL;
        const hs = Math.max(0.12, 1 - u ** 1.7), ws = Math.max(0.16, Math.sqrt(1 - u ** 2.6));
        rings.push(carRing(z, W * ws, Hh * hs, Y0, 28, 4.5 - u * 2));
      }
      rings.unshift(carRing(zb, W, Hh, Y0));
    } else if (lead) {
      rings.push(carRing(zb, W, Hh, Y0), carRing(zf - 0.03, W, Hh, Y0), carRing(zf - 0.008, W * 0.98, Hh * 0.97, Y0, 28, 4), carRing(zf, W * 0.93, Hh * 0.9, Y0, 28, 3.6));
    } else {
      rings.push(carRing(zb, W * 0.97, Hh * 0.97, Y0), carRing(zb + 0.006, W, Hh, Y0), carRing(zf - 0.006, W, Hh, Y0), carRing(zf, W * 0.97, Hh * 0.97, Y0));
    }
    skin(gp, rings, c, { caps: true, paint: stripe });
    // Bogies, gangway bellows, roof gear
    bogie(gp, zb + 0.045, W);
    bogie(gp, zf - 0.045, W);
    if (i < cars - 1) box(gp, '#1f2937', 0, Y0 + 0.01, zb - GAP / 2, W * 1.4, Hh * 0.85, GAP + 0.004);
    if (bullet) {
      if (i % 2 === 1) {
        // Pantograph
        box(gp, '#64748b', 0, Y0 + Hh, zb + CL / 2, 0.03, 0.006, 0.03);
        rod(gp, [0, Y0 + Hh + 0.006, zb + CL / 2], [0, Y0 + Hh + 0.04, zb + CL / 2 - 0.02], 0.0025, '#94a3b8', 4);
        box(gp, '#94a3b8', 0, Y0 + Hh + 0.04, zb + CL / 2 - 0.02, 0.05, 0.003, 0.004);
      }
    } else if (!lead) {
      for (let k = 0; k < 4; k++) box(gp, shade(c, 0.8), 0, Y0 + Hh - 0.004, zb + 0.03 + k * 0.05, 0.03, 0.008, 0.016);
    }
    // Doors
    for (const sx of [-1, 1]) for (const dz of (lead && bullet ? [0.02] : [0.02, CL - 0.03])) box(gp, shade(c, 0.82), sx * W * 1.0, Y0 + 0.02, zb + dz, 0.003, Hh * 0.7, 0.018);
  }
  // Lead-car glazing & headlights
  const zf = 0.5;
  if (bullet) {
    ellip(gp, '#0f172a', 0, Y0 + Hh * 0.62, zf - 0.115, W * 0.5, Hh * 0.1, 0.03, 0, -0.32);
    for (const sx of [-1, 1]) ellip(gp, '#fef9c3', sx * W * 0.45, Y0 + Hh * 0.3, zf - 0.06, 0.012, 0.006, 0.012).material = mat('#fef9c3', { emissive: '#fde68a' });
  } else {
    box(gp, '#0f172a', 0, Y0 + Hh * 0.6, zf - 0.004, W * 1.5, Hh * 0.22, 0.006);
    box(gp, a, 0, Y0 + Hh * 0.2, zf - 0.002, W * 1.6, Hh * 0.14, 0.006);
    ellip(gp, '#fef9c3', 0, Y0 + Hh * 0.93, zf - 0.004, 0.012, 0.012, 0.006).material = mat('#fef9c3', { emissive: '#fde68a' });
    box(gp, '#334155', 0, 0, zf - 0.005, W * 1.6, 0.02, 0.03);
  }
};

// ---------------------------------------------------------------------------------------------------------
// High-speed trains with type-specific noses: Shinkansen N700 (long "aero double-wing" duck bill) and
// KTX-I / TGV (power car at each end with a short wedge nose, articulated coaches on shared Jacobs bogies).

/** Half cross-section of a high-speed car body (X: 0 centre → 1 side, Y: 0 floor → 1 roof); row k lies between TP[k] and TP[k+1]. */
const TP: [number, number][] = [[0, 0], [0.8, 0], [0.96, 0.04], [1, 0.12], [1, 0.36], [1, 0.42], [1, 0.48], [0.995, 0.52], [0.975, 0.66],
  [0.94, 0.76], [0.84, 0.87], [0.64, 0.95], [0.34, 0.99], [0, 1]];
const TPN = TP.length * 2 - 2;
/** Profile row for ring segment j (segments 0..12 on the right, 13..25 mirrored on the left). */
const tpRow = (j: number) => (j <= TP.length - 2 ? j : TPN - 1 - j);

interface NoseDef { len: number; hS: [number, number][]; wS: [number, number][]; lift: number; bump?: (X: number, Y: number, u: number) => number }
interface RingMeta { z: number; u: number; k: number }

/** Ring through the profile, scaled for nose position u (u < 0 = constant body section). */
function tpRing(z: number, W: number, H: number, Y0: number, u: number, nd: NoseDef | null, inset = 1): V3[] {
  const hs = nd && u >= 0 ? tab(nd.hS, u) : inset, ws = nd && u >= 0 ? tab(nd.wS, u) : inset, lift = nd && u >= 0 ? nd.lift * u * u : 0;
  const half = TP.map(([X, Y]) => {
    let yn = lift + (hs - lift) * Y;
    if (nd?.bump && u >= 0) yn += nd.bump(X, Y, u);
    return [X * W * ws, Y0 + H * yn] as [number, number];
  });
  const ring: V3[] = half.map(([x, y]) => [x, y, z] as V3);
  for (let k = TP.length - 2; k >= 1; k--) ring.push([-half[k][0], half[k][1], z]);
  return ring;
}

/**
 * One car body from zb to zf. Noses (if any) taper the front (+z) and/or back end. Body rings are spaced at the
 * window pitch so windows can be painted as dashes by ring parity. `col(meta, row)` picks a colour per quad.
 */
function railCar(p: THREE.Object3D, zb: number, zf: number, W: number, H: number, Y0: number, front: NoseDef | null, back: NoseDef | null,
  col: (m: RingMeta, row: number, side: number) => string): void {
  const P = 0.0125, rings: V3[][] = [], meta: RingMeta[] = [];
  const b0 = zb + (back ? back.len : 0), b1 = zf - (front ? front.len : 0);
  if (back) for (let i = 14; i >= 1; i--) { const u = Math.sin((i / 14) * Math.PI / 2), z = b0 - u * back.len; rings.push(tpRing(z, W, H, Y0, u, back)); meta.push({ z, u, k: -1 }); }
  else { rings.push(tpRing(zb, W, H, Y0, -1, null, 0.95)); meta.push({ z: zb, u: -1, k: -2 }); }
  const nb = Math.max(2, Math.round((b1 - b0) / P));
  for (let k = 0; k <= nb; k++) { const z = b0 + (b1 - b0) * (k / nb); rings.push(tpRing(z, W, H, Y0, -1, null)); meta.push({ z, u: -1, k }); }
  if (front) for (let i = 1; i <= 14; i++) { const u = Math.sin((i / 14) * Math.PI / 2), z = b1 + u * front.len; rings.push(tpRing(z, W, H, Y0, u, front)); meta.push({ z, u, k: -1 }); }
  else { rings.push(tpRing(zf, W, H, Y0, -1, null, 0.95)); meta.push({ z: zf, u: -1, k: -2 }); }
  gridSkin(p, rings, (i, j) => {
    const m = meta[Math.max(0, Math.min(meta.length - 1, i < 0 ? 0 : i))];
    const m2 = meta[Math.max(0, Math.min(meta.length - 1, i + 1))];
    const um = m.u >= 0 || m2.u >= 0 ? Math.max(m.u, m2.u) : -1;
    return col({ z: (m.z + m2.z) / 2, u: um, k: m.k }, tpRow(j), j < TP.length - 1 ? 1 : -1);
  });
}

function bogie2(p: THREE.Object3D, z: number, w: number, big = false): void {
  const s = big ? 1.15 : 1;
  box(p, '#2b3440', 0, 0.006, z, w * 1.55, 0.024, 0.07 * s);
  for (const dz of [-0.022 * s, 0.022 * s]) for (const sx of [-1, 1]) {
    const wh = cyl(p, '#4b5563', sx * w * 0.82, 0, z + dz, 0.0125, 0.008, 10);
    wh.rotation.z = Math.PI / 2;
    wh.position.y = 0.0125;
  }
}

function pantograph(p: THREE.Object3D, y: number, z: number, dir = 1): void {
  box(p, '#6b7280', 0, y, z, 0.03, 0.005, 0.03);
  rod(p, [0, y + 0.005, z + 0.012 * dir], [0, y + 0.03, z - 0.012 * dir], 0.002, '#94a3b8', 4);
  rod(p, [0, y + 0.03, z - 0.012 * dir], [0, y + 0.048, z + 0.004 * dir], 0.002, '#94a3b8', 4);
  box(p, '#94a3b8', 0, y + 0.048, z + 0.004 * dir, 0.055, 0.003, 0.005);
}

const N700_NOSE: NoseDef = {
  len: 0.16, lift: 0.05,
  hS: [[0, 1], [0.1, 0.97], [0.22, 0.86], [0.36, 0.66], [0.5, 0.52], [0.7, 0.41], [0.86, 0.33], [0.95, 0.26], [1, 0.12]],
  wS: [[0, 1], [0.4, 0.99], [0.6, 0.94], [0.78, 0.83], [0.9, 0.66], [0.97, 0.44], [1, 0.14]],
  // Raised cab canopy in the middle and two "wing" ridges along the shoulders (the aero double-wing)
  bump: (X, Y, u) => (Y > 0.6 ? 0.07 * sst(0.06, 0.18, u) * (1 - sst(0.34, 0.46, u)) * Math.exp(-((X / 0.5) ** 2))
    + 0.06 * sst(0.3, 0.45, u) * (1 - sst(0.78, 0.95, u)) * Math.exp(-(((X - 0.74) / 0.2) ** 2)) : 0),
};

const TGV_NOSE: NoseDef = {
  len: 0.085, lift: 0.06,
  hS: [[0, 1], [0.12, 0.97], [0.55, 0.6], [0.78, 0.45], [0.92, 0.36], [1, 0.2]],
  wS: [[0, 1], [0.35, 0.97], [0.65, 0.86], [0.85, 0.7], [0.96, 0.48], [1, 0.2]],
};

/** Shinkansen N700: white, blue band under the windows, long duck-bill nose at both ends. */
const n700: Builder = (gp, r) => {
  const cars = Math.max(3, num(r.cars, 6)), c = r.color ?? '#f5f6f8', a = r.accent ?? '#1d4fa3';
  const W = 0.068, H = 0.112, Y0 = 0.028, CL = 0.25, EL = 0.29, GAP = 0.012, win = '#1c2633', skirt = '#b7bec7';
  let zf = 0.5;
  for (let i = 0; i < cars; i++) {
    const lead = i === 0, tail = i === cars - 1, len = lead || tail ? EL : CL, zb = zf - len;
    railCar(gp, zb, zf, W, H, Y0, lead ? N700_NOSE : null, tail ? N700_NOSE : null, (m, row) => {
      if (row <= 1) return '#3b4550';
      if (row === 2) return skirt;
      if (m.u >= 0) {
        if (m.u > 0.14 && m.u < 0.38 && row >= 9) return win;
        if (m.u > 0.04 && m.u < 0.14 && row === 8) return win;
        if (row === 4 || row === 5) return a;
        return c;
      }
      if (row === 4 || row === 5) return a;
      const doorZone = m.k >= 0 && (m.k < 4 || (m.z > zf - 0.05 && !lead) || (m.z < zb + 0.05 && !tail && !lead));
      if (row === 7 && m.k >= 0 && m.k % 2 === 0 && !doorZone && !(lead && m.z > zf - N700_NOSE.len - 0.03)) return win;
      if (doorZone && m.k >= 0 && (m.k === 1 || m.k === 2) && row >= 3 && row <= 7) return shade(c, 0.86);
      return c;
    });
    bogie2(gp, zb + (tail ? 0.075 : 0.045), W);
    bogie2(gp, zf - (lead ? 0.075 : 0.045), W);
    if (!tail) box(gp, '#262f3a', 0, Y0 + 0.008, zb - GAP / 2, W * 1.6, H * 0.86, GAP + 0.004);
    if (i === 2 || i === cars - 3) pantograph(gp, Y0 + H, zb + len / 2);
    zf = zb - GAP;
  }
  for (const sx of [-1, 1]) ball(gp, '#fff7cc', sx * W * 0.32, Y0 + H * 0.2, 0.5 - 0.012, 0.007, 0.004, 0.006).material = mat('#fff7cc', { emissive: '#fde68a' });
};

/** KTX-I (TGV family): silver-grey with blue, power car at each end, articulated coaches on shared bogies. */
const tgv: Builder = (gp, r) => {
  const cars = Math.max(3, num(r.cars, 5)), c = r.color ?? '#d3d7dc', a = r.accent ?? '#2547a8';
  const W = 0.068, H = 0.128, Y0 = 0.03, PL = 0.25, CL = 0.2, GAP = 0.01, win = '#1c2633', dark = '#55606c';
  let zf = 0.5;
  for (let i = 0; i < cars; i++) {
    const lead = i === 0, tail = i === cars - 1, power = lead || tail, len = power ? PL : CL, zb = zf - len;
    railCar(gp, zb, zf, W, H, Y0, lead ? TGV_NOSE : null, tail ? TGV_NOSE : null, (m, row) => {
      if (row <= 1) return '#363e48';
      if (row === 2) return dark;
      if (m.u >= 0) {
        if (m.u > 0.1 && m.u < 0.52 && row >= 8) return win;
        if (m.u > 0.48 && m.u < 0.97 && row >= 5 && row <= 8) return a;
        if (row === 3 && m.u > 0.2) return dark;
        if (row === 4) return a;
        return '#eef0f3';
      }
      if (row === 4) return a;
      if (power) {
        // Cab side window just behind the nose, otherwise a windowless machinery body with a lighter upper panel
        const cabZ = lead ? m.z > zf - TGV_NOSE.len - 0.018 : m.z < zb + TGV_NOSE.len + 0.018;
        if (cabZ && row === 8) return win;
        if (cabZ && row >= 5) return '#eef0f3';
        return row >= 9 ? shade(c, 0.94) : c;
      }
      if (row === 7 && m.k >= 2 && m.k % 2 === 0 && m.z < zf - 0.03) return win;
      if (m.k >= 0 && m.z > zf - 0.03 && row >= 3 && row <= 8) return shade(c, 0.85);
      return c;
    });
    if (power) {
      // Own two bogies, roof grille near the cab and a pantograph further back
      bogie2(gp, zb + (tail ? 0.08 : 0.05), W, true);
      bogie2(gp, zf - (lead ? 0.08 : 0.05), W, true);
      const gz = lead ? zf - TGV_NOSE.len - 0.05 : zb + TGV_NOSE.len + 0.05;
      for (const sx of [-1, 1]) {
        box(gp, '#3b4652', sx * W * 0.72, Y0 + H * 0.82, gz, 0.008, H * 0.12, 0.06);
        const lz = (zb + zf) / 2 + (lead ? -0.03 : 0.03);
        box(gp, '#9aa3ac', sx * W * 0.99, Y0 + H * 0.6, lz, 0.002, H * 0.14, 0.1);
        for (let g = 0; g < 4; g++) box(gp, '#6b7580', sx * W * 0.995, Y0 + H * (0.62 + g * 0.03), lz, 0.002, H * 0.008, 0.096);
      }
      pantograph(gp, Y0 + H, lead ? zb + 0.06 : zf - 0.06, lead ? 1 : -1);
    } else {
      // Jacobs bogie shared with the next coach (the first coach also gets its own bogie behind the power car)
      if (i === 1) bogie2(gp, zf - 0.04, W);
      if (i < cars - 2) bogie2(gp, zb - GAP / 2, W, true);
      else bogie2(gp, zb + 0.04, W);
    }
    if (!tail) box(gp, '#262f3a', 0, Y0 + 0.008, zb - GAP / 2, W * 1.5, H * 0.86, GAP + 0.004);
    zf = zb - GAP;
  }
  // Headlights in the blue nose band
  for (const sx of [-1, 1]) ball(gp, '#fff7cc', sx * W * 0.5, Y0 + H * 0.42, 0.5 - 0.016, 0.009, 0.005, 0.006).material = mat('#fff7cc', { emissive: '#fde68a' });
};

// ---------------------------------------------------------------------------------------------------------
const balloon: Builder = (gp, r) => {
  const c = r.color!, a = r.accent ?? '#fde047';
  // Classic inverted-teardrop envelope profile (radius, height)
  const prof: [number, number][] = [];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const y = 0.36 + t * 0.66;
    const rad = t < 0.62
      ? 0.07 + 0.29 * Math.sin((t / 0.62) * Math.PI / 2) ** 0.85
      : 0.36 * Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.38) ** 2.2));
    prof.push([Math.max(0.0005, rad), y]);
  }
  const geo = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 72);
  geo.computeVertexNormals();
  const gores = 12;
  add(gp, paintGores(geo, c, a, gores), mat('#ffffff', { flat: false, vc: true, rough: 0.5 }), 0, 0, 0, 1, 1, 1);
  // Skirt (scoop) & load tapes converge to the burner frame
  lathe(gp, [[0.07, 0.36], [0.064, 0.3], [0.058, 0.27]], shade(c, 0.7), 0, 0, 0, 18);
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2;
    rod(gp, [Math.cos(t) * 0.058, 0.27, Math.sin(t) * 0.058], [Math.cos(t) * 0.05, 0.18, Math.sin(t) * 0.05], 0.0018, '#334155', 3);
  }
  // Burner with flame
  cyl(gp, '#9ca3af', 0, 0.17, 0, 0.026, 0.02, 10);
  lathe(gp, [[0.0, 0.19], [0.016, 0.2], [0.012, 0.24], [0, 0.27]], '#fde047', 0, 0, 0, 10).material = mat('#fbbf24', { emissive: '#f59e0b' });
  // Wicker basket with padded rim
  const bg = new THREE.BoxGeometry(0.1, 0.075, 0.1, 6, 4, 6);
  add(gp, paintFaces2(bg), mat('#ffffff', { vc: true, rough: 0.95 }), 0, 0.0375, 0, 1, 1, 1);
  for (const [x, z, w, d] of [[0, 0.05, 0.106, 0.012], [0, -0.05, 0.106, 0.012], [0.05, 0, 0.012, 0.106], [-0.05, 0, 0.012, 0.106]] as const) rbox(gp, '#5b3a1e', x, 0.07, z, w, 0.012, d, 0.005);
  for (const [x, z] of [[-0.045, -0.045], [0.045, -0.045], [-0.045, 0.045], [0.045, 0.045]] as const) rod(gp, [x, 0.08, z], [x * 0.5, 0.17, z * 0.5], 0.002, '#78350f', 3);
};

function paintGores(geo: THREE.BufferGeometry, c: string, a: string, gores: number): THREE.BufferGeometry {
  const ng = geo.index ? geo.toNonIndexed() : geo;
  const P = ng.getAttribute('position'), cols = new Float32Array(P.count * 3);
  const cc = new THREE.Color(c), ca = new THREE.Color(a), cw = new THREE.Color('#f8fafc'), cd = new THREE.Color(shade(c, 0.55));
  for (let i = 0; i < P.count; i += 3) {
    const x = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, y = (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3, z = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3;
    const ang = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1, gi = Math.floor(ang * gores), fr = ang * gores - gi;
    const zig = 0.62 + 0.035 * Math.abs(((fr * 2) % 1) * 2 - 1);
    let col = gi % 2 ? ca : cc;
    if (Math.abs(y - zig) < 0.03) col = gi % 2 ? cc : cw;
    if (y > 0.985) col = cd;
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = col.r; cols[(i + k) * 3 + 1] = col.g; cols[(i + k) * 3 + 2] = col.b; }
  }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return ng;
}

/** Wicker weave: alternating light/dark cells on a subdivided box. */
function paintFaces2(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = geo.toNonIndexed(), P = ng.getAttribute('position'), cols = new Float32Array(P.count * 3);
  const l = new THREE.Color('#b07a3e'), d = new THREE.Color('#8a5a2b');
  for (let i = 0; i < P.count; i += 6) {
    const x = P.getX(i) + P.getZ(i), y = P.getY(i);
    const col = (Math.floor((x + 1) * 60) + Math.floor((y + 1) * 53)) % 2 ? l : d;
    for (let k = 0; k < 6 && i + k < P.count; k++) { cols[(i + k) * 3] = col.r; cols[(i + k) * 3 + 1] = col.g; cols[(i + k) * 3 + 2] = col.b; }
  }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return ng;
}

export const VEHICLE_BUILDERS: Record<string, Builder> = { ship, plane, train, balloon };
