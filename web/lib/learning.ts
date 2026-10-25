/**
 * Learning records: lesson runs (attempts), answers graded on the server, lab tasks, lesson progress, the activity
 * log, Daily Planet results, and the summaries the dashboard shows.
 */
import { catalogue, content, isFree, kindOf, lessonById, parseHome, subjectOf, type Lesson } from '@src/server/lessons.ts';
import { streak } from '@src/server/rules.ts';
import { EPOCH } from '@src/shared/games/daily.ts';
import type { Home, LessonMark, Pair, Subject } from '@src/shared/lessons/wire.ts';
import type { Me } from './auth.ts';
import { me } from './auth.ts';
import { db, insertOnce, type Prisma } from './db.ts';
import { fail } from './http.ts';

export const DAY = 864e5;
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY);

/** The lesson and learner for a lesson request; a 404 or 401 reply when there is no such lesson or it needs an account. */
export async function access(id: string): Promise<{ lesson: Lesson; user: Me | null } | Response> {
  const lesson = lessonById(id);
  if (!lesson) return fail(404, 'No such lesson');
  const user = await me();
  if (!user && !isFree(id)) return Response.json({ error: 'Sign in to take this lesson', signin: true }, { status: 401 });
  return { lesson, user };
}

type Attempt = { id: string; home: Prisma.JsonValue; total: number; score: number | null; startedAt: Date; finishedAt: Date | null };
/** The learner's own run of this lesson. */
export async function attemptOf(user: Me, lessonId: string, id: unknown): Promise<Attempt | null> {
  if (typeof id !== 'string' || id.length > 40) return null;
  return db().quizAttempt.findFirst({ where: { id, userId: user.id, lessonId }, select: { id: true, home: true, total: true, score: true, startedAt: true, finishedAt: true } });
}
/** The home a run was written about (from the run when signed in, from the request otherwise). */
export const homeOf = (a: Attempt | null, fromBody: unknown): Home | null => parseHome(a ? a.home : fromBody);

/** A new run: the attempt that answers are recorded under, and the lesson's progress row. */
export async function startRun(user: Me, lesson: Lesson, home: Home | null): Promise<string | null> {
  const c = content(lesson, home);
  if (!c) return null;
  const now = new Date();
  const [a] = await db().$transaction([
    db().quizAttempt.create({ data: { userId: user.id, lessonId: lesson.id, total: c.quiz.length, home: home ? home as unknown as Prisma.InputJsonValue : undefined }, select: { id: true } }),
    db().lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
      create: { userId: user.id, lessonId: lesson.id, subject: subjectOf(lesson.id), steps: c.steps.length, quizSize: c.quiz.length, stepReached: 1 },
      update: { lastAt: now, steps: c.steps.length, quizSize: c.quiz.length },
    }),
    db().learningEvent.create({ data: { userId: user.id, type: 'lesson.start', ref: lesson.id } }),
  ]);
  return a.id;
}

/** How far into the steps the learner got (only ever grows). */
export async function reachStep(user: Me, lessonId: string, step: number): Promise<void> {
  await db().lessonProgress.updateMany({ where: { userId: user.id, lessonId, stepReached: { lt: step } }, data: { stepReached: step, lastAt: new Date() } });
}

/** Keeps the first answer to each question of a run. */
export async function recordAnswer(a: Attempt, k: number, kind: string, correct: boolean, response: unknown): Promise<void> {
  if (a.finishedAt) return;
  await insertOnce(db().quizAnswer.create({ data: { attemptId: a.id, index: k, kind, correct, response: response as Prisma.InputJsonValue } }));
}

export async function recordLab(user: Me, lessonId: string, step: number, done: boolean[]): Promise<void> {
  for (const [task, d] of done.entries()) if (d) await insertOnce(db().labTaskCompletion.create({ data: { userId: user.id, lessonId, step, task } }));
}

/** Ends a run: its score from the recorded answers, the learner's best, time spent, and the activity log. */
export async function finishRun(user: Me, lesson: Lesson, a: Attempt): Promise<{ score: number; total: number; best: number }> {
  const p = db();
  if (a.finishedAt) {
    const row = await p.lessonProgress.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } }, select: { bestScore: true } });
    return { score: a.score ?? 0, total: a.total, best: row?.bestScore ?? a.score ?? 0 };
  }
  return p.$transaction(async tx => {
    const score = await tx.quizAnswer.count({ where: { attemptId: a.id, correct: true } });
    const now = new Date(), secs = Math.min(7200, Math.max(0, Math.round((now.getTime() - a.startedAt.getTime()) / 1000)));
    const done = await tx.quizAttempt.updateMany({ where: { id: a.id, finishedAt: null }, data: { finishedAt: now, score } });
    const prev = await tx.lessonProgress.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } } });
    const best = Math.max(prev?.bestScore ?? 0, score);
    if (!done.count) return { score, total: a.total, best };
    await tx.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
      create: { userId: user.id, lessonId: lesson.id, subject: subjectOf(lesson.id), status: 'COMPLETED', bestScore: score, lastScore: score, quizSize: a.total, completions: 1, timeSpentS: secs, completedAt: now, stepReached: lesson.steps.length },
      update: { status: 'COMPLETED', bestScore: best, lastScore: score, quizSize: a.total, completions: { increment: 1 }, timeSpentS: { increment: secs }, completedAt: prev?.completedAt ?? now, lastAt: now, stepReached: Math.max(prev?.stepReached ?? 0, prev?.steps ?? 0) },
    });
    await tx.learningEvent.create({ data: { userId: user.id, type: 'lesson.finish', ref: lesson.id, data: { score, total: a.total } } });
    return { score, total: a.total, best };
  });
}

