/** The progress backup file format (pure: no DOM, no store). */
import { countOn, emptyProgress, isProgress, mergeProgress, type Progress } from '../../shared/lib/progress.ts';
import { isLessonJournal, mergeLessonJournal, type LessonJournal } from '../../shared/lib/journal.ts';
import { encodeView, type Bookmark } from './viewlink.ts';

const KIND = 'terrastra-progress';
const MAX_BOOKMARKS = 40;

export interface BackupExtras {
  lessonsDone?: string[];
  toursDone?: string[];
  lessonJournal?: LessonJournal;
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
  bookmarks?: Bookmark[];
}

export function isBookmark(x: unknown): x is Bookmark {
  if (!x || typeof x !== 'object') return false;
  const b = x as Partial<Bookmark>;
  if (typeof b.route !== 'string' || b.route.length === 0 || b.route.length > 160) return false;
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

export function mergeBookmarks(a: readonly Bookmark[], b: readonly Bookmark[]): Bookmark[] {
  const byKey = new Map<string, Bookmark>();
  for (const list of [a, b]) {
    for (const item of list) {
      if (!isBookmark(item)) continue;
      const k = encodeView(item);
      const prev = byKey.get(k);
      if (!prev || item.at >= prev.at) byKey.set(k, item);
    }
  }
  return [...byKey.values()].sort((x, y) => y.at - aSortTie(x, y)).slice(0, MAX_BOOKMARKS);
}

function aSortTie(x: Bookmark, y: Bookmark): number {
  return x.at !== y.at ? x.at : encodeView(y).localeCompare(encodeView(x));
}

export function backupOf(p: Progress, at = Date.now(), extras?: BackupExtras): Backup {
  const out: Backup = { kind: KIND, v: 1, at, progress: p };
  if (extras?.lessonsDone?.length) out.lessonsDone = [...new Set(extras.lessonsDone.filter(x => typeof x === 'string' && x.length <= 64))].slice(0, 500);
  if (extras?.toursDone?.length) out.toursDone = [...new Set(extras.toursDone.filter(x => typeof x === 'string' && x.length <= 64))].slice(0, 500);
  if (extras?.lessonJournal && Object.keys(extras.lessonJournal).length > 0 && isLessonJournal(extras.lessonJournal)) {
    out.lessonJournal = extras.lessonJournal;
  }
  if (extras?.bookmarks?.length) {
    const valid = mergeBookmarks([], extras.bookmarks);
    if (valid.length > 0) out.bookmarks = valid;
  }
  return out;
}

export function readBackupFull(text: string): {
  progress: Progress;
  lessonsDone: string[];
  toursDone: string[];
  lessonJournal: LessonJournal;
  bookmarks: Bookmark[];
} | null {
  try {
    const x = JSON.parse(text) as Partial<Backup>;
    if (x?.kind !== KIND || x.v !== 1 || !isProgress(x.progress)) return null;
    const lessonsDone = Array.isArray(x.lessonsDone)
      ? [...new Set(x.lessonsDone.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64))].slice(0, 500)
      : [];
    const toursDone = Array.isArray(x.toursDone)
      ? [...new Set(x.toursDone.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64))].slice(0, 500)
      : [];
    const lessonJournal = isLessonJournal(x.lessonJournal) ? mergeLessonJournal({}, x.lessonJournal) : {};
    const bookmarks = Array.isArray(x.bookmarks) ? mergeBookmarks([], x.bookmarks.filter(isBookmark)) : [];
    return {
      progress: mergeProgress(emptyProgress(), x.progress),
      lessonsDone,
      toursDone,
      lessonJournal,
      bookmarks,
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
