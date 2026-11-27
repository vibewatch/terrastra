import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { openDb, pruneExpiredState, transaction } from '../../src/server/db.ts';
import { createApp, cleanText, isBlocked } from '../../src/server/app.ts';
import { HANDLE_RE } from '../../src/shared/lib/profile.ts';
import { emptyProgress } from '../../src/shared/lib/progress.ts';
import { withContentPolicy } from '../../scripts/csp.ts';
import { limiter } from '../../src/server/rate-limit.ts';

let server: Server, db: ReturnType<typeof openDb>, base = '';
beforeAll(async () => {
  db = openDb(':memory:');
  const app = createApp({ db, devLogin: true, baseUrl: 'http://test', secureCookies: false });
  await new Promise<void>(r => { server = app.listen(0, () => r()); });
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
});
afterAll(() => { server.close(); db.close(); });

const jar = new Map<string, string>();
async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method, redirect: 'manual',
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...extra },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar.set(k, v); else jar.delete(k); }
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, location: res.headers.get('location') };
}

/** Presses "Sign in" on the confirmation page: a same-origin form POST of the link's token, through the cookie jar. */
async function confirmLink(devLink: string, server = base, useJar = true) {
  const token = new URL(devLink).searchParams.get('token')!;
  const res = await fetch(server + '/api/auth/verify', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: server, ...(useJar ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
    body: new URLSearchParams({ token }).toString(),
  });
  const cookies = res.headers.getSetCookie();
  if (useJar) for (const c of cookies) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar.set(k, v); else jar.delete(k); }
  return { status: res.status, location: res.headers.get('location'), sid: cookies.find(c => c.startsWith('pp_sid='))?.split(';')[0] };
}

describe('auth', () => {
  it('rejects bad email, non-JSON and cross-origin writes', async () => {
    expect((await call('POST', '/api/auth/request', { email: 'nope' })).status).toBe(400);
    const r = await fetch(base + '/api/auth/request', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    expect(r.status).toBe(415);
    expect((await call('POST', '/api/auth/request', { email: 'a@b.co' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('POST', '/api/auth/request', { email: 'a@b.co' }, { origin: 'null' })).status).toBe(403);
    expect((await call('POST', '/api/auth/request', { email: 'a@b.co' }, { origin: 'https://test' })).status).toBe(403);
    expect((await call('POST', '/api/auth/request', { email: 'a@b.co' }, { origin: base.replace('http:', 'https:') })).status).toBe(403);
  });
  it('returns JSON errors and security headers for malformed or oversized requests', async () => {
    const send = (body: string) => fetch(base + '/api/auth/request', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    });
    const bad = await send('{');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Invalid JSON' });
    expect(bad.headers.get('x-content-type-options')).toBe('nosniff');
    const large = await send(JSON.stringify({ email: 'x'.repeat(256 * 1024) }));
    expect(large.status).toBe(413);
    expect(await large.json()).toEqual({ error: 'Request is too large' });
    const unsupported = await fetch(base + '/api/auth/request', {
      method: 'POST', headers: { 'content-type': 'application/json; charset=iso-8859-1' }, body: '{}',
    });
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toEqual({ error: 'Unsupported request encoding' });
    const compression = await fetch(base + '/api/auth/request', {
      method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'unknown' }, body: '{}',
    });
    expect(compression.status).toBe(415);
    expect(await compression.json()).toEqual({ error: 'Unsupported request encoding' });
  });
  it('requires a session for private endpoints and probes SQLite on /api/health', async () => {
    expect((await call('GET', '/api/health')).json).toEqual({ ok: true });
    expect((await call('GET', '/api/progress')).status).toBe(401);
    expect((await call('POST', '/api/guestbook', { body: 'hi' })).status).toBe(401);
    expect((await call('GET', '/api/me')).json).toEqual({ user: null });
    expect((await fetch(base + '/api/me')).headers.get('cache-control')).toBe('no-store');

    const closedDb = openDb(':memory:');
    const closedApp = createApp({ db: closedDb, devLogin: true, baseUrl: 'http://test', secureCookies: false });
    const closedSrv: Server = await new Promise(r => { const s = closedApp.listen(0, () => r(s)); });
    try {
      closedDb.close();
      const port = (closedSrv.address() as { port: number }).port;
      const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(healthRes.status).toBe(503);
      expect(await healthRes.json()).toEqual({ ok: false, error: 'Database unavailable' });
    } finally {
      await new Promise<void>(r => closedSrv.close(() => r()));
    }
  });
  it('magic link signs in once; token cannot be reused', async () => {
    const r = await call('POST', '/api/auth/request', { email: 'Kid@Example.com' });
    expect(r.status).toBe(200);
    const path = new URL(r.json.devLink).pathname + new URL(r.json.devLink).search;
    // opening the link (or a mail scanner prefetching it) only shows a confirmation and does not use the token up
    for (let i = 0; i < 2; i++) {
      const page = await fetch(base + path, { redirect: 'manual' });
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toMatch(/text\/html/);
      expect(page.headers.get('content-security-policy')).toContain("form-action 'self'");
      expect(page.headers.getSetCookie().some(c => c.startsWith('pp_sid='))).toBe(false);
      expect(await page.text()).toContain('k•••@example.com');
    }
    // another site cannot press the button for you
    const token = new URL(r.json.devLink).searchParams.get('token')!;
    const form = (origin?: string) => fetch(base + '/api/auth/verify', { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}) }, body: 'token=' + token });
    expect((await form('https://evil.example')).status).toBe(403);
    expect((await form()).status).toBe(403);
    const v = await confirmLink(r.json.devLink);
    expect(v.status).toBe(303); expect(v.location).toBe('/#signed-in');
    expect((await call('GET', '/api/me')).json.user.email).toBe('kid@example.com');
    expect((await confirmLink(r.json.devLink)).location).toBe('/#auth-error');
    const again = await fetch(base + path, { redirect: 'manual' });
    expect(again.headers.get('location')).toBe('/#auth-error');
    expect((await fetch(base + '/api/auth/verify?token=garbage', { redirect: 'manual' })).headers.get('location')).toBe('/#auth-error');
  });
  it('signing in again revokes the browser\'s previous session', async () => {
    const oldSid = jar.get('pp_sid')!;
    const r = await call('POST', '/api/auth/request', { email: 'kid@example.com' });
    await confirmLink(r.json.devLink);
    expect(jar.get('pp_sid')).not.toBe(oldSid);
    expect((await call('GET', '/api/me')).json.user.email).toBe('kid@example.com');
    const stale = await fetch(base + '/api/me', { headers: { cookie: `pp_sid=${oldSid}` } });
    expect((await stale.json()).user).toBeNull();
  });
});

