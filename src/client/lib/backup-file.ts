/** The progress backup file format (pure: no DOM, no store). */
import { countOn, emptyProgress, isProgress, mergeProgress, type Progress } from '../../shared/lib/progress.ts';

const KIND = 'terrastra-progress';

interface Backup { kind: typeof KIND; v: 1; at: number; progress: Progress }

export function backupOf(p: Progress, at = Date.now()): Backup { return { kind: KIND, v: 1, at, progress: p }; }

/** The progress in a backup file, or null when it is not one (nothing is changed then). */
export function readBackup(text: string): Progress | null {
  try {
    const x = JSON.parse(text) as Partial<Backup>;
    if (x?.kind !== KIND || x.v !== 1 || !isProgress(x.progress)) return null;
    // fill fields a future/older version may lack, so a merge never meets undefined
    return mergeProgress(emptyProgress(), x.progress);
  } catch { return null; }
}

const n = (o: Record<string, unknown> | undefined) => Object.keys(o ?? {}).length;
/** What a progress holds, for the preview. */
export function summary(p: Progress): { seen: number; found: number; stickers: number; likes: number } {
  return { seen: n(p.seen), found: n(p.dex) + n(p.logs) + n(p.found), stickers: n(p.stickers), likes: countOn(p.likes) };
}
