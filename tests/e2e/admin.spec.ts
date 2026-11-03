import { expect, test, type Page } from '@playwright/test';
import { flyTo, openApp } from './helpers.ts';

async function compareCulledBorders(page: Page, view: 'globe' | 'map'): Promise<{ changed: number; culled: number; full: number }> {
  return page.evaluate(kind => {
    const app = (window as any).__pp;
    const target = kind === 'globe' ? app.globe : app.map();
    const renderer = target.renderer, gl = renderer.getContext();
    if (kind === 'map') target.draw();
    const objects = target.adminTiles.flatMap((tile: any) => kind === 'globe' ? [tile.line] : [tile.line, tile.casing]);
    const saved = objects.map((object: any) => [object.visible, object.frustumCulled]);
    const render = () => {
      renderer.render(target.scene, kind === 'globe' ? target.camera : target.cam);
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { pixels, primitives: kind === 'globe' ? renderer.info.render.lines : renderer.info.render.triangles };
    };
    const culled = render();
    let full: ReturnType<typeof render>;
    try {
      for (const object of objects) { object.visible = true; object.frustumCulled = false; }
      full = render();
    } finally {
      objects.forEach((object: any, i: number) => { [object.visible, object.frustumCulled] = saved[i]; });
    }
    let changed = 0;
    for (let i = 0; i < culled.pixels.length; i += 4) {
      if (culled.pixels[i] !== full.pixels[i] || culled.pixels[i + 1] !== full.pixels[i + 1] || culled.pixels[i + 2] !== full.pixels[i + 2]) changed++;
    }
    return { changed, culled: culled.primitives, full: full.primitives };
  }, view);
}

test('zoom remains top-down and the globe loads administrative detail on demand', async ({ page }) => {
  let requests = 0;
  page.on('request', request => { if (request.url().includes('/data/admin-1.json')) requests++; });
  await openApp(page);
  expect(requests).toBe(0);
  await flyTo(page, 23.6, 112.5, 0.65);
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.adminData?.regions.length ?? 0), { timeout: 60_000 }).toBeGreaterThan(4000);
  expect(requests).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.adminLines?.visible)).toBe(true);
  const alignment = await page.evaluate(() => {
    const globe = (window as any).__pp.globe;
    const lat = globe.lat * Math.PI / 180, lon = globe.lon * Math.PI / 180;
    const normal = globe.camera.position.clone().set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
    const down = globe.camera.getWorldDirection(normal.clone());
    return { position: globe.camera.position.clone().normalize().dot(normal), direction: down.dot(normal) };
  });
  expect(alignment.position).toBeGreaterThan(0.99999);
  expect(alignment.direction).toBeLessThan(-0.99999);
  await page.getByTestId('btn-language').click();
  await expect(page.locator('#globe .lb-provcap', { hasText: '广州' })).toBeVisible();
  await flyTo(page, 22.19, 113.55, 0.07);
  await expect(page.locator('#globe .lb-admin', { hasText: '澳门特别行政区' })).toBeVisible();
});

test('tile culling preserves visible borders on the globe and all map projections', async ({ page }) => {
  await openApp(page);
  for (const [lat, lon] of [[23.6, 112.5], [36.75, -119.59], [67, 179]]) {
    await flyTo(page, lat, lon, 0.65);
    await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.adminLines?.visible), { timeout: 60_000 }).toBe(true);
    const result = await compareCulledBorders(page, 'globe');
    expect(result.full).toBeGreaterThan(result.culled);
    expect(result.changed).toBe(0);
  }
  await page.getByTestId('btn-map').click();
  await expect(page.getByTestId('flatmap')).toBeVisible();
  const point = await page.evaluate(() => (window as any).__pp.map().toScreen(67, 179) as [number, number]);
  await page.locator('.fm-canvas').dispatchEvent('wheel', { clientX: point[0], clientY: point[1], deltaY: -1500 });
  await expect.poll(() => page.evaluate(() => (window as any).__pp.map().zoom)).toBeGreaterThan(10);
  for (const projection of ['equalearth', 'mercator', 'plate']) {
    await page.getByTestId('proj-' + projection).click();
    const result = await compareCulledBorders(page, 'map');
    expect(result.full).toBeGreaterThan(result.culled);
    expect(result.changed).toBe(0);
  }
});

