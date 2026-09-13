import { expect, test } from '@playwright/test';

const repoLinks = [
  'https://github.com/Maurits-pixe/PALACO',
  'https://github.com/Maurits-pixe/PALACO-INDUSTRIE',
  'https://github.com/Maurits-pixe/palaco-genesis'
];

const localeExpectations = [
  { lang: 'en', dir: 'ltr', githubSubtitle: 'Direct access to PALACO, PALACO Industrie, and PALACO Genesis on GitHub.' },
  { lang: 'nl', dir: 'ltr', githubSubtitle: 'Directe toegang tot PALACO, PALACO Industrie en PALACO Genesis op GitHub.' },
  { lang: 'eo', dir: 'ltr', githubSubtitle: 'Rekta aliro al PALACO, PALACO Industrie kaj PALACO Genesis en GitHub.' },
  { lang: 'fr', dir: 'ltr' },
  { lang: 'es', dir: 'ltr' },
  { lang: 'ar', dir: 'rtl' }
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('keeps the portal readable and free of runtime errors', async ({ page }) => {
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(String(error)));
  await page.reload();

  await expect(page.locator('h1')).toHaveText('PALACO Citadel');
  await expect(page.locator('.github-card')).toHaveCount(3);
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
  expect(runtimeErrors).toEqual([]);
});

test('preserves github hubs and control-room interactions', async ({ page }) => {
  const githubCards = page.locator('.github-card');
  await expect(githubCards).toHaveCount(3);

  for (const [index, href] of repoLinks.entries()) {
    await expect(githubCards.nth(index)).toHaveAttribute('href', href);
  }

  const controlButtons = page.locator('.control-btn');
  await expect(controlButtons).toHaveCount(2);
  await expect(page.locator('#industry-status')).toHaveText('Standby');
  await expect(page.locator('#citadel-status')).toHaveText('Standby');

  await controlButtons.first().click();
  await expect(page.locator('#industry-status')).toHaveText('Active');
  await expect(controlButtons.first()).toHaveClass(/is-active/);

  await page.locator('#sync-btn').click();
  await expect(page.locator('#sync-output')).not.toHaveText('');
});

test('keeps localization controls reachable across supported languages', async ({ page }) => {
  const languageButtons = page.locator('.language-switch .lang-btn');
  await expect(languageButtons).toHaveCount(9);

  for (const button of await languageButtons.all()) {
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(30);
  }

  for (const { lang, dir, githubSubtitle } of localeExpectations) {
    await page.locator(`[data-lang="${lang}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    if (githubSubtitle) {
      await expect(page.locator('[data-i18n="githubSubtitle"]')).toHaveText(githubSubtitle);
    } else {
      await expect(page.locator('[data-i18n="githubSubtitle"]')).not.toHaveText('');
    }
    await expect(page.locator(`[data-lang="${lang}"]`)).toHaveClass(/active/);
  }
});
