import { db, insertOnce } from '@/lib/db.ts';
import { limiter } from '@src/server/rules.ts';
import { clientIp, fail, guard, json, knownVisitor, visitor } from '@/lib/http.ts';

export const dynamic = 'force-dynamic';

const limit = limiter(10, 3600_000);

/** A visitor flags a note; three flags hide it. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const bad = await guard(req, false); if (bad) return bad;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1 || id > 2 ** 31 - 1) return fail(400, 'Bad id');
  if (!limit(await clientIp())) return fail(429, 'Too many requests, try again later');
  // only a visitor seen before counts, so clearing cookies can't add flag after flag
  const known = await knownVisitor();
  await visitor();
  if (!known) return json({ ok: true });
  const v = known;
  const p = db();
  if (!(await p.guestbookEntry.findUnique({ where: { id }, select: { id: true } }))) return json({ ok: true });
  // one flag per visitor (the unique key decides), then count it; the last step is idempotent
  if (await insertOnce(p.guestbookReport.create({ data: { entryId: id, visitor: v } }))) {
    await p.guestbookEntry.update({ where: { id }, data: { reports: { increment: 1 } } });
    await p.guestbookEntry.updateMany({ where: { id, reports: { gte: 3 } }, data: { hidden: true } });
  }
  return json({ ok: true });
}
