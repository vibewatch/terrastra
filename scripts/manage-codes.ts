/**
 * CLI tool for managing Terrastra Explorer Pro & Classroom activation codes and entitlements
 * directly against SQLite — no payment gateway account required.
 *
 * Examples:
 *   npm run codes -- create --plan pro --count 10 --note "xiaohongshu-batch-1" --expires-days 365
 *   npm run codes -- create --plan pro --count 50 --raw > batch.txt
 *   npm run codes -- create --plan pro --count 50 --csv --base-url https://terrastra.example > batch.csv
 *   npm run codes -- list --status available --plan pro
 *   npm run codes -- inspect TRST-XXXX-XXXX-XXXX
 *   npm run codes -- stats
 *   npm run codes -- revoke TRST-XXXX-XXXX-XXXX --revoke-user
 *   npm run codes -- grant --email parent@example.com --plan pro
 */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openDb, pruneExpiredState, transaction } from '../src/server/db.ts';
import {
  formatCodesCsv,
  getBillingStats,
  grantEntitlement,
  inspectRedemptionCode,
  issueRedemptionCodes,
  listRedemptionCodes,
  revokeRedemptionCode,
  type RedemptionCodeStatus,
} from '../src/server/billing.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dbPath = process.env.DB_PATH ?? join(root, 'data', 'terrastra.db');

