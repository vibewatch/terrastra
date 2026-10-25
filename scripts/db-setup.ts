/**
 * Gets the database ready: generates the Prisma client for it, then creates its tables. Local SQLite (the default)
 * is pushed straight from the schema; Postgres applies the committed migrations.
 */
import { execFileSync } from 'node:child_process';
import { databaseUrl, isSqlite } from '../prisma/env.ts';

const prisma = (...args: string[]) => execFileSync('npx', ['prisma', ...args], { stdio: 'inherit' });
const sqlite = isSqlite(databaseUrl());
console.log(`Database: ${sqlite ? 'SQLite (local development)' : 'Postgres'}`);
prisma('generate');
prisma(...(sqlite ? ['db', 'push'] : ['migrate', 'deploy']));