describe('profile, progress, reactions, guestbook', () => {
  it('validates nickname', async () => {
    expect((await call('PUT', '/api/profile', { handle: 'x' })).status).toBe(400);
    expect((await call('PUT', '/api/profile', { handle: 'idiot99' })).status).toBe(400);
    expect((await call('PUT', '/api/profile', { handle: '별여행' })).status).toBe(200);
    expect((await call('PUT', '/api/profile', { handle: 'ほし旅' })).status).toBe(200);
    const ok = await call('PUT', '/api/profile', { handle: '探险家_01' });
    expect(ok.status).toBe(200); expect(ok.json.user.handle).toBe('探险家_01');
  });
  it('a malformed cookie from another app does not break the session; the public origin passes the CSRF check', async () => {
    const mine = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    expect((await call('GET', '/api/me', undefined, { cookie: 'other=%E0%A4%A; ' + mine })).json.user).not.toBeNull();
    expect((await call('PUT', '/api/progress', { progress: emptyProgress() }, { origin: 'http://test' })).status).toBe(200);
  });
  it('merges progress on PUT', async () => {
    const p1 = emptyProgress(); p1.dex = { an_lion: 100 }; p1.updatedAt = 1;
    expect((await call('PUT', '/api/progress', { progress: p1 })).json.progress.dex).toEqual({ an_lion: 100 });
    const p2 = emptyProgress(); p2.dex = { an_panda: 200, an_lion: 50 }; p2.updatedAt = 2;
    const r = await call('PUT', '/api/progress', { progress: p2 });
    expect(r.json.progress.dex).toEqual({ an_lion: 50, an_panda: 200 });
    expect((await call('GET', '/api/progress')).json.progress.dex).toEqual({ an_lion: 50, an_panda: 200 });
    expect((await call('PUT', '/api/progress', { progress: { v: 9 } })).status).toBe(400);
    expect((await call('PUT', '/api/progress', { progress: { ...emptyProgress(), dex: null } })).status).toBe(400);
  });
  it('does not store a merged progress record beyond the allowed size', async () => {
    const first = emptyProgress();
    first.dex = Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`first-${i}`, 1]));
    const saved = await call('PUT', '/api/progress', { progress: first });
    expect(saved.status).toBe(200);
    const second = emptyProgress();
    second.dex = Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`second-${i}`, 1]));
    expect((await call('PUT', '/api/progress', { progress: second })).status).toBe(413);
    expect((await call('GET', '/api/progress')).json.progress.dex).toEqual(saved.json.progress.dex);
  });
  it('keeps merged progress small enough for a later sync request', async () => {
    const keys = (prefix: string) => Object.fromEntries(Array.from({ length: 2000 }, (_, i) =>
      [`${prefix}${String(i).padStart(4, '0')}-${'x'.repeat(52)}`, 1]));
    const first = emptyProgress(); first.logs = keys('a');
    const saved = await call('PUT', '/api/progress', { progress: first });
    expect(saved.status).toBe(200);
    const second = emptyProgress(); second.logs = keys('b');
    expect((await call('PUT', '/api/progress', { progress: second })).status).toBe(413);
    expect((await call('GET', '/api/progress')).json.progress.logs).toEqual(saved.json.progress.logs);
  });
  it('two valid uploads whose merge is too large are trimmed instead of blocking sync forever', async () => {
    const seen = (prefix: string, t0: number) => Object.fromEntries(Array.from({ length: 2800 }, (_, i) => [`${prefix}_${i}`.padEnd(60, 'x'), t0 + i]));
    const a = emptyProgress(); a.dex = { an_lion: 100 }; a.seen = seen('a', 1000);
    const b = emptyProgress(); b.seen = seen('b', 50_000);
    expect((await call('PUT', '/api/progress', { progress: a })).status).toBe(200);
    const merged = await call('PUT', '/api/progress', { progress: b });
    expect(merged.status).toBe(200);
    expect(merged.json.progress.dex.an_lion).toBeGreaterThan(0); // the collection survives the trim
    expect(Object.keys(merged.json.progress.seen).length).toBeLessThan(5600);
    // and the next sync goes through
    expect((await call('PUT', '/api/progress', { progress: emptyProgress() })).status).toBe(200);
  });
  it('reactions are idempotent per visitor and validated', async () => {
    expect((await call('POST', '/api/reactions', { key: 'eiffel', kind: 'like', on: true })).json).toEqual({ like: 1, visited: 0 });
    expect((await call('POST', '/api/reactions', { key: 'eiffel', kind: 'like', on: true })).json).toEqual({ like: 1, visited: 0 });
    expect((await call('POST', '/api/reactions', { key: 'eiffel', kind: 'like', on: false })).json).toEqual({ like: 0, visited: 0 });
    expect((await call('POST', '/api/reactions', { key: 'nope', kind: 'like', on: true })).status).toBe(400);
    expect((await call('POST', '/api/reactions', { key: 'eiffel', kind: 'love', on: true })).status).toBe(400);
  });
  it('guestbook cleans messages and counts distinct reports without trusting visitor cookies', async () => {
    const r = await call('POST', '/api/guestbook', { body: 'Hello <b>world</b> https://x.example/y' });
    expect(r.status).toBe(201);
    expect(r.json.entry.body).toBe('Hello <b>world</b> 🔗');
    expect(r.json.entry.handle).toBe('探险家_01');
    expect((await call('POST', '/api/guestbook', { body: 'you are dumb' })).status).toBe(400);
    expect((await call('POST', '/api/guestbook', { body: '   ' })).status).toBe(400);
    const id = r.json.entry.id;
    const report = (cookie?: string, ip?: string) => fetch(base + `/api/guestbook/${id}/report`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}) }, body: '{}',
    });
    const first = await report();
    const visitor = first.headers.getSetCookie().find(c => c.startsWith('pp_vid='))?.split(';')[0];
    expect(visitor).toBeDefined();
    // Forging cookies on the same address cannot create additional reports.
    for (let i = 0; i < 3; i++) {
      await report(`pp_vid=${String(i).repeat(32)}`);
    }
    expect((await call('GET', '/api/guestbook')).json.entries.find((e: any) => e.id === id)).toBeDefined();
    // A signed-in person on the same address may report, but the original browser still counts only once if it moves.
    await call('POST', `/api/guestbook/${id}/report`, {});
    await report(`pp_sid=${jar.get('pp_sid')}; pp_vid=${'f'.repeat(32)}`, '203.0.113.3');
    await report(visitor, '203.0.113.1');
    expect((await call('GET', '/api/guestbook')).json.entries.find((e: any) => e.id === id)).toBeDefined();
    await report(undefined, '203.0.113.2');
    expect((await call('GET', '/api/guestbook')).json.entries.find((e: any) => e.id === id)).toBeUndefined();
  });
  it('one person on one address cannot hide an entry by switching between anonymous and several accounts', async () => {
    const entry = Number(db.prepare('INSERT INTO guestbook (body) VALUES (?)').run('Hi from a kid').lastInsertRowid);
    const signIn = async (email: string) => {
      const r = await fetch(base + '/api/auth/request', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' }, body: JSON.stringify({ email }) });
      return (await confirmLink((await r.json()).devLink, base, false)).sid!;
    };
    const report = (cookie: string | undefined, ip: string) => fetch(base + `/api/guestbook/${entry}/report`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) }, body: '{}',
    });
    await report(undefined, '198.51.100.7');
    await report(await signIn('sybil-a@example.com'), '198.51.100.7');
    await report(await signIn('sybil-b@example.com'), '198.51.100.7');
    expect(db.prepare('SELECT reports, hidden FROM guestbook WHERE id = ?').get(entry)).toMatchObject({ reports: 1, hidden: 0 });
    // IPv6 addresses in one /64 are one reporter too
    await report(undefined, '2001:db8:5:6::1');
    await report(undefined, '2001:db8:5:6::2');
    expect(db.prepare('SELECT reports, hidden FROM guestbook WHERE id = ?').get(entry)).toMatchObject({ reports: 2, hidden: 0 });
    await report(undefined, '192.0.2.44');
    expect(db.prepare('SELECT reports, hidden FROM guestbook WHERE id = ?').get(entry)).toMatchObject({ reports: 3, hidden: 1 });
  });
  it('rate limits guestbook posts', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await call('POST', '/api/guestbook', { body: 'hi ' + i })).status);
    expect(codes).toContain(429);
  });
  it('logout and account deletion', async () => {
    const pending = await call('POST', '/api/auth/request', { email: 'kid@example.com' });
    expect(pending.status).toBe(200);
    const link = new URL(pending.json.devLink);
    const user = (await call('GET', '/api/me')).json.user;
    const entry = db.prepare('INSERT INTO guestbook (body) VALUES (?)').run('Another visitor’s message').lastInsertRowid;
    await call('POST', `/api/guestbook/${entry}/report`, {});
    expect(db.prepare('SELECT 1 FROM guestbook_reports WHERE entry_id = ? AND visitor = ?').get(entry, `account:${user.id}`)).toBeDefined();
    expect((await call('DELETE', '/api/me')).status).toBe(200);
    expect(db.prepare('SELECT 1 FROM guestbook_reports WHERE entry_id = ? AND visitor = ?').get(entry, `account:${user.id}`)).toBeUndefined();
    expect((await call('GET', '/api/me')).json.user).toBeNull();
    const stale = await fetch(base + link.pathname + link.search, { redirect: 'manual' });
    expect(stale.headers.get('location')).toBe('/#auth-error');
  });
});

