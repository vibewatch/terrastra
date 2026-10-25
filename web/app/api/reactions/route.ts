import { BY_KEY } from '@src/shared/data/catalogue.ts';
import { db, insertOnce } from '@/lib/db.ts';
import { body, fail, guard, json, visitor } from '@/lib/http.ts';

export const dynamic = 'force-dynamic';

async function counts(item: string): Promise<{ like: number; visited: number }> {
  const rows = await db().reaction.groupBy({ by: ['kind'], where: { item }, _count: { _all: true } });
  const out = { like: 0, visited: 0 };
  for (const r of rows) out[r.kind] = r._count._all;
  return out;
}

export async function GET(req: Request): Promise<Response> {
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!BY_KEY.has(key)) return fail(404, 'Unknown item');
  return json(await counts(key));
}

/** Anonymous like / "I've been there" marks, one per visitor. */
export async function POST(req: Request): Promise<Response> {
  const bad = await guard(req); if (bad) return bad;
  const b = await body(req); if (!b) return fail(400, 'Bad request');
  const { key, kind, on } = b;
  if (typeof key !== 'string' || !BY_KEY.has(key) || (kind !== 'like' && kind !== 'visited') || typeof on !== 'boolean') return fail(400, 'Bad reaction');
  const v = await visitor();
  if (on) await insertOnce(db().reaction.create({ data: { visitor: v, item: key, kind } }));
  else await db().reaction.deleteMany({ where: { visitor: v, item: key, kind } });
  return json(await counts(key));
}
