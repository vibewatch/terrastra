/**
 * Shared conflict-free validation and merge for extended learning cloud sync (`SyncExtras`):
 * completed lessons/tours, Learning Journal, Mistake Notebook, and saved view bookmarks.
 */
import type { I18n } from '../data/types.ts';
import { FREE_MISTAKE_LIMIT, hasProAccess, type Plan } from './entitlements.ts';
import {
  isLessonJournal,
  isMistakeBook,
  mergeLessonJournal,
  mergeMistakeBook,
  type LessonJournal,
  type MistakeBook,
} from './journal.ts';

export interface SyncBookmark {
  route: string;
  cam?: { lat: number; lon: number; h: number };
  label: I18n;
  at: number;
}

export interface SyncExtras {
  lessonsDone?: string[];
  toursDone?: string[];
  lessonJournal?: LessonJournal;
  mistakeBook?: MistakeBook;
  bookmarks?: SyncBookmark[];
}

const MAX_ID_LIST = 500;
const MAX_BOOKMARKS = 40;

export function bookmarkKey(v: { route: string; cam?: { lat: number; lon: number; h: number } }): string {
  const c = v.cam;
  return v.route + (c ? `@v1:${c.lat.toFixed(2)},${c.lon.toFixed(2)},${c.h.toFixed(3)}` : '');
}

export function isSyncBookmark(x: unknown): x is SyncBookmark {
  if (!x || typeof x !== 'object') return false;
  const b = x as Partial<SyncBookmark>;
  if (typeof b.route !== 'string' || b.route.length > 160) return false;
  if (b.route.length === 0 && b.cam === undefined) return false;
  if (typeof b.at !== 'number' || !Number.isFinite(b.at) || b.at < 0) return false;
  if (!b.label || typeof b.label !== 'object' || typeof b.label.en !== 'string' || b.label.en.length > 160) return false;
  if (b.label.zh !== undefined && (typeof b.label.zh !== 'string' || b.label.zh.length > 160)) return false;
  if (b.cam !== undefined) {
    if (!b.cam || typeof b.cam !== 'object') return false;
    const { lat, lon, h } = b.cam;
    if (![lat, lon, h].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || h <= 0 || h > 20) return false;
  }
  return true;
}

export function mergeSyncBookmarks(a: readonly SyncBookmark[] = [], b: readonly SyncBookmark[] = []): SyncBookmark[] {
  const byKey = new Map<string, SyncBookmark>();
  for (const list of [a, b]) {
    for (const item of list) {
      if (!isSyncBookmark(item)) continue;
      const k = bookmarkKey(item);
      const prev = byKey.get(k);
      if (!prev || item.at >= prev.at) byKey.set(k, item);
    }
  }
  return [...byKey.values()]
    .sort((x, y) => (y.at !== x.at ? y.at - x.at : bookmarkKey(x).localeCompare(bookmarkKey(y))))
    .slice(0, MAX_BOOKMARKS);
}

function isIdList(x: unknown): x is string[] {
  return Array.isArray(x)
    && x.length <= MAX_ID_LIST
    && x.every(id => typeof id === 'string' && id.length > 0 && id.length <= 64);
}

function mergeIdList(a: readonly string[] = [], b: readonly string[] = []): string[] {
  const out = new Set<string>();
  for (const list of [a, b]) {
    for (const id of list) {
      if (typeof id === 'string' && id.length > 0 && id.length <= 64) out.add(id);
      if (out.size >= MAX_ID_LIST) break;
    }
  }
  return [...out];
}

export function isSyncExtras(x: unknown): x is SyncExtras {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const e = x as Record<string, unknown>;
  if (e.lessonsDone !== undefined && !isIdList(e.lessonsDone)) return false;
  if (e.toursDone !== undefined && !isIdList(e.toursDone)) return false;
  if (e.lessonJournal !== undefined && !isLessonJournal(e.lessonJournal)) return false;
  if (e.mistakeBook !== undefined && !isMistakeBook(e.mistakeBook)) return false;
  if (e.bookmarks !== undefined && (!Array.isArray(e.bookmarks) || e.bookmarks.length > MAX_BOOKMARKS || !e.bookmarks.every(isSyncBookmark))) {
    return false;
  }
  return true;
}

