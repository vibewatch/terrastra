import { expect, test } from '@playwright/test';
import { createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { openDb } from '../../src/server/db.ts';
import { issueRedemptionCodes } from '../../src/server/billing.ts';
import { createApp } from '../../src/server/app.ts';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(err => (err ? reject(err) : resolve(port)));
    });
  });
}

test('paywall enforcement: gates Pro lessons & chunks until signed-in activation code redemption', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  const distDir = join(process.cwd(), 'dist');
  const proChunkName = readdirSync(join(distDir, '.pro-assets')).find(f => f.startsWith('pro-lessons-earth-'))!;
  expect(proChunkName).toBeTruthy();

  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const db = openDb(':memory:');
  const [proCode] = issueRedemptionCodes(db, { plan: 'pro', count: 1, note: 'e2e-paywall' });
  let srv: Server | undefined;

  try {
    const app = createApp({
      db,
      staticDir: distDir,
      devLogin: true,
      baseUrl: origin,
      secureCookies: false,
      enforcePaywall: true,
    });
    srv = await new Promise<Server>(r => { const s = app.listen(port, () => r(s)); });

    // 1. Open app on paywall-enforced server; verify Pro lesson chunks are blocked (401)
    await page.goto(`${origin}/?lowfx=1&notut`);
    await expect.poll(
      () => page.evaluate(() => !!(window as unknown as { __pp?: { ready: boolean } }).__pp?.ready),
      { timeout: 90_000 },
    ).toBe(true);

    const anonChunkStatus = await page.evaluate(f => fetch(`/assets/${f}`).then(r => r.status), proChunkName);
    expect(anonChunkStatus).toBe(401);

    // 2. Free starter lesson ('shape') launches immediately without hitting paywall
    await page.getByTestId('btn-hub').click();
    await page.getByTestId('hub-tab-learn').click();
    await page.getByTestId('menu-lessons').click();
    await expect(page.getByTestId('lesson-list')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('lesson-shape').click();
    await expect(page.getByTestId('lesson')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('lesson-exit').click();

    // 3. Clicking a Pro lesson ('usa') shows the Paywall modal instead of loading Pro chunks
    await page.getByTestId('btn-hub').click();
    await page.getByTestId('hub-tab-learn').click();
    await page.getByTestId('menu-lessons').click();
    await page.getByTestId('lesson-track').click();
    await page.getByRole('option', { name: /China · PEP grades/ }).click();
    await expect(page.getByTestId('lesson-usa')).toContainText('PRO');
    await page.getByTestId('lesson-usa').click();
    await expect(page.getByTestId('paywall')).toBeVisible();

    // 4. Sign in directly from the Paywall prompt via magic dev-link
    await page.getByTestId('paywall-signin-btn').click();
    await expect(page.getByTestId('email')).toBeVisible();
    await page.getByTestId('email').fill('pro.student@example.com');
    await page.getByTestId('send-link').click();
    const link = await page.getByTestId('dev-link').getAttribute('href');
    expect(link).toContain('/api/auth/verify?token=');
    await page.goto(origin + link!.replace(/^https?:\/\/[^/]+/, ''));
    await page.getByRole('button', { name: /Sign in/ }).click();

    await expect.poll(
      () => page.evaluate(() => !!(window as unknown as { __pp?: { ready: boolean } }).__pp?.ready),
      { timeout: 90_000 },
    ).toBe(true);
    await expect(page.getByTestId('acct-plan-pill')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('acct-plan-pill')).toContainText(/Free/i);
    await expect(page.getByTestId('acct-session-cap')).toContainText('1 / 3');

    // Signed-in Free account still gets 402 Payment Required on Pro chunks
    const freeChunkStatus = await page.evaluate(f => fetch(`/assets/${f}`).then(r => r.status), proChunkName);
    expect(freeChunkStatus).toBe(402);

    // Close Account modal, click Pro lesson ('usa') -> Paywall modal now shows redemption input, redeem & auto-continue!
    await page.keyboard.press('Escape');
    await page.getByTestId('btn-hub').click();
    await page.getByTestId('hub-tab-learn').click();
    await page.getByTestId('menu-lessons').click();
    await page.getByTestId('lesson-track').click();
    await page.getByRole('option', { name: /China · PEP grades/ }).click();
    await page.getByTestId('lesson-usa').click();
    await expect(page.getByTestId('paywall-code-input')).toBeVisible();
    await page.getByTestId('paywall-code-input').fill(proCode!);
    await page.getByTestId('paywall-redeem-btn').click();

    // 5. Pro lesson dynamically imports gated pro-lessons-*.js chunk with session cookie and starts immediately!
    await expect(page.getByTestId('lesson')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('lesson')).toContainText(/United States|美国/);
    await page.getByTestId('lesson-exit').click();

    // Verify Account modal reflects Explorer Pro badge
    await page.getByTestId('btn-hub').click();
    await page.getByTestId('hub-tab-me').click();
    await page.getByTestId('menu-account').click();
    await expect(page.getByTestId('acct-plan-pill')).toContainText(/Explorer Pro/i);
    expect(errors).toEqual([]);
  } finally {
    if (srv) await new Promise<void>(r => srv!.close(() => r()));
    db.close();
  }
});
