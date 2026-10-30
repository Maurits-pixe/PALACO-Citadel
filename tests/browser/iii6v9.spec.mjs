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
  await expect(page.locator('[data-i18n="noticeBody"]')).toContainText('nothing is uploaded or saved in the app');
  await expect(page.locator('[data-i18n="methodNote"]')).toContainText('600,000 iterations');
  await expect(page.locator('[data-i18n="fileNote"]')).toContainText('4 MiB of plaintext and 6 MiB per encrypted file');

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
  await expect(page.locator('#crypto-status')).toHaveText('Encryption complete. Copy or download the ciphertext; it is not saved in the app.');
  const ciphertext = await page.locator('#crypto-output').inputValue();
  expect(ciphertext).toMatch(/^AETHER1\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/);
  expect(ciphertext).not.toContain(plaintext);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-output').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('aether-encrypted.aether');
  const downloadedFile = await download.createReadStream();
  const downloadedChunks = [];
  for await (const chunk of downloadedFile) downloadedChunks.push(chunk);
  const downloadedEnvelope = Buffer.concat(downloadedChunks).toString('utf8');
  expect(downloadedEnvelope).toBe(ciphertext);
  expect(downloadedEnvelope).not.toContain(plaintext);
  expect(downloadedEnvelope).not.toContain(passphrase);

  await page.locator('#import-file').setInputFiles({
    name: 'aether-encrypted.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect(page.locator('#crypto-status')).toHaveText('Encrypted file opened locally. Enter its passphrase to decrypt.');
  await expect(page.locator('#decrypt-mode')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
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
  await expect(page.locator('#download-output')).toBeDisabled();

  await page.locator('#import-file').setInputFiles({
    name: 'invalid.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from('not-an-envelope')
  });
  await expect(page.locator('#crypto-status')).toHaveText('Choose a valid AETHER1 encrypted file no larger than 6 MiB.');

  await page.locator('#crypto-input').fill('');
  await page.evaluate(() => {
    document.querySelector('#crypto-input').value = 'x'.repeat(4 * 1024 * 1024 + 1);
  });
  await page.locator('#encrypt-mode').click();
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Plaintext must be 4 MiB or smaller.');

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

test('encrypts and decrypts locally while offline after the shell is cached', async ({ page, context }) => {
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.goto('/citadel/iii6v9/');
  await context.setOffline(true);
  await page.reload();

  await expect(page).toHaveTitle('AETHER · Local encryption');
  await page.locator('#crypto-input').fill('offline local secret');
  await page.locator('#passphrase').fill('correct horse battery staple');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Encryption complete. Copy or download the ciphertext; it is not saved in the app.');
  const ciphertext = await page.locator('#crypto-output').inputValue();
  expect(ciphertext).toMatch(/^AETHER1\./);

  await page.locator('#decrypt-mode').click();
  await page.locator('#crypto-input').fill(ciphertext);
  await page.locator('#passphrase').fill('correct horse battery staple');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-output')).toHaveValue('offline local secret');
  expect(externalRequests).toEqual([]);
});
