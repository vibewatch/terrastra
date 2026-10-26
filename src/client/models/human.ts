import * as THREE from 'three';
import { add, g, mat, sweep, type Station, type V3 } from './prims.ts';
import { ik2, lerp3 } from './rig.ts';

// A small, anatomically proportioned person (≈7 heads) for dioramas, crowds and athletes. Limbs are solved with
// two-bone IK, so they keep their length and knees/elbows always bend the natural way. Poses are presets of foot and
// hand targets that builders can override. Unit-height space: feet on y = 0, facing +z.

export type HumanPose =
  | 'stand' | 'relax' | 'walk' | 'run' | 'sit' | 'sitGround' | 'kneel' | 'crouch'
  | 'wave' | 'point' | 'cheer' | 'carry' | 'pray' | 'photo' | 'reach' | 'row';

interface HumanOpts {
  /** total height (crown) in parent units */
  h: number;
  ry?: number;
  pose?: HumanPose;
  /** 0…1 gait phase for walk/run (mirrors the stride at 0.5) */
  phase?: number;
  /** shirt / jacket */
  top: string;
  /** trousers, shorts or skirt */
  bottom?: string;
  skin?: string;
  /** hair colour, null = covered/bald */
  hair?: string | null;
  /** hat colour (brimmed hat), or 'cap', 'helmet', 'hood' styles via hatStyle */
  hat?: string;
  hatStyle?: 'brim' | 'cap' | 'helmet' | 'hood' | 'conical' | 'turban';
  shoes?: string;
  /** long robe / dress / skirt hiding the legs to the given level */
  dress?: 'knee' | 'ankle';
  /** sleeves: 1 long (default), 0.4 short, 0 bare */
  sleeve?: number;
  /** shorts: legs bare below mid-thigh */
  shorts?: boolean;
  socks?: string;
  /** body build 0.85 (slim) … 1.2 (broad) */
  build?: number;
  /** forward lean of the upper body (radians, added to the pose's lean) */
  lean?: number;
  /** override ankle targets [left, right] in unit-height space */
  feet?: [V3, V3];
  /** override wrist targets [left, right] in unit-height space */
  hands?: [V3, V3];
  /** override pelvis height (unit space), e.g. seat height for sitting */
  hipY?: number;
  /** 'lo' for distant crowds (~180 tris), 'hi' adds face, hands and more segments */
  detail?: 'min' | 'lo' | 'hi';
}

interface HumanRig { group: THREE.Group; handL: V3; handR: V3; head: V3 }

interface PoseDef { hipY: number; lean: number; feet: [V3, V3]; hands: [V3, V3]; knee?: [V3, V3]; elbow?: [V3, V3] }

const L_THIGH = 0.245, L_SHIN = 0.235, L_UP = 0.17, L_FORE = 0.15, ANK = 0.032;
const SH_X = 0.1, HIP_X = 0.052;

