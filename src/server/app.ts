import express, { type Request, type Response, type NextFunction } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { mergeProgress, isProgress, emptyProgress, type Progress } from '../shared/lib/progress.ts';
import { BY_KEY } from '../shared/data/catalogue.ts';

interface AppOptions {
  db: DB;
  /** Expose the magic link in the API response (local dev / e2e only). */
  devLogin: boolean;
  /** Absolute base URL used to build magic links. */
  baseUrl: string;
  secureCookies: boolean;
  staticDir?: string;
  /** Delivers the magic link; must reject on failure. Without it (and without devLogin) email sign-in is off. */
  sendMail?: (to: string, link: string) => Promise<void>;
}

const TOKEN_TTL = 15 * 60_000;
const SESSION_TTL = 60 * 24 * 3600_000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const HANDLE_RE = /^[A-Za-z0-9_\u4E00-\u9FFF]{2,16}$/;
const BLOCKED = ['stupid', 'idiot', 'hate', 'kill', 'dumb', 'shut up', '笨蛋', '白痴', '傻瓜', '滚开'];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    // other apps on the parent domain may set cookies that aren't valid URI encoding: keep those raw
    const raw = part.slice(i + 1).trim();
    try { out[part.slice(0, i).trim()] = decodeURIComponent(raw); } catch { out[part.slice(0, i).trim()] = raw; }
  }
  return out;
}

/** Tiny fixed-window rate limiter keyed by ip+bucket. */
function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k); // forget windows that are over
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
    h.n++;
    return h.n <= max;
  };
}

export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+|www\.\S+/gi, '🔗').replace(/\s+/g, ' ').trim();
}
export function isBlocked(s: string): boolean { const l = s.toLowerCase(); return BLOCKED.some(w => l.includes(w)); }

