import { cookies } from 'next/headers';
import { me } from '@/lib/auth.ts';
import { db } from '@/lib/db.ts';
import { fail, guard, json } from '@/lib/http.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return json({ user: await me() });
}

/** Deletes the account and everything recorded about the learner. */
export async function DELETE(req: Request): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const u = await me(); if (!u) return fail(401, 'Sign in required');
  await db().user.delete({ where: { id: u.id } });
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name.endsWith('next-auth.session-token')) jar.delete(c.name);
  return json({ ok: true });
}