export function emptySyncExtras(): SyncExtras {
  return { lessonsDone: [], toursDone: [], lessonJournal: {}, mistakeBook: {}, bookmarks: [] };
}

/**
 * Coerces arbitrary or partially-corrupt local storage extras into a guaranteed-valid `SyncExtras`
 * (`isSyncExtras(out) === true`) so a single malformed or over-limit local key never blocks cloud sync.
 */
export function sanitizeSyncExtras(raw: unknown): SyncExtras {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptySyncExtras();
  const r = raw as Record<string, unknown>;
  const lessonsDone = Array.isArray(r.lessonsDone) ? mergeIdList([], r.lessonsDone as string[]) : [];
  const toursDone = Array.isArray(r.toursDone) ? mergeIdList([], r.toursDone as string[]) : [];
  const lessonJournal = r.lessonJournal && typeof r.lessonJournal === 'object' && !Array.isArray(r.lessonJournal)
    ? mergeLessonJournal({}, r.lessonJournal as LessonJournal)
    : {};
  const mistakeBook = r.mistakeBook && typeof r.mistakeBook === 'object' && !Array.isArray(r.mistakeBook)
    ? mergeMistakeBook({}, r.mistakeBook as MistakeBook)
    : {};
  const bookmarks = Array.isArray(r.bookmarks) ? mergeSyncBookmarks([], r.bookmarks as SyncBookmark[]) : [];
  return { lessonsDone, toursDone, lessonJournal, mistakeBook, bookmarks };
}

export function mergeSyncExtras(a: SyncExtras = {}, b: SyncExtras = {}): SyncExtras {
  return {
    lessonsDone: mergeIdList(a.lessonsDone, b.lessonsDone),
    toursDone: mergeIdList(a.toursDone, b.toursDone),
    lessonJournal: mergeLessonJournal(a.lessonJournal ?? {}, b.lessonJournal ?? {}),
    mistakeBook: mergeMistakeBook(a.mistakeBook ?? {}, b.mistakeBook ?? {}),
    bookmarks: mergeSyncBookmarks(a.bookmarks ?? [], b.bookmarks ?? []),
  };
}

/**
 * Applies plan-level cloud write limits when the paywall is active:
 * Free users sync completion badges and up to `FREE_MISTAKE_LIMIT` mistakes, while Pro/Classroom
 * users sync full Learning Journal scores, unlimited Mistake Notebook entries, and saved Bookmarks.
 */
export function filterIncomingExtrasForPlan(
  incoming: SyncExtras,
  plan: Plan | null | undefined,
  paywallEnabled: boolean,
): SyncExtras {
  if (hasProAccess(plan, paywallEnabled)) return incoming;
  const cappedMistakes: MistakeBook = {};
  if (incoming.mistakeBook) {
    const sorted = Object.values(incoming.mistakeBook).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, FREE_MISTAKE_LIMIT);
    for (const item of sorted) cappedMistakes[item.key] = item;
  }
  return {
    lessonsDone: incoming.lessonsDone,
    toursDone: incoming.toursDone,
    mistakeBook: cappedMistakes,
  };
}

function payloadBytes(progress: unknown, extras: SyncExtras): number {
  return new TextEncoder().encode(JSON.stringify({ progress, extras })).byteLength;
}

