import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { mailerFromEnv, type SendMail } from './mail.ts';

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
if (prod && process.env.INSECURE_COOKIES === '1') console.error('[auth] INSECURE_COOKIES is enabled: use only in isolated HTTP staging.');
if (prod && process.env.INSECURE_MAIL_API === '1') console.error('[mail] INSECURE_MAIL_API is enabled: use only with an isolated relay.');
const devLogin = !prod || process.env.DEV_LOGIN === '1';
if (prod && devLogin) console.error('[auth] DEV_LOGIN is enabled: anyone can sign in as any email address. Use only in isolated testing.');
const mailer = mailerFromEnv(process.env);
let sendMail: SendMail | undefined;
if ('send' in mailer) sendMail = mailer.send;
else if (!prod) sendMail = async (to, link) => { console.log(`[mail] sign-in link for ${to.replace(/(.).*@/, '$1***@')}: ${link}`); };
else console.error(`[mail] email sign-in is OFF: ${mailer.error}`);
const db = openDb(process.env.DB_PATH ?? join(root, 'data', 'terrastra.db'));
const app = createApp({
  db,
  devLogin,
  baseUrl: configuredBaseUrl ?? `http://localhost:${port}`,
  secureCookies: prod && process.env.INSECURE_COOKIES !== '1',
  staticDir: join(root, 'dist'),
  sendMail,
});
app.listen(port, () => console.log(`Terrastra server on http://localhost:${port}`));
