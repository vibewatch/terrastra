import { test, expect } from '@playwright/test';
import { fromHub, openApp } from './helpers.ts';

/** Each tour walks real scenes; screenshots go to test-results for a visual check of what the card covers. */
test('guided tours: pick from the help panel, walk every step, leave or finish', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);
  await fromHub(page, 'learn', 'menu-tours');
  await expect(page.getByTestId('tour-cosmos')).toBeVisible();

  const walk = async (id: string, check: (i: number) => Promise<void>) => {
    if (!(await page.getByTestId('tour-' + id).isVisible())) await fromHub(page, 'learn', 'menu-tours');
    await page.getByTestId('tour-' + id).click();
    const card = page.getByTestId('tour');
    await expect(card).toBeVisible();
    const n = Number((await card.locator('.tour-kicker').innerText()).match(/\/\s*(\d+)/)?.[1] ?? (await card.locator('.dots span').count()));
    for (let i = 0; i < n; i++) {
      await check(i);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: info.outputPath(`${id}-${i + 1}.png`) });
      if (i < n - 1) await card.getByTestId('tour-next').click();
    }
    await card.getByTestId('tour-next').click(); // finish
    await expect(card).toHaveCount(0);
  };

  await walk('cosmos', async i => {
    if (i === 1) await expect(page.locator('body.solar')).toHaveCount(1, { timeout: 60_000 });
    if (i === 3) await expect(page.getByTestId('rail-stars')).toHaveClass(/on/, { timeout: 30_000 });
    if (i === 4) await expect(page.getByTestId('rail-galaxy')).toHaveClass(/on/, { timeout: 30_000 });
    if (i === 6) await expect(page.getByTestId('rail-group')).toHaveClass(/on/, { timeout: 30_000 });
  });
  await walk('eclipse', async i => {
    if (i === 1) { await expect(page.getByTestId('sky')).toBeVisible({ timeout: 60_000 }); await expect(page.getByTestId('sky-view-model')).toHaveAttribute('aria-selected', 'true'); }
    if (i === 2) await expect(page.getByTestId('sky-view-ground')).toHaveAttribute('aria-selected', 'true');
    if (i === 3) await expect(page.locator('#sky-title')).toContainText(/lunar/i);
  });
  // the sky stays open after the tour: close it and leave space
  await page.getByTestId('sky-close').click();
  await expect(page.getByTestId('sky')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#tour/tern'; });
  const card = page.getByTestId('tour');
  await expect(card).toBeVisible();
  await expect(page.locator('body.solar')).toHaveCount(0, { timeout: 20_000 });
  for (const k of [2, 3, 4, 5, 6]) {
    await card.getByTestId('tour-next').click();
    await page.waitForTimeout(2200);
    await page.screenshot({ path: info.outputPath(`tern-${k}.png`) });
  }
  await expect(page.getByTestId('info-name')).toContainText(/tern/i);
  // leaving keeps you where you are
  await card.getByTestId('tour-exit').click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/touring/);
  expect(errors).toEqual([]);
});

test('mission story: Apollo 11 phases carry real times and say what is record and what is sketch', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);
  await page.evaluate(() => { location.hash = '#tour/apollo11'; });
  const card = page.getByTestId('tour');
  await expect(card).toBeVisible();
  const when = card.getByTestId('tour-when'), track = card.getByTestId('tour-track');
  await expect(when).toContainText('1969');
  await expect(when).toContainText('T+0:00');
  await expect(track).toHaveClass(/tour-record/);
  await expect(page.getByTestId('info-name')).toContainText(/Kennedy/i, { timeout: 20_000 });
  await card.getByTestId('tour-next').click();
  await expect(track).toHaveClass(/tour-sketch/);
  await card.getByTestId('tour-next').click();
  await expect(page.locator('body.solar')).toHaveCount(1, { timeout: 60_000 });
  await card.getByTestId('tour-next').click();
  await expect(when).toContainText('T+102:45');
  await expect(page.locator('body')).toContainText(/Jul 20, 1969/, { timeout: 20_000 });
  await expect(track).toHaveClass(/tour-record/);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('apollo-landing.png') });
  await card.getByTestId('tour-next').click();
  await card.getByTestId('tour-next').click();
  await expect(page.locator('body.solar')).toHaveCount(0, { timeout: 20_000 });
  await card.getByTestId('tour-next').click();
  await expect(track).toHaveCount(0);
  await expect(page.getByTestId('info-name')).toContainText(/Armstrong/i, { timeout: 20_000 });
  await card.getByTestId('tour-next').click();
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});
