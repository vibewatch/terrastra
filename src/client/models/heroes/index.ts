import type { Builder } from '../prims.ts';

/**
 * Lazy registry of detailed hero builders. Each file in this folder is a "pack" that exports one or more
 * `Record<string, Builder>` maps; catalogue recipes reference a builder as `hero: '<pack>/<name>'`.
 * Packs become separate chunks and are fetched only when an item that needs them is about to be built.
 */
type Pack = Record<string, Builder>;
const LOADERS = import.meta.glob<Record<string, unknown>>(['./*.ts', '!./index.ts']);
const packPath = (id: string) => `./${id}.ts`;

const loaded = new Map<string, Pack>();
const loading = new Map<string, Promise<Pack>>();

export const PACK_IDS: string[] = Object.keys(LOADERS).map(p => p.slice(2, -3));

/** Splits a `pack/name` hero reference; returns null for anything else. */
function parseHero(ref: unknown): { pack: string; name: string } | null {
  if (typeof ref !== 'string') return null;
  const i = ref.indexOf('/');
  return i > 0 ? { pack: ref.slice(0, i), name: ref.slice(i + 1) } : null;
}

function loadPack(id: string): Promise<Pack> {
  const have = loaded.get(id);
  if (have) return Promise.resolve(have);
  let p = loading.get(id);
  if (!p) {
    const load = LOADERS[packPath(id)];
    if (!load) return Promise.reject(new Error(`Unknown hero pack "${id}"`));
    p = load().then(mod => {
      const pack: Pack = {};
      for (const v of Object.values(mod)) {
        if (v && typeof v === 'object') for (const [k, fn] of Object.entries(v)) if (typeof fn === 'function') pack[k] = fn as Builder;
      }
      loaded.set(id, pack);
      loading.delete(id);
      return pack;
    }, (e: unknown) => { loading.delete(id); throw e; });
    loading.set(id, p);
  }
  return p;
}

/** True when the recipe needs no hero or its pack is already in memory. */
export function heroReady(ref: unknown): boolean {
  const h = parseHero(ref);
  return !h || loaded.has(h.pack);
}

/** Resolves once the hero pack for `ref` (if any) is loaded. Unknown packs resolve too (generic fallback). */
export function whenHeroReady(ref: unknown): Promise<void> {
  const h = parseHero(ref);
  return h ? loadPack(h.pack).then(() => undefined, () => undefined) : Promise.resolve();
}

/** The loaded builder for a hero reference, or undefined if none / not loaded yet. */
export function heroBuilder(ref: unknown): Builder | undefined {
  const h = parseHero(ref);
  return h ? loaded.get(h.pack)?.[h.name] : undefined;
}

/** Loads every pack referenced by the given recipes (used by tests and dev tools). */
export async function loadHeroesFor(refs: Iterable<unknown>): Promise<void> {
  const packs = new Set<string>();
  for (const r of refs) { const h = parseHero(r); if (h) packs.add(h.pack); }
  await Promise.all([...packs].map(id => loadPack(id).catch(() => undefined)));
}
