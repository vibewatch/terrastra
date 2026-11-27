import { transaction, type DB } from './db.ts';

export interface LimiterStore {
  db: DB;
  scope: string;
}

export interface Limiter {
  (key: string): boolean;
  /** Remaining whole seconds until `key`'s active window resets (at least 1). */
  retryAfterSec: (key: string) => number;
}

/**
 * Fixed-window limiter with bounded buckets. When every bucket is active, the one closest to expiry is evicted,
 * so filling the table cannot lock out new clients (callers key IPv6 by prefix so one host cannot fill it cheaply).
 * Uses SQLite when `store` is supplied so multiple server processes share one rate-limit state.
 */
export function limiter(max: number, windowMs: number, maxBuckets = 10_000, store?: LimiterStore): Limiter {
  const defaultSec = Math.max(1, Math.ceil(windowMs / 1000));
  if (store) {
    const { db, scope } = store;
    const getRow = db.prepare('SELECT count, reset FROM rate_limits WHERE scope = ? AND key = ?');
    const bumpRow = db.prepare('UPDATE rate_limits SET count = count + 1 WHERE scope = ? AND key = ?');
    const setRow = db.prepare('INSERT INTO rate_limits (scope, key, count, reset) VALUES (?, ?, 1, ?) ON CONFLICT(scope, key) DO UPDATE SET count = 1, reset = excluded.reset');
    const countRows = db.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE scope = ?');
    const purgeExpired = db.prepare('DELETE FROM rate_limits WHERE scope = ? AND reset <= ?');
    const evictOldest = db.prepare('DELETE FROM rate_limits WHERE scope = ? AND key = (SELECT key FROM rate_limits WHERE scope = ? ORDER BY reset LIMIT 1)');
    const fn = ((key: string) => transaction(db, () => {
      const now = Date.now();
      const row = getRow.get(scope, key) as { count: number; reset: number } | undefined;
      if (row && row.reset > now) {
        if (row.count >= max) return false;
        bumpRow.run(scope, key);
        return true;
      }
      if (!row) {
        const { n } = countRows.get(scope) as { n: number };
        if (n >= maxBuckets) {
          purgeExpired.run(scope, now);
          const after = countRows.get(scope) as { n: number };
          if (after.n >= maxBuckets) evictOldest.run(scope, scope);
        }
      }
      setRow.run(scope, key, now + windowMs);
      return true;
    })) as Limiter;
    fn.retryAfterSec = (key: string) => {
      const now = Date.now();
      const row = getRow.get(scope, key) as { count: number; reset: number } | undefined;
      return row && row.reset > now ? Math.max(1, Math.ceil((row.reset - now) / 1000)) : defaultSec;
    };
    return fn;
  }
  const hits = new Map<string, { n: number; reset: number }>();
  let earliestReset = Infinity;
  const fn = ((key: string) => {
    const now = Date.now();
    const hit = hits.get(key);
    if (hit && hit.reset > now) return ++hit.n <= max;
    if (!hit && hits.size >= maxBuckets) {
      if (now >= earliestReset) {
        earliestReset = Infinity;
        for (const [k, v] of hits) {
          if (v.reset <= now) hits.delete(k);
          else earliestReset = Math.min(earliestReset, v.reset);
        }
      }
      if (hits.size >= maxBuckets) {
        // Map keeps insertion order, and every window is the same length, so the first entry expires soonest
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
    }
    const reset = now + windowMs;
    hits.delete(key); // re-insert so insertion order stays oldest-first
    hits.set(key, { n: 1, reset });
    earliestReset = Math.min(earliestReset, reset);
    return true;
  }) as Limiter;
  fn.retryAfterSec = (key: string) => {
    const now = Date.now();
    const hit = hits.get(key);
    return hit && hit.reset > now ? Math.max(1, Math.ceil((hit.reset - now) / 1000)) : defaultSec;
  };
  return fn;
}
