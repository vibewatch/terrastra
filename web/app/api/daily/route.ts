import { MAX_GUESSES } from '@src/shared/games/daily.ts';
import { me } from '@/lib/auth.ts';
import { db, insertOnce } from '@/lib/db.ts';
import { body, fail, guard, json } from '@/lib/http.ts';
import { dailyToday } from '@/lib/learning.ts';

export const dynamic = 'force-dynamic';

/** Records today's Daily Planet result (once per puzzle day; the learner's local day may be ±1 from UTC). */
export async function POST(req: Request): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const u = await me(); if (!u) return fail(401, 'Sign in required');
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  const { day, won, guesses } = b, today = dailyToday();
  if (!Number.isInteger(day) || Math.abs((day as number) - today) > 1 || typeof won !== 'boolean'
    || !Number.isInteger(guesses) || (guesses as number) < 1 || (guesses as number) > MAX_GUESSES) return fail(400, 'Bad result');
  const recorded = await insertOnce(db().dailyResult.create({ data: { userId: u.id, day: day as number, won, guesses: guesses as number } }));
  if (recorded) await db().learningEvent.create({ data: { userId: u.id, type: 'daily', ref: String(day), data: { won, guesses: guesses as number } } });
  return json({ ok: true, recorded });
}

export async function GET(): Promise<Response> {
  const u = await me(); if (!u) return fail(401, 'Sign in required');
  const rows = await db().dailyResult.findMany({ where: { userId: u.id }, orderBy: { day: 'desc' }, take: 60, select: { day: true, won: true, guesses: true } });
  return json({ results: rows });
}
