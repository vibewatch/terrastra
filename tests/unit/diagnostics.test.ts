import { describe, it, expect } from 'vitest';
import { createErrorLog, sanitizeDiagText } from '../../src/client/lib/diagnostics.ts';
import { withContentPolicy } from '../../scripts/csp.ts';

const e = (at: number, message = 'TypeError: x is undefined', where = 'view.ts:1:2') => ({ at, kind: 'error' as const, message, where, scene: 'globe' });

describe('error log', () => {
  it('keeps the latest entries, merges repeats and ignores browser noise including AbortError', () => {
    const log = createErrorLog(3);
    log.add(e(1)); log.add(e(2));
    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0].count).toBe(2);
    log.add(e(3, 'Script error.'));
    log.add(e(4, 'ResizeObserver loop completed with undelivered notifications.'));
    log.add(e(5, 'AbortError: The operation was aborted.'));
    expect(log.entries()).toHaveLength(1);
    for (let i = 0; i < 5; i++) log.add(e(10 + i, 'err ' + i));
    expect(log.entries().map(x => x.message)).toEqual(['err 2', 'err 3', 'err 4']);
    expect(log.add(e(20, 'x'.repeat(1000)))).toBeTypeOf('boolean');
    expect(log.entries().at(-1)!.message.length).toBe(300);
    log.clear();
    expect(log.entries()).toEqual([]);
  });

  it('redacts origins, query strings, and redeem/token hashes from diagnostic text', () => {
    expect(sanitizeDiagText('Failed at https://terrastra.example/app.js?token=abc123:10:4')).toBe('Failed at /app.js?[redacted]:10:4');
    expect(sanitizeDiagText('Bad route #redeem=PP-PRO1-ABCD-EFGH')).toBe('Bad route #[redacted]');
  });

  it('signals a burst once, then stays quiet for a while', () => {
    const log = createErrorLog(20, { n: 3, withinMs: 60_000 }, 300_000);
    expect(log.add(e(0, 'a'))).toBe(false);
    expect(log.add(e(1000, 'b'))).toBe(false);
    expect(log.add(e(2000, 'c'))).toBe(true);
    expect(log.add(e(3000, 'd'))).toBe(false); // quiet period
    expect(log.add(e(400_000, 'e'))).toBe(false); // the old ones are out of the window
    expect(log.add(e(401_000, 'f'))).toBe(false);
    expect(log.add(e(402_000, 'g'))).toBe(true);
  });
});

describe('withContentPolicy', () => {
  it('deduplicates identical inline script hashes and preserves <head> attributes', () => {
    const html = '<!doctype html><html><head lang="en"><script>var x=1;</script><script>var x=1;</script><script src="/app.js"></script></head><body></body></html>';
    const out = withContentPolicy(html);
    expect(out).toContain('<head lang="en"><meta http-equiv="Content-Security-Policy"');
    const shaMatches = out.match(/'sha256-[^']+'/g) ?? [];
    expect(shaMatches).toHaveLength(1);
  });
});
