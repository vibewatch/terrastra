/**
 * Signature 3D particle models of galaxies, galaxy groups and clusters and quasars, built on the nebula model
 * framework (`nebulae/core.ts`). Each named object is authored from its real shape and sky orientation (+Z faces
 * Earth, +Y is celestial north, −X is east), so the front view matches the famous pictures and it reads as a 3D
 * object when orbited. Unknown keys can fall back to a seeded generic model of their kind / shape.
 */
import { hashStr } from './cosmos-paint.ts';
import { NB, paintData, toModel, type NebulaModel, type NebulaTier } from './nebulae/core.ts';
import { FAR } from './galaxies/far.ts';
import { genericDef, type Fallback, type GalaxyDef } from './galaxies/generic-models.ts';
import { LOCAL } from './galaxies/local.ts';
import { NEARBY } from './galaxies/nearby.ts';

const MODELS: Record<string, GalaxyDef> = { ...LOCAL, ...NEARBY, ...FAR };

export const hasGalaxyModel = (key: string): boolean => key in MODELS;

const defFor = (key: string, fb?: Fallback): GalaxyDef | null => MODELS[key] ?? (fb ? genericDef(fb) : null);

/** Raw primitives of a model (shared by the 3D build and the painter). */
function galaxyData(key: string, tier: NebulaTier, fallback?: Fallback): NB | null {
  const d = defFor(key, fallback);
  if (!d) return null;
  const b = new NB(hashStr(key), tier);
  d.f(b);
  return b;
}

/** The model for `key` (or a seeded generic one built from `fallback`), longest semi-axis ≈ 1 model unit. */
export function buildGalaxyModel(key: string, tier: NebulaTier, fallback?: Fallback): NebulaModel | null {
  const b = galaxyData(key, tier, fallback);
  return b && toModel(b, 1);
}

/** True full width (light-years) spanned by the model's ±radius: scale the model so radius = extent / 2. */
export function galaxyExtentLy(key: string, fallback?: Fallback): number {
  return defFor(key, fallback)?.ext ?? fallback?.sizeLy ?? 1e5;
}

const art = new Map<string, HTMLCanvasElement>();
/** Flat painting of the model's front view (square, black background). Cached per key and size. */
export function paintGalaxyArt(key: string, size: number, fallback?: Fallback): HTMLCanvasElement | null {
  const id = `${key}@${size}`, hit = art.get(id);
  if (hit) return hit;
  const b = galaxyData(key, size > 300 ? 'medium' : 'low', fallback);
  if (!b) return null;
  const c = paintData(b, Math.round(size));
  art.set(id, c);
  return c;
}
