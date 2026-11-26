/**
 * Dev login returns magic links in the API response, so anyone can sign in as any email address.
 * It fails closed: only an explicit DEV_LOGIN=1 or NODE_ENV=development (set by `npm run dev:server`) turns it on.
 */
export function devLoginFrom(env: Record<string, string | undefined>): boolean {
  return env.DEV_LOGIN === '1' || env.NODE_ENV === 'development';
}

/**
 * Controls strict Pro paywall enforcement (`401`/`402` on Pro chunks & UI locks).
 * Defaults to false while payment gateways are not yet configured, and turns on with `PAYWALL_ENABLED=1`.
 */
export function paywallFrom(env: Record<string, string | undefined>): boolean {
  return env.PAYWALL_ENABLED === '1';
}

/** True for origins that only reach this machine, where dev login cannot be abused from outside. */
export function isLocalOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  } catch { return false; }
}