describe('guestbook report identity', () => {
  it('rejects a corrupt persisted report key rather than weakening deduplication', () => {
    const db = openDb(':memory:');
    try {
      db.prepare('INSERT INTO app_secrets (name, value) VALUES (?, ?)').run('report-address-key', 'invalid');
      expect(() => createApp({ db, devLogin: false, baseUrl: 'http://test', secureCookies: false })).toThrow('Stored guestbook report key is invalid');
    } finally { db.close(); }
  });

  it('keeps duplicate-address protection across app restarts', async () => {
    const db = openDb(':memory:');
    const id = db.prepare('INSERT INTO guestbook (body) VALUES (?)').run('Hello').lastInsertRowid;
    const options = { db, devLogin: false, baseUrl: 'http://test', secureCookies: false };
    const listen = () => new Promise<Server>(resolve => {
      const s = createApp(options).listen(0, () => resolve(s));
    });
    const post = (s: Server) => fetch(`http://127.0.0.1:${(s.address() as { port: number }).port}/api/guestbook/${id}/report`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    const close = (s: Server) => new Promise<void>(resolve => s.close(() => resolve()));
    let first: Server | undefined, second: Server | undefined;
    try {
      first = await listen();
      expect((await post(first)).status).toBe(200);
      await close(first); first = undefined;
      second = await listen();
      expect((await post(second)).status).toBe(200);
      expect(db.prepare('SELECT reports FROM guestbook WHERE id = ?').get(id)).toMatchObject({ reports: 1 });
    } finally {
      if (first) await close(first);
      if (second) await close(second);
      db.close();
    }
  });
});

describe('server configuration', () => {
  it('requires an explicit public origin in production', async () => {
    const { spawnSync } = await import('node:child_process');
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', PORT: '0', DB_PATH: ':memory:', MAIL_API_URL: '', SMTP_URL: '', DEV_LOGIN: '' };
    delete env.BASE_URL;
    delete env.INSECURE_COOKIES;
    const result = spawnSync(process.execPath, ['src/server/index.ts'], { env, encoding: 'utf8', timeout: 5000 });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('BASE_URL is required in production');
    env.BASE_URL = 'http://example.com';
    const insecure = spawnSync(process.execPath, ['src/server/index.ts'], { env, encoding: 'utf8', timeout: 5000 });
    expect(insecure.status).not.toBe(0);
    expect(insecure.stderr).toContain('BASE_URL must use HTTPS in production');
  });
  it('rejects invalid ports before starting the server', async () => {
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(process.execPath, ['src/server/index.ts'], {
      env: { ...process.env, NODE_ENV: 'development', PORT: '65536' }, encoding: 'utf8', timeout: 5000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PORT must be an integer');
  });
});

describe('content policy generation', () => {
  it('updates script hashes without duplicating the policy when a page is rebuilt', () => {
    const page = '<html><head><script>window.value = 1;</script></head><body></body></html>';
    const first = withContentPolicy(page);
    expect(withContentPolicy(first)).toBe(first);
    const changed = withContentPolicy(first.replace('window.value = 1;', 'window.value = 2;'));
    const policy = (html: string) => html.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)?.[0];
    expect(policy(changed)).not.toBe(policy(first));
  });
});

describe('rate limiter', () => {
  it('bounds active buckets by evicting the oldest, so a full table never locks out new clients', () => {
    let now = 100;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const limit = limiter(1, 1000, 2);
      expect(limit('a')).toBe(true);
      now += 1;
      expect(limit('b')).toBe(true);
      expect(limit('b')).toBe(false);
      expect(limit('c')).toBe(true); // table full: 'a' (oldest) is evicted
      expect(limit('b')).toBe(false); // 'b' keeps its window
      expect(limit('c')).toBe(false);
      now += 1000;
      expect(limit('b')).toBe(true);
    } finally { clock.mockRestore(); }
  });

  it('shares rate-limit buckets across SQLite-backed limiter instances and expires old windows', () => {
    let now = 500;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const sharedDb = openDb(':memory:');
    try {
      const workerA = limiter(2, 1000, 2, { db: sharedDb, scope: 'auth' });
      const workerB = limiter(2, 1000, 2, { db: sharedDb, scope: 'auth' });
      expect(workerA('ip-1')).toBe(true);
      expect(workerB('ip-1')).toBe(true);
      expect(workerA('ip-1')).toBe(false);
      now += 1;
      expect(workerB('ip-2')).toBe(true);
      // full: the oldest bucket (ip-1) is evicted rather than refusing the new client
      expect(workerA('ip-3')).toBe(true);
      expect(workerB('ip-2')).toBe(true);
      expect(workerB('ip-2')).toBe(false);
      now += 1000;
      expect(workerA('ip-2')).toBe(true);
    } finally {
      sharedDb.close();
      clock.mockRestore();
    }
  });
});

describe('SQLite storage', () => {
  it('rolls back all writes when a transaction fails', () => {
    const db = openDb(':memory:');
    try {
      expect(() => transaction(db, () => {
        db.prepare('INSERT INTO users (email) VALUES (?)').run('rollback@example.com');
        throw new Error('injected failure');
      })).toThrow('injected failure');
      expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toMatchObject({ n: 0 });
    } finally { db.close(); }
  });

  it('prunes expired or consumed login tokens, expired sessions, and expired rate limits while retaining active ones', () => {
    const db = openDb(':memory:');
    try {
      const now = 10_000;
      db.prepare('INSERT INTO users (id, email) VALUES (1, ?)').run('active@example.com');
      db.prepare('INSERT INTO login_tokens (hash, email, expires, used) VALUES (?, ?, ?, ?)').run('tok-exp', 'a@b.co', 9_000, 0);
      db.prepare('INSERT INTO login_tokens (hash, email, expires, used) VALUES (?, ?, ?, ?)').run('tok-used', 'a@b.co', 20_000, 1);
      db.prepare('INSERT INTO login_tokens (hash, email, expires, used) VALUES (?, ?, ?, ?)').run('tok-live', 'a@b.co', 20_000, 0);
      db.prepare('INSERT INTO sessions (hash, user_id, expires) VALUES (?, 1, ?)').run('sess-exp', 10_000);
      db.prepare('INSERT INTO sessions (hash, user_id, expires) VALUES (?, 1, ?)').run('sess-live', 20_000);
      db.prepare('INSERT INTO rate_limits (scope, key, count, reset) VALUES (?, ?, 1, ?)').run('auth', 'ip-old', 9_999);
      db.prepare('INSERT INTO rate_limits (scope, key, count, reset) VALUES (?, ?, 1, ?)').run('auth', 'ip-live', 20_000);

      const pruned = pruneExpiredState(db, now);
      expect(pruned).toEqual({ loginTokens: 2, sessions: 1, rateLimits: 1 });
      expect(db.prepare('SELECT hash FROM login_tokens').all()).toEqual([{ hash: 'tok-live' }]);
      expect(db.prepare('SELECT hash FROM sessions').all()).toEqual([{ hash: 'sess-live' }]);
      expect(db.prepare('SELECT key FROM rate_limits').all()).toEqual([{ key: 'ip-live' }]);
    } finally {
      db.close();
    }
  });

  it('backs up a live WAL database without overwriting an existing snapshot', async () => {
    const { spawnSync } = await import('node:child_process');
    const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { DatabaseSync } = await import('node:sqlite');
    const dir = mkdtempSync(join(tmpdir(), 'terrastra-backup-'));
    const source = join(dir, 'live.db'), destination = join(dir, 'backup.db');
    const live = openDb(source);
    try {
      live.exec('PRAGMA wal_autocheckpoint = 0');
      live.prepare('INSERT INTO users (email) VALUES (?)').run('backup@example.com');
      const run = (dbPath: string, output: string) => spawnSync(process.execPath, ['scripts/backup-db.ts', output], {
        env: { ...process.env, DB_PATH: dbPath }, encoding: 'utf8', timeout: 10_000,
      });
      const result = run(source, destination);
      expect(result.status, result.stderr).toBe(0);
      expect(statSync(destination).mode & 0o077).toBe(0);
      const restored = new DatabaseSync(destination, { readOnly: true });
      try {
        expect(restored.prepare('SELECT email FROM users').get()).toMatchObject({ email: 'backup@example.com' });
        expect(restored.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'delete' });
        expect(restored.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' });
      } finally { restored.close(); }
      const original = readFileSync(destination);
      expect(run(source, destination).status).not.toBe(0);
      expect(readFileSync(destination)).toEqual(original);
      const corrupt = join(dir, 'corrupt.db'), partial = join(dir, 'partial.db');
      writeFileSync(corrupt, 'not a database');
      expect(run(corrupt, partial).status).not.toBe(0);
      expect(existsSync(partial)).toBe(false);
      expect(readdirSync(dir).filter(name => name.includes('.partial'))).toEqual([]);
    } finally {
      live.close();
      for (const name of ['live.db', 'live.db-wal', 'live.db-shm', 'backup.db', 'backup.db-wal', 'backup.db-shm', 'corrupt.db', 'partial.db', 'partial.db-wal', 'partial.db-shm']) {
        rmSync(join(dir, name), { force: true });
      }
      rmdirSync(dir);
    }
  });
});

describe('helpers', () => {
  it('cleanText / isBlocked / HANDLE_RE', () => {
    expect(cleanText('a\u0000b   www.x.com  c')).toBe('a b 🔗 c');
    expect(isBlocked('I HATE this')).toBe(true);
    expect(HANDLE_RE.test('ok_name')).toBe(true);
    expect(HANDLE_RE.test('bad name')).toBe(false);
  });
});

describe('sign-in mail', async () => {
  const { mailerFromEnv } = await import('../../src/server/mail.ts');
  const { createServer } = await import('node:net');

  it('explains a missing or invalid transport', () => {
    expect('error' in mailerFromEnv({})).toBe(true);
    expect('error' in mailerFromEnv({ SMTP_URL: 'smtp://h' })).toBe(true);
    expect('error' in mailerFromEnv({ SMTP_URL: 'http://h', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('error' in mailerFromEnv({ SMTP_URL: 'smtp://%zz@localhost', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('error' in mailerFromEnv({ SMTP_URL: 'smtp://localhost/unused', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('error' in mailerFromEnv({ MAIL_API_URL: 'not-a-url', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('error' in mailerFromEnv({ MAIL_API_URL: 'file:///tmp/mail', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('error' in mailerFromEnv({ MAIL_API_URL: 'https://user:pass@example.com/', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('error' in mailerFromEnv({ MAIL_API_URL: 'https://x', MAIL_FROM: 'a@b.co\r\nBcc: other@example.com' })).toBe(true);
    expect('error' in mailerFromEnv({ NODE_ENV: 'production', MAIL_API_URL: 'http://localhost:3000/mail', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('send' in mailerFromEnv({ NODE_ENV: 'production', INSECURE_MAIL_API: '1', MAIL_API_URL: 'http://localhost:3000/mail', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('send' in mailerFromEnv({ MAIL_API_URL: 'https://x', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('send' in mailerFromEnv({ MAIL_API_URL: 'http://localhost:3000/mail', MAIL_FROM: 'a@b.co' })).toBe(true);
  });

  it('speaks SMTP with STARTTLS and AUTH to deliver one message', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { TLSSocket, createSecureContext } = await import('node:tls');
    const dir = mkdtempSync(join(tmpdir(), 'pp-smtp-'));
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
        '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' });
    } catch { return; /* no openssl: skip */ }
    const ctx = createSecureContext({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) });
    const seen: string[] = [];
    const srv = createServer(raw => {
      let s: import('node:net').Socket = raw, buf = '', data = false;
      const onData = (d: Buffer) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (data) { if (line === '.') { data = false; s.write('250 queued\r\n'); } else seen.push(line); continue; }
          seen.push(line.startsWith('AUTH') ? 'AUTH' : line);
          if (line.startsWith('EHLO')) s.write(s === raw ? '250-hi\r\n250 STARTTLS\r\n' : '250-hi\r\n250 AUTH PLAIN\r\n');
          else if (line === 'STARTTLS') {
            s.write('220 go\r\n'); raw.removeAllListeners('data');
            s = new TLSSocket(raw, { isServer: true, secureContext: ctx }); s.on('data', onData);
          } else if (line.startsWith('AUTH')) s.write('235 ok\r\n');
          else if (line === 'DATA') { data = true; s.write('354 go\r\n'); }
          else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
          else s.write('250 ok\r\n');
        }
      };
      raw.on('data', onData);
      raw.write('220 hi\r\n');
    });
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as { port: number }).port;
    writeFileSync(join(dir, 'ca.pem'), readFileSync(join(dir, 'c.pem')));
    const m = mailerFromEnv({ SMTP_URL: `smtp://u:p@localhost:${port}`, MAIL_FROM: 'Pocket <pp@b.co>', SMTP_CA_FILE: join(dir, 'ca.pem') });
    if (!('send' in m)) throw new Error(m.error);
    await m.send('kid@b.co', 'http://x/verify?token=1');
    srv.close();
    expect(seen).toEqual(expect.arrayContaining(['STARTTLS', 'AUTH', 'MAIL FROM:<pp@b.co>', 'RCPT TO:<kid@b.co>', 'DATA']));
    const body = Buffer.from(seen.slice(seen.indexOf('') + 1).join(''), 'base64').toString();
    expect(body).toContain('http://x/verify?token=1');
  });

  it('reports a failed send instead of claiming the link went out', async () => {
    const db = openDb(':memory:');
    const app = createApp({ db, devLogin: false, baseUrl: 'http://t', secureCookies: false, sendMail: async () => { throw new Error('down'); } });
    const s: Server = await new Promise(r => { const x = app.listen(0, () => r(x)); });
    const port = (s.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co' }) });
    expect(res.status).toBe(502);
    expect((db.prepare('SELECT COUNT(*) AS n FROM login_tokens').get() as { n: number }).n).toBe(0);
    const off = createApp({ db, devLogin: false, baseUrl: 'http://t', secureCookies: false });
    const s2: Server = await new Promise(r => { const x = off.listen(0, () => r(x)); });
    const r2 = await fetch(`http://127.0.0.1:${(s2.address() as { port: number }).port}/api/auth/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co' }) });
    expect(r2.status).toBe(503);
    s.close(); s2.close();
  });

  it('keeps the dev link usable if configured mail delivery fails', async () => {
    const db = openDb(':memory:');
    const app = createApp({ db, devLogin: true, baseUrl: 'http://t/', secureCookies: false, sendMail: async () => { throw new Error('down'); } });
    const s: Server = await new Promise(r => { const x = app.listen(0, () => r(x)); });
    try {
      const base = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
      const res = await fetch(base + '/api/auth/request', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co' }),
      });
      expect(res.status).toBe(200);
      const { devLink } = await res.json() as { devLink: string };
      const link = new URL(devLink);
      expect(link.pathname).toBe('/api/auth/verify');
      const verify = await confirmLink(devLink, base, false);
      expect(verify.location).toBe('/#signed-in');
    } finally {
      await new Promise<void>(resolve => s.close(() => resolve()));
      db.close();
    }
  });
});

describe('reaction rate limit', () => {
  it('caps anonymous reactions per IP even when cookies are dropped', async () => {
    const db2 = openDb(':memory:');
    const app = createApp({ db: db2, devLogin: true, baseUrl: 'http://test', secureCookies: false });
    const srv: Server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
    const a = srv.address(); const url = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/api/reactions`;
    const like = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'eiffel', kind: 'like', on: true }) });
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await like()).status;
    expect(last).toBe(429);
    const counts = await (await fetch(url + '?key=eiffel')).json();
    expect(counts.like).toBe(60);
    srv.close(); db2.close();
  });
});

describe('dev login default & storefront config', () => {
  it('is off unless explicitly enabled, and validates HTTPS/local storefront links', async () => {
    const { devLoginFrom, isLocalOrigin, storefrontFrom } = await import('../../src/server/config.ts');
    expect(devLoginFrom({})).toBe(false);
    expect(devLoginFrom({ NODE_ENV: 'production' })).toBe(false);
    expect(devLoginFrom({ NODE_ENV: 'test' })).toBe(false);
    expect(devLoginFrom({ NODE_ENV: 'development' })).toBe(true);
    expect(devLoginFrom({ NODE_ENV: 'production', DEV_LOGIN: '1' })).toBe(true);
    expect(isLocalOrigin('http://localhost:8787')).toBe(true);
    expect(isLocalOrigin('http://127.0.0.1:1')).toBe(true);
    expect(isLocalOrigin('https://terrastra.example')).toBe(false);
    expect(isLocalOrigin('not a url')).toBe(false);

    expect(storefrontFrom({
      PURCHASE_URL_PRO: 'https://shop.example/pro',
      PURCHASE_CONTACT: '  WeChat: terrastra_edu\n',
    })).toEqual({
      purchaseUrlPro: 'https://shop.example/pro',
      purchaseUrlClassroom: 'https://shop.example/pro',
      purchaseContact: 'WeChat: terrastra_edu',
    });
    expect(storefrontFrom({
      PURCHASE_URL_PRO: 'javascript:alert(1)',
      PURCHASE_URL_CLASSROOM: 'http://remote.example/insecure',
    })).toEqual({
      purchaseUrlPro: null,
      purchaseUrlClassroom: null,
      purchaseContact: null,
    });
  });
});

describe('client keys for rate limits', () => {
  it('groups IPv6 by /64 and /48, folds IPv4-mapped addresses back to IPv4', async () => {
    const { clientKey } = await import('../../src/server/client-key.ts');
    expect(clientKey('203.0.113.9')).toEqual({ host: '203.0.113.9', wide: null });
    expect(clientKey('::ffff:203.0.113.9')).toEqual({ host: '203.0.113.9', wide: null });
    const a = clientKey('2001:db8:1:2:aaaa::1'), b = clientKey('2001:db8:1:2:bbbb:cccc:dddd:eeee');
    expect(a.host).toBe('2001:db8:1:2::/64');
    expect(b.host).toBe(a.host);
    expect(clientKey('2001:db8:1:3::1').host).not.toBe(a.host);
    expect(clientKey('2001:db8:1:3::1').wide).toBe('2001:db8:1::/48');
    expect(clientKey('fe80::1%eth0').host).toBe('fe80:0:0:0::/64');
    expect(clientKey(undefined).host).toBe('');
  });

  it('caps sign-in mail per recipient regardless of the requesting address', async () => {
    const db3 = openDb(':memory:');
    const app = createApp({ db: db3, devLogin: true, baseUrl: 'http://test', secureCookies: false });
    const srv: Server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
    const a = srv.address(); const url = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/api/auth/request`;
    try {
      const statuses: number[] = [];
      // the per-IP limit is 5 per 10 min, so use several emails from this IP to reach one inbox's cap through the DB
      for (let i = 0; i < 5; i++) {
        db3.prepare("DELETE FROM rate_limits WHERE scope = 'auth'").run(); // simulate requests from different IPs
        statuses.push((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'inbox@example.com' }) })).status);
      }
      db3.prepare("DELETE FROM rate_limits WHERE scope = 'auth'").run();
      statuses.push((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'inbox@example.com' }) })).status);
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    } finally { srv.close(); db3.close(); }
  });
});

describe('billing, redemption codes, session caps, sync v2 & gated pro chunks', async () => {
  const { issueRedemptionCodes, grantEntitlement, hashRedeemCode } = await import('../../src/server/billing.ts');
  const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  async function loginFreshSession(srvBase: string, email: string): Promise<string> {
    const reqRes = await fetch(srvBase + '/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: srvBase },
      body: JSON.stringify({ email }),
    });
    expect(reqRes.status).toBe(200);
    const { devLink } = await reqRes.json() as { devLink: string };
    const verified = await confirmLink(devLink, srvBase, false);
    expect(verified.status).toBe(303);
    expect(verified.sid).toBeTruthy();
    return verified.sid!;
  }

  it('redeems single-use codes, enforces FIFO session caps (3 vs 10), syncs extras, and gates pro-lessons chunks', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'terrastra-pro-gate-'));
    mkdirSync(join(staticDir, 'assets'), { recursive: true });
    mkdirSync(join(staticDir, 'encyclopedia'), { recursive: true });
    mkdirSync(join(staticDir, '.pro-assets'), { recursive: true });
    const htmlPad = '<!-- static page compressible body -->\n'.repeat(40);
    writeFileSync(join(staticDir, 'index.html'), `<!doctype html><html><head></head><body>ok\n${htmlPad}</body></html>`);
    writeFileSync(join(staticDir, 'encyclopedia', 'index.html'), `<!doctype html><html><head></head><body>enc\n${htmlPad}</body></html>`);
    const largePublicJs = 'export const pub = 1;\n' + '// compressible padding\n'.repeat(100);
    const largeProJs = 'export const secretLesson = true;\n' + '// pro lesson payload\n'.repeat(120);
    writeFileSync(join(staticDir, 'assets', 'public-test.js'), largePublicJs);
    writeFileSync(join(staticDir, '.pro-assets', 'pro-lessons-earth-TEST123.js'), largeProJs);

    const paywallDb = openDb(':memory:');
    const [proCode] = issueRedemptionCodes(paywallDb, { plan: 'pro', count: 1, note: 'unit-pro' });
    const [expiredCode] = issueRedemptionCodes(paywallDb, {
      plan: 'pro',
      count: 1,
      note: 'unit-expired',
      now: Date.now() - 10_000,
      expiresAt: Date.now() - 1_000,
    });
    const [revokedCode] = issueRedemptionCodes(paywallDb, { plan: 'pro', count: 1, note: 'unit-revoked' });
    paywallDb.prepare('UPDATE redemption_codes SET revoked = 1 WHERE code_hash = ?').run(hashRedeemCode(revokedCode!));

    let srv: Server | undefined;
    try {
      const app = createApp({
        db: paywallDb,
        staticDir,
        devLogin: true,
        baseUrl: 'http://127.0.0.1',
        secureCookies: false,
        enforcePaywall: true,
        storefront: {
          purchaseUrlPro: 'https://shop.example/pro',
          purchaseUrlClassroom: 'https://shop.example/classroom',
          purchaseContact: 'support@terrastra.example',
        },
      });
      srv = await new Promise<Server>(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
      const srvBase = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;

      // 1. Direct /.pro-assets access is always 404; public asset is 200; pro chunk is 401 when signed out
      expect((await fetch(srvBase + '/.pro-assets/pro-lessons-earth-TEST123.js')).status).toBe(404);
      expect((await fetch(srvBase + '/assets/public-test.js')).status).toBe(200);
      expect((await fetch(srvBase + '/assets/pro-lessons-earth-TEST123.js')).status).toBe(401);

      const anonStatus = await (await fetch(srvBase + '/api/billing/status')).json();
      expect(anonStatus).toMatchObject({ paywall: true, plan: 'free', proAccess: false, maxSessions: 3, activeSessions: 0 });

      // 2. Sign in on 4 separate devices as a Free user -> oldest session is evicted (FIFO cap = 3)
      const sids: string[] = [];
      for (let i = 0; i < 4; i++) {
        paywallDb.prepare("DELETE FROM rate_limits").run();
        sids.push(await loginFreshSession(srvBase, 'learner@example.com'));
      }
      const checkMe = async (cookie: string) => (await (await fetch(srvBase + '/api/me', { headers: { cookie } })).json()).user;
      expect(await checkMe(sids[0]!)).toBeNull();
      expect((await checkMe(sids[1]!))?.plan).toBe('free');
      expect((await checkMe(sids[3]!))?.plan).toBe('free');

      const activeSid = sids[3]!;
      const authedStatus = await (await fetch(srvBase + '/api/billing/status', { headers: { cookie: activeSid } })).json();
      expect(authedStatus).toMatchObject({ plan: 'free', proAccess: false, activeSessions: 3, maxSessions: 3 });

      // 3. Signed-in Free user gets 402 on pro-lessons chunk and has cloud mistakes capped to 5
      expect((await fetch(srvBase + '/assets/pro-lessons-earth-TEST123.js', { headers: { cookie: activeSid } })).status).toBe(402);

      const { recordMistake } = await import('../../src/shared/lib/journal.ts');
      let mistakes = {};
      for (let i = 0; i < 7; i++) {
        mistakes = recordMistake(
          mistakes,
          'shape',
          { q: [`Q${i}?`, `题${i}？`], options: [['A', 'A'], ['B', 'B']], answer: 0, why: ['W', '因'] },
          100 + i,
        );
      }
      const putFree = await fetch(srvBase + '/api/progress', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: srvBase, cookie: activeSid },
        body: JSON.stringify({
          progress: emptyProgress(),
          extras: {
            lessonsDone: ['shape'],
            bookmarks: [{ route: '', cam: { lat: 30, lon: 120, h: 1.5 }, label: { en: 'Home' }, at: 500 }],
            mistakeBook: mistakes,
          },
        }),
      });
      expect(putFree.status).toBe(200);
      const freeBody = await putFree.json();
      expect(Object.keys(freeBody.extras.mistakeBook)).toHaveLength(5);
      expect(freeBody.extras.bookmarks).toEqual([]);

      // 4. Redemption error handling (401 anon, 400 malformed, 404 unknown/revoked) + normalized redemption
      const redeem = (code: string, cookie?: string) => fetch(srvBase + '/api/billing/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: srvBase, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ code }),
      });
      expect((await redeem(proCode!)).status).toBe(401);
      expect((await redeem('bad-code', activeSid)).status).toBe(400);
      expect((await redeem(revokedCode!, activeSid)).status).toBe(404);
      const expiredRes = await redeem(expiredCode!, activeSid);
      expect(expiredRes.status).toBe(410);
      expect(await expiredRes.json()).toMatchObject({ code: 'CODE_EXPIRED' });

      const okRedeem = await redeem(proCode!.toLowerCase().replace(/-/g, ' '), activeSid);
      expect(okRedeem.status).toBe(200);
      const okJson = await okRedeem.json();
      expect(okJson.entitlement.plan).toBe('pro');
      expect(okJson.user.plan).toBe('pro');

      // Re-redeeming the same single-use code returns 409 Conflict
      expect((await redeem(proCode!, activeSid)).status).toBe(409);

      // 5. Pro user now gets 200 OK on gated pro-lessons chunk (with Brotli/Gzip + ETag + Vary: Cookie, Accept-Encoding)
      expect((await fetch(srvBase + '/%2epro-assets/pro-lessons-earth-TEST123.js')).status).toBe(404);
      const proChunk = await fetch(srvBase + '/assets/pro-lessons-earth-TEST123.js', {
        headers: { cookie: activeSid, 'accept-encoding': 'br, gzip' },
      });
      expect(proChunk.status).toBe(200);
      expect(proChunk.headers.get('cache-control')).toContain('private');
      expect(proChunk.headers.get('vary')).toContain('Cookie');
      expect(proChunk.headers.get('vary')).toContain('Accept-Encoding');
      expect(proChunk.headers.get('content-encoding')).toBe('br');
      const proEtag = proChunk.headers.get('etag');
      expect(proEtag).toBeTruthy();
      expect(await proChunk.text()).toContain('secretLesson = true');
      const proNotMod = await fetch(srvBase + '/assets/pro-lessons-earth-TEST123.js', {
        headers: { cookie: activeSid, 'if-none-match': proEtag! },
      });
      expect(proNotMod.status).toBe(304);

      const pubGzip = await fetch(srvBase + '/assets/public-test.js', {
        headers: { 'accept-encoding': 'br;q=0, gzip;q=0.9' },
      });
      expect(pubGzip.status).toBe(200);
      expect(pubGzip.headers.get('content-encoding')).toBe('gzip');
      expect(await pubGzip.text()).toContain('export const pub = 1;');

      // Directory index.html routes get Brotli + ETag 304 while preserving trailing-slash redirects
      const rootHtml = await fetch(srvBase + '/', { headers: { 'accept-encoding': 'br, gzip' } });
      expect(rootHtml.status).toBe(200);
      expect(rootHtml.headers.get('content-encoding')).toBe('br');
      const rootEtag = rootHtml.headers.get('etag');
      expect(rootEtag).toBeTruthy();
      expect((await fetch(srvBase + '/', { headers: { 'if-none-match': rootEtag! } })).status).toBe(304);
      const slashRedirect = await fetch(srvBase + '/encyclopedia', { redirect: 'manual' });
      expect(slashRedirect.status).toBe(301);
      expect(slashRedirect.headers.get('location')).toBe('/encyclopedia/');
      const encHtml = await fetch(srvBase + '/encyclopedia/', { headers: { 'accept-encoding': 'br' } });
      expect(encHtml.status).toBe(200);
      expect(encHtml.headers.get('content-encoding')).toBe('br');

      // 5b. Redeeming another Pro code on an already-lifetime-Pro account returns 409 ALREADY_ENTITLED WITHOUT burning the code!
      const [spareProCode, singleUseDeleteTestCode] = issueRedemptionCodes(paywallDb, { plan: 'pro', count: 2, note: 'audit-regression' });
      const dupEntitled = await redeem(spareProCode!, activeSid);
      expect(dupEntitled.status).toBe(409);
      expect(await dupEntitled.json()).toMatchObject({ code: 'ALREADY_ENTITLED' });

      // Another Free account CAN still redeem `spareProCode` because it was not burned!
      paywallDb.prepare("DELETE FROM rate_limits").run();
      const secondSid = await loginFreshSession(srvBase, 'sibling@example.com');
      expect((await redeem(spareProCode!, secondSid)).status).toBe(200);

      // 5c. Account deletion (`DELETE /api/me`) MUST NOT allow single-use activation code replay on a new account!
      paywallDb.prepare("DELETE FROM rate_limits").run();
      const tempSid = await loginFreshSession(srvBase, 'temp-deleter@example.com');
      expect((await redeem(singleUseDeleteTestCode!, tempSid)).status).toBe(200);
      const delRes = await fetch(srvBase + '/api/me', {
        method: 'DELETE',
        headers: { origin: srvBase, cookie: tempSid },
      });
      expect(delRes.status).toBe(200);
      paywallDb.prepare("DELETE FROM rate_limits").run();
      const replaySid = await loginFreshSession(srvBase, 'replayer@example.com');
      const replayAttempt = await redeem(singleUseDeleteTestCode!, replaySid);
      expect(replayAttempt.status).toBe(409);
      expect(await replayAttempt.json()).toMatchObject({ code: 'CODE_ALREADY_USED' });

      const putPro = await fetch(srvBase + '/api/progress', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: srvBase, cookie: activeSid },
        body: JSON.stringify({
          progress: emptyProgress(),
          extras: {
            lessonsDone: ['shape', 'usa'],
            bookmarks: [{ route: '', cam: { lat: 30, lon: 120, h: 1.5 }, label: { en: 'Home' }, at: 500 }],
            mistakeBook: mistakes,
          },
        }),
      });
      const proBody = await putPro.json();
      expect(Object.keys(proBody.extras.mistakeBook)).toHaveLength(7);
      expect(proBody.extras.bookmarks).toHaveLength(1);

      // 6. Upgrading to Classroom raises concurrent device cap to 10 without downgrading on a Pro grant
      const uRow = paywallDb.prepare('SELECT id FROM users WHERE email = ?').get('learner@example.com') as { id: number };
      expect(grantEntitlement(paywallDb, { userId: uRow.id, plan: 'classroom', source: 'school-license' }).maxSessions).toBe(10);
      expect(grantEntitlement(paywallDb, { userId: uRow.id, plan: 'pro', source: 'extra-code' }).plan).toBe('classroom');
      for (let i = 0; i < 5; i++) {
        paywallDb.prepare("DELETE FROM rate_limits").run();
        await loginFreshSession(srvBase, 'learner@example.com');
      }
      const clsStatus = await (await fetch(srvBase + '/api/billing/status', { headers: { cookie: activeSid } })).json();
      expect(clsStatus).toMatchObject({
        plan: 'classroom',
        activeSessions: 8,
        maxSessions: 10,
        storefront: {
          purchaseUrlPro: 'https://shop.example/pro',
          purchaseUrlClassroom: 'https://shop.example/classroom',
          purchaseContact: 'support@terrastra.example',
        },
      });
      expect(clsStatus.orders).toHaveLength(1);
      expect(clsStatus.orders[0]).toMatchObject({ plan: 'pro', provider: 'redeem', status: 'paid' });

      // 7. Self-service "Sign out other devices" revokes the other 7 sessions while keeping `activeSid` alive
      const logoutOthers = await fetch(srvBase + '/api/auth/logout-others', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: srvBase, cookie: activeSid },
        body: '{}',
      });
      expect(logoutOthers.status).toBe(200);
      expect(await logoutOthers.json()).toEqual({ ok: true, revoked: 7, activeSessions: 1 });
      expect((await checkMe(activeSid))?.plan).toBe('classroom');
      expect(await checkMe(sids[1]!)).toBeNull();
    } finally {
      if (srv) await new Promise<void>(r => srv!.close(() => r()));
      paywallDb.close();
      rmSync(staticDir, { recursive: true, force: true });
    }
  });
});

describe('HTTP caching, security headers, expiry preservation & backup resilience', () => {
  it('supports weak If-None-Match comparison, Accept-Encoding wildcards, Retry-After parsing, and mail escaping', async () => {
    const { matchesIfNoneMatch, negotiateEncoding } = await import('../../src/server/app.ts');
    const { mailBody } = await import('../../src/server/mail.ts');
    const { parseRetryAfterSeconds } = await import('../../src/shared/lib/entitlements.ts');

    expect(matchesIfNoneMatch('"abc-123"', 'W/"abc-123"')).toBe(true);
    expect(matchesIfNoneMatch('W/"other", "abc-123"', 'W/"abc-123"')).toBe(true);
    expect(matchesIfNoneMatch('W/"other"', 'W/"abc-123"')).toBe(false);

    expect(negotiateEncoding('*;q=0.8')).toBe('br');
    expect(negotiateEncoding('br;q=0, *;q=0.5')).toBe('gzip');
    expect(negotiateEncoding('br;q=0, gzip;q=0, *;q=0.5')).toBeNull();

    expect(parseRetryAfterSeconds('60')).toBe(60);
    expect(parseRetryAfterSeconds('Wed, 21 Oct 2026 07:28:10 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'))).toBe(10);
    expect(parseRetryAfterSeconds('invalid')).toBeUndefined();

    const body = mailBody('https://terrastra.example/?a=1&b="x">\'y');
    expect(body.html).toContain('https://terrastra.example/?a=1&amp;b=&quot;x&quot;&gt;&#39;y');
  });

  it('sets Permissions-Policy + HSTS on secure origins, recovers corrupt stored progress, and never shortens active expiry', async () => {
    const { grantEntitlement } = await import('../../src/server/billing.ts');
    const tmpDb = openDb(':memory:');
    tmpDb.prepare('INSERT INTO users (email) VALUES (?)').run('school@example.edu');
    const u = tmpDb.prepare('SELECT id FROM users WHERE email = ?').get('school@example.edu') as { id: number };
    const now = 1_700_000_000_000;
    const yearOut = now + 365 * 86_400_000;
    const monthOut = now + 30 * 86_400_000;
    expect(grantEntitlement(tmpDb, { userId: u.id, plan: 'classroom', source: 'annual', expiresAt: yearOut, now }).expiresAt).toBe(yearOut);
    expect(grantEntitlement(tmpDb, { userId: u.id, plan: 'classroom', source: 'promo', expiresAt: monthOut, now }).expiresAt).toBe(yearOut);

    // Corrupt stored JSON in progress/learning_sync self-heals on GET/PUT instead of throwing 500
    const secApp = createApp({ db: tmpDb, devLogin: true, baseUrl: 'https://secure.example', secureCookies: true });
    const srv: Server = await new Promise(r => { const s = secApp.listen(0, () => r(s)); });
    try {
      const port = (srv.address() as { port: number }).port;
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(health.headers.get('strict-transport-security')).toContain('max-age=31536000');
      expect(health.headers.get('permissions-policy')).toContain('geolocation=(self)');
    } finally {
      await new Promise<void>(r => srv.close(() => r()));
      tmpDb.close();
    }

    // Corrupt row recovery on shared test server
    db.prepare("DELETE FROM rate_limits").run();
    const rHeal = await call('POST', '/api/auth/request', { email: 'heal@example.com' });
    await confirmLink(rHeal.json.devLink);
    const uTest = db.prepare('SELECT id FROM users WHERE email = ?').get('heal@example.com') as { id: number };
    db.prepare('INSERT OR REPLACE INTO progress (user_id, json, updated_at) VALUES (?, ?, ?)').run(uTest.id, '{broken-json', 1);
    db.prepare('INSERT OR REPLACE INTO learning_sync (user_id, json, updated_at) VALUES (?, ?, ?)').run(uTest.id, '{"bad":true}', 1);
    const recoveredGet = await call('GET', '/api/progress');
    expect(recoveredGet.status).toBe(200);
    expect(recoveredGet.json.progress).toBeNull();
    const pClean = emptyProgress(); pClean.dex = { eiffel: 10 }; pClean.updatedAt = 99;
    const recoveredPut = await call('PUT', '/api/progress', { progress: pClean });
    expect(recoveredPut.status).toBe(200);
    expect(recoveredPut.json.progress.dex).toEqual({ eiffel: 10 });
  });
});
