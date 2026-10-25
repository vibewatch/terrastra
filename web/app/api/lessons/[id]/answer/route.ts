import { content, grade, kindOf } from '@src/server/lessons.ts';
import { limiter } from '@src/server/rules.ts';
import { body, clientIp, fail, guard, json } from '@/lib/http.ts';
import { access, attemptOf, homeOf, recordAnswer } from '@/lib/learning.ts';

export const dynamic = 'force-dynamic';
const limit = limiter(240, 60_000);

/** Grades an answer to question `k`; signed in, the first answer to each question of the run is kept. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const a = await access((await ctx.params).id); if (a instanceof Response) return a;
  const { lesson, user } = a;
  if (!limit(user?.id ?? await clientIp())) return fail(429, 'Slow down a little!');
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  const run = user ? await attemptOf(user, lesson.id, b.attempt) : null;
  if (user && !run) return fail(400, 'Unknown attempt');
  const c = content(lesson, homeOf(run, b.home));
  const k = b.k;
  if (!c || !Number.isInteger(k) || (k as number) < 0 || (k as number) >= c.quiz.length) return fail(400, 'Bad question');
  const q = c.quiz[k as number];
  const g = grade(lesson.id, q, k as number, b.response);
  if (!g) return fail(400, 'Bad answer');
  if (run) await recordAnswer(run, k as number, kindOf(q), g.ok, b.response);
  return json(g);
}
