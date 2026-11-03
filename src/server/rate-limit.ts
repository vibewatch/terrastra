/** Fixed-window limiter with bounded memory; new keys fail closed while all buckets are active. */
export function limiter(max: number, windowMs: number, maxBuckets = 10_000): (key: string) => boolean {
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
