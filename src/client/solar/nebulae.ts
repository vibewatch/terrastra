/**
 * Signature 3D models of the named nebulae and supernova remnants: each one hand-authored from its real
 * (published) 3D structure so it is recognisable against the famous photos from the front (+Z) and shows
 * depth when orbited. Also paints matching flat art for cards and distant billboards.
 */
import { hashStr } from './cosmos-paint.ts';
import { NB, paintData, toModel, type NebulaModel, type NebulaTier } from './nebulae/core.ts';
import { HII } from './nebulae/hii.ts';
import { SHELLS } from './nebulae/shells.ts';

export type { NebulaModel };

const MODELS: Record<string, (b: NB) => void> = { ...HII, ...SHELLS };

export const hasNebulaModel = (key: string): boolean => key in MODELS;

/** Raw primitives of a model (shared by the 3D build and the painter). */
function nebulaData(key: string, tier: NebulaTier): NB | null {
  const f = MODELS[key];
  if (!f) return null;
  const b = new NB(hashStr(key), tier);
  f(b);
  return b;
}

export function buildNebula(key: string, tier: NebulaTier): NebulaModel | null {
  const b = nebulaData(key, tier);
  return b && toModel(b);
}

const art = new Map<string, HTMLCanvasElement>();
/** Flat painting of the model's front view (square, dark background). Cached per key and size. */
export function paintNebulaArt(key: string, size: number): HTMLCanvasElement | null {
  const id = `${key}@${size}`, hit = art.get(id);
  if (hit) return hit;
  const b = nebulaData(key, size > 300 ? 'medium' : 'low');
  if (!b) return null;
  const c = paintData(b, Math.round(size));
  art.set(id, c);
  return c;
}
