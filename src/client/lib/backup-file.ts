/** The progress backup file format (pure: no DOM, no store). */
import { countOn, emptyProgress, isProgress, mergeProgress, type Progress } from '../../shared/lib/progress.ts';
import { isLessonJournal, mergeLessonJournal, type LessonJournal } from '../../shared/lib/journal.ts';

const KIND = 'terrastra-progress';

export interface BackupExtras {
  lessonsDone?: string[];
  lessonJournal?: LessonJournal;
}

export interface Backup {
  kind: typeof KIND;
  v: 1;
  at: number;
  progress: Progress;
  lessonsDone?: string[];
  lessonJournal?: LessonJournal;
}

export function backupOf(p: Progress, at = Date.now(), extras?: BackupExtras): Backup {
  const out: Backup = { kind: KIND, v: 1, at, progress: p };
  if (extras?.lessonsDone?.length) out.lessonsDone = [...new Set(extras.lessonsDone.filter(x => typeof x === 'string' && x.length <= 64))].slice(0, 500);
  if (extras?.lessonJournal && Object.keys(extras.lessonJournal).length > 0 && isLessonJournal(extras.lessonJournal)) {
    out.lessonJournal = extras.lessonJournal;
  }
  return out;
}

export function readBackupFull(text: string): { progress: Progress; lessonsDone: string[]; lessonJournal: LessonJournal } | null {
  try {
    const x = JSON.parse(text) as Partial<Backup>;
    if (x?.kind !== KIND || x.v !== 1 || !isProgress(x.progress)) return null;
    const lessonsDone = Array.isArray(x.lessonsDone)
      ? [...new Set(x.lessonsDone.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64))].slice(0, 500)
      : [];
    const lessonJournal = isLessonJournal(x.lessonJournal) ? mergeLessonJournal({}, x.lessonJournal) : {};
    return {
      progress: mergeProgress(emptyProgress(), x.progress),
      lessonsDone,
      lessonJournal,
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
