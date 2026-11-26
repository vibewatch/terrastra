/**
 * CLI tool for managing Terrastra Explorer Pro & Classroom activation codes and entitlements
 * directly against SQLite — no payment gateway account required.
 *
 * Examples:
 *   npm run codes -- create --plan pro --count 10 --note "xiaohongshu-batch-1"
 *   npm run codes -- list
 *   npm run codes -- revoke TRST-XXXX-XXXX-XXXX
 *   npm run codes -- grant --email parent@example.com --plan pro
 */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openDb, transaction } from '../src/server/db.ts';
import { grantEntitlement, issueRedemptionCodes, revokeRedemptionCode } from '../src/server/billing.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dbPath = process.env.DB_PATH ?? join(root, 'data', 'terrastra.db');

function argVal(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function usage(): never {
  console.error(`Usage:
  npm run codes -- create [--plan pro|classroom] [--count N] [--note TEXT]
  npm run codes -- list [--limit N]
  npm run codes -- revoke <TRST-XXXX-XXXX-XXXX> [--revoke-user]
  npm run codes -- grant --email <EMAIL> [--plan pro|classroom]`);
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
    const note = argVal(args, '--note');
    const codes = issueRedemptionCodes(db, { plan: planRaw, count, note });
    console.log(`Created ${codes.length} ${planRaw.toUpperCase()} activation code(s)${note ? ` [${note}]` : ''}:`);
    for (const c of codes) console.log(c);
  } else if (cmd === 'list') {
    const limit = Math.max(1, Math.min(500, Number(argVal(args, '--limit') ?? '50') || 50));
    const rows = db.prepare(`
      SELECT rc.code_hint, rc.plan, rc.note, rc.created_at, rc.redeemed_at, rc.revoked, u.email AS redeemed_email
      FROM redemption_codes rc
      LEFT JOIN users u ON u.id = rc.redeemed_by
      ORDER BY rc.created_at DESC
      LIMIT ?
    `).all(limit) as {
      code_hint: string;
      plan: string;
      note: string | null;
      created_at: number;
      redeemed_at: number | null;
      revoked: number;
      redeemed_email: string | null;
    }[];
    if (!rows.length) {
      console.log('No activation codes found.');
    } else {
      for (const r of rows) {
        const status = r.revoked
          ? 'REVOKED'
          : r.redeemed_at
            ? `REDEEMED (${r.redeemed_email ?? 'deleted-user'} at ${new Date(r.redeemed_at).toISOString()})`
            : 'AVAILABLE';
        console.log(`TRST-••••-••••-${r.code_hint} | ${r.plan.padEnd(9)} | ${status}${r.note ? ` | ${r.note}` : ''}`);
      }
    }
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
    const ent = transaction(db, () => {
      db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').run(email);
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number };
      return grantEntitlement(db, { userId: u.id, plan: planRaw, source: 'cli-grant' });
    });
    console.log(`Granted ${ent.plan.toUpperCase()} (max ${ent.maxSessions} sessions) to ${email}.`);
  } else {
    usage();
  }
} finally {
  db.close();
}
