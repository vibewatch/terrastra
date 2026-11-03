import { transaction, type DB } from './db.ts';

export interface LimiterStore {
  db: DB;
  scope: string;
}

/**
 * Fixed-window limiter with bounded buckets; new keys fail closed while all buckets are active.
 * Uses SQLite when `store` is supplied so multiple server processes share one rate-limit state.
 */
export function limiter(max: number, windowMs: number, maxBuckets = 10_000, store?: LimiterStore): (key: string) => boolean {
  if (store) {
    const { db, scope } = store;
    const getRow = db.prepare('SELECT count, reset FROM rate_limits WHERE scope = ? AND key = ?');
    const bumpRow = db.prepare('UPDATE rate_limits SET count = count + 1 WHERE scope = ? AND key = ?');
    const setRow = db.prepare('INSERT INTO rate_limits (scope, key, count, reset) VALUES (?, ?, 1, ?) ON CONFLICT(scope, key) DO UPDATE SET count = 1, reset = excluded.reset');
    const countRows = db.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE scope = ?');
    const purgeExpired = db.prepare('DELETE FROM rate_limits WHERE scope = ? AND reset <= ?');
    return key => transaction(db, () => {
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
          if (after.n >= maxBuckets) return false;
        }
      }
      setRow.run(scope, key, now + windowMs);
      return true;
    });
  }
  const hits = new Map<string, { n: number; reset: number }>();
  let earliestReset = Infinity;
  return key => {
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
      if (hits.size >= maxBuckets) return false;
    }
    const reset = now + windowMs;
    hits.set(key, { n: 1, reset });
    earliestReset = Math.min(earliestReset, reset);
    return true;
  };
}
