import { HANDLE_RE, isBlocked } from '@src/server/rules.ts';
import { me } from '@/lib/auth.ts';
import { db } from '@/lib/db.ts';
import { body, fail, guard, json } from '@/lib/http.ts';

export const dynamic = 'force-dynamic';

/** Sets the learner's public nickname (and optionally their language). */
export async function PUT(req: Request): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const u = await me(); if (!u) return fail(401, 'Sign in required');
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  const handle = String(b.handle ?? '').trim();
  if (!HANDLE_RE.test(handle)) return fail(400, '2–16 letters, numbers or _');
  if (isBlocked(handle)) return fail(400, 'Please choose a kinder nickname');
  const locale = b.locale === 'en' || b.locale === 'zh' ? b.locale : undefined;
  const key = handle.toLowerCase();
  const taken = await db().user.findFirst({ where: { handleKey: key, NOT: { id: u.id } }, select: { id: true } });
  if (taken) return fail(409, 'That nickname is taken');
  try {
    await db().user.update({ where: { id: u.id }, data: { handle, handleKey: key, ...(locale ? { locale } : {}) } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return fail(409, 'That nickname is taken');
    throw e;
  }
  return json({ user: { ...u, handle } });
}
