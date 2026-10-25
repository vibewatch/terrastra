/**
 * Sign-in (NextAuth v4, database sessions in PostgreSQL): a magic link by e-mail, plus GitHub and Google when their
 * credentials are configured. `DEV_LOGIN=1` keeps the links in a dev mailbox instead of sending them.
 */
import type { NextAuthOptions, Session } from 'next-auth';
import { getServerSession } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { mailerFromEnv } from '@src/server/mail.ts';
import { EMAIL_RE } from '@src/server/rules.ts';
import { prismaAdapter } from './adapter.ts';
import { db } from './db.ts';
import { devLogin } from './http.ts';

export type Role = 'LEARNER' | 'TEACHER' | 'ADMIN';
export interface Me { id: string; email: string; handle: string | null; role: Role }

declare module 'next-auth' {
  interface Session { user: Me }
}

const g = globalThis as { __mailbox?: Map<string, string> };
/** Development only: the last sign-in link per address. */
export const mailbox = (): Map<string, string> => (g.__mailbox ??= new Map());

const prod = process.env.NODE_ENV === 'production';
const mailer = mailerFromEnv(process.env);
if (!('send' in mailer) && prod && !devLogin() && process.env.NEXT_PHASE !== 'phase-production-build') console.error(`[mail] e-mail sign-in is OFF: ${mailer.error}`);
/** E-mail sign-in is on with a mail transport, or in development. */
export const emailSignIn = 'send' in mailer || devLogin() || !prod;

function providers(): NextAuthOptions['providers'] {
  const list: NextAuthOptions['providers'] = [];
  if (emailSignIn) list.push(EmailProvider({
    server: '', from: process.env.MAIL_FROM ?? 'Terrastra <no-reply@localhost>', maxAge: 15 * 60,
    normalizeIdentifier(id) {
      const email = id.trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 254) throw new Error('Please enter a valid email');
      return email;
    },
    async sendVerificationRequest({ identifier, url }) {
      if (devLogin()) { mailbox().set(identifier, url); return; }
      if ('send' in mailer) { await mailer.send(identifier, url); return; }
      console.log(`[mail] sign-in link for ${identifier.replace(/(.).*@/, '$1***@')}: ${url}`);
    },
  }));
  // OAuth providers return verified addresses, so an account with the same e-mail is the same learner.
  if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) list.push(GitHubProvider({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET, allowDangerousEmailAccountLinking: true }));
  if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) list.push(GoogleProvider({ clientId: process.env.GOOGLE_ID, clientSecret: process.env.GOOGLE_SECRET, allowDangerousEmailAccountLinking: true }));
  return list;
}

export const authOptions: NextAuthOptions = {
  adapter: prismaAdapter(),
  providers: providers(),
  secret: process.env.NEXTAUTH_SECRET ?? (prod ? undefined : 'terrastra-dev-secret'),
  session: { strategy: 'database', maxAge: 60 * 24 * 3600, updateAge: 24 * 3600 },
  pages: { signIn: '/signin', verifyRequest: '/signin?sent=1', error: '/signin' },
  callbacks: {
    async session({ session, user }) {
      const u = user as typeof user & { handle?: string | null; role?: Role };
      session.user = { id: u.id, email: u.email ?? '', handle: u.handle ?? null, role: u.role ?? 'LEARNER' };
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      await db().user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    },
  },
};

/** The signed-in learner, or null. */
export async function me(): Promise<Me | null> {
  const s: Session | null = await getServerSession(authOptions);
  return s?.user ?? null;
}
