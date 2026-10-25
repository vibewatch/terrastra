import { body, fail, guard, json } from '@/lib/http.ts';
import { access, reachStep } from '@/lib/learning.ts';

export const dynamic = 'force-dynamic';

/** The learner reached step `step` (1-based) of the lesson. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const a = await access((await ctx.params).id); if (a instanceof Response) return a;
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  const step = b.step;
  if (!Number.isInteger(step) || (step as number) < 1 || (step as number) > 200) return fail(400, 'Bad step');
  if (a.user) await reachStep(a.user, a.lesson.id, step as number);
  return json({ ok: true });
}
