import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { openDb, transaction } from '../../src/server/db.ts';
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
  it('requires a session for private endpoints', async () => {
    expect((await call('GET', '/api/progress')).status).toBe(401);
    expect((await call('POST', '/api/guestbook', { body: 'hi' })).status).toBe(401);
    expect((await call('GET', '/api/me')).json).toEqual({ user: null });
    expect((await fetch(base + '/api/me')).headers.get('cache-control')).toBe('no-store');
  });
  it('magic link signs in once; token cannot be reused', async () => {
    const r = await call('POST', '/api/auth/request', { email: 'Kid@Example.com' });
    expect(r.status).toBe(200);
    const path = new URL(r.json.devLink).pathname + new URL(r.json.devLink).search;
    const v = await call('GET', path);
    expect(v.status).toBe(302); expect(v.location).toBe('/#signed-in');
    expect((await call('GET', '/api/me')).json.user.email).toBe('kid@example.com');
    const again = await fetch(base + path, { redirect: 'manual' });
    expect(again.headers.get('location')).toBe('/#auth-error');
    expect((await fetch(base + '/api/auth/verify?token=garbage', { redirect: 'manual' })).headers.get('location')).toBe('/#auth-error');
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
  it('bounds active buckets and admits new keys when old windows expire', () => {
    let now = 100;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const limit = limiter(1, 1000, 2);
      expect(limit('a')).toBe(true);
      expect(limit('b')).toBe(true);
      expect(limit('c')).toBe(false);
      expect(limit('a')).toBe(false);
      now += 1000;
      expect(limit('c')).toBe(true);
      expect(limit('a')).toBe(true);
    } finally { clock.mockRestore(); }
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
      const verify = await fetch(base + link.pathname + link.search, { redirect: 'manual' });
      expect(verify.headers.get('location')).toBe('/#signed-in');
    } finally {
      await new Promise<void>(resolve => s.close(() => resolve()));
      db.close();
    }
  });
});
