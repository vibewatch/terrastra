import * as THREE from 'three';
import type { Builder, Paint, V3 } from '../prims.ts';
import { mat, sweep, rbox, box, cyl, lathe, hash3, vnoise, worley } from '../prims.ts';
import { mx, sh, speck, sst, type SpSt } from '../kit/sculpt.ts';
import { type BirdOpts, Soup, bead, bird, blade, carrack, drop, ellip, flag, foam, foil, grp, hinge, hull, lugSail, rod, spine, squareSail, triSail, tube, vblob, wake } from '../kit/travel.ts';

// Travellers that move along routes on the globe: migrating animal groups and historic ships / caravans.
// No plinth — just the moving subject, front +z, ~1 unit long, base at y = 0 (the sea or land surface).

function framer(pts: V3[], side: V3) {
  const cu = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal'), sd = new THREE.Vector3(...side);
  return (u: number) => {
    const P = cu.getPoint(u), T = cu.getTangent(u), N = new THREE.Vector3().crossVectors(T, sd).normalize(), S = new THREE.Vector3().crossVectors(N, T).normalize();
    const at = (s0: number, n0: number, t0 = 0): V3 => [P.x + S.x * s0 + N.x * n0 + T.x * t0, P.y + S.y * s0 + N.y * n0 + T.y * t0, P.z + S.z * s0 + N.z * n0 + T.z * t0];
    return { P, T, N, S, at };
  };
}

// ======================================================================================================
// Whales
// ======================================================================================================
interface WhaleOpts {
  st: [number, number, number, number][]; // z, y, half-width, half-height (tail → snout)
  back: string; belly: string; pleats: number; knuckles?: boolean; mottle?: number; fin: number; flipL: number; flipW: number; flipWhite?: boolean;
  tubercles?: boolean; fluke: number; arch?: number;
}
function whale(p: THREE.Object3D, o: WhaleOpts): void {
  const st: SpSt[] = o.st.map(([z, y, w, h]) => ({ p: [0, y + (o.arch ?? 0) * Math.cos(z * 2.6), z], w, h }));
  const pts = st.map(s => s.p), F = framer(pts, [1, 0, 0]);
  const zt = pts.map(p => p[2]), zmin = zt[0], zmax = zt[zt.length - 1];
  const wh = (u: number): [number, number] => {
    const f = u * (st.length - 1), k = Math.min(st.length - 2, Math.floor(f)), t = f - k, s = t * t * (3 - 2 * t);
    return [st[k].w + (st[k + 1].w - st[k].w) * s, st[k].h + (st[k + 1].h - st[k].h) * s];
  };
  const mottle = o.mottle ?? 0;
  const skinP = (u: number, a: number, x: number, y: number, z: number): string => {
    const s2 = Math.sin(a);
    // Ventral throat pleats run from the chin back to the navel
    const throat = u > 0.52 && s2 < -0.25;
    let c = s2 < -0.45 + 0.1 * Math.sin(u * 9) ? mx(o.back, o.belly, sst(-0.3, -0.75, s2)) : o.back;
    if (throat && o.pleats) {
      const pl = Math.abs(Math.sin(Math.cos(a) * o.pleats));
      c = mx(c, sh(c, 0.62), sst(0.75, 0.98, pl));
    }
    if (mottle) {
      const [f1, f2] = worley(x * 26, y * 26, z * 26);
      if (f1 < 0.16 * mottle && s2 > -0.6) c = mx(c, '#dfe2e0', 0.75);
      else if (f2 - f1 < 0.05) c = mx(c, sh(o.back, 0.75), 0.6);
      else c = mx(c, sh(c, 1.12), vnoise(x * 18, y * 18, z * 18) * 0.5);
    } else c = speck(c, x, y, z, 0.03);
    return c;
  };
  spine(p, st, o.back, undefined, {
    nu: 64, nv: 26,
    shape: (u, a) => {
      const s2 = Math.sin(a);
      let m = 1;
      if (o.pleats && u > 0.52 && s2 < -0.25) m += 0.035 * Math.abs(Math.sin(Math.cos(a) * o.pleats)) * sst(0.52, 0.65, u);
      if (u < 0.3) m *= 1 - 0.18 * Math.abs(Math.cos(a)) * sst(0.3, 0.05, u); // laterally keeled tail stock
      return m;
    },
    uvp: skinP,
  });
  const tail = F(0.0), mid = F(0.62), fz = (u: number) => zmin + (zmax - zmin) * u;
  void fz;
  // Dorsal fin on a hump (humpback) or a hump + knuckle ridge (grey whale)
  if (o.fin > 0) {
    const f = F(0.36), [, h] = wh(0.36), b = f.at(0, h * 0.92);
    vblob(p, o.back, b[0], b[1] - 0.004, b[2], 0.03, 0.018, 0.05, undefined, [0, 0, 0], 12);
    foil(p, o.back, [{ le: [0, b[1], b[2] + 0.03], te: [0, b[1], b[2] - 0.04], t: 0.01 }, { le: [0, b[1] + o.fin * 0.7, b[2] - 0.0], te: [0, b[1] + o.fin * 0.6, b[2] - 0.035], t: 0.006 },
      { le: [0, b[1] + o.fin, b[2] - 0.035], te: [0, b[1] + o.fin * 0.95, b[2] - 0.045], t: 0.002 }], [1, 0, 0], undefined, 8, 8);
  }
  if (o.knuckles) {
    const f = F(0.4), [, h] = wh(0.4), b = f.at(0, h * 0.95);
    vblob(p, o.back, b[0], b[1] - 0.006, b[2], 0.022, 0.016, 0.035, undefined, [0, 0, 0], 10);
    for (let i = 0; i < 7; i++) {
      const u = 0.34 - i * 0.035, ff = F(u), [, hh] = wh(u), q = ff.at(0, hh * 0.95);
      vblob(p, o.back, q[0], q[1], q[2], 0.008, 0.008 - i * 0.0006, 0.011, undefined, [0, 0, 0], 8);
    }
  }
  // Pectoral flippers
  for (const sx of [-1, 1]) {
    const f = mid, [w, h] = wh(0.62), b = f.at(sx * w * 0.8, -h * 0.45);
    const L = o.flipL, W = o.flipW;
    const q = (s0: number, n0: number, t0: number): V3 => [b[0] + sx * s0, b[1] + n0, b[2] + t0];
    const fc = o.flipWhite ? '#e9edf0' : o.back;
    const flipP: Paint | undefined = o.flipWhite ? (x, y, z, _nx, ny) => (ny > 0.4 ? mx('#e9edf0', o.back, sst(0.4, 0.9, ny) * vnoise(x * 20, y * 20, z * 20)) : '#e9edf0') : undefined;
    foil(p, fc, [
      { le: q(0, 0, W * 0.5), te: q(0, 0, -W * 0.5), t: 0.012 },
      { le: q(L * 0.3, -L * 0.1, W * 0.25), te: q(L * 0.3, -L * 0.1, -W * 0.55), t: 0.009 },
      { le: q(L * 0.65, -L * 0.25, -L * 0.15), te: q(L * 0.6, -L * 0.24, -L * 0.15 - W * 0.6), t: 0.006 },
      { le: q(L, -L * 0.36, -L * 0.42), te: q(L * 0.96, -L * 0.36, -L * 0.44), t: 0.002 },
    ], [0, 1, 0.1], flipP, 14, 10);
    if (o.tubercles) {
      // Scalloped leading-edge knobs of the humpback flipper
      for (let i = 1; i < 8; i++) {
        const t = i / 8, le = [q(0, 0, W * 0.5), q(L * 0.3, -L * 0.1, W * 0.25), q(L * 0.65, -L * 0.25, -L * 0.15), q(L, -L * 0.36, -L * 0.42)];
        const s = t * 3, k = Math.min(2, Math.floor(s)), tt = s - k;
        const x = le[k][0] + (le[k + 1][0] - le[k][0]) * tt, y = le[k][1] + (le[k + 1][1] - le[k][1]) * tt, z = le[k][2] + (le[k + 1][2] - le[k][2]) * tt;
        ellip(p, '#dfe4e8', x, y, z + 0.003, 0.009 * (1 - t * 0.6), 0.007, 0.008);
      }
    }
  }
  // Flukes — broad, notched, white-patterned underside (humpback) or plain mottled
  const fk = o.fluke;
  for (const sx of [-1, 1]) {
    const ft = tail, q = (s0: number, t0: number): V3 => ft.at(sx * s0, 0, t0);
    foil(p, o.back, [
      { le: q(0, 0.03), te: q(0, -0.035), t: 0.016 },
      { le: q(fk * 0.35, 0.0), te: q(fk * 0.32, -0.06), t: 0.011 },
      { le: q(fk * 0.75, -0.04), te: q(fk * 0.7, -0.085), t: 0.006 },
      { le: q(fk, -0.1), te: q(fk * 0.97, -0.115), t: 0.002 },
    ], [ft.N.x, ft.N.y, ft.N.z], (x, y, z, _nx, ny) => (ny < -0.2 && o.flipWhite ? (vnoise(x * 30, 3, z * 30) > 0.42 ? '#eef1f3' : sh(o.back, 0.9)) : speck(o.back, x, y, z, 0.04)), 12, 10);
    if (o.tubercles) for (let i = 1; i < 6; i++) { const s0 = fk * (0.15 + i * 0.15), b = q(s0, -0.065 - i * 0.008); drop(p, o.back, [b[0], b[1], b[2] + 0.008], [b[0], b[1], b[2] - 0.016], 0.008, 0.003); }
  }
  // Eyes at the mouth corner, blowholes
  for (const sx of [-1, 1]) {
    const f = F(0.86), [w, h] = wh(0.86);
    bead(p, ...f.at(sx * w * 0.97, -h * 0.25), 0.008, '#0b0e12');
  }
  const bh = F(0.84), [, hb] = wh(0.84);
  for (const sx of [-1, 1]) ellip(p, sh(o.back, 0.5), ...bh.at(sx * 0.008, hb * 0.98), 0.006, 0.003, 0.012);
}
/** Bushy V-shaped spout (white vapour puffs) above the blowholes. */
function spout(p: THREE.Object3D, x: number, y: number, z: number, hgt: number, spread: number): void {
  const vap: Paint = (px, py, pz) => mx('#ffffff', '#c6d4e0', vnoise(px * 40, py * 40, pz * 40) * 0.8);
  const n = 22;
  for (let i = 0; i < n; i++) {
    // Puffs scattered through a widening cone: a narrow jet low, a loose bushy crown drifting back on top
    const t = Math.pow((i + 0.5) / n, 0.7), h1 = hash3(i, 3, 7) - 0.5, h2 = hash3(i, 5, 1) - 0.5, h3 = hash3(i, 9, 4) - 0.5;
    const cone = 0.004 + (spread + 0.025) * t * t, r = 0.007 + 0.022 * t * (0.8 + h3 * 0.6);
    const sx = (i % 2 ? 1 : -1) * spread * t * 0.7 + h1 * 2 * cone;
    vblob(p, '#f4f8fb', x + sx, y + hgt * t * (0.92 + h3 * 0.16), z - 0.03 * t + h2 * 2 * cone, r, r * 0.9, r, vap, [0, 0, 0], 8);
  }
}

