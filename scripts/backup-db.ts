import { randomUUID } from 'node:crypto';
import { closeSync, linkSync, openSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 3) throw new Error('Usage: npm run backup -- /path/to/new-backup.db');

const root = fileURLToPath(new URL('..', import.meta.url));
const source = process.env.DB_PATH ?? join(root, 'data', 'terrastra.db');
if (source === ':memory:') throw new Error('An in-memory database cannot be backed up by a separate process');
const destination = resolve(process.argv[2]);
const temporary = join(dirname(destination), `.terrastra-backup-${randomUUID()}.partial`);
const db = new DatabaseSync(source, { readOnly: true, timeout: 5000 });
let created = false, published = false;
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
console.log(`Backup created: ${destination}`);
