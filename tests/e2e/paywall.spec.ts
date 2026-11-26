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

    // 1. Open deep-linked Pro route directly on paywall-enforced server (WITHOUT ?paywall=1):
    // boot auth hydration catches it before route() and opens Paywall instead of firing unauthorized chunk load!
    await page.goto(`${origin}/?lowfx=1&notut#lesson/usa`);
    await expect.poll(
      () => page.evaluate(() => !!(window as unknown as { __pp?: { ready: boolean } }).__pp?.ready),
      { timeout: 90_000 },
    ).toBe(true);
    await expect(page.getByTestId('paywall')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('tier-pro-price')).toContainText('49');
    await page.keyboard.press('Escape');

    // Deep-linking to a historical Sky event (#sky/solar-eclipse-1999-08-11) is also gated on Free tier
    await page.evaluate(() => { location.hash = 'sky/solar-eclipse-1999-08-11'; });
    await expect(page.getByTestId('paywall')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');

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

    // Seed 7 mistakes on Free tier and verify #1..#5 remain usable while #6..#7 are locked against per-card bypass
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const book: Record<string, unknown> = {};
      for (let i = 0; i < 7; i++) {
        const key = `shape::q${i}`;
        const q = [`Sample geo question ${i}?`, `地理错题 ${i}？`];
        const why = [`Why ${i}`, `解析 ${i}`];
        book[key] = {
          key,
          lessonId: 'shape',
          q,
          rightText: [`Answer ${i}`, `答案 ${i}`],
          why,
          snapshot: { q, why, options: [['Answer 0', '答案 0'], ['Other', '其他']], answer: 0 },
          wrongCount: 1,
          reviewStreak: 0,
          mastered: false,
          lastMissedAt: 1000 + i,
          updatedAt: 1000 + i,
        };
      }
      localStorage.setItem('pp.mistakeBook', JSON.stringify(book));
    });
    await page.getByTestId('btn-hub').click();
    await page.getByTestId('hub-tab-learn').click();
    await page.getByTestId('menu-lessons').click();
    await expect(page.getByTestId('mistake-practice-free-btn')).toBeVisible();
    await page.getByTestId('mistake-toggle-btn').click();
    await expect(page.getByTestId('mistake-item')).toHaveCount(5);
    await expect(page.getByTestId('mistake-item-locked')).toHaveCount(2);
    await page.getByTestId('mistake-toggle-btn').click();

    // Clicking a Pro lesson ('usa') -> Paywall modal shows redemption input; verify invalid code error & valid code unlock!
    await page.getByTestId('lesson-usa').click();
    await expect(page.getByTestId('paywall-code-input')).toBeVisible();
    await page.getByTestId('paywall-code-input').fill('TRST-0000-0000-0000');
    await page.getByTestId('paywall-redeem-btn').click();
    await expect(page.getByTestId('paywall-feedback')).toBeVisible();
    await page.getByTestId('paywall-code-input').fill(proCode!);
    await page.getByTestId('paywall-redeem-btn').click();

    // 5. Pro lesson dynamically imports gated pro-lessons-earth-*.js chunk with session cookie and starts immediately!
    await expect(page.getByTestId('lesson')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('lesson')).toContainText(/United States|美国/);
    await page.getByTestId('lesson-exit').click();

    // Also verify decoupled pro-lessons-astro-*.js loads independently via #lesson/a-black-holes!
    await page.evaluate(() => { location.hash = 'lesson/a-black-holes'; });
    await expect(page.getByTestId('lesson')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('lesson')).toContainText(/Black holes|黑洞/i);
    await page.getByTestId('lesson-exit').click();

    // Verify Account modal reflects Explorer Pro badge, and "Sign out & clear this device" wipes local mistakeBook
    await page.getByTestId('btn-hub').click();
    await page.getByTestId('hub-tab-me').click();
    await page.getByTestId('menu-account').click();
    await expect(page.getByTestId('acct-plan-pill')).toContainText(/Explorer Pro/i);
    await page.getByTestId('sign-out').click();
    await page.getByTestId('sign-out-clear').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pp.mistakeBook'))).toBe('{}');
    expect(errors).toEqual([]);
  } finally {
    if (srv) await new Promise<void>(r => srv!.close(() => r()));
    db.close();
  }
});
