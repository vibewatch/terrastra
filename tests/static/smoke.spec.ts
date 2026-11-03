import { test, expect, type Page } from '@playwright/test';

/** The published edition: sub-path assets, lazy chunks, deep links and the generated encyclopedia, with no server API. */
const ready = (page: Page) => expect.poll(() => page.evaluate(() => !!(window as any).__pp?.ready), { timeout: 90_000 }).toBe(true);

test('static build works below a sub-path', async ({ page }) => {
  const bad: string[] = [];
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/')) bad.push(`${r.status()} ${r.url()}`); });
  page.on('pageerror', e => bad.push('pageerror ' + e.message));

  await page.goto('?lowfx=1&notut');
  await ready(page);
  const blocked = await page.evaluate(() => {
    const w = window as unknown as { injected?: boolean };
    const script = document.createElement('script');
    script.textContent = 'window.injected = true';
    document.head.append(script);
    return w.injected !== true;
  });
  expect(blocked).toBe(true);
  // the map and the catalogue loaded: an item is on the globe
  await expect.poll(() => page.evaluate(() => (window as any).__pp.itemScreen('eiffel_tower') !== null || document.querySelectorAll('canvas').length > 0)).toBe(true);
  const adminResponse = page.waitForResponse(r => r.url().endsWith('/terrastra/data/admin-1.json'));
  await page.evaluate(() => (window as any).__pp.globe.setH(0.8));
  expect((await adminResponse).ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.adminData?.regions.length ?? 0), { timeout: 60_000 }).toBeGreaterThan(4000);
  // no account UI in the static edition
  await page.locator('#btn-hub').click();
  await page.getByTestId('hub-tab-me').click();
  await expect(page.getByTestId('menu-passport')).toBeVisible();
  await expect(page.getByTestId('menu-account')).toHaveCount(0);
  await page.locator('#btn-menu').click();
  await expect(page.getByTestId('backup-export')).toBeVisible();

  // deep link into a lazy scene (its chunk comes from the sub-path)
  await page.goto('?lowfx=1&notut#milkyway');
  await ready(page);
  await expect(page.locator('body.solar')).toHaveCount(1, { timeout: 60_000 });
  await page.goto('?lowfx=1&notut#sky');
  await expect(page.getByTestId('sky')).toBeVisible({ timeout: 60_000 });

  // the generated encyclopedia and its way back into the app
  await page.goto('encyclopedia/');
  await expect(page.locator('h1')).toBeVisible();
  await page.locator('a[href="/terrastra/animals/"]').first().click();
  await expect(page).toHaveURL(/\/terrastra\/animals\/$/);
  await expect(page.locator('h1')).toBeVisible();
  await page.locator('[data-set=zh]').click();
  await expect(page.locator('html')).toHaveAttribute('data-l', 'zh');
  await page.locator('[data-set=en]').click();
  // an item page under the category, then back into the app at the base path
  await page.locator('main a[href^="/terrastra/animals/"]').first().click();
  await expect(page.locator('h1')).toBeVisible();
  const app = page.locator('a[href^="/terrastra/?"], a[href^="/terrastra/#"]').first();
  if (await app.count()) await expect(app).toHaveAttribute('href', /^\/terrastra\//);
  expect(bad).toEqual([]);
});