function poseDef(p: HumanPose, ph: number): PoseDef {
  const s = Math.sin(ph * Math.PI * 2), c = Math.cos(ph * Math.PI * 2);
  const hang: [V3, V3] = [[-0.125, 0.47, 0.015], [0.125, 0.47, 0.015]];
  switch (p) {
    case 'relax': // contrapposto: weight on the right leg, left knee eased forward
      return { hipY: 0.495, lean: 0, feet: [[-0.075, ANK, 0.05], [0.05, ANK, -0.01]], hands: [[-0.13, 0.47, 0.03], [0.12, 0.48, 0.0]] };
    case 'walk':
      return {
        hipY: 0.49 + Math.abs(c) * 0.006, lean: 0.05,
        feet: [[-0.058, ANK + Math.max(0, -c) * 0.035, 0.12 * s], [0.058, ANK + Math.max(0, c) * 0.035, -0.12 * s]],
        hands: [[-0.125, 0.48, -0.1 * s + 0.02], [0.125, 0.48, 0.1 * s + 0.02]],
      };
    case 'run': {
      // flight phase: one knee driving forward, the other foot kicked up behind; arms swing opposite at ~90°
      const k = ph < 0.5 ? 1 : -1, front: V3 = [0, 0.07, 0.2], back: V3 = [0, 0.21, -0.2];
      const fL: V3 = k > 0 ? front : back, fR: V3 = k > 0 ? back : front;
      const hf: V3 = [0, 0.66, 0.19], hb: V3 = [0, 0.5, -0.13];
      const hL = k > 0 ? hb : hf, hR = k > 0 ? hf : hb;
      return {
        hipY: 0.47, lean: 0.3,
        feet: [[-0.055, fL[1], fL[2]], [0.055, fR[1], fR[2]]],
        hands: [[-0.13, hL[1], hL[2]], [0.13, hR[1], hR[2]]],
        elbow: [[-0.2, -0.4, -1], [0.2, -0.4, -1]],
      };
    }
    case 'sit':
      return { hipY: 0.27, lean: 0.04, feet: [[-0.07, ANK, 0.24], [0.07, ANK, 0.23]], knee: [[0, 1, 1], [0, 1, 1]], hands: [[-0.09, 0.3, 0.17], [0.09, 0.3, 0.17]] };
    case 'sitGround':
      return { hipY: 0.07, lean: -0.12, feet: [[-0.09, ANK, 0.4], [0.1, ANK, 0.33]], knee: [[0, 1, 0.3], [0, 1, 0.3]], hands: [[-0.16, 0.06, -0.1], [0.16, 0.06, -0.1]], elbow: [[-1, 0, -1], [1, 0, -1]] };
    case 'kneel':
      return { hipY: 0.3, lean: 0.05, feet: [[-0.06, ANK, 0.17], [0.06, ANK, -0.23]], knee: [[0, 0.4, 1], [0, 0, 1]], hands: [[-0.1, 0.36, 0.2], [0.13, 0.42, 0.06]] };
    case 'crouch':
      return { hipY: 0.24, lean: 0.45, feet: [[-0.08, ANK, 0.06], [0.08, ANK, -0.02]], knee: [[-0.4, 0.2, 1], [0.4, 0.2, 1]], hands: [[-0.06, 0.12, 0.28], [0.08, 0.12, 0.3]] };
    case 'wave':
      return { hipY: 0.495, lean: 0, feet: [[-0.07, ANK, 0.03], [0.055, ANK, -0.005]], hands: [hang[0], [0.24, 0.9, 0.06]], elbow: [[-0.4, -0.2, -1], [1, -0.6, -0.1]] };
    case 'point':
      return { hipY: 0.495, lean: 0.02, feet: [[-0.07, ANK, 0.04], [0.06, ANK, -0.01]], hands: [hang[0], [0.16, 0.77, 0.4]], elbow: [[-0.4, -0.2, -1], [0.6, -1, 0]] };
    case 'cheer':
      return { hipY: 0.5, lean: -0.06, feet: [[-0.08, ANK, 0], [0.08, ANK, 0]], hands: [[-0.22, 1.1, 0.04], [0.22, 1.1, 0.04]], elbow: [[-1, 0, -0.2], [1, 0, -0.2]] };
    case 'carry':
      return { hipY: 0.495, lean: -0.03, feet: [[-0.065, ANK, 0.02], [0.065, ANK, -0.01]], hands: [[-0.09, 0.6, 0.2], [0.09, 0.6, 0.2]], elbow: [[-1, -1, -0.3], [1, -1, -0.3]] };
    case 'pray':
      return { hipY: 0.5, lean: 0.04, feet: [[-0.06, ANK, 0.01], [0.06, ANK, 0.01]], hands: [[-0.012, 0.7, 0.14], [0.012, 0.7, 0.14]], elbow: [[-1, -1, 0], [1, -1, 0]] };
    case 'photo':
      return { hipY: 0.495, lean: 0, feet: [[-0.07, ANK, 0.03], [0.06, ANK, -0.01]], hands: [[-0.05, 0.85, 0.17], [0.05, 0.85, 0.17]], elbow: [[-1, -0.8, 0], [1, -0.8, 0]] };
    case 'reach':
      return { hipY: 0.5, lean: -0.04, feet: [[-0.06, ANK, 0.02], [0.06, ANK, 0.02]], hands: [[-0.125, 0.47, 0.03], [0.1, 1.08, 0.12]], elbow: [[-0.4, -0.2, -1], [1, 0, 0]] };
    case 'row':
      return { hipY: 0.2, lean: 0.25, feet: [[-0.07, 0.08, 0.32], [0.07, 0.08, 0.32]], knee: [[0, 1, 0.5], [0, 1, 0.5]], hands: [[-0.16, 0.42, 0.3], [0.16, 0.42, 0.3]], elbow: [[-1, -0.6, -0.4], [1, -0.6, -0.4]] };
    default:
      return { hipY: 0.497, lean: 0, feet: [[-0.065, ANK, 0.015], [0.065, ANK, 0.0]], hands: hang };
  }
}