/** The learner's mark on each lesson they started, for the catalogue. */
export async function marks(user: Me, sub: Subject): Promise<Record<string, LessonMark>> {
  const rows = await db().lessonProgress.findMany({ where: { userId: user.id, subject: sub } });
  return Object.fromEntries(rows.map(r => [r.lessonId, { done: r.status === 'COMPLETED', best: r.bestScore, of: r.quizSize, step: r.stepReached }]));
}

export interface CourseBar { name: Pair; done: number; total: number }
export interface Stats {
  user: { email: string; handle: string | null; since: string };
  subjects: { subject: Subject; done: number; started: number; total: number; view: { name: Pair }; groups: CourseBar[] }[];
  recent: { id: string; title: Pair; icon: string; done: boolean; best: number; of: number; at: string }[];
  quiz: { answered: number; correct: number };
  labs: number;
  minutes: number;
  streak: number;
  /** activity per day, oldest first, ending today */
  days: number[];
  daily: { played: number; won: number; streak: number };
}

/** Everything the dashboard shows. `zh` picks the default curriculum of each subject. */
export async function stats(user: Me, zh: boolean): Promise<Stats> {
  const p = db(), today = dayOf(new Date()), since = new Date((today - 365) * DAY);
  const [u, rows, answered, correct, labs, events, daily] = await Promise.all([
    p.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, handle: true, createdAt: true } }),
    p.lessonProgress.findMany({ where: { userId: user.id }, orderBy: { lastAt: 'desc' } }),
    p.quizAnswer.count({ where: { attempt: { userId: user.id } } }),
    p.quizAnswer.count({ where: { attempt: { userId: user.id }, correct: true } }),
    p.labTaskCompletion.count({ where: { userId: user.id } }),
    p.learningEvent.findMany({ where: { userId: user.id, at: { gte: since } }, select: { at: true } }),
    p.dailyResult.findMany({ where: { userId: user.id }, select: { day: true, won: true } }),
  ]);
  const doneIds = new Set(rows.filter(r => r.status === 'COMPLETED').map(r => r.lessonId));
  const subjects = (['geo', 'astro'] as const).map(sub => {
    const cat = catalogue(sub), v = cat.views.find(x => x.id === (zh ? cat.def.zh : cat.def.en)) ?? cat.views[0];
    const all = Object.keys(cat.lessons);
    return {
      subject: sub, total: all.length, done: all.filter(id => doneIds.has(id)).length,
      started: rows.filter(r => r.subject === sub).length,
      view: { name: v.name },
      groups: v.groups.map(g => ({ name: g.name, total: g.lessons.length, done: g.lessons.filter(id => doneIds.has(id)).length })),
    };
  });
  const title = (id: string) => catalogue(subjectOf(id)).lessons[id];
  const recent = rows.slice(0, 8).flatMap(r => {
    const s = title(r.lessonId);
    return s ? [{ id: r.lessonId, title: s.title, icon: s.icon, done: r.status === 'COMPLETED', best: r.bestScore, of: r.quizSize, at: r.lastAt.toISOString() }] : [];
  });
  const active = new Map<number, number>();
  for (const e of events) { const d = dayOf(e.at); active.set(d, (active.get(d) ?? 0) + 1); }
  return {
    user: { email: u.email ?? '', handle: u.handle, since: u.createdAt.toISOString() },
    subjects, recent,
    quiz: { answered, correct }, labs,
    minutes: Math.round(rows.reduce((s, r) => s + r.timeSpentS, 0) / 60),
    streak: streak(active.keys(), today),
    days: Array.from({ length: 28 }, (_, i) => active.get(today - 27 + i) ?? 0),
    daily: { played: daily.length, won: daily.filter(d => d.won).length, streak: streak(daily.filter(d => d.won).map(d => d.day), dailyToday()) },
  };
}

/** Daily Planet days are counted from its epoch, in days. */
export const DAILY_EPOCH_DAY = EPOCH / DAY;
export const dailyToday = (): number => dayOf(new Date()) - DAILY_EPOCH_DAY;

export { kindOf };
