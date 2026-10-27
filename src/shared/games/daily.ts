import { haversineKm, bearingDeg, arrow8 } from '../lib/geo.ts';
import { mulberry32, shuffle } from '../lib/rng.ts';
import type { CatalogueItem } from '../data/types.ts';

export const MAX_GUESSES = 6;
const HIT_KM = 200;
const EPOCH = Date.UTC(2026, 0, 1);
const SEED = 4242;
const MIN_NEIGHBOUR_KM = 1200;

/** Frozen, seeded order where consecutive days are ≥1200 km apart (greedy repair). */
export function buildPool(items: CatalogueItem[]): CatalogueItem[] {
  const base = shuffle(items.filter(i => i.type === 'landmark').sort((a, b) => a.key.localeCompare(b.key)), mulberry32(SEED));
  const out: CatalogueItem[] = [];
  const rest = base.slice();
  while (rest.length) {
    const prev = out[out.length - 1];
    let idx = prev ? rest.findIndex(r => haversineKm(prev.lat, prev.lon, r.lat, r.lon) >= MIN_NEIGHBOUR_KM) : 0;
    if (idx < 0) idx = 0;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

export function dayIndex(now: Date = new Date()): number {
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((local - EPOCH) / 86400000);
}

export function puzzleFor(pool: CatalogueItem[], day: number): CatalogueItem {
  return pool[((day % pool.length) + pool.length) % pool.length];
}

type Band = 'hit' | 'warm' | 'mild' | 'cold';
export const BAND_EMOJI: Record<Band, string> = { hit: '🟩', warm: '🟨', mild: '🟧', cold: '🟥' };

export interface GuessResult { key: string; km: number; band: Band; arrow: string }

export function evaluate(target: { lat: number; lon: number }, guess: { key: string; lat: number; lon: number }): GuessResult {
  const km = haversineKm(guess.lat, guess.lon, target.lat, target.lon);
  const band: Band = km <= HIT_KM ? 'hit' : km > 3000 ? 'cold' : km > 1000 ? 'mild' : 'warm';
  return { key: guess.key, km, band, arrow: band === 'hit' ? '🎯' : arrow8(bearingDeg(guess.lat, guess.lon, target.lat, target.lon)) };
}

/** Hints unlock after 2, 4 and 5 misses. */
export function hintsUnlocked(misses: number): ('continent' | 'country' | 'name')[] {
  const h: ('continent' | 'country' | 'name')[] = [];
  if (misses >= 2) h.push('continent');
  if (misses >= 4) h.push('country');
  if (misses >= 5) h.push('name');
  return h;
}

export interface DailyState { day: number; guesses: GuessResult[]; done: boolean; won: boolean }
export interface DailyStats { played: number; won: number; streak: number; maxStreak: number; lastWonDay: number | null; dist: number[] }
export const EMPTY_STATS: DailyStats = { played: 0, won: 0, streak: 0, maxStreak: 0, lastWonDay: null, dist: [0, 0, 0, 0, 0, 0] };

export function applyGuess(state: DailyState, r: GuessResult): DailyState {
  if (state.done) return state;
  const guesses = [...state.guesses, r];
  const won = r.band === 'hit';
  return { ...state, guesses, won, done: won || guesses.length >= MAX_GUESSES };
}

export function finishStats(stats: DailyStats, state: DailyState): DailyStats {
  const dist = stats.dist.slice();
  if (state.won) dist[state.guesses.length - 1]++;
  const continuing = stats.lastWonDay === state.day - 1;
  const streak = state.won ? (continuing ? stats.streak + 1 : 1) : 0;
  return { played: stats.played + 1, won: stats.won + (state.won ? 1 : 0), streak, maxStreak: Math.max(stats.maxStreak, streak),
    lastWonDay: state.won ? state.day : stats.lastWonDay, dist };
}

export function shareText(state: DailyState, title = 'Terrastra Daily'): string {
  const n = state.day + 1;
  const rows = state.guesses.map(g => BAND_EMOJI[g.band] + g.arrow).join('\n');
  return `${title} #${n} ${state.won ? state.guesses.length : 'X'}/${MAX_GUESSES}\n${rows}`;
}
