import { expect, test } from '@playwright/test';

test('Vue launcher rejects unapproved HTTPS destinations without claiming metadata verification', async ({ page }) => {
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });
  await page.goto('/citadel/');

  await expect(page).toHaveTitle('PALACO NEO · Launcher');
  await expect(page.locator('h1')).toHaveText('PALACO NEO');
  await expect(page.locator('#boundary-title')).toHaveText('TEMPORARY LAUNCHER · METADATA CHECKS ARE LIMITED');
  await expect(page.locator('.module-card')).toHaveCount(3);
  await expect(page.locator('.module-name')).toHaveText(['AETHER', 'Bastion', '5CRIPTIE']);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.module-message')).toHaveText([
    'Not configured',
    'Not configured',
    'Not configured'
  ]);
  await expect(page.locator('.open-link')).toHaveCount(0);

  const aether = page.locator('.module-form[data-module="aether"]');
  const address = aether.locator('[data-url-input]');
  await address.fill('http://aether.example.test');
  await aether.locator('button[type="submit"]').click();
  await expect(aether.locator('[data-message]')).toHaveText(/Invalid address/);
  await expect(aether.locator('.destination')).toHaveCount(0);

  await address.fill('https://vault.example.test/path?source=launcher');
  await aether.locator('button[type="submit"]').click();
  await expect(aether.locator('[data-message]')).toHaveText(/Invalid address.*without a path, query, fragment/);
  await expect(aether.locator('[data-domain]')).toHaveCount(0);

  await address.fill('https://vault.example.test');
  await aether.locator('button[type="submit"]').click();
  await expect(aether.locator('[data-message]')).toHaveText('Destination not approved');
  await expect(aether.locator('[data-domain]')).toHaveText('https://vault.example.test');
  await expect(aether.locator('[data-open-link]')).toHaveCount(0);
  await expect(aether.getByRole('button', { name: 'Check module metadata' })).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.module-form[data-module="aether"] [data-message]'))
    .toHaveText('Destination not approved');
  await expect(page.locator('.module-form[data-module="aether"] [data-domain]'))
    .toHaveText('https://vault.example.test');

  const newTab = await page.context().newPage();
  await newTab.goto('/citadel/');
  await expect(newTab.locator('.module-form[data-module="aether"] [data-message]'))
    .toHaveText('Not configured');
  await newTab.close();

  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#boundary-title')).toHaveText('TIJDELIJKE LAUNCHER · METADATA-CONTROLE IS BEPERKT');
  await expect(page.locator('.module-form[data-module="aether"] [data-message]'))
    .toHaveText('Bestemming niet goedgekeurd');

  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(externalRequests).toEqual([]);
});
