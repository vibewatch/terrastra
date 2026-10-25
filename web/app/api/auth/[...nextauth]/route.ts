import NextAuth from 'next-auth';
import { limiter } from '@src/server/rules.ts';
import { authOptions } from '@/lib/auth.ts';
import { clientIp, fail } from '@/lib/http.ts';

const handler = NextAuth(authOptions);
const byIp = limiter(10, 10 * 60_000), byEmail = limiter(5, 10 * 60_000);
type Ctx = { params: Promise<{ nextauth: string[] }> };

/** Sign-in mails are rate-limited per address and per client. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { nextauth } = await ctx.params;
  if (nextauth[0] === 'signin' && nextauth[1] === 'email') {
    const form = await req.clone().formData().catch(() => null);
    const email = String(form?.get('email') ?? '').trim().toLowerCase();
    if (!byIp(await clientIp()) || !byEmail(email)) return fail(429, 'Too many requests, try again later');
  }
  return handler(req, ctx);
}
export const GET = handler;