/**
 * Limb/torso sweeps are cached uncoloured (white vertex colours) and shared, keyed by their rounded stations: crowds
 * repeat the same few poses, and kit's bake multiplies vertex colour by material colour anyway.
 */
const sweepCache = new Map<string, THREE.BufferGeometry>();
const scratch = new THREE.Group();
function limb(p: THREE.Object3D, st: Station[], c: string, o: { radial: number; sub: number; up?: V3 }): THREE.Mesh {
  const r = (v: number) => Math.round(v * 2000);
  let key = `${o.radial}|${o.sub}|${o.up ? o.up.join(',') : ''}`;
  for (const q of st) key += `|${r(q.p[0])},${r(q.p[1])},${r(q.p[2])},${r(q.w)},${q.h === undefined ? '' : r(q.h)}`;
  let geo = sweepCache.get(key);
  if (!geo) {
    const m = sweep(scratch, st, '#ffffff', o);
    scratch.remove(m);
    geo = m.geometry;
    if (sweepCache.size > 6000) sweepCache.clear();
    sweepCache.set(key, geo);
  }
  return add(p, geo, mat(c, { flat: false, vc: true }), 0, 0, 0, 1, 1, 1);
}

const SPH = (n: number) => g('hm-s' + n, () => new THREE.SphereGeometry(1, n, Math.max(4, Math.round(n * 0.62))));
const ell = (p: THREE.Object3D, c: string, n: number, at: V3, r: V3, rot: V3 = [0, 0, 0]) =>
  add(p, SPH(n), mat(c, { flat: false }), at[0], at[1], at[2], r[0], r[1], r[2], rot[1], rot[0], rot[2]);

/**
 * Sub-range [t0, t1] (by arc length) of a station polyline, widened by `grow` — clothing layers (sleeves, shorts,
 * socks) are separate overlapping sweeps so every hem is a clean ring instead of a jagged per-face colour edge.
 */
export function part(st: Station[], t0: number, t1: number, grow = 0): Station[] {
  const L = [0];
  for (let i = 1; i < st.length; i++) L.push(L[i - 1] + Math.hypot(st[i].p[0] - st[i - 1].p[0], st[i].p[1] - st[i - 1].p[1], st[i].p[2] - st[i - 1].p[2]));
  const tot = L[L.length - 1] || 1;
  const at = (t: number): Station => {
    const d = t * tot;
    let i = 1;
    while (i < st.length - 1 && L[i] < d) i++;
    const k = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1), a = st[i - 1], b = st[i];
    return { p: lerp3(a.p, b.p, k), w: a.w + (b.w - a.w) * k + grow, h: a.h !== undefined && b.h !== undefined ? a.h + (b.h - a.h) * k + grow : undefined };
  };
  const out: Station[] = [at(t0)];
  for (let i = 1; i < st.length - 1; i++) { const t = L[i] / tot; if (t > t0 + 0.02 && t < t1 - 0.02) out.push({ ...st[i], w: st[i].w + grow, h: st[i].h !== undefined ? st[i].h! + grow : undefined }); }
  out.push(at(t1));
  return out;
}

