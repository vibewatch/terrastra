import { createHash, randomBytes } from 'node:crypto';
import { transaction, type DB } from './db.ts';
import {
  CODE_ALPHABET,
  maxSessionsForPlan,
  normalizeRedeemCode,
  type Plan,
} from '../shared/lib/entitlements.ts';

export interface UserEntitlement {
  plan: Plan;
  maxSessions: number;
  grantedAt: number | null;
  expiresAt: number | null;
  source: string | null;
}

export class RedeemError extends Error {
  readonly status: 400 | 404 | 409;
  readonly code: 'INVALID_CODE' | 'CODE_NOT_FOUND' | 'CODE_ALREADY_USED';
  constructor(status: 400 | 404 | 409, code: 'INVALID_CODE' | 'CODE_NOT_FOUND' | 'CODE_ALREADY_USED', message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, classroom: 2 };

export function hashRedeemCode(normalizedCode: string): string {
  return createHash('sha256').update(normalizedCode).digest('hex');
}

export function generateRedeemCode(): string {
  const bytes = randomBytes(12);
  let body = '';
  for (let i = 0; i < 12; i++) {
    body += CODE_ALPHABET[bytes[i]! & 31];
  }
  return `TRST-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export function getUserEntitlement(db: DB, userId: number, now = Date.now()): UserEntitlement {
  const row = db.prepare(
    'SELECT plan, max_sessions, granted_at, expires_at, source FROM entitlements WHERE user_id = ?',
  ).get(userId) as {
    plan: Plan;
    max_sessions: number;
    granted_at: number;
    expires_at: number | null;
    source: string;
  } | undefined;
  if (!row || row.plan === 'free' || (row.expires_at !== null && row.expires_at <= now)) {
    return { plan: 'free', maxSessions: maxSessionsForPlan('free'), grantedAt: null, expiresAt: null, source: null };
  }
  return {
    plan: row.plan,
    maxSessions: Math.max(1, Number(row.max_sessions) || maxSessionsForPlan(row.plan)),
    grantedAt: Number(row.granted_at),
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
    source: row.source,
  };
}

/**
 * Grants or upgrades a user's entitlement without downgrading an already higher active tier
 * (e.g. a Classroom account redeeming a Pro code keeps Classroom).
 */
export function grantEntitlement(
  db: DB,
  opts: {
    userId: number;
    plan: 'pro' | 'classroom';
    source: string;
    expiresAt?: number | null;
    now?: number;
  },
): UserEntitlement {
  const now = opts.now ?? Date.now();
  const current = getUserEntitlement(db, opts.userId, now);
  const nextPlan: Plan = PLAN_RANK[opts.plan] >= PLAN_RANK[current.plan] ? opts.plan : current.plan;
  const maxSessions = Math.max(current.maxSessions, maxSessionsForPlan(nextPlan));
  const expiresAt = opts.expiresAt === undefined
    ? null
    : current.plan !== 'free' && current.expiresAt === null
      ? null
      : opts.expiresAt;
  db.prepare(`
    INSERT INTO entitlements (user_id, plan, max_sessions, granted_at, expires_at, source)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan = excluded.plan,
      max_sessions = excluded.max_sessions,
      granted_at = excluded.granted_at,
      expires_at = excluded.expires_at,
      source = excluded.source
  `).run(opts.userId, nextPlan, maxSessions, now, expiresAt, opts.source);
  return getUserEntitlement(db, opts.userId, now);
}

/** Enforces FIFO concurrent active sessions for a user before inserting one new session. */
export function enforceSessionCap(db: DB, userId: number, maxSessions: number, now = Date.now()): void {
  const cap = Math.max(1, Math.floor(maxSessions));
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires <= ?').run(userId, now);
  const rows = db.prepare(
    'SELECT hash FROM sessions WHERE user_id = ? ORDER BY created_at ASC, rowid ASC',
  ).all(userId) as { hash: string }[];
  const overflow = rows.length - (cap - 1);
  if (overflow > 0) {
    const del = db.prepare('DELETE FROM sessions WHERE hash = ?');
    for (let i = 0; i < overflow; i++) del.run(rows[i]!.hash);
  }
}

export function countActiveSessions(db: DB, userId: number, now = Date.now()): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires > ?').get(userId, now) as { n: number };
  return Number(row.n);
}

/** Issues `count` single-use activation codes, storing only their SHA-256 hash and last-4 hint in SQLite. */
export function issueRedemptionCodes(
  db: DB,
  opts: { plan: 'pro' | 'classroom'; count: number; note?: string; now?: number },
): string[] {
  const count = Math.max(1, Math.min(1000, Math.floor(opts.count)));
  const now = opts.now ?? Date.now();
  const note = opts.note?.trim() ? opts.note.trim().slice(0, 120) : null;
  return transaction(db, () => {
    const ins = db.prepare(`
      INSERT INTO redemption_codes (code_hash, code_hint, plan, note, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const created: string[] = [];
    while (created.length < count) {
      const code = generateRedeemCode();
      const hash = hashRedeemCode(code);
      const exists = db.prepare('SELECT 1 FROM redemption_codes WHERE code_hash = ?').get(hash);
      if (exists) continue;
      ins.run(hash, code.slice(-4), opts.plan, note, now);
      created.push(code);
    }
    return created;
  });
}

/** Atomically validates and consumes a single-use activation code, recording an order and granting entitlement. */
export function redeemCodeForUser(db: DB, userId: number, rawCode: string, now = Date.now()): UserEntitlement {
  const normalized = normalizeRedeemCode(rawCode);
  if (!normalized) {
    throw new RedeemError(400, 'INVALID_CODE', 'Please enter a valid 16-character activation code (TRST-XXXX-XXXX-XXXX)');
  }
  const hash = hashRedeemCode(normalized);
  return transaction(db, () => {
    const row = db.prepare(
      'SELECT plan, redeemed_by, revoked FROM redemption_codes WHERE code_hash = ?',
    ).get(hash) as { plan: 'pro' | 'classroom'; redeemed_by: number | null; revoked: number } | undefined;
    if (!row || row.revoked) {
      throw new RedeemError(404, 'CODE_NOT_FOUND', 'Activation code not found or no longer valid');
    }
    if (row.redeemed_by !== null) {
      throw new RedeemError(409, 'CODE_ALREADY_USED', 'This activation code has already been redeemed');
    }
    const updated = db.prepare(
      'UPDATE redemption_codes SET redeemed_by = ?, redeemed_at = ? WHERE code_hash = ? AND redeemed_by IS NULL AND revoked = 0',
    ).run(userId, now, hash);
    if (updated.changes !== 1) {
      throw new RedeemError(409, 'CODE_ALREADY_USED', 'This activation code has already been redeemed');
    }
    const orderId = `ord_rdm_${hash.slice(0, 16)}`;
    db.prepare(`
      INSERT INTO orders (id, user_id, provider, external_id, plan, amount_cents, currency, status, created_at, paid_at)
      VALUES (?, ?, 'redeem', ?, ?, 0, 'CNY', 'paid', ?, ?)
    `).run(orderId, userId, `code:${hash.slice(0, 24)}`, row.plan, now, now);
    return grantEntitlement(db, {
      userId,
      plan: row.plan,
      source: `redeem:${normalized.slice(-4)}`,
      now,
    });
  });
}
