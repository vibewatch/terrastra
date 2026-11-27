import type { Progress } from '../../shared/lib/progress.ts';
import { parseRetryAfterSeconds, type Plan, type PlanSpec } from '../../shared/lib/entitlements.ts';
import type { SyncExtras } from '../../shared/lib/sync-extras.ts';
import { HAS_API, url } from './env.ts';

export interface Me { id: number; email: string; handle: string | null; plan?: Plan }
export interface StorefrontInfo {
  purchaseUrlPro: string | null;
  purchaseUrlClassroom: string | null;
  purchaseContact: string | null;
}
export interface BillingOrder {
  id: string;
  plan: 'pro' | 'classroom';
  provider: string;
  status: 'pending' | 'paid' | 'refunded' | 'disputed';
  createdAt: number;
  paidAt: number | null;
}
export interface BillingStatus {
  paywall: boolean;
  plan: Plan;
  source: string | null;
  grantedAt: number | null;
  expiresAt?: number | null;
  activeSessions: number;
  maxSessions: number;
  pricing?: { pro: PlanSpec; classroom: PlanSpec };
  storefront?: StorefrontInfo;
  orders?: BillingOrder[];
}
export interface RedeemResponse {
  ok: true;
  user: Me | null;
  entitlement: {
    plan: Plan;
    maxSessions: number;
    grantedAt: number | null;
    expiresAt: number | null;
    source: string | null;
  };
}
export interface GuestbookEntry { id: number; handle: string; body: string; created_at: string; mine?: boolean }

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSec?: number;
  constructor(status: number, message: string, code?: string, retryAfterSec?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

const API_TIMEOUT_MS = 15_000;
export { parseRetryAfterSeconds };

async function j<T>(resPromise: Promise<Response>): Promise<T> {
  let res: Response;
  try {
    res = await resPromise;
  } catch (err) {
    const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ApiError(408, 'Request timed out, please try again', 'REQUEST_TIMEOUT');
    }
    throw err;
  }
  if (!res.ok) {
    let msg = res.statusText;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body.error) msg = body.error;
      if (body.code) code = body.code;
    } catch { /* not json */ }
    const retryAfterSec = parseRetryAfterSeconds(res.headers.get('retry-after'));
    throw new ApiError(res.status, msg, code, retryAfterSec);
  }
  return (await res.json()) as T;
}
const opt = (method: string, body?: unknown): RequestInit => ({
  method,
  credentials: 'same-origin',
  headers: body ? { 'content-type': 'application/json' } : {},
  body: body ? JSON.stringify(body) : undefined,
  signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(API_TIMEOUT_MS) : undefined,
});

export const api = {
  async me(): Promise<Me | null> { if (!HAS_API) return null; return (await j<{ user: Me | null }>(fetch(url('api/me'), opt('GET')))).user; },
  async billingStatus(): Promise<BillingStatus | null> { if (!HAS_API) return null; return j<BillingStatus>(fetch(url('api/billing/status'), opt('GET'))); },
  redeemCode: async (code: string) => j<RedeemResponse>(fetch(url('api/billing/redeem'), opt('POST', { code }))),
  requestLink: async (email: string) => j<{ ok: true; devLink?: string }>(fetch(url('api/auth/request'), opt('POST', { email }))),
  logout: async () => j<{ ok: true }>(fetch(url('api/auth/logout'), opt('POST', {}))),
  logoutOthers: async () => j<{ ok: true; revoked: number; activeSessions: number }>(fetch(url('api/auth/logout-others'), opt('POST', {}))),
  setHandle: async (handle: string) => j<{ user: Me }>(fetch(url('api/profile'), opt('PUT', { handle }))),
  deleteAccount: async () => j<{ ok: true }>(fetch(url('api/me'), opt('DELETE'))),
  getProgress: async () => j<{ progress: Progress | null; extras?: SyncExtras | null }>(fetch(url('api/progress'), opt('GET'))),
  syncProgress: async (p: Progress, extras?: SyncExtras) => j<{ progress: Progress; extras?: SyncExtras }>(fetch(url('api/progress'), opt('PUT', extras ? { progress: p, extras } : { progress: p }))),
  reactions: async (key: string) => j<{ like: number; visited: number }>(fetch(url('api/reactions?key=' + encodeURIComponent(key)), opt('GET'))),
  react: async (key: string, kind: 'like' | 'visited', on: boolean) => j<{ like: number; visited: number }>(fetch(url('api/reactions'), opt('POST', { key, kind, on }))),
  guestbook: async () => j<{ entries: GuestbookEntry[] }>(fetch(url('api/guestbook'), opt('GET'))),
  post: async (body: string) => j<{ entry: GuestbookEntry }>(fetch(url('api/guestbook'), opt('POST', { body }))),
  deleteGuestbookEntry: async (id: number) => j<{ ok: true }>(fetch(url(`api/guestbook/${id}`), opt('DELETE'))),
  report: async (id: number) => j<{ ok: true }>(fetch(url(`api/guestbook/${id}/report`), opt('POST', {}))),
};
