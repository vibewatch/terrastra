import { content, parseHome, wireLesson } from '@src/server/lessons.ts';
import { body, devLogin, fail, guard, json } from '@/lib/http.ts';
import { access, startRun } from '@/lib/learning.ts';

export const dynamic = 'force-dynamic';

/**
 * Starts a run of a lesson: the lesson in the wire format and, signed in, the attempt its answers are recorded
 * under. A "where I live" lesson comes back empty (`build: true`) until the request says where home is.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const a = await access((await ctx.params).id); if (a instanceof Response) return a;
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  const { lesson, user } = a;
  const home = b.home === undefined ? null : parseHome(b.home);
  if (b.home !== undefined && !home) return fail(400, 'Bad home');
  const built = lesson.build && home ? content(lesson, home)! : undefined;
  const attempt = user && (!lesson.build || home) ? await startRun(user, lesson, home) : null;
  return json({ lesson: wireLesson(lesson, { dev: devLogin(), built }), attempt });
}
