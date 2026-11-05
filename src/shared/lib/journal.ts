/**
 * Persistent Learning Journal: tracks per-lesson step progress, quiz/exam scores, attempts, and missed review topics.
 * Pure, conflict-free merge functions allow seamless local persistence and backup export/import.
 */

export interface LessonJournalEntry {
  id: string;
  /** Current step or quiz index when in progress (`0` when at start or after finishing). */
  stepIndex: number;
  /** Total steps + quiz questions in the lesson. */
  totalSteps: number;
  /** Best score achieved on the lesson quiz/exam (`null` if not yet finished). */
  bestScore: number | null;
  /** Most recent score achieved on the lesson quiz/exam (`null` if not yet finished). */
  lastScore: number | null;
  /** Total points in the quiz/exam (`0` if not yet finished). */
  quizTotal: number;
  /** Number of completed attempts. */
  attempts: number;
  /** Bilingual missed review topics `[en, zh][]` from the latest attempt. */
  missedTopics: [string, string][];
  /** Timestamp (ms) when first completed, or `null` if incomplete. */
  completedAt: number | null;
  /** Timestamp (ms) of most recent activity. */
  updatedAt: number;
}

export type LessonJournal = Record<string, LessonJournalEntry>;

const MAX_JOURNAL_ENTRIES = 500;

export function recordLessonStep(
  journal: LessonJournal,
  id: string,
  stepIndex: number,
  totalSteps: number,
  now = Date.now(),
): LessonJournal {
  const prev = journal[id];
  const updatedAt = Math.max(now, (prev?.updatedAt ?? 0) + 1);
  const entry: LessonJournalEntry = {
    id,
    stepIndex: Math.max(0, Math.min(totalSteps, Math.floor(stepIndex))),
    totalSteps: Math.max(1, Math.floor(totalSteps)),
    bestScore: prev?.bestScore ?? null,
    lastScore: prev?.lastScore ?? null,
    quizTotal: prev?.quizTotal ?? 0,
    attempts: prev?.attempts ?? 0,
    missedTopics: prev?.missedTopics ?? [],
    completedAt: prev?.completedAt ?? null,
    updatedAt,
  };
  return { ...journal, [id]: entry };
}

export function recordLessonFinish(
  journal: LessonJournal,
  id: string,
  score: number,
  quizTotal: number,
  missedTopics: readonly (readonly [string, string])[],
  totalSteps: number,
  now = Date.now(),
): LessonJournal {
  const prev = journal[id];
  const updatedAt = Math.max(now, (prev?.updatedAt ?? 0) + 1);
  const cleanScore = Math.max(0, Math.floor(score));
  const cleanTotal = Math.max(1, Math.floor(quizTotal));
  const bestScore = prev?.bestScore !== null && prev?.bestScore !== undefined
    ? Math.max(prev.bestScore, cleanScore)
    : cleanScore;
  const dedupMissed: [string, string][] = [];
  const seen = new Set<string>();
  for (const pair of missedTopics) {
    if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') continue;
    const key = `${pair[0]}|${pair[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupMissed.push([pair[0].slice(0, 80), pair[1].slice(0, 80)]);
    if (dedupMissed.length >= 12) break;
  }
  const entry: LessonJournalEntry = {
    id,
    stepIndex: 0,
    totalSteps: Math.max(1, Math.floor(totalSteps)),
    bestScore,
    lastScore: cleanScore,
    quizTotal: cleanTotal,
    attempts: (prev?.attempts ?? 0) + 1,
    missedTopics: dedupMissed,
    completedAt: prev?.completedAt ?? updatedAt,
    updatedAt,
  };
  return { ...journal, [id]: entry };
}

export function mergeLessonJournal(a: LessonJournal = {}, b: LessonJournal = {}): LessonJournal {
  const out = new Map<string, LessonJournalEntry>();
  for (const [k, v] of Object.entries(a)) {
    if (isLessonJournalEntry(v)) out.set(k, v);
  }
  for (const [k, eb] of Object.entries(b)) {
    if (!isLessonJournalEntry(eb)) continue;
    const ea = out.get(k);
    if (!ea) {
      out.set(k, eb);
      continue;
    }
    const newer = eb.updatedAt >= ea.updatedAt ? eb : ea;
    const bestScore = ea.bestScore !== null && eb.bestScore !== null
      ? Math.max(ea.bestScore, eb.bestScore)
      : (ea.bestScore ?? eb.bestScore);
    const completedAt = ea.completedAt !== null && eb.completedAt !== null
      ? Math.min(ea.completedAt, eb.completedAt)
      : (ea.completedAt ?? eb.completedAt);
    out.set(k, {
      id: k,
      stepIndex: newer.stepIndex,
      totalSteps: Math.max(ea.totalSteps, eb.totalSteps),
      bestScore,
      lastScore: newer.lastScore ?? ea.lastScore ?? eb.lastScore,
      quizTotal: newer.quizTotal || ea.quizTotal || eb.quizTotal,
      attempts: Math.max(ea.attempts, eb.attempts),
      missedTopics: newer.missedTopics,
      completedAt,
      updatedAt: Math.max(ea.updatedAt, eb.updatedAt),
    });
  }
  return Object.fromEntries(out);
}

function isLessonJournalEntry(x: unknown): x is LessonJournalEntry {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const e = x as LessonJournalEntry;
  if (typeof e.id !== 'string' || !e.id || e.id.length > 64) return false;
  if (typeof e.stepIndex !== 'number' || !Number.isFinite(e.stepIndex) || e.stepIndex < 0) return false;
  if (typeof e.totalSteps !== 'number' || !Number.isFinite(e.totalSteps) || e.totalSteps < 1) return false;
  if (e.bestScore !== null && (typeof e.bestScore !== 'number' || !Number.isFinite(e.bestScore) || e.bestScore < 0)) return false;
  if (e.lastScore !== null && (typeof e.lastScore !== 'number' || !Number.isFinite(e.lastScore) || e.lastScore < 0)) return false;
  if (typeof e.quizTotal !== 'number' || !Number.isFinite(e.quizTotal) || e.quizTotal < 0) return false;
  if (typeof e.attempts !== 'number' || !Number.isFinite(e.attempts) || e.attempts < 0) return false;
  if (e.completedAt !== null && (typeof e.completedAt !== 'number' || !Number.isFinite(e.completedAt))) return false;
  if (typeof e.updatedAt !== 'number' || !Number.isFinite(e.updatedAt)) return false;
  if (!Array.isArray(e.missedTopics) || e.missedTopics.length > 20) return false;
  return e.missedTopics.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string');
}

export function isLessonJournal(x: unknown): x is LessonJournal {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const entries = Object.entries(x);
  if (entries.length > MAX_JOURNAL_ENTRIES) return false;
  return entries.every(([k, v]) => k.length <= 64 && isLessonJournalEntry(v) && v.id === k);
}

/** Finds the most recently active in-progress lesson (or most recently completed lesson if none is mid-step). */
export function pickContinueLesson(
  journal: LessonJournal,
  filterFn?: (id: string) => boolean,
): LessonJournalEntry | null {
  const entries = Object.values(journal).filter(e => isLessonJournalEntry(e) && (!filterFn || filterFn(e.id)));
  if (entries.length === 0) return null;
  const inProgress = entries.filter(e => e.stepIndex > 0 && e.stepIndex < e.totalSteps);
  if (inProgress.length > 0) {
    inProgress.sort((a, b) => b.updatedAt - a.updatedAt);
    return inProgress[0];
  }
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries[0];
}
