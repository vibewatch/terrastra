/** Input rules shared by the API routes: nicknames, guestbook text, e-mail addresses and rate limits. */

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const HANDLE_RE = /^[A-Za-z0-9_\u4E00-\u9FFF]{2,16}$/;
const BLOCKED = ['stupid', 'idiot', 'hate', 'kill', 'dumb', 'shut up', '笨蛋', '白痴', '傻瓜', '滚开'];

/** One line of plain text: no control characters, links replaced, spaces collapsed. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+|www\.\S+/gi, '🔗').replace(/\s+/g, ' ').trim();
}
export function isBlocked(s: string): boolean { const l = s.toLowerCase(); return BLOCKED.some(w => l.includes(w)); }

/** A fixed-window rate limiter: `hit(key)` is false once `max` hits fell in the current window. */
export function limiter(max: number, windowMs: number): (key: string) => boolean {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    if (hits.size > 10_000) for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
    h.n++;
    return h.n <= max;
  };
}

/** Today's streak: consecutive days (UTC day numbers, any order) ending today or yesterday. */
export function streak(days: Iterable<number>, today: number): number {
  const set = new Set(days);
  let d = set.has(today) ? today : today - 1, n = 0;
  while (set.has(d)) { n++; d--; }
  return n;
}
