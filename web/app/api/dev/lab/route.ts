import { content, labSolve, lessonById, parseHome } from '@src/server/lessons.ts';
import { body, devLogin, fail, json } from '@/lib/http.ts';

export const dynamic = 'force-dynamic';

/** Development and tests only: slider settings that do a lab task. */
export async function POST(req: Request): Promise<Response> {
  if (!devLogin()) return fail(404, 'Not found');
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  const lesson = lessonById(String(b.lesson));
  const c = lesson && content(lesson, parseHome(b.home));
  if (!c || !Number.isInteger(b.step) || !Number.isInteger(b.task) || typeof b.value !== 'number') return fail(400, 'Bad request');
  return json({ params: labSolve(c.steps[b.step as number], b.task as number, b.value) });
}