// ======================================================================================================
// Butterflies
// ======================================================================================================
/** Monarch butterfly: orange wings with black veins, a black white-spotted border and black apex patch. */
function butterfly(p: THREE.Object3D, at: V3, yaw: number, s: number, beat: number): void {
  const b = grp(p, at, [0.15, yaw, 0], s);
  const blk = '#17110c', org = '#e9731a', orgU = '#eaa04d';
  vblob(b, blk, 0, 0, 0.03, 0.045, 0.042, 0.075, (x, y, z) => (hash3(Math.round(x * 90), Math.round(y * 90), Math.round(z * 90)) > 0.86 ? '#f2efe6' : blk), [0, 0, 0], 12);
  vblob(b, blk, 0, 0, 0.12, 0.03, 0.03, 0.03, (x, y, z) => (hash3(Math.round(x * 120), Math.round(y * 120), Math.round(z * 120)) > 0.8 ? '#f2efe6' : blk), [0, 0, 0], 10);
  vblob(b, '#2a1a10', 0, -0.005, -0.13, 0.032, 0.03, 0.11, undefined, [0.12, 0, 0], 10);
  for (const sx of [-1, 1]) {
    tube(b, [[sx * 0.012, 0.02, 0.14], [sx * 0.05, 0.08, 0.24], [sx * 0.07, 0.1, 0.3]], 0.0035, 0.003, blk, 4);
    ellip(b, blk, sx * 0.07, 0.1, 0.305, 0.008, 0.008, 0.012);
  }
  const R: [number, number][] = [[1.25, 0.2], [1.02, 0.66], [0.78, 1.04], [0.56, 1.12], [0.36, 0.98], [0.14, 0.7], [-0.06, 0.56], [-0.3, 0.7], [-0.6, 0.74], [-0.9, 0.64], [-1.15, 0.46], [-1.38, 0.16]];
  const rad = (th: number) => {
    let k = 0;
    while (k < R.length - 2 && R[k + 1][0] > th) k++;
    const t = Math.min(1, Math.max(0, (R[k][0] - th) / (R[k][0] - R[k + 1][0]))), ts = t * t * (3 - 2 * t);
    return R[k][1] + (R[k + 1][1] - R[k][1]) * ts;
  };
  const th0 = 1.25, th1 = -1.38, TH = (v: number) => th0 + (th1 - th0) * v;
  const pt = (u: number, v: number, lift = 0): V3 => {
    const th = TH(v), r = rad(th) * u * 0.62;
    return [0.03 + Math.cos(th) * r, 0.05 * r * r + lift, 0.02 + Math.sin(th) * r];
  };
  const us = [0, 0.2, 0.42, 0.62, 0.78, 0.88, 0.94, 1];
  const vein = [0.12, 0.24, 0.35, 0.46, 0.55, 0.66, 0.77, 0.88];
  for (const sx of [-1, 1]) {
    const f = hinge(b, sx, [0.02, 0.0, 0.0]);
    const w = grp(f, [0, 0, 0], [0, 0, beat]);
    const sp = new Soup();
    const paint = (base: string) => (u: number, v: number) => {
      const th = TH(v);
      if (u > 0.88 || th > 1.05) return blk; // border and costal margin
      if (th > 0.4 && th < 1.05 && u > 0.78) return blk; // forewing apex
      if (u < 0.2) return mx(base, '#7a3a12', 0.35);
      return hash3(Math.round(u * 20), Math.round(v * 30), 7) > 0.8 ? sh(base, 0.95) : base;
    };
    sp.sheet(7, 20, (u, v) => pt(u, v), paint(org), paint(orgU), 0.006, us);
    // Black veins (raised ribbons on both faces) and the white-dotted border
    for (const v0 of vein) for (const sgn of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const u0 = 0.3 + k * 0.193, u1 = u0 + 0.193, dv = 0.006;
        const a = pt(u0, v0 - dv, sgn * 0.0036), bb = pt(u1, v0 - dv * 0.6, sgn * 0.0036), c = pt(u1, v0 + dv * 0.6, sgn * 0.0036), d = pt(u0, v0 + dv, sgn * 0.0036);
        if (sgn > 0) sp.quad(a, bb, c, d, blk); else sp.quad(a, d, c, bb, blk);
      }
    }
    for (let k = 0; k < 16; k++) {
      const v0 = 0.03 + k * 0.06, u0 = k % 2 ? 0.9 : 0.955, th = TH(v0);
      const dots = th > 0.4 && th < 1.05 ? [u0, 0.83] : [u0];
      for (const uu of dots) for (const sgn of [1, -1]) {
        const c0 = pt(uu, v0, sgn * 0.0038), e = 0.012, cs = uu < 0.8 ? '#f0a03a' : '#f4f1e8';
        const q: V3[] = [[c0[0] + e, c0[1], c0[2]], [c0[0], c0[1], c0[2] + e], [c0[0] - e, c0[1], c0[2]], [c0[0], c0[1], c0[2] - e]];
        if (sgn > 0) sp.quad(q[0], q[3], q[2], q[1], cs); else sp.quad(q[0], q[1], q[2], q[3], cs);
      }
    }
    sp.mesh(w);
  }
}

// ======================================================================================================
// Hoofed herds & camels
// ======================================================================================================
interface QuadOpts {
  yw: number; yh: number; L: number; dep: number; wd: number; leg: number; phase: number; stride?: number;
  paint: Paint; legPaint?: Paint; c: string; hoof: string;
}
/** Torso + four striding legs; returns nothing — species functions add neck, head, tail and dressing. */
function quadBody(b: THREE.Object3D, o: QuadOpts): void {
  const { yw, yh, L, dep, wd } = o;
  const lr = (a: number, c: number, t: number) => a + (c - a) * t;
  spine(b, [
    { p: [0, yh - dep * 0.32, -L * 0.53], w: wd * 0.4, h: dep * 0.3 },
    { p: [0, yh - dep * 0.44, -L * 0.43], w: wd * 0.88, h: dep * 0.46 },
    { p: [0, lr(yh, yw, 0.3) - dep * 0.5, -L * 0.15], w: wd, h: dep * 0.5 },
    { p: [0, lr(yh, yw, 0.7) - dep * 0.5, L * 0.15], w: wd * 0.98, h: dep * 0.52 },
    { p: [0, yw - dep * 0.52, L * 0.38], w: wd * 0.86, h: dep * 0.5 },
    { p: [0, yw - dep * 0.6, L * 0.53], w: wd * 0.45, h: dep * 0.34 },
  ], o.c, o.paint, { nu: 18, nv: 12 });
  const st = o.stride ?? 0.07;
  for (const [front, z0] of [[true, L * 0.34], [false, -L * 0.36]] as const) for (const sx of [-1, 1]) {
    const ph = o.phase + (sx > 0 ? 0 : Math.PI) + (front ? Math.PI * 0.5 : 0);
    const sw = Math.sin(ph) * st, lift = Math.max(0, Math.cos(ph)) * 0.045, x = sx * wd * 0.55;
    const yb = (front ? yw : yh) - dep * 0.9, lg = o.leg;
    const pts: [V3, number, number][] = front ? [
      [[x, yb + dep * 0.35, z0], wd * 0.42, wd * 0.5], [[x * 1.02, yb - 0.02, z0 + 0.005 + sw * 0.15], lg * 1.5, lg * 1.8],
      [[x, yb * 0.42 + lift * 0.8, z0 + sw * 0.55 + lift * 0.3], lg, lg * 1.15], [[x, 0.05 + lift, z0 + sw - lift * 0.4], lg * 0.8, lg * 0.85], [[x, 0.012 + lift, z0 + sw + 0.005 - lift * 0.4], lg * 0.9, lg],
    ] : [
      [[x, yb + dep * 0.4, z0 + 0.02], wd * 0.5, wd * 0.62], [[x * 1.04, yb - 0.01, z0 + 0.04 + sw * 0.2], lg * 1.9, lg * 2.4],
      [[x, yb * 0.5 + lift * 0.5, z0 - 0.04 + sw * 0.5], lg * 0.95, lg * 1.3], [[x, 0.05 + lift, z0 - 0.01 + sw], lg * 0.8, lg * 0.85], [[x, 0.012 + lift, z0 + sw + 0.005], lg * 0.9, lg],
    ];
    sweep(b, pts.map(([p, w, h]) => ({ p, w, h })), o.c, { radial: 8, sub: 3, paint: o.legPaint ?? o.paint, up: [0, 0, 1], flat: false });
    const ft = pts[4][0];
    ellip(b, o.hoof, ft[0], ft[1], ft[2] + 0.004, lg * 1.05, lg * 0.9, lg * 1.25);
  }
}

