import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';
import { ROOT, databaseUrl, isSqlite } from './prisma/env.ts';

const url = databaseUrl();

/**
 * `prisma/schema.prisma` (Postgres) is the one schema. Local development on SQLite uses a copy with the provider
 * swapped, kept in `prisma/sqlite/` (git-ignored) with its own migrations; `npm run db:setup` just pushes it.
 */
function sqliteSchema(): string {
  const src = readFileSync(resolve(ROOT, 'prisma/schema.prisma'), 'utf8');
  const out = '// Generated from ../schema.prisma by prisma.config.ts for local SQLite: do not edit.\n'
    + src.replace(/provider(\s*)=\s*"postgresql"/, 'provider$1= "sqlite"').replace(/output(\s*)=\s*"\.\.\//, 'output$1= "../../');
  const file = resolve(ROOT, 'prisma/sqlite/schema.prisma');
  mkdirSync(resolve(ROOT, 'prisma/sqlite'), { recursive: true });
  let old = '';
  try { old = readFileSync(file, 'utf8'); } catch { /* first run */ }
  if (old !== out) writeFileSync(file, out);
  return file;
}

export default defineConfig(isSqlite(url)
  ? { schema: sqliteSchema(), migrations: { path: 'prisma/sqlite/migrations' }, datasource: { url } }
  : { schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url } });