/** Builds a person into `p` with feet at (x, y, z). Returns hand/head anchors in `p`'s space. */
export function human(p: THREE.Object3D, x: number, y: number, z: number, o: HumanOpts): HumanRig {
  const G = new THREE.Group();
  G.position.set(x, y, z);
  G.rotation.y = o.ry ?? 0;
  G.scale.setScalar(o.h);
  p.add(G);
  const hi = o.detail ? o.detail === 'hi' : o.h > 0.06;
  const min = o.detail === 'min', rad = hi ? 7 : min ? 4 : 5, sub = hi ? 3 : 1, trad = hi ? 10 : min ? 5 : 6, hseg = hi ? 10 : min ? 5 : 7;
  const P = poseDef(o.pose ?? 'stand', o.phase ?? 0);
  const feet = o.feet ?? P.feet, hands = o.hands ?? P.hands;
  const hipY = o.hipY ?? P.hipY, lean = P.lean + (o.lean ?? 0), bw = o.build ?? 1;
  const skin = o.skin ?? '#d9a982', top = o.top, bottom = o.bottom ?? '#3a4150', shoes = o.shoes ?? '#2a2522';
  const sleeve = o.sleeve ?? 1;

  // upper body rotates about the pelvis by `lean`
  const pelvis: V3 = [0, hipY + 0.02, 0];
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const U = (dy: number, dz = 0, dx = 0): V3 => [dx, pelvis[1] + dy * cl - dz * sl, pelvis[2] + dy * sl + dz * cl];

  // ---- legs (hip → knee → ankle), shoes
  for (let i = 0; i < 2; i++) {
    const sg = i ? 1 : -1, hip: V3 = [sg * HIP_X * bw, hipY, 0.0];
    const pole = P.knee?.[i] ?? [sg * 0.15, 0, 1];
    const { mid: knee, end: ank } = ik2(hip, feet[i], L_THIGH, L_SHIN, pole);
    if (o.dress !== 'ankle') {
      const leg: Station[] = [
        { p: [hip[0], hip[1] + 0.02, hip[2]], w: 0.058 * bw },
        { p: lerp3(hip, knee, 0.45), w: 0.05 * bw },
        { p: knee, w: 0.036 * bw },
        { p: lerp3(knee, ank, 0.3), w: 0.038 * bw },
        { p: ank, w: 0.022 * bw },
      ];
      const bare = o.shorts || o.dress === 'knee';
      limb(G, leg, bare ? skin : bottom, { radial: rad, sub });
      if (o.shorts) limb(G, part(leg, 0, 0.36, 0.006), bottom, { radial: rad, sub: 2 });
      if (o.socks) limb(G, part(leg, 0.7, 1, 0.004), o.socks, { radial: rad, sub: 2 });
    }
    // shoe: heel under the ankle, toes forward and slightly out; a lifted foot points its toes down
    const yaw = sg * 0.12;
    const lifted = ank[1] > ANK + 0.02;
    const pitch = lifted ? 0.5 : 0;
    ell(G, shoes, rad, [ank[0] + Math.sin(yaw) * 0.035, Math.max(0.018, ank[1] - 0.016), ank[2] + Math.cos(yaw) * 0.035], [0.03, 0.02, 0.064], [pitch, yaw, 0]);
  }

  // ---- torso: pelvis → waist → chest → shoulders → neck, flattened front-to-back
  // trousers/hips, then the shirt as a layer over them with a slightly flared hem
  if (!o.dress) limb(G, [
    { p: U(-0.045), w: 0.07 * bw, h: 0.055 },
    { p: U(0.0), w: 0.088 * bw, h: 0.062 },
    { p: U(0.09), w: 0.076 * bw, h: 0.056 },
  ], bottom, { radial: trad, sub: min ? 1 : 2, up: [0, 0, 1] });
  limb(G, [
    { p: U(o.dress ? -0.04 : 0.06), w: 0.084 * bw, h: 0.062 },
    { p: U(0.11), w: 0.077 * bw, h: 0.058 },
    { p: U(0.2), w: 0.092 * bw, h: 0.068 },
    { p: U(0.27), w: 0.094 * bw, h: 0.06 },
    { p: U(0.305), w: 0.068 * bw, h: 0.046 },
    { p: U(0.33), w: 0.036, h: 0.034 },
  ], top, { radial: trad, sub, up: [0, 0, 1] });
  if (o.dress) {
    const hem = o.dress === 'ankle' ? 0.02 : 0.26;
    const top0 = U(0.08);
    const prof: [number, number][] = [[0, hem], [0.16 * bw, hem], [0.1 * bw, top0[1]], [0, top0[1]]];
    const seg = hi ? 12 : 8, sk = g(`hm-dress${hem}|${bw.toFixed(3)}|${top0[1].toFixed(3)}|${seg}`, () => new THREE.LatheGeometry(prof.map(([r, yy]) => new THREE.Vector2(r, yy)), seg));
    add(G, sk, mat(top, { flat: false }), 0, 0, top0[2] * 0.5, 1, 1, 0.8);
  }

  // ---- arms (shoulder → elbow → wrist), hands
  const out: V3[] = [];
  for (let i = 0; i < 2; i++) {
    const sg = i ? 1 : -1, sh = U(0.27, 0, sg * SH_X * bw);
    const pole = P.elbow?.[i] ?? [sg * 0.35, -0.2, -1];
    const { mid: el, end: wr } = ik2(sh, hands[i], L_UP, L_FORE, pole);
    const arm: Station[] = [
      { p: sh, w: 0.04 * bw },
      { p: lerp3(sh, el, 0.5), w: 0.035 * bw },
      { p: el, w: 0.029 * bw },
      { p: lerp3(el, wr, 0.4), w: 0.03 * bw },
      { p: wr, w: 0.021 * bw },
    ];
    limb(G, arm, sleeve >= 1 ? top : skin, { radial: rad, sub });
    if (sleeve > 0 && sleeve < 1) limb(G, part(arm, 0, sleeve * 0.53, 0.005), top, { radial: rad, sub: 2 });
    // deltoid rounding the shoulder into the arm
    if (!min) ell(G, sleeve > 0 ? top : skin, rad, lerp3(sh, el, 0.1), [0.04 * bw, 0.042, 0.039]);
    const d = new THREE.Vector3(wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]).normalize();
    const hand: V3 = [wr[0] + d.x * 0.028, wr[1] + d.y * 0.028, wr[2] + d.z * 0.028];
    if (!min) ell(G, skin, rad, hand, [0.02, 0.03, 0.017]).quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    out.push(hand);
  }

  // ---- neck & head
  const neck = U(0.35), head = U(0.425, 0.006);
  if (!min) ell(G, skin, rad, neck, [0.03, 0.04, 0.03]);
  ell(G, skin, hseg, head, [0.056, 0.068, 0.062]);
  if (hi) {
    ell(G, skin, 5, U(0.418, 0.062), [0.011, 0.016, 0.012]); // nose
    for (const sx of [-1, 1]) ell(G, '#2a211c', 5, U(0.43, 0.056, sx * 0.022), [0.0085, 0.0085, 0.005]);
  }
  if (o.hair !== null) {
    const hc = o.hair ?? '#3b2a20';
    ell(G, hc, hseg, U(0.448, -0.012), [0.06, 0.056, 0.064]);
  }
  if (o.hat) {
    const st = o.hatStyle ?? 'brim', ht = U(0.48, -0.004);
    if (st === 'brim') {
      ell(G, o.hat, rad, U(0.468), [0.1, 0.008, 0.1]);
      ell(G, o.hat, rad, ht, [0.056, 0.036, 0.058]);
    } else if (st === 'conical') {
      const m = add(G, g('hm-cone', () => new THREE.ConeGeometry(1, 1, 10)), mat(o.hat), ht[0], ht[1] + 0.01, ht[2], 0.13, 0.07, 0.13);
      m.rotation.x = lean;
    } else if (st === 'helmet') ell(G, o.hat, hi ? 10 : 7, U(0.45, -0.004), [0.066, 0.06, 0.07]);
    else if (st === 'turban') ell(G, o.hat, hi ? 10 : 7, U(0.462, -0.006), [0.068, 0.05, 0.07]);
    else if (st === 'hood') ell(G, o.hat, hi ? 10 : 7, U(0.43, -0.014), [0.07, 0.08, 0.072]);
    else { // cap with a visor
      ell(G, o.hat, rad, U(0.46, -0.006), [0.06, 0.04, 0.064]);
      ell(G, o.hat, rad, U(0.447, 0.06), [0.045, 0.006, 0.035]);
    }
  }

  G.updateMatrix();
  const W = (a: V3): V3 => { const w = new THREE.Vector3(...a).applyMatrix4(G.matrix); return [w.x, w.y, w.z]; };
  return { group: G, handL: W(out[0]), handR: W(out[1]), head: W(head) };
}