/** Blue wildebeest: humped shoulders, sloping back, dark brindled neck bands, black beard & mane, cow-like hooked horns. */
function gnu(p: THREE.Object3D, at: V3, yaw: number, s: number, phase: number, headDown = 0): void {
  const b = grp(p, at, [0, yaw, 0], s);
  // Blue wildebeest: slate grey with dark brindle bands down the neck and shoulders, black face, mane and beard
  const c = '#6f6b64', dk = '#1f1b18', tan = '#8a7c68';
  const paint: Paint = (x, y, z, _nx, ny) => {
    let col = ny < -0.5 ? mx(c, tan, 0.35) : c;
    if (z > -0.1 && y > 0.28) col = mx(col, '#26221e', sst(0.1, 0.5, Math.sin(z * 46 + y * 8 + vnoise(x * 8, y * 8, z * 8) * 1.5)) * sst(-0.1, 0.1, z) * 0.6);
    if (y > 0.5 && z > 0.05) col = mx(col, '#4a4540', sst(0.05, 0.25, z) * 0.4);
    return speck(col, x, y, z, 0.06);
  };
  quadBody(b, { yw: 0.63, yh: 0.47, L: 0.54, dep: 0.27, wd: 0.105, leg: 0.017, phase, paint, c, hoof: '#1a1715', legPaint: (x, y, z) => speck(y < 0.2 ? mx(c, '#3a3530', 0.5) : c, x, y, z, 0.05) });
  vblob(b, c, 0, 0.55, 0.15, 0.085, 0.09, 0.13, paint, [0, 0, 0], 12); // humped shoulders
  const hd = headDown;
  spine(b, [{ p: [0, 0.5, 0.22], w: 0.075, h: 0.11 }, { p: [0, 0.56, 0.31], w: 0.058, h: 0.085 }, { p: [0, 0.59 - hd * 0.5, 0.38], w: 0.048, h: 0.065 }], c, paint, { nu: 8, nv: 12 });
  // Big, long 'Roman-nosed' head — the wildebeest's signature front-heavy look
  const H = grp(b, [0, 0.6 - hd * 0.5, 0.39], [0.6 + hd, 0, 0], 1.15);
  spine(H, [{ p: [0, 0.005, -0.025], w: 0.04, h: 0.05 }, { p: [0, 0.008, 0.03], w: 0.044, h: 0.058 }, { p: [0, 0.0, 0.09], w: 0.032, h: 0.044 }, { p: [0, -0.008, 0.14], w: 0.028, h: 0.036 },
    { p: [0, -0.014, 0.175], w: 0.038, h: 0.032 }, { p: [0, -0.016, 0.2], w: 0.03, h: 0.022 }],
    dk, (x, y, z, nx) => speck(Math.abs(nx) > 0.6 && z < 0.08 ? mx(dk, '#4a443e', 0.5) : dk, x, y, z, 0.08), { nu: 14, nv: 10 });
  for (const sx of [-1, 1]) {
    // Cow-like horns: thick boss, out sideways, then hooking up and in (dark grey, paler tips for readability)
    tube(H, [[sx * 0.02, 0.045, 0.0], [sx * 0.09, 0.045, -0.015], [sx * 0.13, 0.085, 0.0], [sx * 0.11, 0.13, 0.03]], 0.024, 0.007, '#57514a', 7, (_x, y) => (y > 0.1 ? '#8a847a' : '#4a453f'));
    blade(H, '#3a332d', [sx * 0.035, 0.03, -0.02], [sx * 0.085, 0.01, -0.05], 0.018, 0.005, [0, 0, 1]);
    bead(H, sx * 0.043, 0.02, 0.04, 0.007, '#0a0806');
    ellip(H, '#121010', sx * 0.022, -0.01, 0.19, 0.008, 0.007, 0.006);
  }
  // Black mane along the neck and long beard under the throat
  for (let i = 0; i < 5; i++) {
    const t = i / 4, z = 0.16 + t * 0.22, y = 0.63 + t * 0.0 - hd * 0.4 * t;
    blade(b, '#1c1917', [0, y - 0.012, z], [0, y + 0.045, z - 0.03], 0.026, 0.008, [1, 0, 0]);
    drop(b, '#1c1917', [0, 0.47 + t * 0.06 - hd * 0.3 * t, 0.26 + t * 0.14], [0, 0.33 + t * 0.03 - hd * 0.3 * t, 0.27 + t * 0.13], 0.022, 0.01);
  }
  tube(b, [[0, 0.47, -0.3], [0, 0.38, -0.34], [0, 0.26, -0.33]], 0.008, 0.005, '#3a3530', 5);
  for (let i = 0; i < 3; i++) drop(b, '#151311', [0, 0.32, -0.335], [(i - 1) * 0.014, 0.17, -0.33 - (i % 2) * 0.01], 0.014, 0.008);
}
/** Plains zebra: crisp black stripes (vertical body, diagonal rump, horizontal legs), upright mane. */
function zebra(p: THREE.Object3D, at: V3, yaw: number, s: number, phase: number): void {
  const b = grp(p, at, [0, yaw, 0], s);
  const W = '#f1eee6', K = '#1a1816';
  const stripe = (x: number, y: number, z: number): string => {
    const wv = vnoise(x * 6, y * 6, z * 6) * 1.4;
    let f: number;
    if (z < -0.16 && y > 0.3) f = Math.sin((z * 0.6 - y) * 70 + wv);
    else if (y < 0.33) f = Math.sin(y * 95 + wv);
    else f = Math.sin(z * 62 + wv + Math.abs(x) * 6);
    return f > 0.15 ? K : W;
  };
  const paint: Paint = (x, y, z) => stripe(x, y, z);
  quadBody(b, { yw: 0.6, yh: 0.58, L: 0.56, dep: 0.26, wd: 0.11, leg: 0.018, phase, paint, c: W, hoof: '#141210', stride: 0.08 });
  spine(b, [{ p: [0, 0.5, 0.22], w: 0.07, h: 0.1 }, { p: [0, 0.61, 0.31], w: 0.05, h: 0.08 }, { p: [0, 0.7, 0.37], w: 0.042, h: 0.07 }], W,
    (x, y, z) => (Math.sin((y * 0.7 + z * 0.4) * 75 + vnoise(x * 6, y * 6, z * 6)) > 0.1 ? K : W), { nu: 12, nv: 14 });
  const H = grp(b, [0, 0.72, 0.38], [1.15, 0, 0]);
  spine(H, [{ p: [0, 0, -0.03], w: 0.045, h: 0.055 }, { p: [0, 0, 0.05], w: 0.042, h: 0.048 }, { p: [0, -0.005, 0.13], w: 0.032, h: 0.036 }, { p: [0, -0.01, 0.19], w: 0.033, h: 0.032 }, { p: [0, -0.012, 0.21], w: 0.025, h: 0.022 }],
    W, (x, y, z) => (z > 0.165 ? K : Math.sin(z * 120 + Math.abs(x) * 40) > 0.25 ? K : W), { nu: 18, nv: 12 });
  for (const sx of [-1, 1]) {
    blade(H, W, [sx * 0.022, 0.035, 0.0], [sx * 0.035, 0.075, -0.05], 0.016, 0.006, [0, 0, 1]);
    bead(H, sx * 0.04, 0.02, 0.05, 0.007, '#0a0806');
  }
  for (let i = 0; i < 9; i++) {
    const t = i / 8, z = 0.2 + t * 0.19, y = 0.59 + t * 0.15;
    blade(b, i % 2 ? K : W, [0, y, z - 0.005], [0, y + 0.04, z - 0.012], 0.014, 0.005, [1, 0, 0]);
  }
  tube(b, [[0, 0.52, -0.3], [0, 0.42, -0.33], [0, 0.3, -0.32]], 0.009, 0.006, W, 5, (_x, y) => (Math.sin(y * 90) > 0 ? K : W));
  drop(b, K, [0, 0.31, -0.322], [0, 0.22, -0.32], 0.012, 0.008);
}
/** Barren-ground caribou: chocolate coat, creamy neck & mane, white rump, big C-shaped antlers with a brow shovel. */
function caribou(p: THREE.Object3D, at: V3, yaw: number, s: number, phase: number, ant: number): void {
  const b = grp(p, at, [0, yaw, 0], s);
  const c = '#6d5442', cream = '#e6ded0', dk = '#3a2c22';
  const paint: Paint = (x, y, z, _nx, ny) => {
    let col = c;
    if (z > 0.12 && y > 0.4) col = mx(c, cream, sst(0.12, 0.3, z)); // pale neck & shoulders
    if (z < -0.24) col = mx(col, cream, sst(-0.24, -0.3, z)); // white rump patch
    if (ny < -0.55 && y > 0.3) col = mx(col, cream, 0.7);
    if (y < 0.48 && y > 0.36 && z > -0.2 && z < 0.2 && Math.abs(x) > 0.08) col = mx(col, dk, 0.5); // dark flank stripe
    return speck(col, x, y, z, 0.07);
  };
  quadBody(b, { yw: 0.6, yh: 0.56, L: 0.6, dep: 0.27, wd: 0.115, leg: 0.019, phase, paint, c, hoof: '#1b1612',
    legPaint: (x, y, z) => speck(y < 0.07 && y > 0.04 ? cream : dk, x, y, z, 0.05) });
  spine(b, [{ p: [0, 0.5, 0.23], w: 0.08, h: 0.11 }, { p: [0, 0.57, 0.33], w: 0.06, h: 0.085 }, { p: [0, 0.62, 0.4], w: 0.045, h: 0.06 }], cream, (x, y, z) => speck(cream, x, y, z, 0.06), { nu: 12, nv: 14 });
  // Hanging throat mane
  for (let i = 0; i < 6; i++) { const t = i / 5; drop(b, '#f2ede4', [(i % 2 - 0.5) * 0.02, 0.48 + t * 0.07, 0.27 + t * 0.12], [(i % 2 - 0.5) * 0.02, 0.38 + t * 0.06, 0.28 + t * 0.1], 0.02, 0.012); }
  const H = grp(b, [0, 0.64, 0.41], [0.95, 0, 0]);
  spine(H, [{ p: [0, 0, -0.03], w: 0.045, h: 0.05 }, { p: [0, 0, 0.05], w: 0.042, h: 0.046 }, { p: [0, -0.008, 0.13], w: 0.036, h: 0.036 }, { p: [0, -0.01, 0.17], w: 0.036, h: 0.03 }, { p: [0, -0.012, 0.19], w: 0.026, h: 0.02 }],
    dk, (x, y, z) => (z > 0.15 ? '#d9d2c6' : speck(dk, x, y, z, 0.07)), { nu: 16, nv: 12 });
  for (const sx of [-1, 1]) {
    blade(H, c, [sx * 0.03, 0.02, -0.02], [sx * 0.07, 0.02, -0.05], 0.015, 0.005, [0, 0, 1]);
    bead(H, sx * 0.04, 0.02, 0.05, 0.007, '#0a0806');
    if (ant > 0) {
      // Main beam sweeps back, up and forward with a palmate crown; a brow tine curls forward over the face
      const A = (x: number, y: number, z: number): V3 => [sx * x * ant, (0.04 + y) * ant + 0.0, (z) * ant];
      const beam: V3[] = [A(0.025, 0, 0.0), A(0.07, 0.06, -0.07), A(0.11, 0.18, -0.1), A(0.13, 0.3, -0.04), A(0.11, 0.36, 0.05), A(0.08, 0.37, 0.1)];
      tube(H, beam, 0.012, 0.005, '#b19c7e', 6);
      for (const [k, dx, dy, dz] of [[3, 0.04, 0.08, 0.02], [4, 0.0, 0.1, 0.03], [4, 0.04, 0.06, 0.06], [2, 0.02, 0.08, 0.06]] as const) {
        const q = beam[k];
        drop(H, '#c2ae90', q, [q[0] + sx * dx * ant, q[1] + dy * ant, q[2] + dz * ant], 0.007, 0.006);
      }
      const b0 = A(0.03, 0.01, 0.0), b1 = A(0.02, 0.06, 0.06), b2 = A(0.008, 0.07, 0.13);
      tube(H, [b0, b1, b2], 0.007, 0.004, '#b19c7e', 5);
      if (sx > 0) blade(H, '#b8a487', b1, A(0.0, 0.1, 0.15), 0.03 * ant, 0.004, [1, 0, 0]);
    }
  }
  tube(b, [[0, 0.5, -0.31], [0, 0.46, -0.34]], 0.016, 0.012, cream, 6);
}
/** Bactrian camel: long legs, two shaggy humps, shaggy neck beard, long curved neck and droopy lips. */
function camel(p: THREE.Object3D, at: V3, yaw: number, s: number, phase: number, load: boolean, blanket: string): THREE.Group {
  const b = grp(p, at, [0, yaw, 0], s);
  const c = '#a77a4c', sg = '#7a5534';
  const paint: Paint = (x, y, z, _nx, ny) => speck(ny < -0.5 ? mx(c, '#c49a6a', 0.4) : c, x, y, z, 0.07);
  quadBody(b, { yw: 0.66, yh: 0.62, L: 0.52, dep: 0.25, wd: 0.11, leg: 0.02, phase, paint, c, hoof: '#5e4630', stride: 0.06,
    legPaint: (x, y, z) => speck(y > 0.5 ? sg : c, x, y, z, 0.06) });
  // Two tall, well-separated Bactrian humps with dark shaggy caps (the riders/loads sit in the saddle between them)
  for (const z of [0.15, -0.13]) {
    vblob(b, c, 0, 0.67, z, 0.068, 0.135, 0.07, (x, y, zz) => (y > 0.74 ? speck(sg, x, y, zz, 0.15) : speck(c, x, y, zz, 0.07)), [0, 0, 0], 11);
    // Shaggy winter tuft flopping over the top of each hump
    for (let i = 0; i < 3; i++) { const sx = i - 1; drop(b, sg, [sx * 0.025, 0.79, z + 0.01], [sx * 0.05, 0.76, z - 0.04], 0.03, 0.014); }
  }
  // Neck dips forward and down from the shoulder, then swings up in a U to carry the head level
  spine(b, [{ p: [0, 0.56, 0.2], w: 0.065, h: 0.09 }, { p: [0, 0.5, 0.32], w: 0.05, h: 0.068 }, { p: [0, 0.51, 0.42], w: 0.042, h: 0.054 }, { p: [0, 0.6, 0.49], w: 0.037, h: 0.044 }, { p: [0, 0.7, 0.51], w: 0.036, h: 0.04 }],
    c, paint, { nu: 12, nv: 10 });
  for (let i = 0; i < 6; i++) { const t = i / 5; drop(b, sg, [0, 0.47 - t * 0.01, 0.28 + t * 0.12], [0, 0.4 - t * 0.0, 0.29 + t * 0.12], 0.026, 0.016); }
  const H = grp(b, [0, 0.72, 0.52], [0.25, 0, 0]);
  spine(H, [{ p: [0, 0, -0.03], w: 0.045, h: 0.05 }, { p: [0, 0, 0.05], w: 0.04, h: 0.046 }, { p: [0, -0.01, 0.11], w: 0.034, h: 0.038 }, { p: [0, -0.02, 0.15], w: 0.03, h: 0.032 }],
    c, paint, { nu: 9, nv: 10 });
  vblob(H, sh(c, 0.85), 0, -0.04, 0.14, 0.024, 0.016, 0.02, undefined, [0, 0, 0], 10);
  for (const sx of [-1, 1]) {
    drop(H, c, [sx * 0.03, 0.03, -0.02], [sx * 0.045, 0.06, -0.04], 0.01, 0.006);
    bead(H, sx * 0.038, 0.02, 0.04, 0.007, '#0a0806');
  }
  for (let i = 0; i < 4; i++) drop(H, sg, [0, 0.045, -0.02 + i * 0.015], [0, 0.07, -0.03 + i * 0.012], 0.014, 0.01);
  tube(b, [[0, 0.56, -0.28], [0, 0.46, -0.31], [0, 0.36, -0.3]], 0.01, 0.006, c, 5);
  drop(b, sg, [0, 0.38, -0.3], [0, 0.3, -0.3], 0.012, 0.008);
  if (load) {
    // Saddle blanket in the dip between the humps; bales slung low on the flanks so both humps stay visible
    vblob(b, blanket, 0, 0.6, 0.01, 0.13, 0.055, 0.075, (x, y, z) => (Math.sin(z * 120) > 0.5 ? '#e7c55a' : Math.abs(x) > 0.11 ? sh(blanket, 0.7) : blanket), [0, 0, 0], 11);
    for (const sx of [-1, 1]) {
      rbox(b, sx > 0 ? '#c9b18a' : '#8f6a45', sx * 0.15, 0.47, 0.01, 0.07, 0.11, 0.12, 0.025);
      for (const dz of [-0.035, 0.045]) box(b, '#5b4330', sx * 0.15, 0.47, 0.01 + dz, 0.074, 0.114, 0.008);
      rod(b, [sx * 0.05, 0.66, 0.01], [sx * 0.15, 0.53, 0.01], 0.006, '#5b4330', 4);
    }
    rbox(b, '#6e7f9a', 0, 0.665, 0.01, 0.12, 0.035, 0.05, 0.015);
  }
  return b;
}

