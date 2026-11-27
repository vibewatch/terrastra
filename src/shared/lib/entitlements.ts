/**
 * Shared membership plans, redemption-code format, and Free vs Pro feature rules.
 * Used by both Express API enforcement and client UI gating so rules never drift.
 */

export type Plan = 'free' | 'pro' | 'classroom';

export interface PlanSpec {
  maxSessions: number;
  priceCny: number;
  earlyBirdCny: number;
  listCny: number;
  priceUsd: number;
  earlyBirdUsd: number;
  listUsd: number;
}

export const PLANS: Record<Plan, PlanSpec> = {
  free: {
    maxSessions: 3,
    priceCny: 0,
    earlyBirdCny: 0,
    listCny: 0,
    priceUsd: 0,
    earlyBirdUsd: 0,
    listUsd: 0,
  },
  pro: {
    maxSessions: 3,
    priceCny: 68,
    earlyBirdCny: 49,
    listCny: 98,
    priceUsd: 14.99,
    earlyBirdUsd: 9.99,
    listUsd: 19.99,
  },
  classroom: {
    maxSessions: 10,
    priceCny: 168,
    earlyBirdCny: 128,
    listCny: 238,
    priceUsd: 29.99,
    earlyBirdUsd: 24.99,
    listUsd: 39.99,
  },
};

export function isPlan(x: unknown): x is Plan {
  return x === 'free' || x === 'pro' || x === 'classroom';
}

export function isPaidPlan(plan: Plan | null | undefined): boolean {
  return plan === 'pro' || plan === 'classroom';
}

/**
 * True when the user can open Pro features.
 * While `paywallEnabled` is false (e.g. before payment gateways go live), all visitors keep full access.
 */
export function hasProAccess(plan: Plan | null | undefined, paywallEnabled: boolean): boolean {
  return !paywallEnabled || isPaidPlan(plan);
}

export function maxSessionsForPlan(plan: Plan | null | undefined): number {
  return PLANS[plan && isPlan(plan) ? plan : 'free'].maxSessions;
}

/** Unambiguous 32-character alphabet (omits 0, O, 1, I) for human-typed activation codes. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_BODY_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/;
const EMBEDDED_CODE_RE = /(?:^|[^A-Z0-9])(TRST[\s-]*(?:[ABCDEFGHJKLMNPQRSTUVWXYZ23456789][\s-]*){12})(?=$|[^A-Z0-9])/i;

/**
 * Normalizes a user-entered redemption code into canonical `TRST-XXXX-XXXX-XXXX` form,
 * or returns `null` if invalid.
 */
export function normalizeRedeemCode(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const compact = raw.trim().toUpperCase().replace(/[\s-]+/g, '');
  const body = compact.startsWith('TRST') ? compact.slice(4) : null;
  if (!body || !CODE_BODY_RE.test(body)) return null;
  return `TRST-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/**
 * Extracts a canonical `TRST-XXXX-XXXX-XXXX` code from a pasted URL (`#redeem=TRST-...`),
 * delivery email/chat message, or bare code string. Returns `null` if none is present.
 */
export function extractRedeemCode(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const direct = normalizeRedeemCode(raw);
  if (direct) return direct;
  let decoded = raw;
  try {
    if (raw.includes('%')) decoded = decodeURIComponent(raw);
  } catch { /* keep raw */ }
  const hit = EMBEDDED_CODE_RE.exec(decoded);
  return hit ? normalizeRedeemCode(hit[1]) : null;
}

/**
 * Formats progressive `TRST-...` typing with standard 4-character hyphen groups
 * while extracting full codes if the user pasted a link or receipt line.
 */
export function formatRedeemCodeInput(raw: string): string {
  const extracted = extractRedeemCode(raw);
  if (extracted) return extracted;
  const alnum = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!alnum.startsWith('TRST') || alnum.length <= 4 || alnum.length > 16) {
    return raw.toUpperCase();
  }
  const body = alnum.slice(4);
  const parts = ['TRST'];
  for (let i = 0; i < body.length; i += 4) parts.push(body.slice(i, i + 4));
  return parts.join('-');
}

/** Masks a valid activation code as `TRST-••••-••••-XXXX` for safe UI confirmation. */
export function maskRedeemCode(raw: string): string | null {
  const norm = normalizeRedeemCode(raw);
  return norm ? `TRST-••••-••••-${norm.slice(-4)}` : null;
}

/** Parses HTTP `Retry-After` (delta-seconds or IMF-fixdate) into non-negative seconds. */
export function parseRetryAfterSeconds(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) return Math.max(0, Number(trimmed));
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) return Math.max(0, Math.ceil((dateMs - now) / 1000));
  return undefined;
}

/**
 * Starter lessons bundled in the public `lessons-free` chunk so every curriculum track
 * offers complete, interactive lessons for free without downloading Pro chunks.
 */
export const FREE_LESSON_IDS = [
  // Geography starter modules (l-earth, l-land, l-home)
  'shape',
  'graticule',
  'hemispheres',
  'rotation',
  'landforms',
  'continents',
  'plates',
  'climate',
  'home',
  'h-history',
  // Astronomy starter modules (astro/l-earthmoon, astro/free-solar)
  'a-sun-moon',
  'a-phases',
  'a-eclipses',
  'a-tides',
  'a-systems',
] as const;

const FREE_LESSON_SET = new Set<string>(FREE_LESSON_IDS);

/** Private SSBS class lessons stay governed by `?ssbs=1`; starter lessons are free for everyone. */
export function isFreeLesson(id: string): boolean {
  return id.startsWith('ssbs-') || FREE_LESSON_SET.has(id);
}

export const FREE_TOUR_IDS = ['cosmos', 'tern'] as const;
const FREE_TOUR_SET = new Set<string>(FREE_TOUR_IDS);

export function isFreeTour(id: string): boolean {
  return FREE_TOUR_SET.has(id);
}

/** Free accounts keep up to 5 local mistake-notebook items; Pro unlocks unlimited mistake review & cloud sync. */
export const FREE_MISTAKE_LIMIT = 5;

/** ±1 year around the current calendar year is free in Sky Theatre; multi-decade 1900–2199 ephemeris & .ics export are Pro. */
export function isFreeSkyYear(year: number, nowYear = new Date().getFullYear()): boolean {
  return Math.abs(year - nowYear) <= 1;
}

/** Extracts the 4-digit calendar year (1900–2199) embedded in a Sky Theatre event ID, or `null` if absent. */
export function skyEventYear(id: string): number | null {
  const m = /(?:^|-)((?:19|20|21)\d\d)(?:-|$)/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Today, 2000 CE, and Dinosaur era (66 Ma) are free in Time Machine; full historical timeline stops are Pro. */
export function isFreeTimeStop(stop: number | 'now' | 'dino'): boolean {
  return stop === 'now' || stop === 'dino' || stop === 2000;
}

/** Masks an account email for subtle Pro handout attribution (`alice@example.com` -> `a***e@example.com`). */
export function maskLicenseEmail(email: string): string {
  const clean = email.trim();
  const at = clean.indexOf('@');
  if (at <= 0 || at === clean.length - 1) return clean;
  const local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  const maskedLocal = local.length <= 2
    ? local[0] + '***'
    : local[0] + '***' + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

