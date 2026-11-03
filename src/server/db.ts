import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, handle TEXT UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS login_tokens (
      hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS login_tokens_expiry ON login_tokens(expires);
    CREATE INDEX IF NOT EXISTS login_tokens_email ON login_tokens(email);
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS progress (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reactions (
      visitor TEXT NOT NULL, item TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('like','visited')),
      created_at INTEGER NOT NULL, PRIMARY KEY (visitor, item, kind));
    CREATE INDEX IF NOT EXISTS reactions_item ON reactions(item, kind);
    CREATE TABLE IF NOT EXISTS guestbook (
      id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), reports INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS guestbook_user ON guestbook(user_id);
    CREATE INDEX IF NOT EXISTS guestbook_visible ON guestbook(hidden, id DESC);
    CREATE TABLE IF NOT EXISTS guestbook_reports (
      entry_id INTEGER NOT NULL REFERENCES guestbook(id) ON DELETE CASCADE, visitor TEXT NOT NULL, PRIMARY KEY (entry_id, visitor));
    CREATE INDEX IF NOT EXISTS guestbook_reports_visitor ON guestbook_reports(visitor);
    CREATE TABLE IF NOT EXISTS app_secrets (
      name TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}

export function transaction<T>(db: DB, run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); }
    catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Transaction and rollback failed'); }
    throw error;
  }
}
