/**
 * Local error log: uncaught errors and rejections are kept in memory (never sent anywhere) so a parent or teacher can
 * copy a short report from the menu, and a gentle notice appears when things keep failing.
 */
export interface ErrorEntry { at: number; kind: 'error' | 'rejection'; message: string; where: string; count: number; scene: string }

/** Browser noise that says nothing about the app: opaque cross-origin script errors, ResizeObserver warnings, and intentional AbortController cancellations. */
const NOISE = /^(Script error\.?|ResizeObserver loop (limit exceeded|completed with undelivered notifications)\.?|AbortError(:.*)?)$/;

/** Strips origins, query parameters (such as magic-link tokens), and redeem hashes so diagnostic strings never leak secrets. */
export function sanitizeDiagText(s: string): string {
  return s
    .replace(/https?:\/\/[^/\s?#)]+/g, '')
    .replace(/\?[A-Za-z0-9_.~%+&=-]+/g, '?[redacted]')
    .replace(/#(redeem|token|code|magic)[=/:][^\s)]+/gi, '#[redacted]');
}

export function createErrorLog(max = 20, burst = { n: 3, withinMs: 60_000 }, quietMs = 5 * 60_000) {
  const entries: ErrorEntry[] = [];
  let lastNotice = -Infinity;
  return {
    entries: () => entries.slice(),
    clear: () => { entries.length = 0; },
    /** Records an error; returns true when it completes a burst that should be shown to the user (rate-limited). */
    add(e: Omit<ErrorEntry, 'count'>): boolean {
      const rawMsg = e.message.trim();
      if (!rawMsg || NOISE.test(rawMsg)) return false;
      const message = sanitizeDiagText(rawMsg).slice(0, 300);
      const where = sanitizeDiagText(e.where).slice(0, 200);
      const last = entries[entries.length - 1];
      if (last && last.message === message && last.where === where) { last.count++; last.at = e.at; }
      else {
        entries.push({ ...e, message, where, count: 1 });
        if (entries.length > max) entries.shift();
      }
      const recent = entries.filter(x => e.at - x.at <= burst.withinMs).reduce((n, x) => n + x.count, 0);
      if (recent < burst.n || e.at - lastNotice < quietMs) return false;
      lastNotice = e.at;
      return true;
    },
  };
}

const log = createErrorLog();
export const errorCount = (): number => log.entries().reduce((n, e) => n + e.count, 0);
export const clearErrorLog = (): void => log.clear();

/** First stack frame (file:line:col), with the origin and query stripped, so reports carry no page URL or user data. */
function whereOf(err: unknown, fallback = ''): string {
  const stack = err instanceof Error && err.stack ? err.stack.split('\n').find(l => /:\d+:\d+/.test(l)) ?? '' : fallback;
  return sanitizeDiagText(stack.trim());
}

export function installDiagnostics(opts: { scene: () => string; onBurst: () => void }): void {
  const record = (kind: ErrorEntry['kind'], err: unknown, message: string, where: string) => {
    if (log.add({ at: Date.now(), kind, message, where: whereOf(err, where), scene: opts.scene() })) opts.onBurst();
  };
  window.addEventListener('error', e => {
    // resource load errors (img/script tags) bubble here without a message; lazy chunks report through their own path
    if (!e.message) return;
    record('error', e.error, e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '');
  });
  window.addEventListener('unhandledrejection', e => {
    const r: unknown = e.reason;
    record('rejection', r, r instanceof Error ? `${r.name}: ${r.message}` : String(r), '');
  });
}

/** A plain-text report for the clipboard. Nothing is uploaded. */
export function diagnosticsReport(extra: Record<string, string>): string {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lines = [
    'Terrastra diagnostics',
    `time: ${new Date().toISOString()}`,
    `agent: ${navigator.userAgent}`,
    `lang: ${navigator.language || 'unknown'}`,
    `online: ${navigator.onLine}`,
    ...(typeof nav.deviceMemory === 'number' ? [`memoryGB: ${nav.deviceMemory}`] : []),
    `screen: ${screen.width}x${screen.height} @${devicePixelRatio}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    `errors: ${errorCount()}`,
    ...log.entries().map(e => `- ${new Date(e.at).toISOString()} [${e.kind}${e.count > 1 ? ' ×' + e.count : ''}] (${e.scene}) ${e.message}${e.where ? ' @ ' + e.where : ''}`),
  ];
  return lines.join('\n');
}
