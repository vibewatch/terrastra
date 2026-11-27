import { maskLicenseEmail } from './entitlements.ts';

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

// ============================================================================
// Wrong-Question Notebook (错题本 / Mistake Book)
// ============================================================================

export type BiPair = [string, string];
export type ReadonlyBiPair = readonly [string, string];

export interface MistakeQuizInput {
  q: ReadonlyBiPair;
  why: ReadonlyBiPair;
  tag?: ReadonlyBiPair;
  sec?: ReadonlyBiPair;
  options?: readonly ReadonlyBiPair[];
  answer?: number;
  multi?: readonly number[];
  order?: readonly ReadonlyBiPair[];
  match?: readonly (readonly [ReadonlyBiPair, ReadonlyBiPair])[];
  num?: { answer: number; tol: number; unit?: ReadonlyBiPair };
  place?: readonly { text: ReadonlyBiPair; at: [number, number]; tolKm?: number }[];
  at?: [number, number];
  tolKm?: number;
  a2?: string;
}

export interface MistakeQuizSnapshot {
  q: BiPair;
  why: BiPair;
  tag?: BiPair;
  sec?: BiPair;
  options?: BiPair[];
  answer?: number;
  multi?: number[];
  order?: BiPair[];
  match?: [BiPair, BiPair][];
  num?: { answer: number; tol: number; unit?: BiPair };
  place?: { text: BiPair; at: [number, number]; tolKm?: number }[];
  at?: [number, number];
  tolKm?: number;
  a2?: string;
}

export interface MistakeEntry {
  /** Deterministic key: `${lessonId}::${q[0]}` */
  key: string;
  /** Lesson or exam ID where the question was missed */
  lessonId: string;
  /** Question prompt `[en, zh]` */
  q: BiPair;
  /** Explanation `[en, zh]` */
  why: BiPair;
  /** Optional topic tag `[en, zh]` */
  tag?: BiPair;
  /** Formatted correct answer summary `[en, zh]` */
  rightText: BiPair;
  /** JSON-serializable snapshot of the interactive question */
  snapshot: MistakeQuizSnapshot;
  /** Total times answered wrong */
  wrongCount: number;
  /** Consecutive correct answers in review sessions */
  reviewStreak: number;
  /** True once answered correctly during review (`reviewStreak >= 1`) */
  mastered: boolean;
  /** Timestamp (ms) when last missed */
  lastMissedAt: number;
  /** Timestamp (ms) of most recent miss or review */
  updatedAt: number;
}

export type MistakeBook = Record<string, MistakeEntry>;

const MAX_MISTAKE_ENTRIES = 300;

const cleanPair = (p: readonly [string, string], max = 360): BiPair => [
  String(p[0] ?? '').slice(0, max),
  String(p[1] ?? '').slice(0, max),
];

export function mistakeKey(lessonId: string, qEn: string): string {
  return `${lessonId.trim().slice(0, 48)}::${qEn.trim().slice(0, 140)}`;
}

/** Builds a concise bilingual summary of the right answer for display in the mistake notebook. */
export function summarizeRightAnswer(s: MistakeQuizSnapshot): BiPair {
  if (s.options && s.multi && s.multi.length > 0) {
    const picked = s.multi.map(i => s.options![i]).filter(Boolean);
    return [picked.map(p => p[0]).join(', '), picked.map(p => p[1]).join('、')];
  }
  if (s.options && typeof s.answer === 'number' && s.options[s.answer]) {
    return cleanPair(s.options[s.answer], 200);
  }
  if (s.order && s.order.length > 0) {
    return [s.order.map(p => p[0]).join(' → '), s.order.map(p => p[1]).join(' → ')];
  }
  if (s.match && s.match.length > 0) {
    return [
      s.match.map(([l, r]) => `${l[0]} → ${r[0]}`).join('; '),
      s.match.map(([l, r]) => `${l[1]} → ${r[1]}`).join('；'),
    ];
  }
  if (s.num) {
    const uEn = s.num.unit ? ` ${s.num.unit[0]}` : '';
    const uZh = s.num.unit ? ` ${s.num.unit[1]}` : '';
    return [`${s.num.answer}${uEn} (±${s.num.tol})`, `${s.num.answer}${uZh}（误差 ±${s.num.tol}）`];
  }
  if (s.place && s.place.length > 0) {
    return [s.place.map(p => p.text[0]).join(', '), s.place.map(p => p.text[1]).join('、')];
  }
  if (s.tag) {
    return cleanPair(s.tag, 160);
  }
  if (s.at) {
    const la = `${Math.abs(s.at[0]).toFixed(1)}°${s.at[0] >= 0 ? 'N' : 'S'}`;
    const lo = `${Math.abs(s.at[1]).toFixed(1)}°${s.at[1] >= 0 ? 'E' : 'W'}`;
    return [`${la}, ${lo}`, `${la}, ${lo}`];
  }
  return ['See explanation', '见解析'];
}

