import { expect, test } from '@playwright/test';

test('keeps III6V9 a clearly bounded static concept preview', async ({ page }) => {
  await page.goto('/citadel/iii6v9/');
  await expect(page).toHaveTitle('III6V9 · Concept preview');
  await expect(page.locator('h1')).toHaveText('III6V9');
  await expect(page.locator('#notice-title')).toHaveText('CONCEPT PREVIEW — NOTHING IS PROTECTED');
  await expect(page.locator('[data-i18n="noticeBody"]')).toContainText('does not encrypt, authenticate, store, or erase data');
  await expect(page.locator('[data-i18n="lockBody"]')).toContainText('There is no access code');
  await expect(page.locator('[data-i18n="switchBody"]')).toContainText('cannot guarantee that data is erased');
  await expect(page.locator('input, textarea, button, form')).toHaveCount(0);
  await expect(page.locator('.vault-card')).toHaveCount(3);

  const navigation = page.getByRole('link', { name: '← Citadel home' });
  const box = await navigation.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expect(navigation).toHaveAttribute('href', '/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.locator('#notice-title')).toHaveText('CONCEPTPREVIEW — NIETS IS BESCHERMD');
  await expect(page.locator('[data-i18n="switchBody"]')).toContainText('garandeert niet dat gegevens worden gewist');

  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eo');
  await expect(page.locator('#notice-title')).toHaveText('KONCEPTA ANTAŬRIGARDO — NENIO ESTAS PROTEKTATA');
  await expect(page.locator('[data-i18n="lockBody"]')).toContainText('Ne ekzistas alirkodo');

  await page.locator('#language-select').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#notice-title')).toHaveText('CONCEPT PREVIEW — NOTHING IS PROTECTED');
});