// ======================================================================================================
// Migrations
// ======================================================================================================
export const H_JOURNEYS: Record<string, Builder> = {
  mg_humpback: gp => {
    // Humpback surfacing: knobbly flat head, very long white scalloped flippers, throat grooves, small hump-backed
    // dorsal fin, serrated flukes with a white underside, a bushy spout
    const wg = grp(gp, [0, 0.07, 0], [0, 0, 0]);
    whale(wg, {
      st: [[-0.5, 0.03, 0.01, 0.008], [-0.45, 0.025, 0.02, 0.026], [-0.35, 0.02, 0.04, 0.052], [-0.22, 0.015, 0.072, 0.082], [-0.06, 0.008, 0.1, 0.096],
        [0.08, 0.002, 0.11, 0.098], [0.22, -0.004, 0.103, 0.086], [0.33, -0.01, 0.088, 0.066], [0.42, -0.016, 0.066, 0.045], [0.48, -0.02, 0.042, 0.03], [0.5, -0.022, 0.016, 0.014]],
      back: '#2c3138', belly: '#dfe3e6', pleats: 26, fin: 0.03, flipL: 0.34, flipW: 0.07, flipWhite: true, tubercles: true, fluke: 0.17, arch: 0.012,
    });
    // Tubercles ("stove bolts") along the rostrum and lower jaw
    for (let i = 0; i < 14; i++) {
      const z = 0.34 + (i % 7) * 0.024, sx = i < 7 ? 0 : (i % 2 ? 1 : -1) * 0.035;
      ellip(wg, '#3a4048', sx, (i < 7 ? 0.05 : 0.035) - (z - 0.34) * 0.33, z, 0.0075, 0.005, 0.0075);
    }
    spout(gp, 0, 0.17, 0.27, 0.22, 0.04);
    foam(gp, [[0.0, 0.3, 0.07], [0.08, 0.05, 0.06], [-0.08, -0.1, 0.07], [0, -0.38, 0.06]]);
  },
  mg_graywhale: gp => {
    // Grey whale cow and calf heading north: mottled slate skin with white barnacle & lice patches, narrow arched
    // head, no dorsal fin — a low hump and a row of "knuckles" — short paddle flippers
    const cw = grp(gp, [0.05, 0.07, 0.02]);
    const st: [number, number, number, number][] = [[-0.5, 0.025, 0.01, 0.008], [-0.45, 0.02, 0.02, 0.024], [-0.35, 0.015, 0.038, 0.05], [-0.22, 0.01, 0.065, 0.078],
      [-0.06, 0.004, 0.088, 0.09], [0.08, 0.0, 0.092, 0.09], [0.22, 0.0, 0.082, 0.075], [0.33, 0.004, 0.064, 0.056], [0.42, 0.0, 0.046, 0.04], [0.48, -0.008, 0.028, 0.024], [0.5, -0.012, 0.012, 0.01]];
    whale(cw, { st, back: '#6f7880', belly: '#8c949a', pleats: 3, knuckles: true, mottle: 1, fin: 0, flipL: 0.13, flipW: 0.07, fluke: 0.15, arch: 0.012 });
    // Barnacle clusters on the head
    for (let i = 0; i < 16; i++) {
      const z = 0.3 + hash3(i, 1, 2) * 0.17, x = (hash3(i, 3, 4) - 0.5) * 0.08, y = 0.08 - (z - 0.3) * 0.38 - Math.abs(x) * 0.4;
      ellip(cw, i % 3 ? '#e8e4d8' : '#d9a780', x, y, z, 0.007 + hash3(i, 5, 6) * 0.006, 0.004, 0.007);
    }
    const calf = grp(gp, [-0.21, 0.04, -0.12], [0, 0.08, 0], 0.5);
    whale(calf, { st, back: '#4c5459', belly: '#6c7479', pleats: 3, knuckles: true, mottle: 0.4, fin: 0, flipL: 0.13, flipW: 0.07, fluke: 0.15, arch: 0.01 });
    spout(gp, 0.05, 0.15, 0.32, 0.18, 0.05);
    foam(gp, [[0.05, 0.36, 0.06], [0.05, -0.38, 0.06], [-0.21, 0.1, 0.05], [-0.2, -0.32, 0.04]]);
  },
  mg_turtle: gp => {
    // Green sea turtle stroking along: heart-shaped carapace with radiating olive-brown scutes and pale seams,
    // scaly head, long paddle fore-flippers mid-stroke
    const shell = '#5f4a2a', sLt = '#9c7a45', sDk = '#3a2c17', seam = '#b9a06c', skin = '#566048';
    const scale = (base: string, k = 30): Paint => (x, y, z) => {
      const [f1, f2] = worley(x * k, y * k, z * k);
      return mx(mx(base, '#1d1a12', 0.2 + f1 * 0.3), '#d8d0a8', sst(0.14, 0.04, f2 - f1) * 0.75);
    };
    const scute = (u: number, a: number): string => {
      const s2 = Math.sin(a);
      if (s2 < -0.08) return mx('#e3d9a8', '#cfc08a', sst(-0.1, -0.9, s2) * 0.4);
      const ang = Math.abs(Math.atan2(Math.cos(a), Math.max(1e-3, s2)));
      const [n, a0, a1, u0, u1] = ang < 0.5 ? [5, 0, 0.5, 0.1, 0.92] : ang < 1.22 ? [4, 0.5, 1.22, 0.12, 0.88] : [11, 1.22, 1.62, 0.02, 0.98];
      const fu = Math.min(0.999, Math.max(0, (u - u0) / (u1 - u0))) * n, iu = Math.floor(fu), lu = fu - iu, la = (ang - a0) / (a1 - a0);
      if (u < u0 || u > u1 || lu < 0.04 || lu > 0.96 || la < 0.04 || la > 0.96) return seam;
      const th = Math.atan2(la - 0.5, lu - 0.5), d = Math.hypot(la - 0.5, lu - 0.5);
      const streak = 0.5 + 0.5 * Math.sin(th * 7 + hash3(iu, n, 3) * 6) * Math.min(1, d * 2.2);
      return mx(mx(sDk, sLt, 0.25 + streak * 0.6), shell, hash3(iu, n, 5) * 0.4);
    };
    const tg = grp(gp, [0, 0.12, 0], [0.05, 0, 0.04], 1.25);
    spine(tg, [
      { p: [0, 0.0, -0.31], w: 0.012, h: 0.01 }, { p: [0, 0, -0.27], w: 0.075, h: 0.04 }, { p: [0, 0, -0.18], w: 0.155, h: 0.08 }, { p: [0, 0, -0.06], w: 0.2, h: 0.1 },
      { p: [0, 0, 0.06], w: 0.208, h: 0.104 }, { p: [0, 0, 0.16], w: 0.178, h: 0.09 }, { p: [0, 0, 0.22], w: 0.12, h: 0.066 }, { p: [0, 0, 0.25], w: 0.04, h: 0.03 },
    ], shell, undefined, {
      nu: 56, nv: 48,
      shape: (_u, a) => { const s2 = Math.sin(a); return s2 < 0 ? 1 - 0.62 * sst(0, 1, -s2) : 1 + 0.03 * Math.exp(-((s2 / 0.12) ** 2)); },
      uvp: (u, a) => scute(u, a),
    });
    const hd = grp(tg, [0, 0.0, 0.25], [0.1, 0, 0]);
    spine(hd, [{ p: [0, 0, -0.05], w: 0.05, h: 0.04 }, { p: [0, 0.004, 0.0], w: 0.046, h: 0.038 }, { p: [0, 0.014, 0.05], w: 0.058, h: 0.05 },
      { p: [0, 0.014, 0.095], w: 0.05, h: 0.045 }, { p: [0, 0.0, 0.125], w: 0.026, h: 0.024 }], skin, (x, y, z, nx, ny, nz) => (ny < -0.35 ? mx('#e3d9a8', skin, 0.25) : scale(skin, 42)(x, y, z, nx, ny, nz)), { nv: 20, nu: 28 });
    for (const sx of [-1, 1]) {
      bead(hd, sx * 0.048, 0.021, 0.074, 0.009, '#0d0b09');
      tube(hd, [[sx * 0.014, -0.012, 0.122], [sx * 0.032, -0.014, 0.095], [sx * 0.044, -0.008, 0.07]], 0.0018, 0.0018, '#2a1e14', 4);
    }
    for (const sx of [-1, 1]) {
      foil(tg, skin, [
        { le: [sx * 0.15, -0.01, 0.17], te: [sx * 0.15, -0.015, 0.08], t: 0.024 },
        { le: [sx * 0.27, 0.02, 0.13], te: [sx * 0.26, 0.01, 0.06], t: 0.016 },
        { le: [sx * 0.38, 0.03, 0.05], te: [sx * 0.35, 0.02, 0.01], t: 0.01 },
        { le: [sx * 0.45, 0.02, -0.05], te: [sx * 0.43, 0.02, -0.055], t: 0.004 },
      ], [-sx * 0.2, 1, 0], scale(skin, 32), 20, 12);
      foil(tg, skin, [
        { le: [sx * 0.08, -0.02, -0.22], te: [sx * 0.07, -0.02, -0.27], t: 0.016 },
        { le: [sx * 0.14, -0.022, -0.27], te: [sx * 0.11, -0.022, -0.33], t: 0.01 },
        { le: [sx * 0.165, -0.025, -0.33], te: [sx * 0.15, -0.025, -0.35], t: 0.004 },
      ], [0, 1, 0], scale(skin, 32), 10, 10);
    }
    tube(tg, [[0, -0.01, -0.29], [0, -0.016, -0.33]], 0.012, 0.004, skin, 6);
    foam(gp, [[0.42, 0.12, 0.05], [-0.42, 0.12, 0.05], [0, -0.42, 0.05]]);
  },
  mg_monarch: gp => {
    // A drifting cloud of monarchs at different heights and headings, all wings beating
    const B: [number, number, number, number, number, number][] = [
      [0, 0.32, 0.12, 0.05, 1.0, 0.3], [-0.3, 0.14, -0.08, -0.25, 0.85, -0.1], [0.28, 0.48, -0.16, 0.2, 0.8, 0.5],
      [-0.12, 0.6, -0.36, -0.1, 0.7, 0.1], [0.2, 0.06, 0.34, 0.35, 0.75, -0.25], [-0.32, 0.42, 0.28, -0.4, 0.72, 0.45],
    ];
    for (const [x, y, z, yaw, s, beat] of B) butterfly(gp, [x, y, z], yaw, s * 0.42, beat);
  },
  mg_tern: gp => {
    // Arctic terns: pale grey wings with dark outer primaries, black cap, blood-red bill and feet, long tail streamers
    const o: BirdOpts = {
      body: '#d9dee3', belly: '#f4f6f8', head: '#f4f6f8', cap: '#16181b', bill: '#c8221d', billL: 0.07, legs: '#c8221d', tail: '#f1f3f5', tailFork: 0.14,
      wingUp: (u, v) => (u > 0.75 && v < 0.35 ? '#5b6168' : u > 0.6 && v > 0.8 ? '#6d747b' : mx('#c4cbd2', '#d6dce2', v)),
      wingDn: (u, v) => (u > 0.85 && v > 0.6 ? '#7d858c' : '#eef1f4'), span: 0.42, chord: 0.12, sweep: 0.14,
    };
    const F: [number, number, number, number, number][] = [[0, 0.24, 0.16, 0.0, 1.0], [-0.26, 0.12, -0.12, -0.08, 0.9], [0.27, 0.36, -0.18, 0.06, 0.9], [-0.06, 0.46, -0.42, 0.04, 0.85], [0.22, 0.04, 0.4, -0.05, 0.8]];
    F.forEach(([x, y, z, yaw, s], i) => bird(gp, [x, y, z], yaw, s * 1.1, o, (i % 2 ? 1 : -1) * 0.12, 0.15 + (i % 3) * 0.12));
  },
  mg_godwit: gp => {
    // Bar-tailed godwits in a ragged V: mottled brown-grey backs, rusty breeding underparts on two, long upturned bills
    const mk = (rusty: boolean): BirdOpts => ({
      body: '#8a7258', belly: rusty ? '#b5612f' : '#e6dccb', head: rusty ? '#b5612f' : '#b9a588', bill: '#2b2420', billL: 0.15, billUp: 0.02, legs: '#2b2420', tail: '#cfc4b2', tailFork: 0,
      wingUp: (u, v) => (u > 0.68 ? '#3d342c' : v < 0.2 && u > 0.2 ? '#f0ebe0' : hash3(Math.round(u * 14), Math.round(v * 8), 2) > 0.55 ? '#6e5a45' : '#9b8467'),
      wingDn: u => (u > 0.75 ? '#7a6d60' : '#e9e3d8'), span: 0.36, chord: 0.12, sweep: 0.1,
    });
    const V: [number, number, number, boolean][] = [[0, 0.28, 0.36, true], [-0.2, 0.26, 0.14, false], [0.2, 0.3, 0.12, true], [-0.38, 0.22, -0.08, false], [0.38, 0.32, -0.1, false], [-0.12, 0.08, -0.36, false]];
    V.forEach(([x, y, z, r], i) => bird(gp, [x, y, z], 0, 1.05, mk(r), (i % 2 ? -1 : 1) * 0.06, 0.1 + (i % 3) * 0.13));
  },
  mg_wildebeest: gp => {
    // Part of the Great Migration column: four wildebeest and a zebra walking north
    gnu(gp, [0.02, 0, 0.32], 0.02, 0.62, 0.2);
    gnu(gp, [-0.24, 0, 0.0], 0.1, 0.6, 1.9, 0.08);
    gnu(gp, [0.22, 0, -0.06], -0.06, 0.58, 3.5);
    gnu(gp, [-0.04, 0, -0.38], 0.05, 0.56, 4.6, 0.12);
    zebra(gp, [0.3, 0, 0.36], -0.12, 0.6, 1.0);
  },
  mg_caribou: gp => {
    // Porcupine caribou crossing the tundra: a big bull with towering antlers leading cows and a calf
    caribou(gp, [0.04, 0, 0.3], 0.04, 0.66, 0.4, 1);
    caribou(gp, [-0.24, 0, -0.02], 0.12, 0.58, 2.2, 0.55);
    caribou(gp, [0.22, 0, -0.1], -0.08, 0.58, 3.7, 0.5);
    caribou(gp, [0.0, 0, -0.38], 0.02, 0.4, 5.0, 0);
  },
  mg_redcrab: gp => {
    // Christmas Island red crabs scuttling to the sea: glossy scarlet carapaces, raised claws, stalked eyes
    const C: [number, number, number, number][] = [[0, 0.1, 0, 1.1], [-0.3, -0.25, 0.4, 0.9], [0.3, -0.2, -0.3, 0.95], [-0.25, 0.3, 0.2, 0.85], [0.28, 0.32, -0.15, 0.9], [0.02, -0.4, 0.1, 0.85]];
    for (const [x, z, yaw, s] of C) {
      const b = grp(gp, [x, 0, z], [0, yaw, 0], s);
      const red = '#c4231b', dk = '#7c120e';
      vblob(b, red, 0, 0.1, 0, 0.11, 0.06, 0.095, (px, py, pz, _nx, ny) => (ny < -0.3 ? '#e0603a' : mx(red, ny > 0.85 ? '#e2433a' : dk, ny > 0.85 ? 0.5 : sst(0.5, 0.0, ny) * 0.6 + vnoise(px * 40, py * 40, pz * 40) * 0.2)), [0, 0, 0], 14);
      for (const sx of [-1, 1]) {
        tube(b, [[sx * 0.025, 0.13, 0.08], [sx * 0.03, 0.17, 0.09]], 0.008, 0.007, dk, 5);
        bead(b, sx * 0.03, 0.175, 0.095, 0.012, '#101010');
        // Walking legs: three-segment, splayed sideways
        for (let k = 0; k < 4; k++) {
          const a = -0.65 + k * 0.42, cz = Math.sin(a) * 0.07, ph = Math.sin(k * 1.7 + x * 9) * 0.03;
          tube(b, [[sx * 0.09, 0.09, cz], [sx * 0.15, 0.13, cz * 1.35 + ph], [sx * 0.19, 0.0, cz * 1.6 + ph]], 0.017, 0.009, k % 2 ? red : '#b11f18', 5);
        }
        // Claws held up in front
        tube(b, [[sx * 0.07, 0.1, 0.07], [sx * 0.1, 0.14, 0.13], [sx * 0.07, 0.17, 0.18]], 0.016, 0.014, red, 5);
        vblob(b, red, sx * 0.065, 0.18, 0.2, 0.03, 0.024, 0.04, (_px, py) => (py > 0.19 ? '#e86a4a' : red), [0, 0, 0], 8);
        drop(b, '#f2c9a8', [sx * 0.06, 0.18, 0.23], [sx * 0.05, 0.17, 0.27], 0.012, 0.008);
      }
    }
  },
  vy_zhenghe: gp => {
    // Ming treasure ship (baochuan): huge broad flat-bottomed hull with a blunt transom bow and painted oculi,
    // towering multi-storey stern castle with tiled roofs, nine masts carrying red battened lug sails
    const red = '#a3241d', gold = '#d9a93a';
    const sheer = (u: number) => 0.13 + 0.1 * Math.pow(1 - u, 3) + 0.05 * Math.pow(u, 3);
    const H = hull(gp, {
      L: 0.86, B: 0.17, full: 0.3, bulwark: 0.022, bulC: red, nu: 28,
      sheer, half: u => (0.74 + 0.26 * Math.sin(Math.PI * Math.min(1, u * 1.08))) * (u > 0.82 ? 1 - (u - 0.82) * 2 : 1),
      keel: u => 0.035 * Math.pow(1 - u, 2) + 0.05 * Math.pow(u, 2),
      bands: [0.16, 0.19, 0.3, 0.32, 0.42, 0.54, 0.66, 0.85],
      paint: (_u, d) => (d > 0.85 ? '#2b231d' : d < 0.16 ? red : d < 0.19 ? gold : d > 0.3 && d < 0.32 ? '#f0e6c8' : [0.42, 0.54, 0.66, 2].findIndex(b => d < b) % 2 ? '#5d3d24' : '#6e4a2c'),
      deck: '#a07a4c',
    });
    // Oculi on the bow, anchors, big rudder
    for (const sd of [-1, 1]) {
      const q = H.gun(0.93, sd), o: V3 = [q[0] + sd * 0.006, q[1] - 0.045, q[2]];
      ellip(gp, '#f3eedf', o[0], o[1], o[2], 0.008, 0.022, 0.03);
      ellip(gp, '#151210', o[0] + sd * 0.006, o[1], o[2] + 0.006, 0.006, 0.013, 0.013);
      tube(gp, [[sd * 0.09, H.top(0.95), H.z(0.95)], [sd * 0.12, H.top(0.95) - 0.06, H.z(1) + 0.01], [sd * 0.12, 0.03, H.z(1) + 0.005]], 0.004, 0.004, '#2a2622', 5);
    }
    box(gp, '#3a2a1c', 0, 0.09, H.z(0) - 0.02, 0.016, 0.16, 0.06);
    // Bow transom face: red with a gold tiger-head roundel
    const bz = H.z(1) + 0.003;
    cyl(gp, gold, 0, H.top(1) - 0.04, bz, 0.03, 0.006, 12).rotation.x = Math.PI / 2;
    // Stern castle: three stepped red storeys with white window bands, tiled roofs with upturned eaves
    const st = H.top(0.08);
    const storey = (y: number, w: number, d: number, h: number, z: number) => {
      rbox(gp, red, 0, y + h / 2, z, w, h, d, 0.006);
      for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) box(gp, '#f2e6c4', sd * (w / 2 + 0.001), y + h * 0.55, z - d * 0.35 + i * d * 0.233, 0.004, h * 0.42, d * 0.15);
      box(gp, gold, 0, y + h, z, w + 0.012, 0.007, d + 0.012);
    };
    storey(st - 0.01, 0.3, 0.2, 0.07, H.z(0.12));
    storey(st + 0.065, 0.25, 0.14, 0.055, H.z(0.08));
    storey(st + 0.125, 0.18, 0.09, 0.045, H.z(0.06));
    const roof = (y: number, w: number, d: number, z: number) => {
      for (const sd of [-1, 1]) { const m = box(gp, '#2f4a46', sd * w * 0.25, y + 0.012, z, w * 0.56, 0.008, d); m.rotation.z = -sd * 0.38; }
      box(gp, '#1f302e', 0, y + 0.026, z, 0.012, 0.012, d + 0.01);
      for (const sd of [-1, 1]) for (const e of [-1, 1]) drop(gp, gold, [sd * w * 0.5, y + 0.0, z + e * d * 0.5], [sd * w * 0.58, y + 0.03, z + e * d * 0.56], 0.006, 0.004);
    };
    roof(st + 0.17, 0.2, 0.11, H.z(0.06));
    // Red lanterns hanging from the stern gallery
    for (const sd of [-1, 1]) { const lt = ellip(gp, '#e0402a', sd * 0.1, st + 0.04, H.z(0.0) - 0.02, 0.012, 0.016, 0.012); lt.material = mat('#ff5a3a', { emissive: '#c0301c' }); }
    // Forecastle rail
    for (const sd of [-1, 1]) rod(gp, [sd * 0.1, H.top(0.86) + 0.035, H.z(0.84)], [sd * 0.1, H.top(0.97) + 0.035, H.z(0.97)], 0.004, gold, 5);
    // Nine masts with battened sails (heights stepped like the paintings: tallest amidships)
    const M: [number, number, number, number, number][] = [
      [0.97, 0, 0.34, 0.2, 0.22], [0.82, 0, 0.5, 0.27, 0.3], [0.68, 0, 0.66, 0.33, 0.42], [0.53, 0, 0.74, 0.37, 0.5],
      [0.39, 0, 0.64, 0.33, 0.42], [0.26, 0, 0.5, 0.27, 0.32], [0.6, 0.13, 0.4, 0.18, 0.22], [0.6, -0.13, 0.4, 0.18, 0.22], [0.04, 0, 0.42, 0.2, 0.22],
    ];
    M.forEach(([u, x, h, w, sh0], i) => {
      const zz = H.z(u), y0 = u < 0.1 ? st + 0.16 : H.top(u), rake = u > 0.9 ? 0.25 : 0;
      const top: V3 = [x, y0 + h, zz + rake * h];
      rod(gp, [x, y0 - 0.02, zz], top, 0.004 + h * 0.006, '#4a3020', 6, 0.6 * (0.004 + h * 0.006));
      lugSail(gp, [x, top[1] - 0.03, top[2] - 0.01 - rake * 0.03], w * 1.1, sh0, 0.95 + (i % 2 ? 0.12 : -0.08) + x * 2, i === 3 ? '#c8352a' : '#bf3227');
      flag(gp, [x, top[1] + 0.005, top[2]], 0.07 + h * 0.08, 0.014, (uu) => (uu < 0.5 ? '#e0b030' : '#c22a1e'));
    });
    // Stern banner
    rod(gp, [0, st + 0.17, H.z(0.0)], [0, st + 0.3, H.z(0.0) - 0.01], 0.004, '#3a2a1a', 5);
    flag(gp, [0, st + 0.3, H.z(0.0) - 0.01], 0.09, 0.07, (u, v) => (u < 0.12 || v < 0.15 || v > 0.85 ? '#c22a1e' : '#e8b632'));
    wake(gp, H.z(1) + 0.03, H.z(0) - 0.06, 0.12);
  },
  vy_magellan: gp => {
    // Nao Victoria — the only ship of Magellan's fleet to sail around the world: tarred black hull with ochre
    // wales, high castles, square courses with red crosses, lateen mizzen, Burgundy-cross ensigns
    const burgundy = (u: number, v: number) => (Math.abs(u - v) < 0.14 || Math.abs(u + v - 1) < 0.14 ? '#b3261e' : '#f2efe6');
    carrack(gp, { hull: '#1d1b1a', wale: '#c99a3e', upper: '#3a2a1e', sail: '#eee4cc', cross: '#b3261e', flagP: burgundy });
  },
  vy_columbus: gp => {
    // Columbus's 1492 fleet: the nao Santa María leading the caravels Pinta and Niña
    const exped = (u: number, v: number) => (Math.abs(u - 0.5) < 0.08 || Math.abs(v - 0.5) < 0.1 ? '#2f7a3a' : '#f4f1e6');
    const castile = (u: number, v: number) => ((u < 0.5) === (v < 0.5) ? '#b3261e' : '#f2efe6');
    carrack(grp(gp, [0.02, 0, 0.26], [0, 0, 0], 0.62), { hull: '#4a3020', wale: '#d9b25a', upper: '#6b4a2c', sail: '#efe5cd', cross: '#b3261e', crossAll: true, flagP: castile });
    carrack(grp(gp, [-0.24, 0, -0.22], [0, 0.04, 0], 0.5), { hull: '#5a3c24', wale: '#cfae6a', upper: '#7a5434', sail: '#ece2ca', cross: '#b3261e', caravel: true, flagP: exped });
    carrack(grp(gp, [0.25, 0, -0.3], [0, -0.05, 0], 0.46), { hull: '#4f3826', wale: '#cfae6a', upper: '#80603e', sail: '#ece2ca', cross: '#b3261e', caravel: true, flagP: exped });
  },
  vy_viking: gp => {
    // Norse longship (c. AD 1000, Leif Erikson's route to Vinland): slender clinker-built hull rising to a dragon
    // prow and curled stern post, a row of painted round shields, oars out, single square red-and-white striped sail
    const sheer = (u: number) => 0.075 + 0.11 * Math.pow(Math.abs(2 * u - 1), 4);
    const H = hull(gp, {
      L: 0.84, B: 0.11, full: 0.7, nu: 28, nv: 10, sheer,
      half: u => Math.pow(Math.sin(Math.PI * u), 0.7), keel: u => 0.006 + 0.05 * Math.pow(Math.abs(2 * u - 1), 6),
      bands: [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.86],
      // Overlapping clinker strakes: alternate tones with a dark tarred top strake
      paint: (_u, d) => (d < 0.12 ? '#3c281a' : d > 0.86 ? '#2a1d14' : Math.floor(d / 0.12) % 2 ? '#6e4a2c' : '#5c3c24'),
      deck: '#8f6e48',
    });
    const z0 = H.z(0), z1 = H.z(1), s1 = sheer(1);
    // Dragon prow: arching neck to a snarling head with gaping red jaw, yellow eyes and swept-back crest
    const wood = '#3e2a1a', gold = '#d8a838', red = '#b3261e';
    tube(gp, [[0, s1 - 0.04, z1 - 0.02], [0, s1 + 0.02, z1 + 0.025], [0, s1 + 0.08, z1 + 0.04], [0, s1 + 0.12, z1 + 0.03], [0, s1 + 0.14, z1 + 0.045]], 0.012, 0.009, wood, 7);
    const hd: V3 = [0, s1 + 0.148, z1 + 0.07];
    vblob(gp, gold, hd[0], hd[1], hd[2], 0.013, 0.014, 0.027, (x, y, z) => (y < hd[1] - 0.004 ? red : speck(gold, x, y, z, 0.1)), [0.15, 0, 0], 12);
    drop(gp, red, [0, hd[1] - 0.01, hd[2] - 0.005], [0, hd[1] - 0.016, hd[2] + 0.03], 0.01, 0.007);
    for (const sx of [-1, 1]) {
      bead(gp, sx * 0.011, hd[1] + 0.005, hd[2] + 0.004, 0.0045, '#f6e27a');
      drop(gp, gold, [sx * 0.006, hd[1] + 0.01, hd[2] - 0.012], [sx * 0.012, hd[1] + 0.028, hd[2] - 0.04], 0.006, 0.003);
      drop(gp, '#f2efe6', [sx * 0.006, hd[1] - 0.006, hd[2] + 0.024], [sx * 0.006, hd[1] - 0.014, hd[2] + 0.026], 0.002, 0.002);
    }
    for (let i = 0; i < 4; i++) { const t = i / 3; drop(gp, red, [0, s1 + 0.03 + t * 0.09, z1 + 0.025 + t * 0.01], [0, s1 + 0.045 + t * 0.09, z1 + 0.0 + t * 0.01], 0.008, 0.002); }
    // Curled stern post
    tube(gp, [[0, s1 - 0.04, z0 + 0.02], [0, s1 + 0.02, z0 - 0.025], [0, s1 + 0.08, z0 - 0.035], [0, s1 + 0.12, z0 - 0.015], [0, s1 + 0.125, z0 + 0.01], [0, s1 + 0.105, z0 + 0.02]], 0.012, 0.007, wood, 7);
    // Shield row along both gunwales (alternating painted designs with iron bosses)
    const SC = ['#e2b53a', '#b3261e', '#1f2a36', '#efe6d2', '#2f6a3f'];
    for (const sd of [-1, 1]) for (let i = 0; i < 13; i++) {
      const u = 0.2 + i * 0.05, q = H.gun(u, sd);
      const sc = cyl(gp, SC[(i + (sd > 0 ? 0 : 2)) % SC.length], q[0] + sd * 0.004, q[1] - 0.006, q[2], 0.022, 0.004, 10);
      sc.rotation.z = Math.PI / 2;
      ellip(gp, '#8a8f96', q[0] + sd * 0.007, q[1] + 0.005, q[2], 0.005);
    }
    // Oars out through the oar-holes below the shields, blades just touching the water
    for (const sd of [-1, 1]) for (let i = 0; i < 9; i++) {
      const u = 0.24 + i * 0.065, q = H.gun(u, sd), a: V3 = [q[0] * 0.95, q[1] - 0.022, q[2] + 0.012];
      const b: V3 = [sd * 0.26, 0.006, q[2] - 0.035];
      rod(gp, a, b, 0.0028, '#a07c52', 5);
      blade(gp, '#a07c52', [a[0] + (b[0] - a[0]) * 0.8, a[1] + (b[1] - a[1]) * 0.8, a[2] + (b[2] - a[2]) * 0.8], b, 0.008, 0.002, [0, 0, 1]);
    }
    // Mast, yard and the striped woollen sail; stays to stem and stern
    const zm = H.z(0.5), ty = sheer(0.5) + 0.5;
    rod(gp, [0, sheer(0.5) - 0.02, zm], [0, ty, zm], 0.009, '#5b4027', 7, 0.006);
    squareSail(gp, [0, ty - 0.05, zm + 0.012], 0.44, 0.32, 0.07, u => (Math.floor(u * 6) % 2 ? '#efe6d2' : '#b3261e'), undefined, undefined, 1.04);
    rod(gp, [0, ty, zm], [0, s1 + 0.02, z1 - 0.01], 0.0016, '#2a2018', 4);
    rod(gp, [0, ty, zm], [0, s1 + 0.02, z0 + 0.01], 0.0016, '#2a2018', 4);
    for (const sd of [-1, 1]) {
      rod(gp, [sd * 0.22, ty - 0.37, zm + 0.02], [sd * 0.07, sheer(0.38), H.z(0.38)], 0.0014, '#2a2018', 3);
      rod(gp, [0, ty - 0.02, zm], H.gun(0.5, sd), 0.0016, '#2a2018', 4);
    }
    flag(gp, [0, ty + 0.005, zm], 0.07, 0.014, () => red, -1);
    // Side rudder (starboard steering oar), sea chests and a little cargo, wake
    rod(gp, [0.055, sheer(0.08) + 0.01, H.z(0.08)], [0.075, 0.0, H.z(0.0) - 0.02], 0.004, '#5b4027', 5);
    blade(gp, '#5b4027', [0.07, 0.04, H.z(0.03) - 0.005], [0.077, -0.005, H.z(0.0) - 0.025], 0.016, 0.003, [1, 0, 0]);
    for (let i = 0; i < 3; i++) rbox(gp, i % 2 ? '#7a5634' : '#6a4a2e', (i - 1) * 0.03, sheer(0.75) - 0.005, H.z(0.74), 0.026, 0.022, 0.03, 0.004);
    wake(gp, z1 + 0.03, z0 - 0.06, 0.07);
  },
  vy_polynesia: gp => {
    // Polynesian double-hulled voyaging canoe (wa'a kaulua, after Hōkūle'a): twin dark hulls with upswept manu,
    // lashed crossbeams and a deck with a small thatched shelter, two tan crab-claw sails, a big steering sweep
    const sheer = (u: number) => 0.07 + 0.05 * Math.pow(Math.abs(2 * u - 1), 5);
    const dark = '#2b221c';
    for (const sx of [-1, 1]) {
      const h = grp(gp, [sx * 0.15, 0, 0]);
      const H = hull(h, {
        L: 0.78, B: 0.052, full: 0.85, nu: 22, nv: 8, sheer,
        half: u => Math.pow(Math.sin(Math.PI * u), 0.6), keel: u => 0.003 + 0.03 * Math.pow(Math.abs(2 * u - 1), 4),
        bands: [0.12, 0.18],
        paint: (_u, d) => (d < 0.12 ? '#9b6a3e' : d < 0.18 ? '#e8d8b0' : dark),
        deck: '#4a3628',
      });
      // Manu: upswept end-pieces carved at bow and stern
      for (const [u, dz] of [[1, 1], [0, -1]] as const) {
        const zz = H.z(u), y = sheer(u);
        tube(h, [[0, y - 0.03, zz - dz * 0.025], [0, y + 0.0, zz + dz * 0.0], [0, y + 0.04, zz + dz * 0.012], [0, y + 0.07, zz + dz * 0.03]], 0.008, 0.004, dark, 6);
        blade(h, dark, [0, y + 0.01, zz - dz * 0.01], [0, y + 0.075, zz + dz * 0.04], 0.012, 0.003, [1, 0, 0]);
      }
      wake(h, H.z(1) + 0.02, H.z(0) - 0.05, 0.04);
    }
    // Crossbeams lashed over both hulls, slatted deck, side rails
    for (let i = 0; i < 7; i++) {
      const zz = -0.24 + i * 0.08;
      rod(gp, [-0.19, 0.09, zz], [0.19, 0.09, zz], 0.007, '#6b4a2c', 6);
      for (const sx of [-1, 1]) cyl(gp, '#d8c49a', sx * 0.15, 0.081, zz, 0.01, 0.018, 6);
    }
    for (let i = 0; i < 9; i++) box(gp, i % 2 ? '#b08a5a' : '#a17c4f', -0.12 + i * 0.03, 0.096, 0, 0.028, 0.006, 0.46);
    for (const sx of [-1, 1]) rod(gp, [sx * 0.14, 0.13, -0.24], [sx * 0.14, 0.13, 0.24], 0.003, '#6b4a2c', 4);
    // Small thatched shelter amidships
    rbox(gp, '#a8875a', 0, 0.102, -0.03, 0.09, 0.05, 0.11, 0.006);
    for (const sd of [-1, 1]) { const m = box(gp, '#c9a868', sd * 0.027, 0.15, -0.03, 0.068, 0.008, 0.13); m.rotation.z = -sd * 0.6; }
    box(gp, '#8f6e40', 0, 0.172, -0.03, 0.01, 0.008, 0.135);
    // Two crab-claw sails: a curved mast/sprit pair rising from a low tack, with a deep concave head
    const claw = (z: number, sc: number, yaw: number) => {
      const s = grp(gp, [0, 0.1, z], [0, yaw, 0], sc);
      const C: V3 = [0, 0.0, 0.07], A: V3 = [0.0, 0.56, 0.17], B: V3 = [0.0, 0.48, -0.24];
      const sail = (u: number, v: number) => sh(v < 0.08 ? '#b37f48' : '#c99a5c', 0.9 + 0.1 * (Math.floor(u * 6) % 2));
      triSail(s, A, B, C, [0.05, 0, 0], sail, 0.22);
      tube(s, [C, [0, 0.2, 0.1], [0, 0.4, 0.14], A], 0.007, 0.004, '#5b4027', 6);
      tube(s, [C, [0, 0.16, 0.0], [0, 0.32, -0.12], B], 0.006, 0.004, '#5b4027', 6);
      for (const T of [A, B]) flag(s, T, 0.07, 0.01, () => '#b3261e', -1);
      rod(s, A, [0, 0.0, 0.3], 0.0015, '#2a2018', 3);
    };
    claw(0.14, 1, 0.22);
    claw(-0.13, 0.9, 0.3);
    // Steering sweep over the stern, crew of two
    rod(gp, [0.03, 0.14, -0.2], [0.07, -0.005, -0.5], 0.004, '#5b4027', 5);
    blade(gp, '#5b4027', [0.06, 0.03, -0.43], [0.072, -0.008, -0.51], 0.016, 0.003, [1, 0, 0]);
    for (const [x, z] of [[0.04, -0.2], [-0.05, 0.2]] as const) {
      ellip(gp, '#7a4a2c', x, 0.12, z, 0.012, 0.022, 0.01);
      ellip(gp, '#6a3e24', x, 0.152, z, 0.009);
    }
  },
  vy_silkroad: gp => {
    // Silk Road caravan: three laden Bactrian camels roped nose-to-tail, led by a turbaned merchant with a staff
    const s = 0.44, line: [number, number, number, string, number][] = [[0.02, 0.24, 0, '#a8322a', 0.12], [-0.07, -0.08, 1.4, '#2f5d8a', 0.32], [-0.2, -0.38, 2.7, '#3f7a4a', 0.45]];
    line.forEach(([x, z, ph, bl, yaw]) => camel(gp, [x, 0, z], yaw, s, ph, true, bl));
    const at = (i: number, lx: number, ly: number, lz: number): V3 => {
      const [x, z, , , yaw] = line[i], c = Math.cos(yaw), sn = Math.sin(yaw);
      return [x + s * (lx * c + lz * sn), ly * s, z + s * (-lx * sn + lz * c)];
    };
    // Halters: each camel's nose rope runs to the pack saddle of the one in front; the leader's to the merchant's hand
    const nose = (i: number) => at(i, 0, 0.69, 0.66), tail = (i: number) => at(i, 0, 0.52, -0.26);
    const sag = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 0.04, (a[2] + b[2]) / 2];
    for (let i = 1; i < line.length; i++) { const a = nose(i), b = tail(i - 1); tube(gp, [a, sag(a, b), b], 0.0025, 0.0025, '#3a2a1a', 4); }
    // Merchant: long robe, sash, turban, beard, staff
    const mx0 = 0.16, mz = 0.5, robe = '#355c8a';
    lathe(gp, [[0, 0], [0.042, 0], [0.04, 0.05], [0.034, 0.11], [0.03, 0.16], [0.022, 0.19], [0, 0.195]], robe, mx0, 0, mz, 10);
    cyl(gp, '#d8a838', mx0, 0.105, mz, 0.034, 0.012, 10);
    ellip(gp, '#c08f62', mx0, 0.21, mz + 0.004, 0.019, 0.022, 0.019);
    ellip(gp, '#efe6d2', mx0, 0.228, mz, 0.024, 0.016, 0.023);
    drop(gp, '#2b1e16', [mx0, 0.2, mz + 0.016], [mx0, 0.18, mz + 0.022], 0.012, 0.008);
    for (const sx of [-1, 1]) drop(gp, robe, [mx0 + sx * 0.03, 0.18, mz], [mx0 + sx * 0.036, 0.12, mz + 0.03], 0.012, 0.01);
    for (const sx of [-1, 1]) ellip(gp, '#4a3020', mx0 + sx * 0.016, 0.006, mz + 0.012 + sx * 0.012, 0.01, 0.007, 0.016);
    rod(gp, [mx0 + 0.04, 0, mz + 0.06], [mx0 + 0.04, 0.27, mz + 0.03], 0.0035, '#6b4a2c', 5);
    const hand: V3 = [mx0 - 0.036, 0.12, mz + 0.03], a = nose(0);
    tube(gp, [hand, sag(hand, a), a], 0.0025, 0.0025, '#3a2a1a', 4);
  },
};