export function sanitizeSnapshot(raw: MistakeQuizInput): MistakeQuizSnapshot {
  const out: MistakeQuizSnapshot = {
    q: cleanPair(raw.q, 320),
    why: cleanPair(raw.why, 480),
  };
  if (raw.tag) out.tag = cleanPair(raw.tag, 120);
  if (raw.sec) out.sec = cleanPair(raw.sec, 120);
  if (Array.isArray(raw.options) && raw.options.length >= 2) {
    out.options = raw.options.slice(0, 8).map(p => cleanPair(p, 180));
    if (Array.isArray(raw.multi) && raw.multi.length > 0) {
      out.multi = raw.multi.filter(i => Number.isInteger(i) && i >= 0 && i < out.options!.length);
    } else if (typeof raw.answer === 'number' && Number.isInteger(raw.answer)) {
      out.answer = Math.max(0, Math.min(out.options.length - 1, raw.answer));
    }
  } else if (Array.isArray(raw.order) && raw.order.length >= 2) {
    out.order = raw.order.slice(0, 8).map(p => cleanPair(p, 160));
  } else if (Array.isArray(raw.match) && raw.match.length >= 2) {
    out.match = raw.match.slice(0, 8).map(([l, r]) => [cleanPair(l, 160), cleanPair(r, 220)]);
  } else if (raw.num && Number.isFinite(raw.num.answer) && Number.isFinite(raw.num.tol) && raw.num.tol > 0) {
    out.num = {
      answer: raw.num.answer,
      tol: raw.num.tol,
      ...(raw.num.unit ? { unit: cleanPair(raw.num.unit, 40) } : {}),
    };
  } else if (Array.isArray(raw.place) && raw.place.length >= 2) {
    out.place = raw.place.slice(0, 8).map(p => ({
      text: cleanPair(p.text, 120),
      at: [Number(p.at[0]) || 0, Number(p.at[1]) || 0],
      ...(typeof p.tolKm === 'number' && Number.isFinite(p.tolKm) ? { tolKm: p.tolKm } : {}),
    }));
  } else if (Array.isArray(raw.at) && raw.at.length === 2 && Number.isFinite(raw.at[0]) && Number.isFinite(raw.at[1])) {
    out.at = [raw.at[0], raw.at[1]];
    if (typeof raw.tolKm === 'number' && Number.isFinite(raw.tolKm)) out.tolKm = raw.tolKm;
    if (typeof raw.a2 === 'string' && raw.a2.length <= 8) out.a2 = raw.a2;
  }
  return out;
}

function pruneMistakeBook(book: MistakeBook): MistakeBook {
  const entries = Object.values(book);
  if (entries.length <= MAX_MISTAKE_ENTRIES) return book;
  entries.sort((a, b) => Number(a.mastered) - Number(b.mastered) || b.updatedAt - a.updatedAt);
  return Object.fromEntries(entries.slice(0, MAX_MISTAKE_ENTRIES).map(e => [e.key, e]));
}

export function recordMistake(
  book: MistakeBook,
  lessonId: string,
  rawSnapshot: MistakeQuizInput,
  now = Date.now(),
): MistakeBook {
  const snapshot = sanitizeSnapshot(rawSnapshot);
  const key = mistakeKey(lessonId, snapshot.q[0]);
  const prev = book[key];
  const updatedAt = Math.max(now, (prev?.updatedAt ?? 0) + 1);
  const rightText = summarizeRightAnswer(snapshot);
  const entry: MistakeEntry = {
    key,
    lessonId: lessonId.trim().slice(0, 48),
    q: snapshot.q,
    why: snapshot.why,
    ...(snapshot.tag ? { tag: snapshot.tag } : {}),
    rightText: [rightText[0].slice(0, 260), rightText[1].slice(0, 260)],
    snapshot,
    wrongCount: (prev?.wrongCount ?? 0) + 1,
    reviewStreak: 0,
    mastered: false,
    lastMissedAt: updatedAt,
    updatedAt,
  };
  return pruneMistakeBook({ ...book, [key]: entry });
}

