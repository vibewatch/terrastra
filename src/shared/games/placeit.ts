import { haversineKm } from '../lib/geo.ts';
import { shuffle } from '../lib/rng.ts';
import type { CatalogueItem } from '../data/types.ts';

export type Difficulty = 'practice' | 'easy' | 'medium' | 'hard';
interface DiffCfg { tiers: number; fullKm: number; zeroKm: number; hints: number; names: boolean }

export const ROUNDS = 10;
const MAX_ROUND_SCORE = 1000;
export const DIFFS: Record<Difficulty, DiffCfg> = {
  practice: { tiers: 1, fullKm: 1000, zeroKm: 5000, hints: 10, names: true },
  easy: { tiers: 1, fullKm: 500, zeroKm: 3000, hints: 3, names: false },
  medium: { tiers: 2, fullKm: 150, zeroKm: 1500, hints: 2, names: false },
  hard: { tiers: 3, fullKm: 30, zeroKm: 500, hints: 1, names: false },
};

/** Distance after subtracting the allowance for very large sites (canyons, reefs, walls). */
export function effectiveKm(item: Pick<CatalogueItem, 'lat' | 'lon' | 'area'>, lat: number, lon: number): number {
  return Math.max(0, haversineKm(item.lat, item.lon, lat, lon) - (item.area ?? 0));
}

export function scoreFor(km: number, cfg: Pick<DiffCfg, 'fullKm' | 'zeroKm'>): number {
  if (km <= cfg.fullKm) return MAX_ROUND_SCORE;
  if (km >= cfg.zeroKm) return 0;
  const t = (km - cfg.fullKm) / (cfg.zeroKm - cfg.fullKm);
  return Math.round(MAX_ROUND_SCORE * Math.pow(1 - t, 1.6));
}

export function verdict(score: number): 'perfect' | 'great' | 'good' | 'tryAgain' {
  return score >= 1000 ? 'perfect' : score >= 700 ? 'great' : score >= 300 ? 'good' : 'tryAgain';
}

export function pickRounds(pool: CatalogueItem[], diff: Difficulty, rnd: () => number = Math.random, n = ROUNDS): CatalogueItem[] {
  const cfg = DIFFS[diff];
  const eligible = pool.filter(i => !i.route && i.tier <= cfg.tiers);
  const src = eligible.length >= n ? eligible : pool.filter(i => !i.route);
  return shuffle(src, rnd).slice(0, n);
}

export interface PlaceItRecord { best: number; plays: number }
export function updateRecord(rec: PlaceItRecord | undefined, total: number): { rec: PlaceItRecord; isNew: boolean } {
  const prev = rec ?? { best: 0, plays: 0 };
  const isNew = total > prev.best;
  return { rec: { best: Math.max(prev.best, total), plays: prev.plays + 1 }, isNew };
}
