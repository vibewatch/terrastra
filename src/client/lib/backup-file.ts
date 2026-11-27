/** The progress backup file format (pure: no DOM, no store). */
import { countOn, emptyProgress, isProgress, mergeProgress, type Progress } from '../../shared/lib/progress.ts';
import { isLessonJournal, isMistakeBook, type LessonJournal, type MistakeBook } from '../../shared/lib/journal.ts';
import { isSyncBookmark, mergeSyncBookmarks, sanitizeSyncExtras } from '../../shared/lib/sync-extras.ts';
import type { Bookmark } from './viewlink.ts';

const KIND = 'terrastra-progress';

export interface BackupExtras {
  lessonsDone?: string[];
  toursDone?: string[];
  lessonJournal?: LessonJournal;
  mistakeBook?: MistakeBook;
  bookmarks?: Bookmark[];
}

export interface Backup {
  kind: typeof KIND;
  v: 1;
  at: number;
  progress: Progress;
  lessonsDone?: string[];
  toursDone?: string[];
  lessonJournal?: LessonJournal;
  mistakeBook?: MistakeBook;
  bookmarks?: Bookmark[];
}

export function isBookmark(x: unknown): x is Bookmark {
  return isSyncBookmark(x);
}

export function mergeBookmarks(a: readonly Bookmark[], b: readonly Bookmark[]): Bookmark[] {
  return mergeSyncBookmarks(a, b);
}

export function backupOf(p: Progress, at = Date.now(), extras?: BackupExtras): Backup {
  const out: Backup = { kind: KIND, v: 1, at, progress: p };
  const clean = sanitizeSyncExtras(extras ?? {});
  if (clean.lessonsDone?.length) out.lessonsDone = clean.lessonsDone;
  if (clean.toursDone?.length) out.toursDone = clean.toursDone;
  if (clean.lessonJournal && Object.keys(clean.lessonJournal).length > 0 && isLessonJournal(clean.lessonJournal)) {
    out.lessonJournal = clean.lessonJournal;
  }
  if (clean.mistakeBook && Object.keys(clean.mistakeBook).length > 0 && isMistakeBook(clean.mistakeBook)) {
    out.mistakeBook = clean.mistakeBook;
  }
  if (clean.bookmarks?.length) out.bookmarks = clean.bookmarks;
  return out;
}

export function readBackupFull(text: string): {
  exportedAt: number | null;
  progress: Progress;
  lessonsDone: string[];
  toursDone: string[];
  lessonJournal: LessonJournal;
  mistakeBook: MistakeBook;
  bookmarks: Bookmark[];
} | null {
  try {
    const x = JSON.parse(text) as Partial<Backup>;
    if (x?.kind !== KIND || x.v !== 1 || !isProgress(x.progress)) return null;
    const exportedAt = typeof x.at === 'number' && Number.isFinite(x.at) && x.at > 0 ? x.at : null;
    const clean = sanitizeSyncExtras(x);
    return {
      exportedAt,
      progress: mergeProgress(emptyProgress(), x.progress),
      lessonsDone: clean.lessonsDone ?? [],
      toursDone: clean.toursDone ?? [],
      lessonJournal: clean.lessonJournal ?? {},
      mistakeBook: clean.mistakeBook ?? {},
      bookmarks: clean.bookmarks ?? [],
    };
  } catch { return null; }
}

/** The progress in a backup file, or null when it is not one (nothing is changed then). */
export function readBackup(text: string): Progress | null {
  return readBackupFull(text)?.progress ?? null;
}

const n = (o: Record<string, unknown> | undefined) => Object.keys(o ?? {}).length;
/** What a progress holds, for the preview. */
export function summary(p: Progress): { seen: number; found: number; stickers: number; likes: number } {
  return { seen: n(p.seen), found: n(p.dex) + n(p.logs) + n(p.found), stickers: n(p.stickers), likes: countOn(p.likes) };
}
