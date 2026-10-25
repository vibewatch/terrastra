/** NextAuth's database adapter over our Prisma client (users, OAuth accounts, sessions, e-mail sign-in tokens). */
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from 'next-auth/adapters';
import { db } from './db.ts';

type Row = { id: string; email: string | null; emailVerified: Date | null; name: string | null; image: string | null; handle: string | null; role: string };
/** NextAuth's user, with the nickname and role the session callback passes on. */
const user = (u: Row): AdapterUser => ({ id: u.id, email: u.email ?? '', emailVerified: u.emailVerified, name: u.name, image: u.image, handle: u.handle, role: u.role } as AdapterUser);
const isMissing = (e: unknown) => (e as { code?: string })?.code === 'P2025';

export function prismaAdapter(): Adapter {
  const p = db();
  return {
    async createUser(data: Omit<AdapterUser, 'id'>) {
      return user(await p.user.create({ data: { email: data.email.toLowerCase(), emailVerified: data.emailVerified, name: data.name, image: data.image } }));
    },
    async getUser(id) { const u = await p.user.findUnique({ where: { id } }); return u ? user(u) : null; },
    async getUserByEmail(email) { const u = await p.user.findUnique({ where: { email: email.toLowerCase() } }); return u ? user(u) : null; },
    async getUserByAccount({ provider, providerAccountId }: Pick<AdapterAccount, 'provider' | 'providerAccountId'>) {
      const a = await p.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } }, include: { user: true } });
      return a ? user(a.user) : null;
    },
    async updateUser({ id, ...data }) {
      return user(await p.user.update({ where: { id }, data: { emailVerified: data.emailVerified, name: data.name, image: data.image } }));
    },
    async deleteUser(id) { await p.user.delete({ where: { id } }).catch(e => { if (!isMissing(e)) throw e; }); },
    async linkAccount(a: AdapterAccount) {
      await p.account.create({ data: {
        userId: a.userId, type: a.type, provider: a.provider, providerAccountId: a.providerAccountId,
        refresh_token: a.refresh_token, access_token: a.access_token, expires_at: a.expires_at, token_type: a.token_type,
        scope: a.scope, id_token: a.id_token, session_state: a.session_state,
      } });
    },
    async unlinkAccount({ provider, providerAccountId }: Pick<AdapterAccount, 'provider' | 'providerAccountId'>) {
      await p.account.delete({ where: { provider_providerAccountId: { provider, providerAccountId } } }).catch(e => { if (!isMissing(e)) throw e; });
    },
    async createSession(s) { return p.session.create({ data: s }) as Promise<AdapterSession>; },
    async getSessionAndUser(sessionToken) {
      const s = await p.session.findUnique({ where: { sessionToken }, include: { user: true } });
      if (!s) return null;
      const { user: u, ...session } = s;
      return { session, user: user(u) };
    },
    async updateSession({ sessionToken, ...data }) {
      return p.session.update({ where: { sessionToken }, data }).catch(e => { if (isMissing(e)) return null; throw e; });
    },
    async deleteSession(sessionToken) {
      await p.session.delete({ where: { sessionToken } }).catch(e => { if (!isMissing(e)) throw e; });
    },
    async createVerificationToken(t) { return p.verificationToken.create({ data: t }); },
    async useVerificationToken({ identifier, token }) {
      return p.verificationToken.delete({ where: { identifier_token: { identifier, token } } }).catch(e => { if (isMissing(e)) return null; throw e; });
    },
  };
}
