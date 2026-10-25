/** Small helpers for the route handlers: JSON replies, same-origin checks, bodies, the visitor cookie, client IPs. */
import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';

export const json = (body: unknown, status = 200): Response => Response.json(body, { status });
export const fail = (status: number, error: string): Response => json({ error }, status);

/**
 * Mutating calls must come from this site: a cross-origin `Origin` is refused (CSRF), and bodies must be JSON
 * (a form post from another site cannot send that content type without a preflight).
 */
export async function guard(req: Request, needsJson = req.method !== 'DELETE'): Promise<Response | null> {
  const origin = req.headers.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* "null" or malformed */ }
    if (host !== req.headers.get('host') && host !== publicHost()) return fail(403, 'Bad origin');
  }
  if (needsJson && !(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return fail(415, 'JSON required');
  return null;
}

/** The site's public host (from NEXTAUTH_URL), which a proxy in front may not pass on as `Host`. */
function publicHost(): string {
  try { return process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : ''; } catch { return ''; }
}

/** The JSON body as an object (`{}` when empty or not an object); `null` when it is malformed or too big. */
export async function body(req: Request, max = 64 * 1024): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > max) return null;
  if (!text) return {};
  try { const v: unknown = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}; } catch { return null; }
}

const secure = () => process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1';
/** The anonymous visitor id (likes, reports): random, kept for a year. */
export async function visitor(): Promise<string> {
  const jar = await cookies();
  let v = jar.get('pp_vid')?.value;
  if (!v || !/^[a-f0-9]{32}$/.test(v)) {
    v = randomBytes(16).toString('hex');
    jar.set('pp_vid', v, { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', maxAge: 365 * 24 * 3600 });
  }
  return v;
}

/** The visitor id only if the browser already had one (a fresh id per request would make every call look new). */
export async function knownVisitor(): Promise<string | null> {
  const v = (await cookies()).get('pp_vid')?.value;
  return v && /^[a-f0-9]{32}$/.test(v) ? v : null;
}

/** The client's address, for rate limits: the first `X-Forwarded-For` hop (set by Next or the proxy in front). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

/** `DEV_LOGIN=1` (local development and end-to-end tests only): sign-in links are shown, not mailed, and tests may read answer keys. */
export const devLogin = (): boolean => process.env.DEV_LOGIN === '1';
