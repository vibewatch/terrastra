import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { cleanText, isBlocked, HANDLE_RE, EMAIL_RE, limiter, streak } from '../../src/server/rules.ts';
import { answerKey, catalogue, content, FREE_LESSONS, grade, kindOf, labCheck, labSolve, lessonById, parseHome, wireLesson } from '../../src/server/lessons.ts';
import { HOMES } from './lesson-check.ts';
import type { Lesson } from '../../src/server/lessons.ts';
import type { Home } from '../../src/shared/lessons/wire.ts';

describe('helpers', () => {
  it('cleanText / isBlocked / HANDLE_RE / EMAIL_RE', () => {
    expect(cleanText('a\u0000b   www.x.com  c')).toBe('a b 🔗 c');
    expect(isBlocked('I HATE this')).toBe(true);
    expect(HANDLE_RE.test('ok_name')).toBe(true);
    expect(HANDLE_RE.test('bad name')).toBe(false);
    expect(EMAIL_RE.test('kid@school.org')).toBe(true);
    expect(EMAIL_RE.test('nope')).toBe(false);
  });
  it('limiter and streak', () => {
    const lim = limiter(2, 60_000);
    expect([lim('a'), lim('a'), lim('a'), lim('b')]).toEqual([true, true, false, true]);
    expect(streak([10, 9, 8, 6], 10)).toBe(3);
    expect(streak([9, 8], 10)).toBe(2);
    expect(streak([8], 10)).toBe(0);
  });
});

const ids = [...Object.keys(catalogue('geo').lessons), ...Object.keys(catalogue('astro').lessons)];
const homeOf = (h: (typeof HOMES)[number]) => parseHome({ ll: h.ll, climate: h.climate, biome: h.biome, a2: h.country?.a2 })!;
/** every lesson, and each "where I live" lesson for a sample home */
const runs = ids.flatMap((id): { l: Lesson; home: Home | null }[] => {
  const l = lessonById(id)!;
  return l.build ? HOMES.map(h => ({ l, home: homeOf(h) })) : [{ l, home: null }];
});
const hasFn = (x: unknown): boolean => typeof x === 'function' || (!!x && typeof x === 'object' && Object.values(x).some(hasFn));

describe('lesson engine', () => {
  it('lists every lesson once, with the free ones open', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(100);
    for (const id of FREE_LESSONS) expect(catalogue(id.startsWith('a-') ? 'astro' : 'geo').lessons[id]?.free).toBe(true);
  });
  it('sends lessons without code or answers', () => {
    for (const { l, home } of runs) {
      const c = content(l, home)!;
      const w = wireLesson(l, { built: l.build ? c : undefined });
      expect(hasFn(w), l.id).toBe(false);
      expect(w.dev).toBeUndefined();
      expect(w.quiz.length).toBe(c.quiz.length);
      for (const q of w.quiz) for (const k of ['answer', 'multi', 'at', 'tolKm', 'num', 'place', 'pick', 'order', 'match']) expect(q, `${l.id} ${k}`).not.toHaveProperty(k);
    }
    const build = runs.find(r => r.l.build)!.l;
    expect(wireLesson(build).quiz).toEqual([]);
  });
  it('grades each answer key right and a wrong answer wrong', () => {
    for (const { l, home } of runs) {
      const { quiz } = content(l, home)!;
      quiz.forEach((q, k) => {
        const key = answerKey(l.id, q, k);
        expect(grade(l.id, q, k, key)?.ok, `${l.id}#${k}`).toBe(true);
        const kind = kindOf(q);
        if (kind === 'choice') expect(grade(l.id, q, k, { pick: ((key as { pick: number }).pick + 1) % q.options!.length })?.ok).toBe(false);
        if (kind === 'order') expect(grade(l.id, q, k, { seq: [...(key as { seq: number[] }).seq].reverse() })?.ok).toBe(false);
        if (kind === 'at') expect(grade(l.id, q, k, { at: [-q.at![0], q.at![1] > 0 ? q.at![1] - 180 : q.at![1] + 180] })?.ok).toBe(false);
      });
    }
  });
  it('refuses answers that do not fit the question', () => {
    const l = lessonById('shape')!, q = l.quiz, k = q.findIndex(x => kindOf(x) === 'choice');
    expect(grade(l.id, q[k], k, { pick: 99 })).toBeNull();
    expect(grade(l.id, q[k], k, { seq: [0] })).toBeNull();
    expect(grade(l.id, q[k], k, 'x')).toBeNull();
    const o = runs.flatMap(({ l, home }) => content(l, home)!.quiz.map((q, k) => ({ l, q, k }))).find(x => kindOf(x.q) === 'order')!;
    expect(grade(o.l.id, o.q, o.k, { seq: o.q.order!.map(() => 0) })).toBeNull();
  });
  it('checks lab tasks on the server, clamping slider values', () => {
    let solved = 0;
    for (const { l, home } of runs) content(l, home)!.steps.forEach(st => {
      const tasks = st.astro?.tasks ?? [];
      if (!tasks.length) return;
      const far = Object.fromEntries((st.astro!.params ?? []).map(q => [q.id, q.max + 1e6]));
      expect(labCheck(st, far, 0), l.id).toHaveLength(tasks.length);
      expect(labCheck(st, far, Number.NaN)).toBeNull();
      if (st.astro!.params?.length) expect(labCheck(st, {}, 0)).toBeNull();
      const p = labSolve(st, 0, 0);
      if (p) { expect(labCheck(st, p, 0)![0]).toBe(true); solved++; }
    });
    expect(solved).toBeGreaterThan(10);
  });
  it('reads the learner\'s home, naming the country itself', () => {
    expect(parseHome({ ll: [39.9, 116.4], a2: 'CN', climate: 'tmonsoon2' })).toMatchObject({ country: { a2: 'CN', name: ['China', '中国'] } });
    expect(parseHome({ ll: [91, 0] })).toBeNull();
    expect(parseHome({ ll: [0, 0], a2: 'cn' })).toBeNull();
    expect(parseHome({ ll: [0, 0], climate: 'lava' })).toBeNull();
  });
});

describe('client bundle', () => {
  it('never imports lesson content (it lives on the server)', () => {
    const seen = new Set<string>(), todo = [resolve('src/client/main.ts')];
    while (todo.length) {
      const f = todo.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      const src = readFileSync(f, 'utf8').replace(/^\s*import type [^;]+;/gm, '').replace(/^\s*export type [^;]+;/gm, '');
      for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+\.ts)['"]/g)) {
        const next = resolve(dirname(f), m[1]);
        if (existsSync(next)) todo.push(next);
      }
    }
    const content = [...seen].filter(f => /lessons\/(data|figs|l-[^/]+|astro\/l-[^/]+)\.ts$/.test(f));
    expect(content).toEqual([]);
    expect([...seen].some(f => f.endsWith('lessons/player.ts'))).toBe(true);
  });
});

describe('sign-in mail', async () => {
  const { mailerFromEnv } = await import('../../src/server/mail.ts');
  const { createServer } = await import('node:net');

  it('explains a missing or invalid transport', () => {
    expect('error' in mailerFromEnv({})).toBe(true);
    expect('error' in mailerFromEnv({ SMTP_URL: 'smtp://h' })).toBe(true);
    expect('error' in mailerFromEnv({ SMTP_URL: 'http://h', MAIL_FROM: 'a@b.co' })).toBe(true);
    expect('send' in mailerFromEnv({ MAIL_API_URL: 'https://x', MAIL_FROM: 'a@b.co' })).toBe(true);
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
});
