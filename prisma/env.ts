/**
 * Which database the app and the Prisma CLI use: `DATABASE_URL` (Postgres in production), or by default a local
 * SQLite file for development. Loads the repository's `.env` first (it never overrides the real environment).
 */
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEV_DATABASE_URL = 'file:./.data/terrastra.db';

try { process.loadEnvFile(resolve(ROOT, '.env')); } catch { /* no .env */ }

export const isSqlite = (url: string): boolean => url.startsWith('file:');

/** The database URL, with a relative SQLite path made absolute (from the repository root) and its folder created. */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL || DEV_DATABASE_URL;
  if (!isSqlite(url) || url === 'file::memory:') return url;
  const path = url.slice('file:'.length), abs = isAbsolute(path) ? path : resolve(ROOT, path);
  mkdirSync(dirname(abs), { recursive: true });
  return `file:${abs}`;
}
