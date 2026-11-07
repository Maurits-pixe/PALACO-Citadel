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

  await page.evaluate(() => {
    window.resolveClipboardWrite = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => new Promise(resolve => {
          window.resolveClipboardWrite = resolve;
        })
      }
    });
  });
  await page.locator('#copy-output').click();
  await expect.poll(() => page.evaluate(() => typeof window.resolveClipboardWrite)).toBe('function');
  await page.locator('#clear-fields').click();
  await page.evaluate(() => window.resolveClipboardWrite());
  await expect(page.locator('#crypto-status')).toHaveText('Input, passphrase, and output cleared from the page.');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();

  await page.locator('#crypto-input').fill('superseded by file picker');
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeDisabled();
  await page.locator('#import-file-button').click();
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.locator('#import-file').setInputFiles([]);
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#crypto-input')).toHaveValue('superseded by file picker');
  await expect(page.locator('#passphrase')).toHaveValue(passphrase);
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#crypto-status')).toHaveText('');

  await page.evaluate(() => {
    window.fileReads = {};
    File.prototype.text = function () {
      const name = this.name;
      return new Promise((resolve, reject) => {
        window.fileReads[name] ??= [];
        window.fileReads[name].push({ resolve, reject });
      });
    };
  });
  await page.locator('#import-file').setInputFiles({
    name: 'oversized.aether',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(6 * 1024 * 1024 + 1)
  });
  await expect(page.locator('#crypto-status')).toHaveText('Choose a valid AETHER1 encrypted file no larger than 6 MiB.');
  await expect(page.locator('#import-file')).toHaveValue('');
  expect(await page.evaluate(() => window.fileReads['oversized.aether'])).toBeUndefined();
  await page.locator('#import-file').setInputFiles({
    name: 'maximum-size.aether',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(6 * 1024 * 1024)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['maximum-size.aether']?.length)).toBe(1);
  await expect(page.locator('#crypto-status')).toHaveText('Reading encrypted file locally…');
  await page.evaluate(envelope => window.fileReads['maximum-size.aether'][0].resolve(envelope), downloadedEnvelope);
  await expect(page.locator('#crypto-status')).toHaveText('Encrypted file opened locally. Enter its passphrase to decrypt.');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
  await expect(page.locator('#import-file')).toHaveValue('');
  await page.locator('#import-file').setInputFiles({
    name: 'delayed.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['delayed.aether']?.length)).toBe(1);
  await expect(page.locator('#crypto-status')).toHaveText('Reading encrypted file locally…');
  await page.locator('#import-file').setInputFiles({
    name: 'rejected.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['rejected.aether']?.length)).toBe(1);
  await expect(page.locator('#crypto-status')).toHaveText('Reading encrypted file locally…');
  await page.evaluate(envelope => window.fileReads['rejected.aether'][0].resolve(envelope), downloadedEnvelope);
  await expect(page.locator('#crypto-status')).toHaveText('Encrypted file opened locally. Enter its passphrase to decrypt.');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
  await expect(page.locator('#import-file')).toHaveValue('');
  await page.evaluate(() => window.fileReads['delayed.aether'][0].resolve(
    `AETHER1.${btoa('s'.repeat(16))}.${btoa('i'.repeat(12))}.${btoa('c'.repeat(16))}`
  ));
  await expect(page.locator('#crypto-status')).toHaveText('Encrypted file opened locally. Enter its passphrase to decrypt.');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.locator('#import-file').setInputFiles({
    name: 'rejected.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['rejected.aether']?.length)).toBe(2);
  await page.locator('#import-file-button').click();
  await expect(page.locator('#import-file')).toHaveValue('');
  await page.locator('#import-file').setInputFiles({
    name: 'rejected.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['rejected.aether']?.length)).toBe(3);
  await page.evaluate(envelope => window.fileReads['rejected.aether'][2].resolve(envelope), downloadedEnvelope);
  await expect(page.locator('#crypto-status')).toHaveText('Encrypted file opened locally. Enter its passphrase to decrypt.');
  await page.evaluate(() => window.fileReads['rejected.aether'][1].reject(new Error('superseded read')));
  await expect(page.locator('#crypto-status')).toHaveText('Encrypted file opened locally. Enter its passphrase to decrypt.');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
  await page.locator('#import-file').setInputFiles({
    name: 'stale-failure-old.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['stale-failure-old.aether']?.length)).toBe(1);
  await page.locator('#import-file').setInputFiles({
    name: 'stale-failure-new.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['stale-failure-new.aether']?.length)).toBe(1);
  await page.evaluate(() => window.fileReads['stale-failure-new.aether'][0].reject(new Error('current read failed')));
  await expect(page.locator('#crypto-status')).toHaveText('Choose a valid AETHER1 encrypted file no larger than 6 MiB.');
  await expect(page.locator('#import-file')).toHaveValue('');
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#crypto-status')).toHaveText('Kies een geldig versleuteld AETHER1-bestand van maximaal 6 MiB.');
  await page.evaluate(() => window.fileReads['stale-failure-old.aether'][0].reject(new Error('superseded read failed')));
  await expect(page.locator('#crypto-status')).toHaveText('Kies een geldig versleuteld AETHER1-bestand van maximaal 6 MiB.');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.locator('#language-select').selectOption('en');
  await page.locator('#import-file').setInputFiles({
    name: 'malformed-after-read.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['malformed-after-read.aether']?.length)).toBe(1);
  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('#crypto-status')).toHaveText('Legante ĉifritan dosieron loke…');
  await page.evaluate(() => window.fileReads['malformed-after-read.aether'][0].resolve('AETHER1.invalid'));
  await expect(page.locator('#crypto-status')).toHaveText('Elektu validan ĉifritan AETHER1-dosieron de maksimume 6 MiB.');
  await expect(page.locator('#import-file')).toHaveValue('');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.locator('#language-select').selectOption('en');
  await page.locator('#import-file').setInputFiles({
    name: 'stale-success-old.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['stale-success-old.aether']?.length)).toBe(1);
  await page.locator('#import-file').setInputFiles({
    name: 'stale-success-new.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['stale-success-new.aether']?.length)).toBe(1);
  await page.evaluate(() => window.fileReads['stale-success-new.aether'][0].resolve('AETHER1.invalid'));
  await expect(page.locator('#crypto-status')).toHaveText('Choose a valid AETHER1 encrypted file no larger than 6 MiB.');
  await expect(page.locator('#import-file')).toHaveValue('');
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#crypto-status')).toHaveText('Kies een geldig versleuteld AETHER1-bestand van maximaal 6 MiB.');
  await page.evaluate(envelope => window.fileReads['stale-success-old.aether'][0].resolve(envelope), downloadedEnvelope);
  await expect(page.locator('#crypto-status')).toHaveText('Kies een geldig versleuteld AETHER1-bestand van maximaal 6 MiB.');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.locator('#language-select').selectOption('en');
  await page.locator('#import-file').setInputFiles({
    name: 'cancelled-picker.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['cancelled-picker.aether']?.length)).toBe(1);
  await page.locator('#import-file-button').click();
  await page.locator('#import-file').setInputFiles([]);
  await page.evaluate(() => window.fileReads['cancelled-picker.aether'][0].resolve(
    `AETHER1.${btoa('x'.repeat(16))}.${btoa('y'.repeat(12))}.${btoa('z'.repeat(16))}`
  ));
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await page.locator('#import-file').setInputFiles({
    name: 'clear.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['clear.aether']?.length)).toBe(1);
  await page.locator('#clear-fields').click();
  await expect(page.locator('#import-file')).toHaveValue('');
  await page.evaluate(() => window.fileReads['clear.aether'][0].resolve('AETHER1.invalid'));
  await expect(page.locator('#crypto-status')).toHaveText('Input, passphrase, and output cleared from the page.');
  await page.locator('#import-file').setInputFiles({
    name: 'mode-change.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => window.fileReads['mode-change.aether']?.length)).toBe(1);
  await page.locator('#encrypt-mode').click();
  await expect(page.locator('#import-file')).toHaveValue('');
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.evaluate(() => window.fileReads['mode-change.aether'][0].reject(new Error('superseded by mode change')));
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#encrypt-mode')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    delete File.prototype.text;
  });

  await page.evaluate(() => {
    File.prototype.text = () => new Promise(resolve => {
      window.resolveEditedPassphraseFileRead = resolve;
    });
  });
  await page.locator('#import-file').setInputFiles({
    name: 'superseded-by-passphrase-edit.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => typeof window.resolveEditedPassphraseFileRead)).toBe('function');
  await page.locator('#passphrase').fill('user selected passphrase');
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.evaluate(envelope => window.resolveEditedPassphraseFileRead(envelope), downloadedEnvelope);
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#passphrase')).toHaveValue('user selected passphrase');
  await expect(page.locator('#crypto-input')).toHaveValue('');

  await page.evaluate(() => {
    window.resolveEditedTextFileRead = null;
    File.prototype.text = () => new Promise(resolve => {
      window.resolveEditedTextFileRead = resolve;
    });
  });
  await page.locator('#import-file').setInputFiles({
    name: 'superseded-by-text-edit.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => typeof window.resolveEditedTextFileRead)).toBe('function');
  await page.locator('#crypto-input').fill('user entered text');
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.evaluate(envelope => window.resolveEditedTextFileRead(envelope), downloadedEnvelope);
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#passphrase')).toHaveValue('user selected passphrase');
  await expect(page.locator('#crypto-input')).toHaveValue('user entered text');
  await page.evaluate(() => {
    delete File.prototype.text;
  });

  await page.locator('#clear-fields').click();
  await page.evaluate(() => {
    File.prototype.text = () => new Promise(resolve => {
      window.resolveSupersededFileRead = resolve;
    });
  });
  await page.locator('#crypto-input').fill('superseding text');
  await page.locator('#passphrase').fill('short');
  await page.locator('#import-file').setInputFiles({
    name: 'superseded-by-submit.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect.poll(() => page.evaluate(() => typeof window.resolveSupersededFileRead)).toBe('function');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Use at least 12 characters for new encryption.');
  await page.evaluate(envelope => window.resolveSupersededFileRead(envelope), downloadedEnvelope);
  await expect(page.locator('#crypto-status')).toHaveText('Use at least 12 characters for new encryption.');
  await expect(page.locator('#crypto-input')).toHaveValue('superseding text');
  await page.evaluate(() => {
    delete File.prototype.text;
  });

  await page.evaluate(() => {
    File.prototype.text = () => Promise.reject(new Error('file read failed'));
  });
  await page.locator('#import-file').setInputFiles({
    name: 'unreadable.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(downloadedEnvelope)
  });
  await expect(page.locator('#crypto-status')).toHaveText('Choose a valid AETHER1 encrypted file no larger than 6 MiB.');
  await expect(page.locator('#import-file')).toHaveValue('');
  await page.evaluate(() => {
    delete File.prototype.text;
  });

  await page.locator('#import-file').setInputFiles({
    name: 'invalid.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from('not-an-envelope')
  });
  await expect(page.locator('#crypto-status')).toHaveText('Choose a valid AETHER1 encrypted file no larger than 6 MiB.');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();

  await page.locator('#crypto-input').fill('clear during encryption');
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeDisabled();
  await page.locator('#clear-fields').click();
  await expect(page.locator('#crypto-input')).toHaveValue('');
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#crypto-status')).toHaveText('Input, passphrase, and output cleared from the page.');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#crypto-input')).toHaveValue('');
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#crypto-status')).toHaveText('Input, passphrase, and output cleared from the page.');

  await page.evaluate(() => {
    const subtle = crypto.subtle;
    window.originalDeriveKey = subtle.deriveKey.bind(subtle);
    window.resolveDelayedDeriveKey = null;
    subtle.deriveKey = (...args) => new Promise(resolve => {
      window.resolveDelayedDeriveKey = () => resolve(window.originalDeriveKey(...args));
    });
  });
  await page.locator('#crypto-input').fill('plaintext before edit');
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect.poll(() => page.evaluate(() => typeof window.resolveDelayedDeriveKey)).toBe('function');
  await page.locator('#crypto-input').fill('plaintext after edit');
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.evaluate(() => window.resolveDelayedDeriveKey());
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await page.locator('#language-select').selectOption('en');
  await page.evaluate(() => {
    crypto.subtle.deriveKey = window.originalDeriveKey;
    delete window.originalDeriveKey;
  });

  await page.evaluate(() => {
    window.resolveDelayedFileFailure = null;
    File.prototype.text = () => new Promise((resolve, reject) => {
      window.resolveDelayedFileFailure = () => reject(new Error('delayed file read failure'));
    });
  });
  await page.locator('#import-file').setInputFiles({
    name: 'delayed-failure.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from('placeholder')
  });
  await expect(page.locator('#crypto-status')).toHaveText('Reading encrypted file locally…');
  await expect.poll(() => page.evaluate(() => typeof window.resolveDelayedFileFailure)).toBe('function');
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#crypto-status')).toHaveText('Versleuteld bestand lokaal lezen…');
  await page.evaluate(() => window.resolveDelayedFileFailure());
  await expect(page.locator('#crypto-status')).toHaveText('Kies een geldig versleuteld AETHER1-bestand van maximaal 6 MiB.');
  await expect(page.locator('#import-file')).toHaveValue('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.evaluate(() => {
    delete File.prototype.text;
    delete window.resolveDelayedFileFailure;
  });
  await page.locator('#language-select').selectOption('en');

  await page.evaluate(() => {
    const subtle = crypto.subtle;
    window.originalDeriveKey = subtle.deriveKey.bind(subtle);
    window.rejectClearedOperationDeriveKey = null;
    subtle.deriveKey = () => new Promise((resolve, reject) => {
      window.rejectClearedOperationDeriveKey = () => reject(new Error('cleared crypto operation'));
    });
  });
  await page.locator('#crypto-input').fill('plaintext before clearing');
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect.poll(() => page.evaluate(() => typeof window.rejectClearedOperationDeriveKey)).toBe('function');
  await page.locator('#clear-fields').click();
  await expect(page.locator('#crypto-input')).toHaveValue('');
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeDisabled();
  await expect(page.locator('#crypto-status')).toHaveText('Input, passphrase, and output cleared from the page.');
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#crypto-status')).toHaveText('Invoer, wachtzin en resultaat van de pagina gewist.');
  await page.evaluate(() => window.rejectClearedOperationDeriveKey());
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#crypto-status')).toHaveText('Invoer, wachtzin en resultaat van de pagina gewist.');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.evaluate(() => {
    crypto.subtle.deriveKey = window.originalDeriveKey;
    delete window.originalDeriveKey;
  });
  await page.locator('#language-select').selectOption('en');

  await page.evaluate(() => {
    const subtle = crypto.subtle;
    window.originalDeriveKey = subtle.deriveKey.bind(subtle);
    window.deriveKeyCallCount = 0;
    window.resolveSingleDeriveKey = null;
    subtle.deriveKey = (...args) => {
      window.deriveKeyCallCount += 1;
      return new Promise(resolve => {
        window.resolveSingleDeriveKey = () => resolve(window.originalDeriveKey(...args));
      });
    };
  });
  await page.locator('#crypto-input').fill('only one crypto operation');
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect.poll(() => page.evaluate(() => window.deriveKeyCallCount)).toBe(1);
  await page.evaluate(() => {
    document.querySelector('#crypto-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeDisabled();
  expect(await page.evaluate(() => window.deriveKeyCallCount)).toBe(1);
  await page.evaluate(() => window.resolveSingleDeriveKey());
  await expect(page.locator('#crypto-status')).toContainText('Encryption complete');
  await expect(page.locator('#crypto-output')).not.toHaveValue('');
  await page.evaluate(() => {
    crypto.subtle.deriveKey = window.originalDeriveKey;
    delete window.originalDeriveKey;
    delete window.deriveKeyCallCount;
    delete window.resolveSingleDeriveKey;
  });
  await page.locator('#clear-fields').click();

  await page.evaluate(() => {
    const subtle = crypto.subtle;
    window.originalDeriveKey = subtle.deriveKey.bind(subtle);
    window.resolvePickerCancelledDeriveKey = null;
    subtle.deriveKey = (...args) => new Promise(resolve => {
      window.resolvePickerCancelledDeriveKey = () => resolve(window.originalDeriveKey(...args));
    });
  });
  await page.locator('#crypto-input').fill('crypto before opening picker');
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect.poll(() => page.evaluate(() => typeof window.resolvePickerCancelledDeriveKey)).toBe('function');
  await page.locator('#import-file-button').click();
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeDisabled();
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.locator('#import-file').setInputFiles([]);
  await page.evaluate(() => window.resolvePickerCancelledDeriveKey());
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.evaluate(() => {
    crypto.subtle.deriveKey = window.originalDeriveKey;
    delete window.originalDeriveKey;
  });

  await page.evaluate(() => {
    const subtle = crypto.subtle;
    window.originalDeriveKey = subtle.deriveKey.bind(subtle);
    window.rejectEditedInputDeriveKey = null;
    subtle.deriveKey = () => new Promise((resolve, reject) => {
      window.rejectEditedInputDeriveKey = () => reject(new Error('superseded crypto operation'));
    });
  });
  await page.locator('#crypto-input').fill('plaintext before rejected operation');
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect.poll(() => page.evaluate(() => typeof window.rejectEditedInputDeriveKey)).toBe('function');
  await page.locator('#crypto-input').fill('plaintext after rejected operation');
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.evaluate(() => window.rejectEditedInputDeriveKey());
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.evaluate(() => {
    crypto.subtle.deriveKey = window.originalDeriveKey;
    delete window.originalDeriveKey;
  });

  await page.evaluate(() => {
    const subtle = crypto.subtle;
    window.originalDeriveKey = subtle.deriveKey.bind(subtle);
    window.resolveModeChangeDeriveKey = null;
    subtle.deriveKey = (...args) => new Promise(resolve => {
      window.resolveModeChangeDeriveKey = () => resolve(window.originalDeriveKey(...args));
    });
  });
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect.poll(() => page.evaluate(() => typeof window.resolveModeChangeDeriveKey)).toBe('function');
  await page.locator('#decrypt-mode').click();
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeDisabled();
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.evaluate(() => window.resolveModeChangeDeriveKey());
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await page.evaluate(() => {
    crypto.subtle.deriveKey = window.originalDeriveKey;
    delete window.originalDeriveKey;
  });
  await page.locator('#encrypt-mode').click();
  await page.locator('#language-select').selectOption('en');

  await page.evaluate(() => {
    const subtle = crypto.subtle;
    window.originalDeriveKey = subtle.deriveKey.bind(subtle);
    window.resolvePassphraseEditDeriveKey = null;
    subtle.deriveKey = (...args) => new Promise(resolve => {
      window.resolvePassphraseEditDeriveKey = () => resolve(window.originalDeriveKey(...args));
    });
  });
  await page.locator('#crypto-input').fill('plaintext before passphrase edit');
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect.poll(() => page.evaluate(() => typeof window.resolvePassphraseEditDeriveKey)).toBe('function');
  await page.locator('#passphrase').fill('changed passphrase');
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await page.evaluate(() => window.resolvePassphraseEditDeriveKey());
  await expect(page.locator('#crypto-form button[type="submit"]')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#crypto-status')).toHaveText('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await page.evaluate(() => {
    crypto.subtle.deriveKey = window.originalDeriveKey;
    delete window.originalDeriveKey;
  });

  await page.evaluate(() => {
    const subtle = crypto.subtle;
    window.originalDeriveKey = subtle.deriveKey.bind(subtle);
    window.resolveLocalizedDeriveKey = null;
    subtle.deriveKey = (...args) => new Promise(resolve => {
      window.resolveLocalizedDeriveKey = () => resolve(window.originalDeriveKey(...args));
    });
  });
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Processing locally…');
  await expect.poll(() => page.evaluate(() => typeof window.resolveLocalizedDeriveKey)).toBe('function');
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#crypto-status')).toHaveText('Lokaal verwerken…');
  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('#crypto-status')).toHaveText('Loka prilaborado…');
  await page.evaluate(() => window.resolveLocalizedDeriveKey());
  await expect(page.locator('#crypto-status')).toHaveText(
    'Ĉifrado finita. Kopiu aŭ elŝutu la ĉifrotekston; ĝi ne estas konservata en la aplikaĵo.'
  );
  await page.evaluate(() => {
    crypto.subtle.deriveKey = window.originalDeriveKey;
    delete window.originalDeriveKey;
  });
  await page.locator('#language-select').selectOption('en');

  await page.evaluate(() => {
    document.querySelector('#crypto-input').value = 'x'.repeat(4 * 1024 * 1024 + 1);
  });
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Plaintext must be 4 MiB or smaller.');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();

  await page.locator('#import-file').setInputFiles({
    name: 'aether-encrypted.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from(` \r\n${downloadedEnvelope}\r\n\t`)
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

  await page.locator('#passphrase').fill('edited passphrase');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-output')).toHaveValue(plaintext);

  await page.locator('#crypto-input').fill('not-an-envelope');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
  await expect(page.locator('#crypto-status')).toHaveText('');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Invalid AETHER1 data format.');
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#crypto-status')).toHaveText('Ongeldig AETHER1-gegevensformaat.');
  await page.locator('#language-select').selectOption('en');
  await expect(page.locator('#crypto-status')).toHaveText('Invalid AETHER1 data format.');
  await expect(page.locator('#download-output')).toBeDisabled();

  const [version, salt, iv, encrypted] = ciphertext.split('.');
  await page.locator('#crypto-input').fill(`${version}.${salt.slice(0, 4)} ${salt.slice(4)}.${iv}.${encrypted}`);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Invalid AETHER1 data format.');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();

  const invalidUtf8Envelope = await page.evaluate(async passphrase => {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, Uint8Array.of(0xff, 0xfe)));
    const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
    return `AETHER1.${toBase64(salt)}.${toBase64(iv)}.${toBase64(encrypted)}`;
  }, passphrase);
  await page.locator('#crypto-input').fill(invalidUtf8Envelope);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Decryption failed. Check the passphrase and encrypted data.');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
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

  await page.locator('#decrypt-mode').click();
  await page.evaluate(() => {
    document.querySelector('#crypto-input').value = 'x'.repeat(6 * 1024 * 1024 + 1);
  });
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Encrypted input must be 6 MiB or smaller.');

  const oversizedEnvelope = await page.evaluate(async passphrase => {
    const encoder = new TextEncoder();
    const salt = new Uint8Array(16).fill(1);
    const iv = new Uint8Array(12).fill(2);
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new Uint8Array(4 * 1024 * 1024 + 1)
    ));
    const toBase64 = bytes => {
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x2000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x2000));
      }
      return btoa(binary);
    };
    return `AETHER1.${toBase64(salt)}.${toBase64(iv)}.${toBase64(ciphertext)}`;
  }, passphrase);
  expect(Buffer.byteLength(oversizedEnvelope)).toBeLessThan(6 * 1024 * 1024);
  await page.locator('#decrypt-mode').click();
  await page.locator('#crypto-input').fill(oversizedEnvelope);
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Decrypted plaintext exceeds the 4 MiB limit.');
  await expect(page.locator('#crypto-output')).toHaveValue('');

  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.locator('#notice-title')).toHaveText('LOKALE VERSLEUTELING · BEVEILIGINGSBEPERKINGEN GELDEN');
  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('html')).toHaveAttribute('lang', 'eo');
  await expect(page.locator('#notice-title')).toHaveText('LOKA ĈIFRADO · SEKURECAJ LIMIGOJ VALIDAS');
  await page.evaluate(() => {
    File.prototype.text = () => new Promise(resolve => {
      window.resolveLocalizedFileRead = resolve;
    });
  });
  await page.locator('#import-file').setInputFiles({
    name: 'esperanto-reading.aether',
    mimeType: 'text/plain',
    buffer: Buffer.from('pending')
  });
  await expect.poll(() => page.evaluate(() => typeof window.resolveLocalizedFileRead)).toBe('function');
  await expect(page.locator('#crypto-status')).toHaveText('Legante ĉifritan dosieron loke…');
  await page.locator('#language-select').selectOption('nl');
  await expect(page.locator('#crypto-status')).toHaveText('Versleuteld bestand lokaal lezen…');
  await page.locator('#language-select').selectOption('eo');
  await expect(page.locator('#crypto-status')).toHaveText('Legante ĉifritan dosieron loke…');
  await page.locator('#clear-fields').click();
  await page.evaluate(() => window.resolveLocalizedFileRead('AETHER1.invalid'));
  await expect(page.locator('#crypto-status')).toHaveText('Enigo, pasfrazo kaj eligo viŝitaj el la paĝo.');
  await page.evaluate(() => {
    delete File.prototype.text;
  });

  await page.locator('#clear-fields').click();
  await expect(page.locator('#crypto-input')).toHaveValue('');
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key !== 'palaco-language'))).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('decrypts multibyte plaintext at the 4 MiB limit and rejects one byte over', async ({ page }) => {
  await page.goto('/citadel/iii6v9/');
  const envelopes = await page.evaluate(async passphrase => {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const toBase64 = bytes => {
      let binary = '';
      for (let start = 0; start < bytes.length; start += 0x2000) {
        binary += String.fromCharCode(...bytes.subarray(start, start + 0x2000));
      }
      return btoa(binary);
    };
    const createEnvelope = async plaintext => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
      return `AETHER1.${toBase64(salt)}.${toBase64(iv)}.${toBase64(encrypted)}`;
    };
    const maximumPlaintext = encoder.encode('é'.repeat(2 * 1024 * 1024));
    const oversizedPlaintext = new Uint8Array(maximumPlaintext.length + 1);
    oversizedPlaintext.set(maximumPlaintext);
    oversizedPlaintext[oversizedPlaintext.length - 1] = 0x61;
    return [await createEnvelope(maximumPlaintext), await createEnvelope(oversizedPlaintext)];
  }, 'correct horse battery staple');
  const expectedPlaintext = 'é'.repeat(2 * 1024 * 1024);

  await page.locator('#decrypt-mode').click();
  await page.locator('#passphrase').fill('correct horse battery staple');
  await page.locator('#crypto-input').fill(envelopes[0]);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toContainText('Decryption complete');
  const decryptedPlaintext = await page.locator('#crypto-output').inputValue();
  expect(decryptedPlaintext).toBe(expectedPlaintext);
  expect(new TextEncoder().encode(decryptedPlaintext).byteLength).toBe(4 * 1024 * 1024);
  await expect(page.locator('#copy-output')).toBeEnabled();
  await expect(page.locator('#download-output')).toBeDisabled();

  await page.locator('#crypto-input').fill(envelopes[1]);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Decrypted plaintext exceeds the 4 MiB limit.');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
});

test('counts Unicode passphrase code points for the encryption minimum', async ({ page }) => {
  await page.goto('/citadel/iii6v9/');
  const passphrase = '🛰'.repeat(12);
  await page.locator('#crypto-input').fill('Unicode passphrase round trip');
  await page.locator('#passphrase').fill(passphrase.slice(0, 22));
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Use at least 12 characters for new encryption.');
  await expect(page.locator('#crypto-output')).toHaveValue('');

  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toContainText('Encryption complete');
  const ciphertext = await page.locator('#crypto-output').inputValue();
  await page.locator('#decrypt-mode').click();
  await page.locator('#crypto-input').fill(ciphertext);
  await page.locator('#passphrase').fill(passphrase);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toContainText('Decryption complete');
  await expect(page.locator('#crypto-output')).toHaveValue('Unicode passphrase round trip');
});

test('applies inclusive AETHER input byte limits', async ({ page }) => {
  await page.goto('/citadel/iii6v9/');
  await page.locator('#crypto-input').fill('é'.repeat(2 * 1024 * 1024));
  await page.locator('#passphrase').fill('short');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Use at least 12 characters for new encryption.');
  await expect(page.locator('#crypto-output')).toHaveValue('');

  await page.locator('#crypto-input').fill(`${'é'.repeat(2 * 1024 * 1024)}a`);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Plaintext must be 4 MiB or smaller.');
  await expect(page.locator('#crypto-output')).toHaveValue('');

  await page.locator('#decrypt-mode').click();
  await page.locator('#passphrase').fill('correct horse battery staple');
  await page.locator('#crypto-input').fill('x'.repeat(6 * 1024 * 1024));
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Invalid AETHER1 data format.');
  await expect(page.locator('#crypto-output')).toHaveValue('');

  await page.locator('#crypto-input').fill(`${'x'.repeat(6 * 1024 * 1024)}x`);
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText('Encrypted input must be 6 MiB or smaller.');
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
});

test('fails closed when Web Crypto is unavailable', async ({ page }) => {
  await page.goto('/citadel/iii6v9/');
  await page.evaluate(() => {
    window.originalCryptoSubtle = crypto.subtle;
    Object.defineProperty(crypto, 'subtle', { configurable: true, value: undefined });
  });

  await page.locator('#crypto-input').fill('local plaintext');
  await page.locator('#passphrase').fill('correct horse battery staple');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText(
    'Web Crypto is unavailable. Open this page in a secure browser context (HTTPS or localhost).'
  );
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();

  await page.locator('#decrypt-mode').click();
  await page.locator('#crypto-input').fill('AETHER1.invalid');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText(
    'Web Crypto is unavailable. Open this page in a secure browser context (HTTPS or localhost).'
  );
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();

  await page.evaluate(() => {
    Object.defineProperty(crypto, 'subtle', { configurable: true, value: window.originalCryptoSubtle });
    Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: undefined });
    delete window.originalCryptoSubtle;
  });
  await page.locator('#encrypt-mode').click();
  await page.locator('#crypto-input').fill('local plaintext');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-status')).toHaveText(
    'Web Crypto is unavailable. Open this page in a secure browser context (HTTPS or localhost).'
  );
  await expect(page.locator('#crypto-output')).toHaveValue('');
  await expect(page.locator('#copy-output')).toBeDisabled();
  await expect(page.locator('#download-output')).toBeDisabled();
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

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-output').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('aether-encrypted.aether');
  const fileStream = await download.createReadStream();
  const fileChunks = [];
  for await (const chunk of fileStream) fileChunks.push(chunk);
  const encryptedFile = Buffer.concat(fileChunks);
  expect(encryptedFile.toString('utf8')).toBe(ciphertext);

  await page.locator('#clear-fields').click();
  await page.locator('#passphrase').fill('stale previous passphrase');
  await page.locator('#import-file').setInputFiles({
    name: 'aether-encrypted.aether',
    mimeType: 'text/plain',
    buffer: encryptedFile
  });
  await expect(page.locator('#crypto-status')).toHaveText('Encrypted file opened locally. Enter its passphrase to decrypt.');
  await expect(page.locator('#crypto-input')).toHaveValue(ciphertext);
  await expect(page.locator('#passphrase')).toHaveValue('');
  await expect(page.locator('#passphrase')).toBeFocused();
  await page.locator('#passphrase').fill('correct horse battery staple');
  await page.locator('#crypto-form button[type="submit"]').click();
  await expect(page.locator('#crypto-output')).toHaveValue('offline local secret');
  expect(encryptedFile.toString('utf8')).not.toContain('offline local secret');
  expect(encryptedFile.toString('utf8')).not.toContain('correct horse battery staple');
  expect(externalRequests).toEqual([]);
});
