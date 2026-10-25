import { content, labCheck } from '@src/server/lessons.ts';
import { limiter } from '@src/server/rules.ts';
import { body, clientIp, fail, guard, json } from '@/lib/http.ts';
import { access, attemptOf, homeOf, recordLab } from '@/lib/learning.ts';

export const dynamic = 'force-dynamic';
const limit = limiter(600, 60_000);

/** Which tasks of a lab step the learner's slider settings do (the rules stay on the server). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const a = await access((await ctx.params).id); if (a instanceof Response) return a;
  const { lesson, user } = a;
  if (!limit(user?.id ?? await clientIp())) return fail(429, 'Slow down a little!');
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  const run = user ? await attemptOf(user, lesson.id, b.attempt) : null;
  const c = content(lesson, homeOf(run, b.home));
  const step = b.step;
  if (!c || !Number.isInteger(step) || (step as number) < 0 || (step as number) >= c.steps.length) return fail(400, 'Bad step');
  const done = labCheck(c.steps[step as number], b.params, b.value);
  if (!done) return fail(400, 'Bad lab');
  if (user) await recordLab(user, lesson.id, step as number, done);
  return json({ done });
}
