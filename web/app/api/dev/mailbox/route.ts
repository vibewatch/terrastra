import { mailbox } from '@/lib/auth.ts';
import { devLogin, fail, json } from '@/lib/http.ts';

export const dynamic = 'force-dynamic';

/** Development and tests only: the last sign-in link sent to an address. */
export async function GET(req: Request): Promise<Response> {
  if (!devLogin()) return fail(404, 'Not found');
  const email = (new URL(req.url).searchParams.get('email') ?? '').trim().toLowerCase();
  const url = mailbox().get(email);
  return url ? json({ url }) : fail(404, 'No mail');
}
