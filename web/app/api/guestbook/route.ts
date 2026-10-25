import { cleanText, isBlocked, limiter } from '@src/server/rules.ts';
import { me } from '@/lib/auth.ts';
import { db } from '@/lib/db.ts';
import { body, fail, guard, json } from '@/lib/http.ts';

export const dynamic = 'force-dynamic';

const postLimit = limiter(5, 60_000);
const entry = (e: { id: number; body: string; createdAt: Date; user: { handle: string | null } | null }) =>
  ({ id: e.id, handle: e.user?.handle ?? 'Explorer', body: e.body, created_at: e.createdAt.toISOString() });
const select = { id: true, body: true, createdAt: true, user: { select: { handle: true } } } as const;

export async function GET(): Promise<Response> {
  const rows = await db().guestbookEntry.findMany({ where: { hidden: false }, orderBy: { id: 'desc' }, take: 50, select });
  return json({ entries: rows.map(entry) });
}

/** Signed-in learners may write a short, friendly note. */
export async function POST(req: Request): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const u = await me(); if (!u) return fail(401, 'Sign in required');
  if (!postLimit(u.id)) return fail(429, 'Slow down a little!');
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  const text = cleanText(String(b.body ?? '')).slice(0, 200);
  if (text.length < 1) return fail(400, 'Write something first');
  if (isBlocked(text)) return fail(400, 'Let’s keep the guestbook friendly');
  const row = await db().guestbookEntry.create({ data: { userId: u.id, body: text }, select });
  return json({ entry: entry(row) }, 201);
}
