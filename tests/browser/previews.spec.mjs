import { expect, test } from '@playwright/test';

const surfaces = [
  { path: '/', title: 'PALACO Citadel', heading: 'PALACO Citadel' },
  { path: '/atelier/wizard.html', title: 'PALACO Atelier · New Citadel', heading: 'New Citadel' },
  { path: '/DOCS/levensader-readonly/', title: 'PALACO · Objectinspectie', heading: 'Bekijk wat we weten.' },
  { path: '/DOCS/levensader-readonly/index.html', title: 'PALACO · Objectinspectie', heading: 'Bekijk wat we weten.' }
];

async function waitForWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test('opens every existing static preview without changing its route', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  for (const surface of surfaces) {
    const response = await page.goto(surface.path);
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle(surface.title);
    await expect(page.locator('h1')).toHaveText(surface.heading);
    expect(new URL(page.url()).pathname).toBe(surface.path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }

  await page.goto('/');
  await page.locator('.hero-preview a[href="/atelier/wizard.html"]').click();
  await expect(page.locator('#progress')).toContainText('Stap 1 van 12');
  await page.locator('#answer').fill('Preview Citadel');
  await page.locator('#next').click();
  await expect(page.locator('#progress')).toContainText('Stap 2 van 12');
  await page.locator('#back').click();
  await expect(page.locator('#answer')).toHaveValue('Preview Citadel');

  await page.goto('/');
  await page.locator('.hero-preview a[href="/DOCS/levensader-readonly/"]').click();
  await expect(page.locator('#list .item')).toHaveCount(13);
  await page.locator('#list .item').filter({ hasText: 'Citadel', hasNotText: 'L.A.' }).click();
  await expect(page.locator('#detail h2')).toHaveText('Citadel');
  await page.locator('#mode').click();
  await expect(page.locator('html')).toHaveClass('dark');
  expect(errors).toEqual([]);
});

test('replaces stale previews online, preserves them offline and retires only owned caches', async ({ page, context }) => {
  await page.goto('/atelier/wizard.html');
  await page.evaluate(async () => {
    await caches.open('palaco-rio-shell-v4');
    await caches.open('unrelated-app-cache');
  });
  await page.goto('/');
  await waitForWorker(page);
  expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(['palaco-rio-shell-v5', 'unrelated-app-cache']));
  expect(await page.evaluate(() => caches.keys())).not.toContain('palaco-rio-shell-v4');

  await page.evaluate(async paths => {
    const cache = await caches.open('palaco-rio-shell-v5');
    for (const path of paths) {
      await cache.put(path, new Response('<title>Stale preview</title><h1>Stale preview</h1>', {
        headers: { 'Content-Type': 'text/html' }
      }));
    }
    await cache.put('/app.js', new Response('window.stalePreview = true;', {
      headers: { 'Content-Type': 'text/javascript' }
    }));
  }, surfaces.map(surface => surface.path));

  for (const surface of surfaces) {
    await page.goto(surface.path);
    await expect(page).toHaveTitle(surface.title);
    expect(await page.evaluate(() => window.stalePreview)).toBeUndefined();
    expect(await page.evaluate(async path => {
      const cache = await caches.open('palaco-rio-shell-v5');
      return (await cache.match(path)).text();
    }, surface.path)).not.toContain('Stale preview');
  }

  await context.setOffline(true);
  for (const surface of surfaces) {
    await page.goto(surface.path);
    await expect(page).toHaveTitle(surface.title);
    await expect(page.locator('h1')).toHaveText(surface.heading);
    if (surface.path === '/atelier/wizard.html') {
      await expect(page.locator('#progress')).toContainText('Stap 1 van 12');
    }
  }
  await context.setOffline(false);
  await page.goto('/');
  await page.evaluate(() => fetch('/registration/not-a-static-preview'));
  expect(await page.evaluate(async () => {
    const cache = await caches.open('palaco-rio-shell-v5');
    return Boolean(await cache.match('/registration/not-a-static-preview'));
  })).toBe(false);
});
