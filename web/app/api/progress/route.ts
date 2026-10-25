import { emptyProgress, isProgress, mergeProgress, type Progress } from '@src/shared/lib/progress.ts';
import { me } from '@/lib/auth.ts';
import { db } from '@/lib/db.ts';
import { body, fail, guard, json } from '@/lib/http.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const u = await me(); if (!u) return fail(401, 'Sign in required');
  const row = await db().progressSnapshot.findUnique({ where: { userId: u.id } });
  return json({ progress: row ? row.data as unknown as Progress : null });
}

/** Merges the device's collections into the account's (conflict-free) and returns the result. */
export async function PUT(req: Request): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const u = await me(); if (!u) return fail(401, 'Sign in required');
  const b = await body(req, 256 * 1024); if (!b) return fail(400, 'Bad request');
  if (!isProgress(b.progress)) return fail(400, 'Invalid progress');
  const merged = await db().$transaction(async tx => {
    const row = await tx.progressSnapshot.findUnique({ where: { userId: u.id } });
    const m = mergeProgress(row ? row.data as unknown as Progress : emptyProgress(), b.progress as Progress);
    const data = m as unknown as object;
    await tx.progressSnapshot.upsert({ where: { userId: u.id }, create: { userId: u.id, data }, update: { data } });
    return m;
  });
  return json({ progress: merged });
}
