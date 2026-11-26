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

export interface StorefrontConfig {
  purchaseUrlPro: string | null;
  purchaseUrlClassroom: string | null;
  purchaseContact: string | null;
}

function safePurchaseUrl(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.username || u.password) return null;
    if (u.protocol === 'https:') return u.toString();
    if (u.protocol === 'http:' && isLocalOrigin(u.origin)) return u.toString();
    return null;
  } catch {
    return null;
  }
}

/**
 * Optional external activation-code storefront links (e.g. Xiaohongshu / Taobao / WeChat Shop / Gumroad)
 * and operator support contact while native payment APIs are not yet enabled.
 */
export function storefrontFrom(env: Record<string, string | undefined>): StorefrontConfig {
  const contactRaw = env.PURCHASE_CONTACT?.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
  return {
    purchaseUrlPro: safePurchaseUrl(env.PURCHASE_URL_PRO),
    purchaseUrlClassroom: safePurchaseUrl(env.PURCHASE_URL_CLASSROOM) ?? safePurchaseUrl(env.PURCHASE_URL_PRO),
    purchaseContact: contactRaw ? contactRaw.slice(0, 120) : null,
  };
}

