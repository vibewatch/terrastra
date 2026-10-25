import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.ts';

export type { PrismaClient };
export { Prisma };

const g = globalThis as { __prisma?: PrismaClient };

/**
 * One client per process (dev hot reloads reuse it): Postgres, or SQLite for a `file:` URL (local development;
 * `next.config.ts` makes the default `.data/terrastra.db` path absolute). The client is generated for one of them
 * (`npm run db:setup`).
 */
export function db(): PrismaClient {
  const url = process.env.DATABASE_URL || 'file:./.data/terrastra.db';
  return g.__prisma ??= new PrismaClient({
    adapter: url.startsWith('file:') ? new PrismaBetterSqlite3({ url }) : new PrismaPg({ connectionString: url }),
  });
}

/** Inserts a row unless one with the same unique key exists (a portable `skipDuplicates`); `true` if it was new. */
export async function insertOnce(write: PromiseLike<unknown>): Promise<boolean> {
  try {
    await write;
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
    throw e;
  }
}
