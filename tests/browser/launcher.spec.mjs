import { expect, test } from '@playwright/test';

test('launcher accepts only HTTPS destinations and presents user-reported verification status', async ({ page }) => {
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });
  await page.goto('/citadel/');

  await expect(page).toHaveTitle('PALACO Hoofdkantoor · Launcher');
  await expect(page.locator('h1')).toHaveText('PALACO HOOFDKANTOOR');
  await expect(page.locator('#boundary-title')).toHaveText('TEMPORARY LAUNCHER · LINKS UNDER VERIFICATION');
  await expect(page.locator('.module-card')).toHaveCount(3);
  await expect(page.locator('.module-name')).toHaveText(['AETHER', 'Bastion', '5CRIPTIE']);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('[data-message]')).toHaveText([
    'Not configured',
    'Not configured',
    'Not configured'
  ]);
  await expect(page.locator('.module-details[hidden]')).toHaveCount(3);

  const aether = page.locator('.module-form[data-module="aether"]');
  const address = aether.locator('[data-url-input]');
  await address.fill('http://aether.example.test');
  await aether.locator('button[type="submit"]').click();
  await expect(aether.locator('[data-message]')).toHaveText(/Invalid address/);
  await expect(aether.locator('.module-details')).toBeHidden();

  await address.fill('https://vault.example.test/path?source=launcher');
  await aether.locator('button[type="submit"]').click();
  await expect(aether.locator('[data-message]')).toHaveText('Configured — not verified');
  await expect(aether.locator('[data-domain]')).toHaveText('vault.example.test');
  const link = aether.locator('[data-open-link]');
  await expect(link).toHaveAttribute('href', 'https://vault.example.test/path?source=launcher');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

  await aether.locator('[data-check="destination"]').check();
  await aether.locator('[data-check="https"]').check();
  await expect(aether.locator('[data-message]')).toHaveText('Configured — not verified');
  await aether.locator('[data-check="access"]').check();
  await expect(aether.locator('[data-message]')).toHaveText('Verified (self-reported)');
  await expect(aether.locator('.verification-caveat')).toContainText('not an independent verification');

  await page.reload();
  await expect(page.locator('.module-form[data-module="aether"] [data-message]'))
    .toHaveText('Verified (self-reported)');
  await expect(page.locator('.module-form[data-module="aether"] [data-domain]'))
    .toHaveText('vault.example.test');

  const newTab = await page.context().newPage();
  await newTab.goto('/citadel/');
  await expect(newTab.locator('.module-form[data-module="aether"] [data-message]'))
    .toHaveText('Not configured');
  await newTab.close();

  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#boundary-title')).toHaveText('TIJDELIJKE LAUNCHER · KOPPELINGEN IN VERIFICATIE');
  await expect(page.locator('.module-form[data-module="aether"] [data-message]'))
    .toHaveText('Geverifieerd (zelf gemeld)');

  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(externalRequests).toEqual([]);
});
