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

export interface OrderSummary {
  id: string;
  plan: 'pro' | 'classroom';
  provider: string;
  status: 'pending' | 'paid' | 'refunded' | 'disputed';
  createdAt: number;
  paidAt: number | null;
}

export class RedeemError extends Error {
  readonly status: 400 | 404 | 409 | 410;
  readonly code: 'INVALID_CODE' | 'CODE_NOT_FOUND' | 'CODE_EXPIRED' | 'CODE_ALREADY_USED' | 'ALREADY_ENTITLED';
  constructor(
    status: 400 | 404 | 409 | 410,
    code: 'INVALID_CODE' | 'CODE_NOT_FOUND' | 'CODE_EXPIRED' | 'CODE_ALREADY_USED' | 'ALREADY_ENTITLED',
    message: string,
  ) {
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

/** Trims oldest active sessions so at most `keepCount` unexpired sessions remain for `userId`. */
export function trimActiveSessions(db: DB, userId: number, keepCount: number, now = Date.now()): void {
  const keep = Math.max(0, Math.floor(keepCount));
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires <= ?').run(userId, now);
  const rows = db.prepare(
    'SELECT hash FROM sessions WHERE user_id = ? ORDER BY created_at ASC, rowid ASC',
  ).all(userId) as { hash: string }[];
  const overflow = rows.length - keep;
  if (overflow > 0) {
    const del = db.prepare('DELETE FROM sessions WHERE hash = ?');
    for (let i = 0; i < overflow; i++) del.run(rows[i]!.hash);
  }
}

/** Enforces FIFO concurrent active sessions for a user before inserting one new session. */
export function enforceSessionCap(db: DB, userId: number, maxSessions: number, now = Date.now()): void {
  const cap = Math.max(1, Math.floor(maxSessions));
  trimActiveSessions(db, userId, cap - 1, now);
}

export function countActiveSessions(db: DB, userId: number, now = Date.now()): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires > ?').get(userId, now) as { n: number };
  return Number(row.n);
}

/** Revokes all active sessions for `userId` except `keepSessionHash` ("Sign out other devices"). */
export function revokeOtherSessions(db: DB, userId: number, keepSessionHash: string | null): number {
  const r = keepSessionHash
    ? db.prepare('DELETE FROM sessions WHERE user_id = ? AND hash != ?').run(userId, keepSessionHash)
    : db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return Number(r.changes);
}

export function listUserOrders(db: DB, userId: number): OrderSummary[] {
  const rows = db.prepare(`
    SELECT id, plan, provider, status, created_at, paid_at
    FROM orders
    WHERE user_id = ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT 10
  `).all(userId) as {
    id: string;
    plan: 'pro' | 'classroom';
    provider: string;
    status: 'pending' | 'paid' | 'refunded' | 'disputed';
    created_at: number;
    paid_at: number | null;
  }[];
  return rows.map(r => ({
    id: r.id,
    plan: r.plan,
    provider: r.provider,
    status: r.status,
    createdAt: Number(r.created_at),
    paidAt: r.paid_at === null ? null : Number(r.paid_at),
  }));
}

/** Issues `count` single-use activation codes, storing only their SHA-256 hash and last-4 hint in SQLite. */
export function issueRedemptionCodes(
  db: DB,
  opts: { plan: 'pro' | 'classroom'; count: number; note?: string; expiresAt?: number | null; now?: number },
): string[] {
  const count = Math.max(1, Math.min(1000, Math.floor(opts.count)));
  const now = opts.now ?? Date.now();
  const note = opts.note?.trim() ? opts.note.trim().slice(0, 120) : null;
  const expiresAt = opts.expiresAt ?? null;
  return transaction(db, () => {
    const ins = db.prepare(`
      INSERT INTO redemption_codes (code_hash, code_hint, plan, note, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const created: string[] = [];
    while (created.length < count) {
      const code = generateRedeemCode();
      const hash = hashRedeemCode(code);
      const exists = db.prepare('SELECT 1 FROM redemption_codes WHERE code_hash = ?').get(hash);
      if (exists) continue;
      ins.run(hash, code.slice(-4), opts.plan, note, now, expiresAt);
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
      'SELECT plan, expires_at, redeemed_by, redeemed_at, revoked FROM redemption_codes WHERE code_hash = ?',
    ).get(hash) as {
      plan: 'pro' | 'classroom';
      expires_at: number | null;
      redeemed_by: number | null;
      redeemed_at: number | null;
      revoked: number;
    } | undefined;
    if (!row || row.revoked) {
      throw new RedeemError(404, 'CODE_NOT_FOUND', 'Activation code not found or no longer valid');
    }
    if (row.redeemed_by !== null || row.redeemed_at !== null) {
      throw new RedeemError(409, 'CODE_ALREADY_USED', 'This activation code has already been redeemed');
    }
    if (row.expires_at !== null && row.expires_at <= now) {
      throw new RedeemError(410, 'CODE_EXPIRED', 'This activation code has expired');
    }
    const current = getUserEntitlement(db, userId, now);
    if (current.plan !== 'free' && current.expiresAt === null && PLAN_RANK[row.plan] <= PLAN_RANK[current.plan]) {
      throw new RedeemError(
        409,
        'ALREADY_ENTITLED',
        `Your account already has lifetime ${current.plan === 'classroom' ? 'Classroom Edition' : 'Explorer Pro'} — save this code for another account`,
      );
    }
    const updated = db.prepare(
      'UPDATE redemption_codes SET redeemed_by = ?, redeemed_at = ? WHERE code_hash = ? AND redeemed_by IS NULL AND redeemed_at IS NULL AND revoked = 0',
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

/**
 * Revokes an activation code and optionally rolls back the redeeming user's entitlement
 * while preserving any other valid paid orders or CLI grants on that account.
 */
export function revokeRedemptionCode(
  db: DB,
  rawCode: string,
  opts: { revokeUser?: boolean; now?: number } = {},
): { code: string; redeemedBy: number | null; userPlanAfter: Plan | null } | null {
  const code = normalizeRedeemCode(rawCode);
  if (!code) return null;
  const hash = hashRedeemCode(code);
  const now = opts.now ?? Date.now();
  return transaction(db, () => {
    const row = db.prepare('SELECT redeemed_by FROM redemption_codes WHERE code_hash = ?')
      .get(hash) as { redeemed_by: number | null } | undefined;
    if (!row) return null;
    db.prepare('UPDATE redemption_codes SET revoked = 1 WHERE code_hash = ?').run(hash);
    db.prepare("UPDATE orders SET status = 'refunded' WHERE provider = 'redeem' AND external_id = ?")
      .run(`code:${hash.slice(0, 24)}`);

    let userPlanAfter: Plan | null = null;
    if (opts.revokeUser && row.redeemed_by !== null) {
      const userId = row.redeemed_by;
      const paidOrders = db.prepare(
        "SELECT plan, provider, external_id FROM orders WHERE user_id = ? AND status = 'paid'",
      ).all(userId) as { plan: 'pro' | 'classroom'; provider: string; external_id: string | null }[];
      const entRow = db.prepare(
        'SELECT plan, expires_at, source FROM entitlements WHERE user_id = ?',
      ).get(userId) as { plan: Plan; expires_at: number | null; source: string } | undefined;

      let bestPlan: Plan = 'free';
      let bestSource = 'order';
      for (const ord of paidOrders) {
        if (PLAN_RANK[ord.plan] > PLAN_RANK[bestPlan]) {
          bestPlan = ord.plan;
          bestSource = ord.provider;
        }
      }
      // Preserve non-redemption grants (e.g. cli-grant) that are still active.
      if (
        entRow
        && !entRow.source.startsWith('redeem:')
        && (entRow.expires_at === null || entRow.expires_at > now)
        && PLAN_RANK[entRow.plan] > PLAN_RANK[bestPlan]
      ) {
        bestPlan = entRow.plan;
        bestSource = entRow.source;
      }

      if (bestPlan === 'free') {
        db.prepare('DELETE FROM entitlements WHERE user_id = ?').run(userId);
      } else {
        const cap = maxSessionsForPlan(bestPlan);
        db.prepare(`
          UPDATE entitlements
          SET plan = ?, max_sessions = ?, source = ?
          WHERE user_id = ?
        `).run(bestPlan, cap, bestSource, userId);
      }
      trimActiveSessions(db, userId, maxSessionsForPlan(bestPlan), now);
      userPlanAfter = bestPlan;
    }
    return { code, redeemedBy: row.redeemed_by, userPlanAfter };
  });
}

export interface InspectedRedemptionCode {
  code: string;
  plan: 'pro' | 'classroom';
  note: string | null;
  createdAt: number;
  expiresAt: number | null;
  redeemedAt: number | null;
  redeemedEmail: string | null;
  status: 'available' | 'redeemed' | 'expired' | 'revoked';
}

export function inspectRedemptionCode(db: DB, rawCode: string, now = Date.now()): InspectedRedemptionCode | null {
  const code = normalizeRedeemCode(rawCode);
  if (!code) return null;
  const hash = hashRedeemCode(code);
  const row = db.prepare(`
    SELECT rc.plan, rc.note, rc.created_at, rc.expires_at, rc.redeemed_at, rc.revoked, u.email AS redeemed_email
    FROM redemption_codes rc
    LEFT JOIN users u ON u.id = rc.redeemed_by
    WHERE rc.code_hash = ?
  `).get(hash) as {
    plan: 'pro' | 'classroom';
    note: string | null;
    created_at: number;
    expires_at: number | null;
    redeemed_at: number | null;
    revoked: number;
    redeemed_email: string | null;
  } | undefined;
  if (!row) return null;
  const status: InspectedRedemptionCode['status'] = row.revoked
    ? 'revoked'
    : row.redeemed_at !== null
      ? 'redeemed'
      : row.expires_at !== null && row.expires_at <= now
        ? 'expired'
        : 'available';
  return {
    code,
    plan: row.plan,
    note: row.note,
    createdAt: Number(row.created_at),
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
    redeemedAt: row.redeemed_at === null ? null : Number(row.redeemed_at),
    redeemedEmail: row.redeemed_email,
    status,
  };
}

export interface BillingStats {
  availableCodes: number;
  redeemedCodes: number;
  expiredCodes: number;
  revokedCodes: number;
  proUsers: number;
  classroomUsers: number;
  paidOrders: number;
}

export function getBillingStats(db: DB, now = Date.now()): BillingStats {
  const codes = db.prepare(`
    SELECT
      SUM(CASE WHEN revoked = 1 THEN 1 ELSE 0 END) AS revoked_n,
      SUM(CASE WHEN revoked = 0 AND redeemed_at IS NOT NULL THEN 1 ELSE 0 END) AS redeemed_n,
      SUM(CASE WHEN revoked = 0 AND redeemed_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END) AS expired_n,
      SUM(CASE WHEN revoked = 0 AND redeemed_at IS NULL AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS available_n
    FROM redemption_codes
  `).get(now, now) as {
    revoked_n: number | null;
    redeemed_n: number | null;
    expired_n: number | null;
    available_n: number | null;
  };
  const ents = db.prepare(`
    SELECT
      SUM(CASE WHEN plan = 'pro' AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS pro_n,
      SUM(CASE WHEN plan = 'classroom' AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS classroom_n
    FROM entitlements
  `).get(now, now) as { pro_n: number | null; classroom_n: number | null };
  const orders = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'").get() as { n: number };
  return {
    availableCodes: Number(codes.available_n ?? 0),
    redeemedCodes: Number(codes.redeemed_n ?? 0),
    expiredCodes: Number(codes.expired_n ?? 0),
    revokedCodes: Number(codes.revoked_n ?? 0),
    proUsers: Number(ents.pro_n ?? 0),
    classroomUsers: Number(ents.classroom_n ?? 0),
    paidOrders: Number(orders.n ?? 0),
  };
}

export type RedemptionCodeStatus = 'available' | 'redeemed' | 'expired' | 'revoked';

export interface ListedRedemptionCode {
  codeHint: string;
  plan: 'pro' | 'classroom';
  note: string | null;
  createdAt: number;
  expiresAt: number | null;
  redeemedAt: number | null;
  redeemedEmail: string | null;
  status: RedemptionCodeStatus;
}

export function listRedemptionCodes(
  db: DB,
  opts: {
    limit?: number;
    status?: RedemptionCodeStatus;
    plan?: 'pro' | 'classroom';
    note?: string;
    now?: number;
  } = {},
): ListedRedemptionCode[] {
  const limit = Math.max(1, Math.min(500, Math.floor(opts.limit ?? 50) || 50));
  const now = opts.now ?? Date.now();
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (opts.plan === 'pro' || opts.plan === 'classroom') {
    clauses.push('rc.plan = ?');
    params.push(opts.plan);
  }
  if (opts.note?.trim()) {
    const escaped = opts.note.trim().toLowerCase().replace(/[\\%_]/g, m => `\\${m}`);
    clauses.push("rc.note IS NOT NULL AND LOWER(rc.note) LIKE ? ESCAPE '\\'");
    params.push(`%${escaped}%`);
  }
  if (opts.status === 'revoked') {
    clauses.push('rc.revoked = 1');
  } else if (opts.status === 'redeemed') {
    clauses.push('rc.revoked = 0 AND rc.redeemed_at IS NOT NULL');
  } else if (opts.status === 'expired') {
    clauses.push('rc.revoked = 0 AND rc.redeemed_at IS NULL AND rc.expires_at IS NOT NULL AND rc.expires_at <= ?');
    params.push(now);
  } else if (opts.status === 'available') {
    clauses.push('rc.revoked = 0 AND rc.redeemed_at IS NULL AND (rc.expires_at IS NULL OR rc.expires_at > ?)');
    params.push(now);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT rc.code_hint, rc.plan, rc.note, rc.created_at, rc.expires_at, rc.redeemed_at, rc.revoked, u.email AS redeemed_email
    FROM redemption_codes rc
    LEFT JOIN users u ON u.id = rc.redeemed_by
    ${whereSql}
    ORDER BY rc.created_at DESC, rc.rowid DESC
    LIMIT ?
  `).all(...params, limit) as {
    code_hint: string;
    plan: 'pro' | 'classroom';
    note: string | null;
    created_at: number;
    expires_at: number | null;
    redeemed_at: number | null;
    revoked: number;
    redeemed_email: string | null;
  }[];
  return rows.map(r => ({
    codeHint: r.code_hint,
    plan: r.plan,
    note: r.note,
    createdAt: Number(r.created_at),
    expiresAt: r.expires_at === null ? null : Number(r.expires_at),
    redeemedAt: r.redeemed_at === null ? null : Number(r.redeemed_at),
    redeemedEmail: r.redeemed_email,
    status: r.revoked
      ? 'revoked'
      : r.redeemed_at !== null
        ? 'redeemed'
        : r.expires_at !== null && r.expires_at <= now
          ? 'expired'
          : 'available',
  }));
}

function csvCell(raw: string): string {
  // Neutralize spreadsheet formula prefixes when opened in Excel / Numbers / Google Sheets.
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Formats issued activation codes as RFC 4180 CSV for storefront auto-delivery pools or school rosters. */
export function formatCodesCsv(
  codes: readonly string[],
  opts: {
    plan: 'pro' | 'classroom';
    baseUrl: string;
    expiresAt?: number | null;
    note?: string | null;
  },
): string {
  const base = opts.baseUrl.replace(/\/$/, '');
  const expStr = opts.expiresAt ? new Date(opts.expiresAt).toISOString().slice(0, 10) : '';
  const noteStr = opts.note ?? '';
  const lines = ['code,plan,redeem_url,expires_at,note'];
  for (const c of codes) {
    lines.push([
      csvCell(c),
      csvCell(opts.plan),
      csvCell(`${base}/#redeem=${c}`),
      csvCell(expStr),
      csvCell(noteStr),
    ].join(','));
  }
  return lines.join('\n');
}