/** Binary-searches the largest prefix `items.slice(0, keep)` that fits within `maxBytes`. */
function maxFittingPrefix<T>(
  items: readonly T[],
  buildCandidate: (kept: T[]) => SyncExtras,
  progress: unknown,
  maxBytes: number,
): T[] {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (payloadBytes(progress, buildCandidate(items.slice(0, mid))) <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return items.slice(0, lo);
}

/**
 * Ensures `{ progress, extras }` fits within `maxBytes` (default 64 KB) so Pro learners with
 * large Mistake Notebooks or Journals keep syncing instead of hitting 413 or silently dropping sync.
 * Trimming priority (least valuable dropped first):
 *   1. Oldest mastered mistakes
 *   2. Oldest completed journal entries (preserving mid-lesson resume positions longest)
 *   3. Oldest saved bookmarks
 *   4. Oldest active (unmastered) mistakes
 */
export function fitSyncExtras(progress: unknown, extras: SyncExtras, maxBytes: number): SyncExtras {
  if (payloadBytes(progress, extras) <= maxBytes) return extras;

  let cur: SyncExtras = {
    ...(extras.lessonsDone ? { lessonsDone: [...extras.lessonsDone] } : {}),
    ...(extras.toursDone ? { toursDone: [...extras.toursDone] } : {}),
    ...(extras.lessonJournal ? { lessonJournal: { ...extras.lessonJournal } } : {}),
    ...(extras.mistakeBook ? { mistakeBook: { ...extras.mistakeBook } } : {}),
    ...(extras.bookmarks ? { bookmarks: [...extras.bookmarks] } : {}),
  };

  // 1. Trim oldest mastered mistakes while keeping all active mistakes.
  if (cur.mistakeBook && Object.keys(cur.mistakeBook).length > 0) {
    const allMistakes = Object.values(cur.mistakeBook);
    const active = allMistakes.filter(m => !m.mastered).sort((a, b) => b.updatedAt - a.updatedAt);
    const mastered = allMistakes.filter(m => m.mastered).sort((a, b) => b.updatedAt - a.updatedAt);
    if (mastered.length > 0) {
      const keptMastered = maxFittingPrefix(
        mastered,
        kept => ({
          ...cur,
          mistakeBook: Object.fromEntries([...active, ...kept].map(m => [m.key, m])),
        }),
        progress,
        maxBytes,
      );
      cur = {
        ...cur,
        mistakeBook: Object.fromEntries([...active, ...keptMastered].map(m => [m.key, m])),
      };
      if (payloadBytes(progress, cur) <= maxBytes) return cur;
    }
  }

  // 2. Trim oldest journal entries (keep in-progress lessons first, then newest updatedAt).
  if (cur.lessonJournal && Object.keys(cur.lessonJournal).length > 0) {
    const sortedJournal = Object.values(cur.lessonJournal).sort((a, b) => {
      const aMid = a.stepIndex > 0 && a.stepIndex < a.totalSteps ? 1 : 0;
      const bMid = b.stepIndex > 0 && b.stepIndex < b.totalSteps ? 1 : 0;
      if (aMid !== bMid) return bMid - aMid;
      return b.updatedAt - a.updatedAt;
    });
    const keptJournal = maxFittingPrefix(
      sortedJournal,
      kept => ({
        ...cur,
        lessonJournal: Object.fromEntries(kept.map(j => [j.id, j])),
      }),
      progress,
      maxBytes,
    );
    cur = {
      ...cur,
      lessonJournal: Object.fromEntries(keptJournal.map(j => [j.id, j])),
    };
    if (payloadBytes(progress, cur) <= maxBytes) return cur;
  }

  // 3. Trim oldest bookmarks.
  if (cur.bookmarks && cur.bookmarks.length > 0) {
    const sortedBm = [...cur.bookmarks].sort((a, b) => b.at - a.at);
    const keptBm = maxFittingPrefix(
      sortedBm,
      kept => ({ ...cur, bookmarks: kept }),
      progress,
      maxBytes,
    );
    cur = { ...cur, bookmarks: keptBm };
    if (payloadBytes(progress, cur) <= maxBytes) return cur;
  }

  // 4. Trim oldest active mistakes if still above budget.
  if (cur.mistakeBook && Object.keys(cur.mistakeBook).length > 0) {
    const sortedActive = Object.values(cur.mistakeBook).sort((a, b) => b.updatedAt - a.updatedAt);
    const keptActive = maxFittingPrefix(
      sortedActive,
      kept => ({
        ...cur,
        mistakeBook: Object.fromEntries(kept.map(m => [m.key, m])),
      }),
      progress,
      maxBytes,
    );
    cur = {
      ...cur,
      mistakeBook: Object.fromEntries(keptActive.map(m => [m.key, m])),
    };
  }

  return cur;
}