/** Cheap distant person for big crowds: posed silhouette at low detail with a seeded outfit. */
const SHIRTS = ['#c2410c', '#1d4ed8', '#e5e7eb', '#15803d', '#ca8a04', '#7c3aed', '#0e7490', '#be185d', '#475569', '#9a3412'];
const PANTS = ['#1f2937', '#374151', '#1e3a5f', '#44403c', '#57534e'];
const SKINS = ['#f1c7a3', '#d9a982', '#b98260', '#8d5a3b', '#5c3a24'];
const HAIRS = ['#2b1d14', '#3b2a1f', '#1c1917', '#6b4226', '#a16207', '#4b5563'];
const pick = <T,>(a: T[], k: number) => a[Math.abs(Math.floor(k)) % a.length];

export function passerby(p: THREE.Object3D, x: number, y: number, z: number, h: number, seed: number, opts: Partial<HumanOpts> = {}): HumanRig {
  const o = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) as Partial<HumanOpts>;
  const k = Math.abs(Math.sin(seed * 12.9898 + x * 78.233 + z * 37.719) * 43758.5453);
  const poses: HumanPose[] = ['stand', 'relax', 'walk', 'walk', 'photo', 'stand', 'point', 'relax'];
  const pose = o.pose ?? pick(poses, k * 7);
  return human(p, x, y, z, {
    h, ry: o.ry ?? (k % 1) * Math.PI * 2, pose, phase: Math.round(((k * 3.1) % 1) * 6) / 6,
    top: o.top ?? pick(SHIRTS, k * 11), bottom: o.bottom ?? pick(PANTS, k * 5), skin: o.skin ?? pick(SKINS, k * 13),
    hair: o.hair === undefined ? pick(HAIRS, k * 17) : o.hair, dress: o.dress ?? ((k * 19) % 5 < 1 ? 'knee' : undefined),
    sleeve: o.sleeve ?? ((k * 23) % 3 < 1 ? 0.4 : 1), detail: o.detail ?? (h < 0.03 ? 'min' : 'lo'), ...o,
  } as HumanOpts);
}

