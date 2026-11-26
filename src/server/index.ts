import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { mailerFromEnv, type SendMail } from './mail.ts';
import { devLoginFrom, isLocalOrigin, paywallFrom, storefrontFrom } from './config.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const portText = process.env.PORT ?? '8787';
const port = Number(portText);
if (!portText.trim() || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
const prod = process.env.NODE_ENV === 'production';
const configuredBaseUrl = process.env.BASE_URL?.trim();
if (prod && !configuredBaseUrl) throw new Error('BASE_URL is required in production');
if (prod && configuredBaseUrl && process.env.INSECURE_COOKIES !== '1' && new URL(configuredBaseUrl).protocol !== 'https:') {
  throw new Error('BASE_URL must use HTTPS in production unless INSECURE_COOKIES=1 is set for isolated staging');
}
if (prod && process.env.INSECURE_COOKIES === '1') console.error('[auth] INSECURE_COOKIES is enabled: use only in isolated staging.');
if (prod && process.env.INSECURE_MAIL_API === '1') console.error('[mail] INSECURE_MAIL_API is enabled: use only with an isolated relay.');
const devLogin = devLoginFrom(process.env);
if (devLogin && (prod || (configuredBaseUrl && !isLocalOrigin(configuredBaseUrl)))) {
  console.error('[auth] DEV_LOGIN is enabled on a public origin: anyone can sign in as any email address. Use only in isolated testing.');
}
const mailer = mailerFromEnv(process.env);
let sendMail: SendMail | undefined;
if ('send' in mailer) sendMail = mailer.send;
else if (!prod) sendMail = async (to, link) => { console.log(`[mail] sign-in link for ${to.replace(/(.).*@/, '$1***@')}: ${link}`); };
else console.error(`[mail] email sign-in is OFF: ${mailer.error}`);
const db = openDb(process.env.DB_PATH ?? join(root, 'data', 'terrastra.db'));
const enforcePaywall = paywallFrom(process.env);
if (enforcePaywall) console.log('[billing] PAYWALL_ENABLED=1: Pro content gating is active.');
const storefront = storefrontFrom(process.env);
const app = createApp({
  db,
  devLogin,
  enforcePaywall,
  storefront,
  baseUrl: configuredBaseUrl ?? `http://localhost:${port}`,
  secureCookies: prod && process.env.INSECURE_COOKIES !== '1',
  staticDir: join(root, 'dist'),
  sendMail,
});
const server = app.listen(port, () => console.log(`Terrastra server on http://localhost:${port}`));

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, closing connections and checkpointing SQLite...`);
  const forceTimer = setTimeout(() => {
    try { db.close(); } catch { /* ignore */ }
    process.exit(0);
  }, 5_000);
  forceTimer.unref();
  server.close(() => {
    clearTimeout(forceTimer);
    try { db.close(); } catch { /* ignore */ }
    process.exit(0);
  });
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

