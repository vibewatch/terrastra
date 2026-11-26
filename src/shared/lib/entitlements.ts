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
  // Astronomy starter modules (astro/l-earthmoon)
  'a-sun-moon',
  'a-phases',
  'a-eclipses',
  'a-tides',
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

/** Current and next UTC year are free in Sky Theatre; multi-decade historical/future ephemeris & .ics export are Pro. */
export function isFreeSkyYear(year: number, nowYear = new Date().getUTCFullYear()): boolean {
  return year === nowYear || year === nowYear + 1;
}

/** Today, 2000 CE, and Dinosaur era (66 Ma) are free in Time Machine; full historical timeline stops are Pro. */
export function isFreeTimeStop(stop: number | 'now' | 'dino'): boolean {
  return stop === 'now' || stop === 'dino' || stop === 2000;
}
