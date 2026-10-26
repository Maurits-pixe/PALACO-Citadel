import { expect, test } from '@playwright/test';

test('encrypts and decrypts text locally with authenticated AETHER envelopes', async ({ page }) => {
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });
  await page.goto('/citadel/iii6v9/');
  await expect(page).toHaveTitle('AETHER · Local encryption');
  await expect(page.locator('h1')).toHaveText('AETHER');
  await expect(page.locator('#notice-title')).toHaveText('LOCAL ENCRYPTION · SECURITY LIMITATIONS APPLY');
  await expect(page.locator('[data-i18n="noticeBody"]')).toContainText('AES-GCM-256');
  await expect(page.locator('[data-i18n="noticeBody"]')).toContainText('not uploaded or persistently stored');
  await expect(page.locator('.crypto-method')).toContainText('600,000 iterations');

  const navigation = page.getByRole('link', { name: '← PALACO home' });
  const box = await navigation.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expect(navigation).toHaveAttribute('href', '/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  const plaintext = 'A secret message: café 🛰';
  const passphrase = 'correct horse battery staple';
  await page.locator('#crypto-input').fill(plaintext);
  await page.locator('#passphrase').fill('short');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Use at least 12 characters for new encryption.');

  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  const ciphertext = await page.locator('#crypto-output').inputValue();
  expect(ciphertext).toMatch(/^AETHER1\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/);
  expect(ciphertext).not.toContain(plaintext);

  await page.locator('#decrypt-mode').click();
  await page.locator('#crypto-input').fill(ciphertext);
  await page.locator('#passphrase').fill('incorrect horse battery staple');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Decryption failed. Check the passphrase and encrypted data.');

  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-output')).toHaveValue(plaintext);
  await expect(page.locator('#crypto-status')).toContainText('Decryption complete');

  await page.locator('#crypto-input').fill('not-an-envelope');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Invalid AETHER1 data format.');

  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.locator('#notice-title')).toHaveText('LOKALE VERSLEUTELING · BEVEILIGINGSBEPERKINGEN GELDEN');
  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eo');
  await expect(page.locator('#notice-title')).toHaveText('LOKA ĈIFRADO · SEKURECAJ LIMIGOJ VALIDAS');

  await page.locator('#clear-fields').click();
  await expect(page.locator('#crypto-input')).toHaveValue('');
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key !== 'palaco-language'))).toEqual([]);
  expect(externalRequests).toEqual([]);
});