export function createApp(o: AppOptions): express.Express {
  const { db } = o;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '256kb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: 'lax' as const, secure: o.secureCookies, path: '/', maxAge });

  // visitor id: anonymous, random, used for reactions and reports
  const visitor = (req: Request, res: Response): string => {
    let v = cookies(req).pp_vid;
    if (!v || !/^[a-f0-9]{32}$/.test(v)) { v = randomBytes(16).toString('hex'); res.cookie('pp_vid', v, cookieOpts(365 * 24 * 3600_000)); }
    return v;
  };
  type User = { id: number; email: string; handle: string | null };
  const currentUser = (req: Request): User | null => {
    const sid = cookies(req).pp_sid;
    if (!sid) return null;
    const row = db.prepare('SELECT u.id, u.email, u.handle FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?').get(sha(sid), Date.now()) as User | undefined;
    return row ? { id: row.id, email: row.email, handle: row.handle } : null;
  };
  const requireUser = (req: Request, res: Response): User | null => {
    const u = currentUser(req);
    if (!u) res.status(401).json({ error: 'Sign in required' });
    return u;
  };

  // CSRF: mutating API calls must be JSON and (if Origin is sent) same-origin.
  let baseHost = '';
  try { baseHost = new URL(o.baseUrl).host; } catch { /* no public origin configured */ }
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.headers.origin;
    if (origin) {
      let host = '';
      try { host = new URL(origin).host; } catch { /* "null" or malformed */ }
      // behind a proxy that rewrites Host, the configured public origin is the one browsers send
      if (host !== req.headers.host && host !== baseHost) return res.status(403).json({ error: 'Bad origin' });
    }
    if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({ error: 'JSON required' });
    next();
  });

  const authLimit = limiter(5, 10 * 60_000);
  const postLimit = limiter(5, 60_000);
  const reportLimit = limiter(10, 60 * 60_000);

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });

  app.post('/api/auth/request', async (req, res) => {
    if (!o.sendMail && !o.devLogin) return res.status(503).json({ error: 'Email sign-in is not available right now' });
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Please enter a valid email' });
    if (!authLimit(req.ip + ':' + email) || !authLimit(String(req.ip))) return res.status(429).json({ error: 'Too many requests, try again later' });
    const token = randomBytes(24).toString('base64url');
    // housekeeping, at most a few times an hour per visitor thanks to the limit above
    db.prepare('DELETE FROM login_tokens WHERE expires < ?').run(Date.now());
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    db.prepare('INSERT INTO login_tokens (hash, email, expires) VALUES (?, ?, ?)').run(sha(token), email, Date.now() + TOKEN_TTL);
    const link = `${o.baseUrl}/api/auth/verify?token=${token}`;
    if (o.sendMail) {
      try { await o.sendMail(email, link); } catch (e) {
        console.error('[mail] send failed:', (e as Error).message);
        db.prepare('DELETE FROM login_tokens WHERE hash = ?').run(sha(token));
        if (!o.devLogin) return res.status(502).json({ error: 'We could not send the email. Please try again later.' });
      }
    }
    res.json(o.devLogin ? { ok: true, devLink: link } : { ok: true });
  });

  app.get('/api/auth/verify', (req, res) => {
    const token = String(req.query.token ?? '');
    const row = db.prepare('SELECT email, expires, used FROM login_tokens WHERE hash = ?').get(sha(token)) as { email: string; expires: number; used: number } | undefined;
    if (!row || row.used || row.expires < Date.now()) return res.redirect(302, '/#auth-error');
    db.prepare('UPDATE login_tokens SET used = 1 WHERE hash = ?').run(sha(token));
    db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').run(row.email);
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(row.email) as { id: number };
    const sid = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions (hash, user_id, expires) VALUES (?, ?, ?)').run(sha(sid), user.id, Date.now() + SESSION_TTL);
    res.cookie('pp_sid', sid, cookieOpts(SESSION_TTL));
    res.redirect(302, '/#signed-in');
  });

  app.post('/api/auth/logout', (req, res) => {
    const sid = cookies(req).pp_sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE hash = ?').run(sha(sid));
    res.clearCookie('pp_sid', { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => { res.json({ user: currentUser(req) }); });

  app.delete('/api/me', (req, res) => {
    const u = requireUser(req, res); if (!u) return;
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    res.clearCookie('pp_sid', { path: '/' });
    res.json({ ok: true });
  });

  app.put('/api/profile', (req, res) => {
    const u = requireUser(req, res); if (!u) return;
    const handle = String(req.body?.handle ?? '').trim();
    if (!HANDLE_RE.test(handle)) return res.status(400).json({ error: '2–16 letters, numbers or _' });
    if (isBlocked(handle)) return res.status(400).json({ error: 'Please choose a kinder nickname' });
    const taken = db.prepare('SELECT id FROM users WHERE handle = ? AND id != ?').get(handle, u.id);
    if (taken) return res.status(409).json({ error: 'That nickname is taken' });
    db.prepare('UPDATE users SET handle = ? WHERE id = ?').run(handle, u.id);
    res.json({ user: { ...u, handle } });
  });

  app.get('/api/progress', (req, res) => {
    const u = requireUser(req, res); if (!u) return;
    const row = db.prepare('SELECT json FROM progress WHERE user_id = ?').get(u.id) as { json: string } | undefined;
    res.json({ progress: row ? JSON.parse(row.json) as Progress : null });
  });

  app.put('/api/progress', (req, res) => {
    const u = requireUser(req, res); if (!u) return;
    const incoming: unknown = req.body?.progress;
    if (!isProgress(incoming)) return res.status(400).json({ error: 'Invalid progress' });
    const row = db.prepare('SELECT json FROM progress WHERE user_id = ?').get(u.id) as { json: string } | undefined;
    const merged = mergeProgress(row ? JSON.parse(row.json) as Progress : emptyProgress(), incoming);
    db.prepare('INSERT INTO progress (user_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at')
      .run(u.id, JSON.stringify(merged), Date.now());
    res.json({ progress: merged });
  });

  const counts = (item: string) => {
    const rows = db.prepare('SELECT kind, COUNT(*) AS n FROM reactions WHERE item = ? GROUP BY kind').all(item) as { kind: 'like' | 'visited'; n: number }[];
    const out = { like: 0, visited: 0 };
    for (const r of rows) out[r.kind] = Number(r.n);
    return out;
  };
  app.get('/api/reactions', (req, res) => {
    const key = String(req.query.key ?? '');
    if (!BY_KEY.has(key)) return res.status(404).json({ error: 'Unknown item' });
    res.json(counts(key));
  });
  app.post('/api/reactions', (req, res) => {
    const { key, kind, on } = req.body ?? {};
    if (typeof key !== 'string' || !BY_KEY.has(key) || (kind !== 'like' && kind !== 'visited') || typeof on !== 'boolean') return res.status(400).json({ error: 'Bad reaction' });
    const v = visitor(req, res);
    if (on) db.prepare('INSERT OR IGNORE INTO reactions (visitor, item, kind, created_at) VALUES (?, ?, ?, ?)').run(v, key, kind, Date.now());
    else db.prepare('DELETE FROM reactions WHERE visitor = ? AND item = ? AND kind = ?').run(v, key, kind);
    res.json(counts(key));
  });

  app.get('/api/guestbook', (_req, res) => {
    const entries = db.prepare(`SELECT g.id, COALESCE(u.handle, 'Explorer') AS handle, g.body, g.created_at FROM guestbook g LEFT JOIN users u ON u.id = g.user_id
      WHERE g.hidden = 0 ORDER BY g.id DESC LIMIT 50`).all();
    res.json({ entries });
  });
  app.post('/api/guestbook', (req, res) => {
    const u = requireUser(req, res); if (!u) return;
    if (!postLimit(String(u.id))) return res.status(429).json({ error: 'Slow down a little!' });
    const body = cleanText(String(req.body?.body ?? '')).slice(0, 200);
    if (body.length < 1) return res.status(400).json({ error: 'Write something first' });
    if (isBlocked(body)) return res.status(400).json({ error: 'Let’s keep the guestbook friendly' });
    const r = db.prepare('INSERT INTO guestbook (user_id, body) VALUES (?, ?)').run(u.id, body);
    const entry = db.prepare(`SELECT g.id, COALESCE(u.handle, 'Explorer') AS handle, g.body, g.created_at FROM guestbook g LEFT JOIN users u ON u.id = g.user_id WHERE g.id = ?`).get(r.lastInsertRowid);
    res.status(201).json({ entry });
  });
  app.post('/api/guestbook/:id/report', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id' });
    // a report counts only from a visitor the site already knows (a cookieless request would be a new visitor every
    // time), and each network gets a few an hour, so nobody can hide other people's notes on their own
    const known = cookies(req).pp_vid, v = visitor(req, res);
    if (!reportLimit(String(req.ip))) return res.status(429).json({ error: 'Too many requests, try again later' });
    if (known !== v) return res.json({ ok: true });
    const r = db.prepare('INSERT OR IGNORE INTO guestbook_reports (entry_id, visitor) SELECT id, ? FROM guestbook WHERE id = ?').run(v, id);
    if (r.changes) db.prepare('UPDATE guestbook SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= 3 THEN 1 ELSE hidden END WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });

  if (o.staticDir && existsSync(o.staticDir)) {
    const dir = o.staticDir;
    app.use(express.static(dir, { extensions: ['html'], setHeaders: (res, p) => { if (p.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
    const notFound = join(dir, '404.html');
    app.use((_req, res) => { res.status(404).type('html').send(existsSync(notFound) ? readFileSync(notFound, 'utf8') : 'Not found'); });
  }
  return app;
}