export function recordMistakeReview(
  book: MistakeBook,
  key: string,
  correct: boolean,
  now = Date.now(),
): MistakeBook {
  const prev = book[key];
  if (!prev) return book;
  const updatedAt = Math.max(now, prev.updatedAt + 1);
  const reviewStreak = correct ? prev.reviewStreak + 1 : 0;
  const entry: MistakeEntry = {
    ...prev,
    wrongCount: correct ? prev.wrongCount : prev.wrongCount + 1,
    reviewStreak,
    mastered: correct ? true : false,
    lastMissedAt: correct ? prev.lastMissedAt : updatedAt,
    updatedAt,
  };
  return { ...book, [key]: entry };
}

export function removeMistake(book: MistakeBook, key: string): MistakeBook {
  if (!(key in book)) return book;
  const next = { ...book };
  delete next[key];
  return next;
}

/** Removes mastered items (optionally scoped by subject/lesson predicate) so learners can keep active mistakes tidy. */
export function clearMasteredMistakes(
  book: MistakeBook,
  filterFn?: (lessonId: string) => boolean,
): MistakeBook {
  const kept: [string, MistakeEntry][] = [];
  for (const [k, v] of Object.entries(book)) {
    if (!isMistakeEntry(v)) continue;
    if (v.mastered && (!filterFn || filterFn(v.lessonId))) continue;
    kept.push([k, v]);
  }
  return Object.fromEntries(kept);
}

/**
 * Formats a printable / copyable Markdown revision sheet from Mistake Notebook entries.
 */
export function formatMistakeSheetMarkdown(
  entries: readonly MistakeEntry[],
  opts: {
    lang?: 'en' | 'zh';
    subjectTitle?: string;
    lessonTitleOf?: (lessonId: string) => string | undefined;
    licensedEmail?: string | null;
    lockedCount?: number;
  } = {},
): string {
  const l = opts.lang ?? 'en';
  const pick = (p: ReadonlyBiPair) => (l === 'zh' ? p[1] : p[0]);
  const todoCount = entries.filter(e => !e.mastered).length;
  const masteredCount = entries.length - todoCount;
  const heading = opts.subjectTitle
    ? (l === 'zh' ? `# 错题复习单 · ${opts.subjectTitle}` : `# Mistake Revision Sheet · ${opts.subjectTitle}`)
    : (l === 'zh' ? '# 错题复习单' : '# Mistake Revision Sheet');
  const summary = l === 'zh'
    ? `> 待复习：${todoCount} 题 · 已掌握：${masteredCount} 题 · 共导出：${entries.length} 题`
    : `> Needs review: ${todoCount} · Mastered: ${masteredCount} · Exported: ${entries.length}`;
  const lines: string[] = [heading, '', summary, ''];

  entries.forEach((e, idx) => {
    const lessonName = opts.lessonTitleOf?.(e.lessonId) ?? e.lessonId;
    const tagStr = e.tag ? ` · ${pick(e.tag)}` : '';
    const statusStr = e.mastered
      ? (l === 'zh' ? `已掌握 ✓（曾错 ${e.wrongCount} 次）` : `Mastered ✓ (missed ×${e.wrongCount})`)
      : (l === 'zh' ? `待复习（错 ${e.wrongCount} 次）` : `Needs review (missed ×${e.wrongCount})`);
    lines.push(`## ${idx + 1}. ${lessonName}${tagStr} — *${statusStr}*`, '', pick(e.q), '');
    if (e.snapshot.options && e.snapshot.options.length > 0) {
      e.snapshot.options.forEach((opt, oi) => {
        const letter = String.fromCharCode(65 + oi);
        lines.push(`- **${letter}.** ${pick(opt)}`);
      });
      lines.push('');
    }
    lines.push(
      l === 'zh' ? `- **正确答案**：${pick(e.rightText)}` : `- **Correct answer**: ${pick(e.rightText)}`,
      l === 'zh' ? `- **解析**：${pick(e.why)}` : `- **Explanation**: ${pick(e.why)}`,
      '',
    );
  });

  if (opts.lockedCount && opts.lockedCount > 0) {
    lines.push(
      l === 'zh'
        ? `> 🔒 另有 ${opts.lockedCount} 道错题解锁寰星 Pro 后可完整导出与复习。`
        : `> 🔒 ${opts.lockedCount} additional mistake(s) available with Terrastra Explorer Pro.`,
      '',
    );
  }
  if (opts.licensedEmail) {
    const masked = maskLicenseEmail(opts.licensedEmail);
    lines.push('---', l === 'zh' ? `*授权账号：${masked}*` : `*Licensed to ${masked}*`, '');
  }
  return lines.join('\n').trim() + '\n';
}

