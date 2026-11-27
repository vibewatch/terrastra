import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, linkSync, mkdirSync, openSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const rawArgs = process.argv.slice(2);
const asJson = rawArgs.includes('--json');
const posArgs = rawArgs.filter(a => a !== '--json');
if (posArgs.length !== 1 || posArgs[0].startsWith('-')) {
  throw new Error('Usage: npm run backup -- [--json] /path/to/new-backup.db');
}

const root = fileURLToPath(new URL('..', import.meta.url));
const source = process.env.DB_PATH ?? join(root, 'data', 'terrastra.db');
if (source === ':memory:') throw new Error('An in-memory database cannot be backed up by a separate process');
const destination = resolve(posArgs[0]);
if (existsSync(destination)) throw new Error(`Backup destination already exists: ${destination}`);
mkdirSync(dirname(destination), { recursive: true });
const temporary = join(dirname(destination), `.terrastra-backup-${randomUUID()}.partial`);
const db = new DatabaseSync(source, { readOnly: true, timeout: 5000 });
let created = false, published = false, sizeBytes = 0;
try {
  const fd = openSync(temporary, 'wx', 0o600);
  created = true;
  closeSync(fd);
  await backup(db, temporary);
  const snapshot = new DatabaseSync(temporary, { timeout: 5000 });
  try {
    snapshot.exec('PRAGMA journal_mode = DELETE');
    const result = snapshot.prepare('PRAGMA quick_check').get() as { quick_check: string };
    if (result.quick_check !== 'ok') throw new Error(`Backup integrity check failed: ${result.quick_check}`);
  } finally {
    snapshot.close();
  }
  sizeBytes = statSync(temporary).size;
  if (sizeBytes <= 0) throw new Error('Backup produced an empty database snapshot');
  linkSync(temporary, destination);
  published = true;
} finally {
  try {
    if (created) {
      let cleanupFailure: unknown;
      for (const file of [temporary, `${temporary}-wal`, `${temporary}-shm`, `${temporary}-journal`]) {
        try { rmSync(file, { force: true }); }
        catch (error) { console.error('[backup] could not remove temporary backup file:', error); cleanupFailure ??= error; }
      }
      if (published && cleanupFailure) throw cleanupFailure;
    }
  } finally { db.close(); }
}
if (asJson) {
  console.log(JSON.stringify({ ok: true, destination, bytes: sizeBytes }));
} else {
  console.log(`Backup created: ${destination} (${sizeBytes} bytes)`);
}
