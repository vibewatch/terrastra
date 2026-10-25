import { catalogue } from '@src/server/lessons.ts';
import type { Catalogue } from '@src/shared/lessons/wire.ts';
import { me } from '@/lib/auth.ts';
import { fail, json } from '@/lib/http.ts';
import { marks } from '@/lib/learning.ts';

export const dynamic = 'force-dynamic';

/** A subject's curricula and lesson list; signed in, with the learner's marks. */
export async function GET(req: Request): Promise<Response> {
  const sub = new URL(req.url).searchParams.get('subject');
  if (sub !== 'geo' && sub !== 'astro') return fail(400, 'subject is geo or astro');
  const user = await me();
  const out: Catalogue = { ...catalogue(sub), signedIn: !!user };
  if (user) out.marks = await marks(user, sub);
  return json(out);
}
