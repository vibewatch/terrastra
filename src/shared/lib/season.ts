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

export interface UpcomingFestival<T extends Seasonal = CatalogueItem> {
  item: T;
  happeningNow: boolean;
  daysUntil: number;
}

/**
 * Returns seasonal items (festivals) sorted by what is happening right now (`daysUntil === 0`)
 * followed by the next upcoming celebrations on the calendar within the next 365 days.
 */
export function upcomingFestivals<T extends Seasonal>(
  items: readonly T[],
  date: Date = new Date(),
  limit = 4,
): UpcomingFestival<T>[] {
  const today = localDay(date);
  const out: UpcomingFestival<T>[] = [];
  for (const item of items) {
    const s = item.season;
    if (!s) continue;
    const len = Math.max(1, s.days ?? 1);
    const sts = starts(s, date);
    let happeningNow = false;
    let bestDays = Infinity;
    for (const st of sts) {
      if (today >= st - LEAD_DAYS && today < st + len + LEAD_DAYS) {
        happeningNow = true;
        bestDays = 0;
        break;
      }
      if (st > today && st - today < bestDays) {
        bestDays = st - today;
      }
    }
    if (Number.isFinite(bestDays)) {
      out.push({ item, happeningNow, daysUntil: happeningNow ? 0 : bestDays });
    }
  }
  out.sort((a, b) => a.daysUntil - b.daysUntil);
  return out.slice(0, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 4)));
}

export type HemisphereSeason = 'spring' | 'summer' | 'autumn' | 'winter' | 'tropical';

/**
 * Astronomical hemisphere season at `latDeg` on `date` (`|lat| < 15°` returns `'tropical'`).
 * Northern and Southern hemispheres are mirror-inverted across equinoxes/solstices.
 */
export function astronomicalSeasonAt(latDeg: number, date: Date = new Date()): HemisphereSeason {
  if (Math.abs(latDeg) < 15) return 'tropical';
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const md = m * 100 + d;
  // North season boundaries (~Mar 20, Jun 21, Sep 22, Dec 21)
  let north: Exclude<HemisphereSeason, 'tropical'>;
  if (md >= 320 && md < 621) north = 'spring';
  else if (md >= 621 && md < 922) north = 'summer';
  else if (md >= 922 && md < 1221) north = 'autumn';
  else north = 'winter';
  if (latDeg >= 0) return north;
  return north === 'spring' ? 'autumn'
    : north === 'summer' ? 'winter'
    : north === 'autumn' ? 'spring'
    : 'summer';
}