/**
 * A passerby baked into a triangle soup (`pos` xyz per vertex, `col` rgb per vertex) for builders that merge a whole
 * scene into one vertex-coloured mesh.
 */
export function humanSoup(pos: number[], col: number[], x: number, y: number, z: number, h: number, seed: number, o: Partial<HumanOpts> = {}): void {
  soupOf(pos, col, g => passerby(g, x, y, z, h, seed, o));
}

/** Bake whatever `build` adds to a scratch group into a vertex-coloured triangle soup. */
export function soupOf(pos: number[], col: number[], build: (g: THREE.Group) => void): void {
  const tmp = new THREE.Group();
  build(tmp);
  tmp.updateMatrixWorld(true);
  const v = new THREE.Vector3(), c = new THREE.Color();
  tmp.traverse(ob => {
    const m = ob as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry, P = geo.attributes.position, C = geo.attributes.color as THREE.BufferAttribute | undefined;
    const base = (m.material as THREE.MeshStandardMaterial).color;
    const n = geo.index ? geo.index.count : P.count;
    for (let i = 0; i < n; i++) {
      const k = geo.index ? geo.index.getX(i) : i;
      v.fromBufferAttribute(P, k).applyMatrix4(m.matrixWorld);
      pos.push(v.x, v.y, v.z);
      if (C) c.setRGB(C.getX(k), C.getY(k), C.getZ(k)).multiply(base); else c.copy(base);
      col.push(c.r, c.g, c.b);
    }
  });
}
