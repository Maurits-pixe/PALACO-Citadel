import { expect, test } from '@playwright/test';

const subjectTypes = ['SYMBOL', 'IMAGE', 'PHOTO', 'ELIXER'];
const exploreLabels = {
  nl: 'Ontdek',
  en: 'Explore',
  de: 'Entdecken',
  fr: 'Explorer',
  es: 'Explorar',
  ar: 'استكشف',
  zh: '探索'
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('keeps the surface readable and free of runtime errors', async ({ page }) => {
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(String(error)));
  await page.reload();

  await expect(page.locator('h1')).toHaveText('RIO.');
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
  expect(runtimeErrors).toEqual([]);
});

test('preserves stable subject identity without presentation authority', async ({ page }) => {
  const subjects = page.locator('.subject-tile');
  await expect(subjects).toHaveCount(4);

  for (const [index, type] of subjectTypes.entries()) {
    const subject = subjects.nth(index);
    await expect(subject).toHaveAttribute('data-subject-id', /^rio:subject:/);
    await expect(subject).toHaveAttribute('data-subject-type', type);
    await expect(subject).toHaveAttribute('data-subject-state', 'CURRENT');
    await expect(subject).toHaveAttribute('data-presentation-effect', 'NONE');
  }

  await subjects.last().click();
  const dialog = page.locator('#subject-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-subject-type', 'ELIXER');
  await expect(dialog).toHaveAttribute('data-object-reference', 'elixer:example-world');
  await expect(dialog).toHaveAttribute('data-presentation-effect', 'NONE');

  await page.locator('#subject-close').click();
  await expect(subjects.last()).toBeFocused();
});

test('keeps localized mobile navigation bounded and reachable', async ({ page }, testInfo) => {
  const mobileNav = page.locator('.mobile-nav');
  if (testInfo.project.name === 'desktop-chromium') {
    await expect(mobileNav).toBeHidden();
    return;
  }

  await expect(mobileNav).toBeVisible();
  const links = mobileNav.locator('a');
  await expect(links).toHaveCount(3);
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    const target = await link.getAttribute('href');
    expect(target).toMatch(/^#[A-Za-z][\w-]*$/);
    await expect(page.locator(target)).toHaveCount(1);
  }

  for (const [locale, label] of Object.entries(exploreLabels)) {
    await page.locator(`[data-lang="${locale}"]`).click();
    await expect(links.first().locator('span').last()).toHaveText(label);
  }
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.locator('[data-lang="ar"]').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await links.nth(1).click();
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'location');
  await expect(page.locator('#meet')).toBeInViewport();
});