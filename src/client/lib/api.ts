import type { Progress } from '../../shared/lib/progress.ts';
import type { Catalogue, Finished, Graded, Home, QuizResponse, Subject, WireLesson } from '../../shared/lessons/wire.ts';
import { HAS_API, url } from './env.ts';

export interface Me { id: string; email: string; handle: string | null }
export interface GuestbookEntry { id: number; handle: string; body: string; created_at: string }

/** A failed request: `signin` when it needs an account. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly signin = false) { super(message); }
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText, signin = false;
    try { const b = (await res.json()) as { error?: string; signin?: boolean }; msg = b.error ?? msg; signin = !!b.signin; } catch { /* not json */ }
    throw new ApiError(msg, res.status, signin || res.status === 401);
  }
  return (await res.json()) as T;
}
const opt = (method: string, body?: unknown): RequestInit => ({ method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
const get = <T>(path: string) => fetch(url(path), opt('GET')).then(r => j<T>(r));
const post = <T>(path: string, body: unknown = {}) => fetch(url(path), opt('POST', body)).then(r => j<T>(r));

/** NextAuth's form posts (they need its CSRF token). */
async function authPost(path: string, fields: Record<string, string>): Promise<{ url: string }> {
  const { csrfToken } = await get<{ csrfToken: string }>('api/auth/csrf');
  const res = await fetch(url(path), {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, csrfToken, json: 'true' }),
  });
  return j<{ url: string }>(res);
}

/** The learner's home, as the server reads it (it looks the country's name up itself). */
export const homeWire = (h: Home) => ({ ll: h.ll, climate: h.climate, biome: h.biome, a2: h.country?.a2 });
const lessonPath = (id: string, what: string) => `api/lessons/${encodeURIComponent(id)}/${what}`;

export const api = {
  async me(): Promise<Me | null> { if (!HAS_API) return null; try { return (await get<{ user: Me | null }>('api/me')).user; } catch { return null; } },
  /** E-mails a sign-in link that comes back to the hash route `back`; in development the link comes back too. */
  async requestLink(email: string, back = 'signed-in'): Promise<{ devLink?: string }> {
    const r = await authPost('api/auth/signin/email', { email, callbackUrl: new URL(url('#' + back), location.href).href });
    if (/[?&]error=/.test(r.url)) throw new ApiError(new URL(r.url).searchParams.get('error') ?? 'error', 400);
    const dev = await fetch(url('api/dev/mailbox?email=' + encodeURIComponent(email.trim().toLowerCase())), opt('GET')).catch(() => null);
    return dev?.ok ? { devLink: ((await dev.json()) as { url: string }).url } : {};
  },
  logout: () => authPost('api/auth/signout', { callbackUrl: location.href }),
  setHandle: (handle: string) => fetch(url('api/profile'), opt('PUT', { handle })).then(r => j<{ user: Me }>(r)),
  deleteAccount: () => fetch(url('api/me'), opt('DELETE')).then(r => j<{ ok: true }>(r)),
  getProgress: () => get<{ progress: Progress | null }>('api/progress'),
  syncProgress: (p: Progress) => fetch(url('api/progress'), opt('PUT', { progress: p })).then(r => j<{ progress: Progress }>(r)),
  reactions: (key: string) => get<{ like: number; visited: number }>('api/reactions?key=' + encodeURIComponent(key)),
  react: (key: string, kind: 'like' | 'visited', on: boolean) => post<{ like: number; visited: number }>('api/reactions', { key, kind, on }),
  guestbook: () => get<{ entries: GuestbookEntry[] }>('api/guestbook'),
  post: (body: string) => post<{ entry: GuestbookEntry }>('api/guestbook', { body }),
  report: (id: number) => post<{ ok: true }>(`api/guestbook/${id}/report`),
  daily: (day: number, won: boolean, guesses: number) => post<{ ok: true }>('api/daily', { day, won, guesses }),

  // ---- lessons: content, grading and records live on the server ----
  catalogue: (sub: Subject) => get<Catalogue>('api/lessons?subject=' + sub),
  startLesson: (id: string, home?: Home) => post<{ lesson: WireLesson; attempt: string | null }>(lessonPath(id, 'start'), home ? { home: homeWire(home) } : {}),
  answer: (id: string, b: { attempt: string | null; k: number; response: QuizResponse; home?: Home }) =>
    post<Graded>(lessonPath(id, 'answer'), { ...b, home: b.home && homeWire(b.home) }),
  lab: (id: string, b: { attempt: string | null; step: number; params: Record<string, number>; value: number; home?: Home }) =>
    post<{ done: boolean[] }>(lessonPath(id, 'lab'), { ...b, home: b.home && homeWire(b.home) }),
  step: (id: string, attempt: string, step: number) => post<{ ok: true }>(lessonPath(id, 'step'), { attempt, step }),
  finish: (id: string, b: { attempt: string | null; score: number; home?: Home }) =>
    post<Finished>(lessonPath(id, 'finish'), { ...b, home: b.home && homeWire(b.home) }),
};
