import { db } from '@/lib/db.ts';
import { json } from '@/lib/http.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try { await db().$queryRaw`SELECT 1`; return json({ ok: true }); } catch { return json({ ok: false }, 503); }
}