function argVal(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function usage(): never {
  console.error(`Usage:
  npm run codes -- create [--plan pro|classroom] [--count N] [--note TEXT] [--expires-days N] [--raw] [--links] [--csv] [--base-url URL]
  npm run codes -- list [--limit N] [--status available|redeemed|expired|revoked] [--plan pro|classroom] [--note QUERY]
  npm run codes -- inspect <TRST-XXXX-XXXX-XXXX>
  npm run codes -- stats [--json]
  npm run codes -- prune
  npm run codes -- revoke <TRST-XXXX-XXXX-XXXX> [--revoke-user]
  npm run codes -- grant --email <EMAIL> [--plan pro|classroom] [--expires-days N]`);
  process.exit(1);
}

const args = process.argv.slice(2);
const cmd = args[0];
if (!cmd || cmd === '--help' || cmd === '-h') usage();

const db = openDb(dbPath);
try {
  if (cmd === 'create') {
    const planRaw = argVal(args, '--plan') ?? 'pro';
    if (planRaw !== 'pro' && planRaw !== 'classroom') {
      console.error('Error: --plan must be "pro" or "classroom"');
      process.exit(1);
    }
    const count = Number(argVal(args, '--count') ?? '1');
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      console.error('Error: --count must be an integer between 1 and 1000');
      process.exit(1);
    }
    const expiresDaysRaw = argVal(args, '--expires-days');
    let expiresAt: number | null = null;
    if (expiresDaysRaw !== undefined) {
      const days = Number(expiresDaysRaw);
      if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        console.error('Error: --expires-days must be a number between 1 and 3650');
        process.exit(1);
      }
      expiresAt = Date.now() + Math.round(days * 86_400_000);
    }
    const note = argVal(args, '--note');
    const rawOnly = args.includes('--raw');
    const asLinks = args.includes('--links');
    const asCsv = args.includes('--csv');
    const baseUrl = (argVal(args, '--base-url') ?? process.env.BASE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
    const codes = issueRedemptionCodes(db, { plan: planRaw, count, note, expiresAt });
    if (asCsv) {
      console.log(formatCodesCsv(codes, { plan: planRaw, baseUrl, expiresAt, note }));
    } else {
      if (!rawOnly) {
        const expSuffix = expiresAt ? ` (expires ${new Date(expiresAt).toISOString().slice(0, 10)})` : '';
        console.log(`Created ${codes.length} ${planRaw.toUpperCase()} activation code(s)${note ? ` [${note}]` : ''}${expSuffix}:`);
      }
      for (const c of codes) {
        console.log(asLinks ? `${baseUrl}/#redeem=${c}` : c);
      }
    }
  } else if (cmd === 'list') {
    const limit = Math.max(1, Math.min(500, Number(argVal(args, '--limit') ?? '50') || 50));
    const statusRaw = argVal(args, '--status');
    const validStatuses: RedemptionCodeStatus[] = ['available', 'redeemed', 'expired', 'revoked'];
    if (statusRaw !== undefined && !validStatuses.includes(statusRaw as RedemptionCodeStatus)) {
      console.error('Error: --status must be one of available, redeemed, expired, or revoked');
      process.exit(1);
    }
    const planFilter = argVal(args, '--plan');
    if (planFilter !== undefined && planFilter !== 'pro' && planFilter !== 'classroom') {
      console.error('Error: --plan must be "pro" or "classroom"');
      process.exit(1);
    }
    const rows = listRedemptionCodes(db, {
      limit,
      status: statusRaw as RedemptionCodeStatus | undefined,
      plan: planFilter as 'pro' | 'classroom' | undefined,
      note: argVal(args, '--note'),
    });
    if (!rows.length) {
      console.log('No activation codes found.');
    } else {
      for (const r of rows) {
        const status = r.status === 'revoked'
          ? 'REVOKED'
          : r.status === 'redeemed'
            ? `REDEEMED (${r.redeemedEmail ?? 'deleted-user'} at ${new Date(r.redeemedAt!).toISOString()})`
            : r.status === 'expired'
              ? `EXPIRED (${new Date(r.expiresAt!).toISOString().slice(0, 10)})`
              : r.expiresAt !== null
                ? `AVAILABLE (until ${new Date(r.expiresAt).toISOString().slice(0, 10)})`
                : 'AVAILABLE';
        console.log(`TRST-••••-••••-${r.codeHint} | ${r.plan.padEnd(9)} | ${status}${r.note ? ` | ${r.note}` : ''}`);
      }
    }
  } else if (cmd === 'inspect') {
    const raw = args[1] ?? '';
    const info = inspectRedemptionCode(db, raw);
    if (!info) {
      console.error('Error: code is invalid or not found.');
      process.exit(1);
    }
    console.log(`Code:       ${info.code}`);
    console.log(`Plan:       ${info.plan.toUpperCase()}`);
    console.log(`Status:     ${info.status.toUpperCase()}`);
    console.log(`Created:    ${new Date(info.createdAt).toISOString()}`);
    console.log(`Expires:    ${info.expiresAt ? new Date(info.expiresAt).toISOString() : 'Never'}`);
    console.log(`Redeemed:   ${info.redeemedAt ? `${new Date(info.redeemedAt).toISOString()} (${info.redeemedEmail ?? 'deleted-user'})` : 'No'}`);
    if (info.note) console.log(`Note:       ${info.note}`);
  } else if (cmd === 'stats') {
    const s = getBillingStats(db);
    if (args.includes('--json')) {
      console.log(JSON.stringify(s));
    } else {
      console.log(`Codes:      ${s.availableCodes} available · ${s.redeemedCodes} redeemed · ${s.expiredCodes} expired · ${s.revokedCodes} revoked`);
      console.log(`Accounts:   ${s.proUsers} Explorer Pro · ${s.classroomUsers} Classroom`);
      console.log(`Orders:     ${s.paidOrders} paid`);
    }
  } else if (cmd === 'prune') {
    const r = pruneExpiredState(db);
    console.log(`Pruned ${r.loginTokens} login token(s), ${r.sessions} expired session(s), and ${r.rateLimits} rate-limit bucket(s).`);
  } else if (cmd === 'revoke') {
    const raw = args[1] ?? '';
    const revokeUser = args.includes('--revoke-user');
    const outcome = revokeRedemptionCode(db, raw, { revokeUser });
    if (!outcome) {
      console.error('Error: code is invalid or not found.');
      process.exit(1);
    }
    const suffix = revokeUser && outcome.redeemedBy !== null
      ? ` and updated user #${outcome.redeemedBy} -> ${(outcome.userPlanAfter ?? 'free').toUpperCase()}`
      : '';
    console.log(`Revoked ${outcome.code}${suffix}.`);
  } else if (cmd === 'grant') {
    const email = (argVal(args, '--email') ?? '').trim().toLowerCase();
    const planRaw = argVal(args, '--plan') ?? 'pro';
    if (!email || !email.includes('@')) {
      console.error('Error: --email is required');
      process.exit(1);
    }
    if (planRaw !== 'pro' && planRaw !== 'classroom') {
      console.error('Error: --plan must be "pro" or "classroom"');
      process.exit(1);
    }
    const expiresDaysRaw = argVal(args, '--expires-days');
    let expiresAt: number | null = null;
    if (expiresDaysRaw !== undefined) {
      const days = Number(expiresDaysRaw);
      if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        console.error('Error: --expires-days must be a number between 1 and 3650');
        process.exit(1);
      }
      expiresAt = Date.now() + Math.round(days * 86_400_000);
    }
    const ent = transaction(db, () => {
      db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').run(email);
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number };
      return grantEntitlement(db, { userId: u.id, plan: planRaw, source: 'cli-grant', expiresAt });
    });
    const expLabel = ent.expiresAt ? `, expires ${new Date(ent.expiresAt).toISOString().slice(0, 10)}` : '';
    console.log(`Granted ${ent.plan.toUpperCase()} (max ${ent.maxSessions} sessions${expLabel}) to ${email}.`);
  } else {
    usage();
  }
} finally {
  db.close();
}
