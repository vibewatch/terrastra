import type { CatalogueItem } from '../data/types.ts';

/** Festivals start glowing this many days before they begin and keep glowing this long after they end. */
export const LEAD_DAYS = 3;
const DAY_MS = 864e5;

/** Whole-day number for a calendar date (timezone/DST independent). */
const dayNum = (y: number, m0: number, d: number) => Math.round(Date.UTC(y, m0, d) / DAY_MS);
const localDay = (date: Date) => dayNum(date.getFullYear(), date.getMonth(), date.getDate());

type Seasonal = Pick<CatalogueItem, 'season'>;

/** Start day numbers of the festival in the years around `date` (so Dec 31 → Jan 2 wraps correctly). */
function starts(s: NonNullable<CatalogueItem['season']>, date: Date): number[] {
  const y = date.getFullYear();
  return [y - 1, y, y + 1].map(yy => dayNum(yy, s.month - 1, s.day));
}

/** True if the festival is on now: within [start − LEAD_DAYS, start + days + LEAD_DAYS). */
export function isHappening(item: Seasonal, date: Date = new Date()): boolean {
  const s = item.season;
  if (!s) return false;
  const today = localDay(date);
  const len = Math.max(1, s.days ?? 1);
  return starts(s, date).some(st => today >= st - LEAD_DAYS && today < st + len + LEAD_DAYS);
}
