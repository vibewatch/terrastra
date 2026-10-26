/**
 * Seeded generic galaxy models for objects without an authored signature model, chosen by kind / morphology.
 * All randomness comes from the builder (seeded by the object key), so every object gets its own stable look.
 */
import type { NB } from '../nebulae/core.ts';
import { GC, cluster, dsph, elliptical, irregular, mini, quasar, sky, spiral, type MiniType } from './generic.ts';

export interface Fallback { kind: string; morph?: string; sizeLy?: number }
/** An authored or generic model: its builder and true full width in light-years (spanned by the model's ±1). */
export interface GalaxyDef { f: (b: NB) => void; ext: number }

const pa = (b: NB) => b.r() * 180;

const genSpiral = (bar: boolean) => (b: NB) => {
  const r = b.r;
  spiral(b, {
    R: 0.95, pa: pa(b), inc: 25 + r() * 55, near: r() < 0.5 ? 1 : -1, arms: r() < 0.75 ? 2 : 3, pitch: 12 + r() * 12, wind: r() < 0.5 ? 1 : -1,
    phase: r() * 360, floc: Math.floor(r() * 6), bulge: 0.08 + r() * 0.08, bar: bar ? 0.28 + r() * 0.1 : 0, barAng: r() * 180, lop: r() * 0.1, lopAng: r() * 360,
  });
};
const genLenticular = (b: NB) => {
  const r = b.r;
  spiral(b, {
    R: 0.95, pa: pa(b), inc: 40 + r() * 45, arms: 2, pitch: 10, armF: 0.03, discF: 0.2, h: 0.22, bulge: 0.22, bulgeF: 0.12, bulgeQ: 0.75,
    hii: 0, young: 0, dust: 0.25, warm: 1, armCol: GC.old2, armCol2: GC.old2,
  });
};
const genElliptical = (b: NB, dwarf = false) => {
  const r = b.r;
  elliptical(b, { R: 1, pa: pa(b), q: 0.6 + r() * 0.35, a: dwarf ? 0.2 : 0.12, F: dwarf ? 0.07 : 0.12, gc: dwarf ? 6 : 300, gcR: 0.45 });
};
const genIrregular = (b: NB) => {
  const r = b.r;
  irregular(b, { R: 1, pa: pa(b), q: 0.5 + r() * 0.4, clumps: 6 + Math.floor(r() * 8), hii: 16 + Math.floor(r() * 30), bar: r() < 0.3 ? 0.5 : 0 });
};
const genDsph = (b: NB) => {
  const r = b.r;
  dsph(b, { R: 1, pa: pa(b), q: 0.55 + r() * 0.4, a: 0.25 + r() * 0.1, stars: 3500 + r() * 3000 });
};
const genCluster = (b: NB) => {
  const r = b.r, g = b.g, sub2 = r() < 0.4;
  const subs = [{ c: [0, 0, 0] as [number, number, number], w: 1, core: 0.14 + r() * 0.08 }];
  if (sub2) subs.push({ c: sky(r() * 360, 0.4 + r() * 0.2, g() * 0.2), w: 0.35, core: 0.1 });
  elliptical(b, { R: 0.09, pa: pa(b), q: 0.75, F: 0.12, gc: 0, n: 0.5, halo: 0.8 });
  cluster(b, { n: 220 + Math.floor(r() * 160), size: 0.05, subs, spirals: 0.4, gasF: 0.03 });
};
const genGroup = (b: NB) => {
  const r = b.r, g = b.g, n = 3 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const c = sky(r() * 360, i === 0 ? 0 : 0.25 + r() * 0.6, g() * 0.3), R = i === 0 ? 0.2 : 0.06 + r() * 0.1, x = r();
    if (i === 0 || (R > 0.12 && x < 0.6)) spiral(b, { c, R, pa: r() * 180, inc: 20 + r() * 60, arms: 2, pitch: 15 + r() * 8, phase: r() * 360, n: 0.12, bulge: 0.1, nucleus: 0.4 });
    else mini(b, c, R, (['E', 'S0', 'S', 'Irr'] as MiniType[])[Math.floor(x * 4)], r() * 180, 20 + r() * 60, 1.4);
  }
};
const genQuasar = (b: NB) => {
  const r = b.r;
  quasar(b, { host: 0.3, hostF: 0.012, jet: r() < 0.6 ? { pa: r() * 360, r0: 0.25, r1: 0.6 + r() * 0.3, z: 0.3, knots: 3 } : undefined });
};

const EXT: Record<string, number> = { galaxy: 1e5, dwarf: 5e3, group: 2e6, cluster: 1e7, quasar: 3e5 };

/** Generic model for a kind / morphology (null when nothing applies, e.g. a star or a void). */
export function genericDef(fb: Fallback): GalaxyDef | null {
  const { kind, morph } = fb, ext = fb.sizeLy ?? EXT[kind] ?? 1e5;
  if (kind === 'cluster') return { f: genCluster, ext };
  if (kind === 'group') return { f: genGroup, ext };
  if (kind === 'quasar') return { f: genQuasar, ext };
  if (kind !== 'galaxy' && kind !== 'dwarf') return null;
  const dwarf = kind === 'dwarf';
  switch (morph) {
    case 'barred': return { f: genSpiral(true), ext };
    case 'elliptical': return { f: (b) => genElliptical(b, dwarf), ext: fb.sizeLy ?? (dwarf ? 8e3 : 1.2e5) };
    case 'lenticular': return { f: genLenticular, ext };
    case 'irregular': return { f: genIrregular, ext: fb.sizeLy ?? (dwarf ? 6e3 : 2.5e4) };
    case 'dwarf': return { f: genDsph, ext: fb.sizeLy ?? 4e3 };
    case 'spiral': return { f: genSpiral(false), ext };
    default: return dwarf ? { f: genDsph, ext: fb.sizeLy ?? 4e3 } : { f: genSpiral(false), ext };
  }
}
