/**
 * End-to-end check of the server API against a running full edition (`DEV_LOGIN=1`), on whichever database it uses:
 * guest limits, email sign-in, a graded lesson run, a lab task, the daily puzzle, progress sync, guestbook flags, the dashboard
 * and account deletion.
 *   node scripts/smoke-api.ts http://localhost:3000
 */
import { EPOCH } from '../src/shared/games/daily.ts';
import { emptyProgress } from '../src/shared/lib/progress.ts';

const B = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const jar = new Map<string, string>();
type Res = { s: number; d: any };

async function raw(path: string, init: { method?: string; json?: unknown; form?: Record<string, string>; origin?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { origin: init.origin ?? B, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
  let body: string | undefined;
  if (init.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(init.json); }
  if (init.form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(init.form).toString(); }
  const r = await fetch(B + path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, redirect: 'manual' });
  for (const c of r.headers.getSetCookie()) { const kv = c.split(';')[0], i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
  return r;
}
async function req(path: string, init: Parameters<typeof raw>[1] = {}): Promise<Res> {
  const r = await raw(path, init), t = await r.text();
  let d: unknown = t;
  try { d = JSON.parse(t); } catch { /* not JSON */ }
  return { s: r.status, d };
}
let failed = 0;
function ok(cond: unknown, what: string, detail?: unknown): void {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${!cond && detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 300) : ''}`);
  if (!cond) failed++;
}

// ── a guest ──
let r = await req('/api/health');
ok(r.s === 200 && r.d.ok, 'health', r);
const cat = (await req('/api/lessons?subject=astro')).d;
const locked = (Object.values(cat.lessons) as { id: string; free: boolean }[]).find(l => !l.free)!.id;
r = await req('/api/lessons/a-phases/start', { json: {} });
ok(r.s === 200 && r.d.attempt === null && r.d.lesson.quiz.length > 0, 'guest starts a free lesson', r);
const free = r.d.lesson;
r = await req('/api/lessons/a-phases/answer', { json: { k: 0, response: free.dev[0] } });
ok(r.s === 200 && r.d.ok === true, 'guest answer graded', r);
r = await req('/api/lessons/a-phases/finish', { json: { score: 99 } });
ok(r.s === 200 && r.d.recorded === false && r.d.score === free.quiz.length, 'guest finish is not kept, score clamped', r);
r = await req(`/api/lessons/${locked}/start`, { json: {} });
ok(r.s === 401 && r.d.signin, 'other lessons need an account', r);
r = await req('/api/lessons/a-phases/start', { json: {}, origin: 'http://evil.test' });
ok(r.s === 403, 'cross-site request refused', r.s);

// ── sign in by email ──
const email = `smoke.${Date.now()}@example.com`;
const { csrfToken } = (await req('/api/auth/csrf')).d;
r = await req('/api/auth/signin/email', { form: { email, csrfToken, callbackUrl: B + '/#signed-in', json: 'true' } });
ok(r.s === 200 && !String(r.d.url).includes('error'), 'magic link requested', r);
r = await req('/api/dev/mailbox?email=' + encodeURIComponent(email));
ok(r.s === 200 && String(r.d.url).includes('/api/auth/callback/email'), 'magic link in the dev mailbox', r);
const cb = await raw(String(r.d.url).replace(B, ''));
ok(cb.status === 302 && cb.headers.get('location')?.endsWith('/#signed-in'), 'magic link signs in', cb.status);
r = await req('/api/me');
ok(r.s === 200 && r.d.user?.email === email, 'session', r);

// ── a graded, recorded lesson run ──
r = await req(`/api/lessons/${locked}/start`, { json: {} });
ok(r.s === 200 && typeof r.d.attempt === 'string', 'signed-in start', r);
const attempt = r.d.attempt as string, L = r.d.lesson;
const q0 = L.quiz[0], wrong = q0.kind === 'choice' ? { pick: (L.dev[0].pick + 1) % q0.options.length } : null;
for (let k = 0; k < L.quiz.length; k++) {
  if (k === 0 && wrong) {
    await req(`/api/lessons/${locked}/answer`, { json: { attempt, k, response: wrong } });
    r = await req(`/api/lessons/${locked}/answer`, { json: { attempt, k, response: L.dev[0] } });
    ok(r.s === 200, 'a second answer is graded (the first one counts)', r);
  } else {
    r = await req(`/api/lessons/${locked}/answer`, { json: { attempt, k, response: L.dev[k] } });
    ok(r.s === 200 && r.d.ok, `answer key ${k} is right`, r);
  }
}
r = await req(`/api/lessons/${locked}/answer`, { json: { attempt, k: 0, response: { seq: 'x' } } });
ok(r.s === 400, 'malformed answer refused', r.s);
await req(`/api/lessons/${locked}/step`, { json: { attempt, step: 2 } });
r = await req(`/api/lessons/${locked}/finish`, { json: { attempt, score: 999 } });
const want = L.quiz.length - (wrong ? 1 : 0);
ok(r.s === 200 && r.d.recorded && r.d.score === want && r.d.best === want, 'finish: the server counts the score', r);
r = await req(`/api/lessons/${locked}/finish`, { json: { attempt } });
ok(r.d.score === want, 'finish is idempotent', r);
r = await req('/api/lessons?subject=astro');
ok(r.d.signedIn && r.d.marks[locked]?.done, 'catalogue marks the lesson done', r.d.marks);

// ── a lab task, checked on the server ──
const lab = 'a-gnomon';
r = await req(`/api/lessons/${lab}/start`, { json: {} });
const labAttempt = r.d.attempt as string;
let labDone = false;
for (let step = 0; step < r.d.lesson.steps.length && !labDone; step++) {
  const sol = (await req('/api/dev/lab', { json: { lesson: lab, step, task: 0, value: 0 } })).d;
  if (!sol?.params) continue;
  const res = await req(`/api/lessons/${lab}/lab`, { json: { attempt: labAttempt, step, params: sol.params, value: 0 } });
  labDone = res.s === 200 && res.d.done?.[0] === true;
}
ok(labDone, 'lab task done and checked');

// ── the daily puzzle ──
const day = Math.floor((Date.now() - EPOCH) / 864e5);
r = await req('/api/daily', { json: { day, won: true, guesses: 3 } });
ok(r.s === 200 && r.d.recorded, 'daily result kept', r);
r = await req('/api/daily', { json: { day, won: false, guesses: 6 } });
ok(r.s === 200 && !r.d.recorded, 'daily: the first result stands', r);

// ── progress sync: an unlike on one device wins over the older like on another ──
const t0 = Date.now();
await req('/api/progress', { method: 'PUT', json: { progress: { ...emptyProgress(), likes: { lm_eiffel: t0 } } } });
r = await req('/api/progress', { method: 'PUT', json: { progress: { ...emptyProgress(), likes: { lm_eiffel: -(t0 + 1) } } } });
ok(r.s === 200 && r.d.progress.likes.lm_eiffel < 0, 'progress: the newer unlike wins', r);
r = await req('/api/progress', { method: 'PUT', json: { progress: { ...emptyProgress(), likes: { lm_eiffel: t0 } } } });
ok(r.s === 200 && r.d.progress.likes.lm_eiffel < 0, 'progress: an older like does not undo it', r);
r = await req('/api/progress', { method: 'PUT', json: { progress: { ...emptyProgress(), dex: null } } });
ok(r.s === 400, 'progress: malformed snapshot refused', r.s);

// ── guestbook flags: only visitors seen before count ──
r = await req('/api/guestbook', { json: { body: 'Hello from the smoke test' } });
const note = r.d.entry?.id as number;
ok(r.s === 201 && note > 0, 'guestbook note written', r);
for (let n = 0; n < 3; n++) await fetch(`${B}/api/guestbook/${note}/report`, { method: 'POST', headers: { origin: B } });
r = await req('/api/guestbook');
ok(r.d.entries.some((e: { id: number }) => e.id === note), 'cookieless flags do not hide a note', r);

// ── the dashboard ──
r = await req('/api/me/stats');
ok(r.s === 200 && r.d.recent.some((x: { id: string }) => x.id === locked) && r.d.labs >= 1 && r.d.streak === 1 && r.d.daily.won === 1, 'stats', r);
let page = await raw('/account');
ok(page.status === 200 && (await page.text()).includes('data-testid="kpis"'), 'dashboard page', page.status);

// ── deleting the account ──
r = await req('/api/me', { method: 'DELETE' });
ok(r.s === 200, 'account deleted', r);
page = await raw('/account');
ok(page.status === 307 && page.headers.get('location')?.includes('/signin'), 'dashboard asks to sign in again', page.status);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