export function listMistakes(
  book: MistakeBook,
  opts?: {
    filterFn?: (lessonId: string) => boolean;
    status?: 'active' | 'mastered' | 'all';
    lessonId?: string;
  },
): MistakeEntry[] {
  const status = opts?.status ?? 'all';
  return Object.values(book)
    .filter(e => {
      if (!isMistakeEntry(e)) return false;
      if (opts?.lessonId && e.lessonId !== opts.lessonId) return false;
      if (opts?.filterFn && !opts.filterFn(e.lessonId)) return false;
      if (status === 'active' && e.mastered) return false;
      if (status === 'mastered' && !e.mastered) return false;
      return true;
    })
    .sort((a, b) => Number(a.mastered) - Number(b.mastered) || b.wrongCount - a.wrongCount || b.lastMissedAt - a.lastMissedAt);
}

function isBiPair(x: unknown, max = 500): x is BiPair {
  return Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string' && x[0].length <= max && x[1].length <= max;
}

export function isMistakeEntry(x: unknown): x is MistakeEntry {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const e = x as MistakeEntry;
  if (typeof e.key !== 'string' || !e.key || e.key.length > 200) return false;
  if (typeof e.lessonId !== 'string' || !e.lessonId || e.lessonId.length > 64) return false;
  if (!isBiPair(e.q, 360) || !isBiPair(e.why, 520) || !isBiPair(e.rightText, 300)) return false;
  if (e.tag !== undefined && !isBiPair(e.tag, 160)) return false;
  if (!e.snapshot || typeof e.snapshot !== 'object' || !isBiPair(e.snapshot.q, 360) || !isBiPair(e.snapshot.why, 520)) return false;
  if (typeof e.wrongCount !== 'number' || !Number.isFinite(e.wrongCount) || e.wrongCount < 1) return false;
  if (typeof e.reviewStreak !== 'number' || !Number.isFinite(e.reviewStreak) || e.reviewStreak < 0) return false;
  if (typeof e.mastered !== 'boolean') return false;
  if (typeof e.lastMissedAt !== 'number' || !Number.isFinite(e.lastMissedAt)) return false;
  if (typeof e.updatedAt !== 'number' || !Number.isFinite(e.updatedAt)) return false;
  return true;
}

export function isMistakeBook(x: unknown): x is MistakeBook {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const entries = Object.entries(x);
  if (entries.length > MAX_MISTAKE_ENTRIES) return false;
  return entries.every(([k, v]) => k.length <= 200 && isMistakeEntry(v) && v.key === k);
}

export function mergeMistakeBook(a: MistakeBook = {}, b: MistakeBook = {}): MistakeBook {
  const out = new Map<string, MistakeEntry>();
  for (const [k, v] of Object.entries(a)) {
    if (isMistakeEntry(v)) out.set(k, v);
  }
  for (const [k, eb] of Object.entries(b)) {
    if (!isMistakeEntry(eb)) continue;
    const ea = out.get(k);
    if (!ea) {
      out.set(k, eb);
      continue;
    }
    const newer = eb.updatedAt >= ea.updatedAt ? eb : ea;
    out.set(k, {
      ...newer,
      wrongCount: Math.max(ea.wrongCount, eb.wrongCount),
      reviewStreak: newer.reviewStreak,
      mastered: newer.mastered,
      lastMissedAt: Math.max(ea.lastMissedAt, eb.lastMissedAt),
      updatedAt: Math.max(ea.updatedAt, eb.updatedAt),
    });
  }
  return pruneMistakeBook(Object.fromEntries(out));
}
