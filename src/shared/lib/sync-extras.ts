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
