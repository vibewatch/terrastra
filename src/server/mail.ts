/**
 * Sign-in mail for the full-server edition, without extra dependencies. Two transports:
 * - `MAIL_API_URL` (+ `MAIL_API_KEY`): an HTTP email API taking `{ from, to, subject, text, html }` as JSON with a
 *   Bearer token (Resend's shape; most providers have a compatible endpoint or a tiny relay);
 * - `SMTP_URL=smtps://user:pass@host:465` (implicit TLS) or `smtp://user:pass@host:587` (STARTTLS required).
 * Both need `MAIL_FROM`. `SMTP_CA_FILE` trusts a private CA (e.g. an internal relay). A failed send rejects, so the API can say so instead of pretending the mail went out.
 */
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { connect as netConnect, type Socket } from 'node:net';
import { readFileSync } from 'node:fs';

export type SendMail = (to: string, link: string) => Promise<void>;
type Env = Record<string, string | undefined>;

function mailBody(link: string): { subject: string; text: string; html: string } {
  const subject = 'Your Terrastra sign-in link · 寰星登录链接';
  const text = `Tap this link to sign in to Terrastra. It works once and expires in 15 minutes.\n点击下面的链接登录寰星。链接只能使用一次，15 分钟后失效。\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.\n如果不是你本人操作，请忽略这封邮件。`;
  const esc = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = `<p>Tap the button to sign in to Terrastra. It works once and expires in 15 minutes.<br>点击按钮登录寰星。链接只能使用一次，15 分钟后失效。</p><p><a href="${esc}" style="display:inline-block;padding:10px 18px;background:#ffb547;color:#111;text-decoration:none;font-weight:600">Sign in · 登录</a></p><p style="color:#666;font-size:12px">If you didn't ask for this, ignore this email. 如果不是你本人操作，请忽略这封邮件。</p>`;
  return { subject, text, html };
}

/** Picks a transport from the environment, or explains what is missing. */
export function mailerFromEnv(env: Env): { send: SendMail } | { error: string } {
  const from = env.MAIL_FROM;
  if (env.MAIL_API_URL) {
    if (!from) return { error: 'MAIL_FROM is required with MAIL_API_URL' };
    return { send: httpMailer(env.MAIL_API_URL, env.MAIL_API_KEY ?? '', from) };
  }
  if (env.SMTP_URL) {
    if (!from) return { error: 'MAIL_FROM is required with SMTP_URL' };
    let u: URL;
    try { u = new URL(env.SMTP_URL); } catch { return { error: 'SMTP_URL is not a valid URL' }; }
    if (u.protocol !== 'smtps:' && u.protocol !== 'smtp:') return { error: 'SMTP_URL must start with smtps:// or smtp://' };
    let ca: string | undefined;
    if (env.SMTP_CA_FILE) try { ca = readFileSync(env.SMTP_CA_FILE, 'utf8'); } catch { return { error: 'SMTP_CA_FILE cannot be read' }; }
    return { send: smtpMailer(u, from, ca) };
  }
  return { error: 'no mail transport: set MAIL_API_URL or SMTP_URL (and MAIL_FROM)' };
}

function httpMailer(endpoint: string, key: string, from: string): SendMail {
  return async (to, link) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ from, to, ...mailBody(link) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`mail API ${res.status}`);
  };
}

/** A minimal SMTP client: EHLO, (STARTTLS), AUTH PLAIN, one message. */
function smtpMailer(u: URL, from: string, ca?: string): SendMail {
  const host = u.hostname, implicit = u.protocol === 'smtps:';
  const port = Number(u.port || (implicit ? 465 : 587));
  const user = decodeURIComponent(u.username), pass = decodeURIComponent(u.password);
  return async (to, link) => {
    const addr = (s: string) => s.match(/<([^>]+)>/)?.[1] ?? s;
    if (/[\r\n]/.test(to + from)) throw new Error('bad address');
    let sock: Socket | TLSSocket = implicit ? tlsConnect({ host, port, servername: host, ca }) : netConnect({ host, port });
    sock.setTimeout(20_000, () => sock.destroy(new Error('smtp timeout')));
    let buf = '';
    let waiting: ((line: string) => void) | null = null;
    let failed: Error | null = null;
    const onData = (d: Buffer) => {
      buf += d.toString('utf8');
      // a reply is complete at a line "NNN text" or a bare "NNN" (not "NNN-", which continues)
      const m = buf.match(/(?:^|\r\n)(\d{3})(?: [^\r\n]*)?\r\n$/);
      if (m && waiting) { const all = buf; buf = ''; const w = waiting; waiting = null; w(all); }
    };
    const onErr = (e: Error) => { failed = e; if (waiting) { const w = waiting; waiting = null; w(''); } };
    // a server hanging up mid-conversation must not leave a reply pending forever
    const onClose = () => { if (waiting) onErr(failed ?? new Error('smtp: connection closed')); };
    const attach = (s: Socket | TLSSocket) => { s.on('data', onData); s.on('error', onErr); s.on('close', onClose); };
    attach(sock);
    const reply = () => new Promise<string>(res => { waiting = res; });
    const expect = async (ok: string) => {
      const r = await reply();
      if (failed) throw failed;
      const code = r.trimEnd().split('\r\n').at(-1)!.slice(0, 3);
      if (!ok.split('|').includes(code)) throw new Error(`smtp: ${r.trim().slice(0, 120)}`);
      return r;
    };
    const cmd = (line: string, ok: string) => { sock.write(line + '\r\n'); return expect(ok); };
    try {
      await expect('220');
      let ehlo = await cmd('EHLO terrastra', '250');
      if (!implicit) {
        if (!/STARTTLS/i.test(ehlo)) throw new Error('smtp: server offers no STARTTLS');
        await cmd('STARTTLS', '220');
        sock.removeAllListeners('data');
        sock = tlsConnect({ socket: sock, servername: host, ca });
        attach(sock);
        await new Promise<void>((res, rej) => { (sock as TLSSocket).once('secureConnect', res); sock.once('error', rej); });
        ehlo = await cmd('EHLO terrastra', '250');
      }
      if (user) await cmd('AUTH PLAIN ' + Buffer.from(`\0${user}\0${pass}`).toString('base64'), '235');
      await cmd(`MAIL FROM:<${addr(from)}>`, '250');
      await cmd(`RCPT TO:<${addr(to)}>`, '250|251');
      await cmd('DATA', '354');
      const { subject, text } = mailBody(link);
      const enc = (s: string) => '=?UTF-8?B?' + Buffer.from(s).toString('base64') + '?=';
      const msg = [
        `From: ${from}`, `To: ${to}`, `Subject: ${enc(subject)}`, `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '',
        Buffer.from(text).toString('base64').replace(/.{76}/g, '$&\r\n'),
      ].join('\r\n');
      await cmd(msg + '\r\n.', '250');
      sock.write('QUIT\r\n');
    } finally {
      sock.end();
    }
  };
}