test('flat map shows and identifies provinces, capitals and overseas states', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('btn-language').click();
  await flyTo(page, 23.6, 112.5, 1.2);
  await page.getByTestId('btn-map').click();
  await expect(page.getByTestId('flatmap')).toBeVisible();
  const guangdong = await page.evaluate(() => (window as any).__pp.map().toScreen(23.5, 112.5) as [number, number]);
  await page.locator('.fm-canvas').dispatchEvent('wheel', { clientX: guangdong[0], clientY: guangdong[1], deltaY: -1500 });
  await expect.poll(() => page.evaluate(() => (window as any).__pp.map().adminData?.regions.length ?? 0), { timeout: 60_000 }).toBeGreaterThan(4000);
  await expect.poll(() => page.evaluate(() => (window as any).__pp.map().adminLine.visible)).toBe(true);
  await expect(page.locator('.fm-labels .lb-provcap', { hasText: '广州' })).toBeVisible();
  await expect(page.locator('.fm-labels .lb-admin', { hasText: '广东省' })).toBeVisible();
  const point = await page.evaluate(() => (window as any).__pp.map().toScreen(23.5, 112.5) as [number, number]);
  await page.mouse.move(point[0], point[1]);
  const tag = page.getByTestId('map-country-tag');
  await expect(tag).toContainText('广东省');
  await expect(tag).toContainText('广州');
  await page.mouse.click(point[0], point[1]);
  await page.locator('.fm-canvas').dispatchEvent('pointerleave');
  await expect(tag).toContainText('广东省');

  await page.getByTestId('btn-menu').click();
  await page.locator('label.switch-card', { has: page.getByTestId('set-borders') }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__pp.map().adminLine.visible)).toBe(false);
  await page.locator('label.switch-card', { has: page.getByTestId('set-borders') }).click();
  await page.keyboard.press('Escape');

  await page.getByTestId('btn-map').click();
  await flyTo(page, 36.75, -119.59, 1.2);
  await page.getByTestId('btn-map').click();
  const california = await page.evaluate(() => (window as any).__pp.map().toScreen(36.75, -119.59) as [number, number]);
  await page.mouse.move(california[0], california[1]);
  await expect(tag).toContainText('加利福尼亚州');

  await page.getByTestId('btn-map').click();
  await flyTo(page, 22.19, 113.55, 0.2);
  await page.getByTestId('btn-map').click();
  await expect(page.locator('.fm-labels .lb-admin', { hasText: '澳门特别行政区' })).toBeVisible();
  const macao = await page.evaluate(() => (window as any).__pp.map().toScreen(22.1987, 113.5439) as [number, number]);
  await page.locator('.fm-canvas').dispatchEvent('pointermove', { pointerType: 'mouse', clientX: macao[0], clientY: macao[1] });
  await expect(tag).toContainText('澳门特别行政区');
});

test('administrative-data failures offer a working retry', async ({ page }) => {
  let attempts = 0;
  await page.route('**/data/admin-1.json', route => {
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 503 }) : route.continue();
  });
  await openApp(page);
  await flyTo(page, 23.6, 112.5, 0.7);
  await expect(page.getByTestId('load-error')).toContainText('Administrative regions');
  await page.getByTestId('load-retry').click();
  await expect.poll(() => page.evaluate(() => (window as any).__pp.globe.adminData?.regions.length ?? 0), { timeout: 60_000 }).toBeGreaterThan(4000);
  expect(attempts).toBe(2);
});
