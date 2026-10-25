import { me } from '@/lib/auth.ts';
import { fail, json } from '@/lib/http.ts';
import { stats } from '@/lib/learning.ts';

export const dynamic = 'force-dynamic';

/** The learner's dashboard numbers. */
export async function GET(req: Request): Promise<Response> {
  const u = await me(); if (!u) return fail(401, 'Sign in required');
  return json(await stats(u, new URL(req.url).searchParams.get('lang') === 'zh'));
}
