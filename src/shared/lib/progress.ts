import type { DailyStats } from '../games/daily.ts';
import { EMPTY_STATS } from '../games/daily.ts';
import type { PlaceItRecord } from '../games/placeit.ts';

export type Stamp = Record<string, number>;
export interface Progress {
  v: 1;
  dex: Stamp; logs: Stamp; likes: Stamp; visited: Stamp; stickers: Stamp;
  /** collectables of the newer types (dinos, foods, festivals, …) */
  found: Stamp;
  /** passport stamps: every item whose card was opened */
  seen: Stamp;
  placeit: Record<string, PlaceItRecord>;
  quiz: { answered: number; correct: number; bySet: Record<string, number> };
  daily: DailyStats;
  updatedAt: number;
}

export function emptyProgress(): Progress {
  return { v: 1, dex: {}, logs: {}, likes: {}, visited: {}, stickers: {}, found: {}, seen: {}, placeit: {}, quiz: { answered: 0, correct: 0, bySet: {} },
    daily: { ...EMPTY_STATS, dist: [...EMPTY_STATS.dist] }, updatedAt: 0 };
}

function unionEarliest(a: Stamp = {}, b: Stamp = {}): Stamp {
  const out: Stamp = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? Math.min(out[k], v) : v;
  return out;
}

/**
 * likes/visited are toggles: a key holds when it was last switched on, or minus when it was last switched off, so
 * an "un-like" survives a merge with a device that still has the like.
 */
export const isOn = (m: Stamp | undefined, key: string): boolean => (m?.[key] ?? 0) > 0;
export const countOn = (m: Stamp | undefined): number => Object.values(m ?? {}).filter(v => v > 0).length;

/** per key, the latest switch wins (whichever side it came from) */
function latestToggle(a: Stamp = {}, b: Stamp = {}): Stamp {
  const out: Stamp = { ...a };
  for (const [k, v] of Object.entries(b)) if (!(k in out) || Math.abs(v) > Math.abs(out[k])) out[k] = v;
  return out;
}

/**
 * Conflict-free merge used for device <-> server sync: collections are unioned keeping the earliest
 * timestamp, records keep the maximum, counters keep the maximum (they only grow on a single device).
 * likes/visited are toggles: the latest switch of each key wins.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const placeit: Record<string, PlaceItRecord> = { ...a.placeit };
  for (const [k, r] of Object.entries(b.placeit ?? {})) {
    const p = placeit[k];
    placeit[k] = p ? { best: Math.max(p.best, r.best), plays: Math.max(p.plays, r.plays) } : r;
  }
  const bySet: Record<string, number> = { ...a.quiz?.bySet };
  for (const [k, v] of Object.entries(b.quiz?.bySet ?? {})) bySet[k] = Math.max(bySet[k] ?? 0, v);
  const da = a.daily ?? EMPTY_STATS, db = b.daily ?? EMPTY_STATS;
  const dailyNewer = (da.lastWonDay ?? -1) >= (db.lastWonDay ?? -1) ? da : db;
  return {
    v: 1,
    dex: unionEarliest(a.dex, b.dex), logs: unionEarliest(a.logs, b.logs), stickers: unionEarliest(a.stickers, b.stickers),
    found: unionEarliest(a.found, b.found), seen: unionEarliest(a.seen, b.seen),
    likes: latestToggle(a.likes, b.likes), visited: latestToggle(a.visited, b.visited),
    placeit,
    quiz: { answered: Math.max(a.quiz?.answered ?? 0, b.quiz?.answered ?? 0), correct: Math.max(a.quiz?.correct ?? 0, b.quiz?.correct ?? 0), bySet },
    daily: {
      played: Math.max(da.played, db.played), won: Math.max(da.won, db.won), streak: dailyNewer.streak,
      maxStreak: Math.max(da.maxStreak, db.maxStreak), lastWonDay: dailyNewer.lastWonDay,
      dist: da.dist.map((v, i) => Math.max(v, db.dist?.[i] ?? 0)),
    },
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
  };
}

const STAMPS = ['dex', 'logs', 'likes', 'visited', 'stickers', 'found', 'seen'] as const;
/** Stamp maps are capped well above the catalogue's size, so a client can't grow a stored record without bound. */
const MAX_STAMPS = 5000;
const isStamp = (m: unknown, required: boolean): boolean => m === undefined ? !required
  : !!m && typeof m === 'object' && !Array.isArray(m) && Object.keys(m).length <= MAX_STAMPS
    && Object.entries(m).every(([k, v]) => k.length <= 64 && typeof v === 'number' && Number.isFinite(v));

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** The merge maps over `dist` and takes maxima of the counters, so every field must be a real number. */
const isDaily = (d: unknown): boolean => {
  if (!d || typeof d !== 'object') return false;
  const s = d as DailyStats;
  return num(s.played) && num(s.won) && num(s.streak) && num(s.maxStreak) && (s.lastWonDay === null || num(s.lastWonDay))
    && Array.isArray(s.dist) && s.dist.length === EMPTY_STATS.dist.length && s.dist.every(num);
};

export function isProgress(x: unknown): x is Progress {
  if (!x || typeof x !== 'object') return false;
  const p = x as Progress;
  return p.v === 1 && STAMPS.every(k => isStamp(p[k], k === 'dex' || k === 'logs' || k === 'stickers'))
    && (p.placeit === undefined || (!!p.placeit && typeof p.placeit === 'object' && Object.keys(p.placeit).length <= 100
      && Object.values(p.placeit).every(r => !!r && Number.isFinite(r.best) && Number.isFinite(r.plays))))
    && (p.quiz === undefined || (!!p.quiz && Number.isFinite(p.quiz.answered) && Number.isFinite(p.quiz.correct) && isStamp(p.quiz.bySet, false)))
    && (p.daily === undefined || isDaily(p.daily))
    && (p.updatedAt === undefined || Number.isFinite(p.updatedAt));
}
