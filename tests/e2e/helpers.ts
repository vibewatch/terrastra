import { expect, type Page } from '@playwright/test';

export const SHOTS = 'docs/assets/screenshots';

export async function openApp(page: Page, path = '/?lowfx=1&notut'): Promise<void> {
  await page.goto(path);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __pp?: { ready: boolean } }).__pp?.ready), { timeout: 90_000 }).toBe(true);
  await page.waitForTimeout(800);
}

export async function flyTo(page: Page, lat: number, lon: number, h: number): Promise<void> {
  await page.evaluate(([a, b, c]) => (window as any).__pp.globe.flyTo(a, b, c, 10), [lat, lon, h]);
  await page.waitForTimeout(700);
}

export async function clickItem(page: Page, key: string): Promise<void> {
  // models are built asynchronously (Web Workers), so wait until the item is placed and on screen
  const where = () => page.evaluate(k => (window as any).__pp.itemScreen(k), key);
  await expect.poll(where, { message: `item ${key} on screen`, timeout: 30_000 }).not.toBeNull();
  const pt = await where();
  await page.mouse.click(pt.x, pt.y);
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 150_000, animations: 'disabled' });
}

/** Opens an activity from the Explore hub: shelf tab, then its row. */
/** Picks an option in one of the app's dropdowns (ui/select.ts). */
export async function pickOption(page: Page, testid: string, value: string): Promise<void> {
  const btn = page.getByTestId(testid);
  await btn.click();
  const list = await btn.getAttribute('aria-controls');
  await page.locator(`#${list} [role=option][data-value="${value}"]`).click();
  await expect(page.getByTestId(testid)).toHaveAttribute('data-value', value);
}

export async function fromHub(page: Page, tab: 'learn' | 'look' | 'play' | 'me', id: string): Promise<void> {
  if (!(await page.getByTestId('hub').isVisible())) await page.getByTestId('btn-hub').click();
  await page.getByTestId('hub-tab-' + tab).click();
  await page.getByTestId(id).click();
}
