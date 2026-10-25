import { content } from '@src/server/lessons.ts';
import type { Finished } from '@src/shared/lessons/wire.ts';
import { body, fail, guard, json } from '@/lib/http.ts';
import { access, attemptOf, finishRun, homeOf } from '@/lib/learning.ts';

export const dynamic = 'force-dynamic';

/** Ends a run: the score (from the answers recorded on the server), the learner's best, and the take-aways. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const a = await access((await ctx.params).id); if (a instanceof Response) return a;
  const { lesson, user } = a;
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  if (user) {
    const run = await attemptOf(user, lesson.id, b.attempt);
    if (!run) return fail(400, 'Unknown attempt');
    const r = await finishRun(user, lesson, run);
    return json({ ...r, keys: lesson.keys, recorded: true } satisfies Finished);
  }
  // a free lesson without an account: nothing is kept
  const total = content(lesson, homeOf(null, b.home))?.quiz.length ?? 0;
  const score = Number.isInteger(b.score) ? Math.max(0, Math.min(total, b.score as number)) : 0;
  return json({ score, total, best: score, keys: lesson.keys, recorded: false } satisfies Finished);
}
