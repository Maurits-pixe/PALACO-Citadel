import { test, expect } from '@playwright/test';

const languages = ['nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ar', 'eo'];
async function ready(page) {
 await expect.poll(() => page.evaluate(async () => Boolean(await window.PalacoI18n?.ready))).toBe(true);
}
async function unavailable(route) {
 await route.fulfill({contentType:'application/json', body:JSON.stringify({configured:false,available:false,authenticated:false})});
}
for (const language of languages) {
 test('translated reading, search, category and access continuity: ' + language, async ({page,request}) => {
  const catalog = await (await request.get('/ambassades/locales.json')).json();
  await page.route('**/api/auth/status', unavailable);
  await page.goto('/ambassades/index.html?lang=' + language + '#posten');
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(page.locator('#language')).toHaveValue(language);
  await expect(page.locator('h1')).toContainText(catalog[language].t009);
  await expect(page.locator('nav a[href="#governance"]')).toHaveText(catalog[language].t187);
  await expect(page.locator('.governance thead th').nth(1)).toHaveText(catalog[language].t188);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', catalog[language].t132);
  await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('.post')).toHaveCount(12);
  if (language !== 'nl') {
   await expect(page.locator('h1')).not.toContainText('Twaalf posten.');
   await expect(page.locator('#search')).not.toHaveAttribute('placeholder', 'Bijv. wetenschap, privacy of audit…');
  }
  const firstTitle = await page.locator('.post h3').first().innerText();
  await page.locator('#search').fill(firstTitle);
  await expect(page.locator('.post:visible')).toHaveCount(1);
  await page.locator('#reset').click();
  await page.locator('#category').selectOption('Kaders');
  await expect(page.locator('.post:visible')).toHaveCount(2);
  await page.locator('#language').selectOption(language === 'en' ? 'de' : 'en');
  await expect(page.locator('#category')).toHaveValue('Kaders');
  await expect(page.locator('.post:visible')).toHaveCount(2);
  await page.locator('#language').selectOption(language);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.post').first().locator('summary').click();
  await page.locator('.post').first().locator('a[href*="toegang.html"]').click();
  await ready(page);
  await expect(page).toHaveURL(new RegExp('toegang\\.html\\?lang=' + language + '#PALACO-AMB-01$'));
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(page.locator('#sign-in')).toBeHidden();
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#access-state')).toHaveText(catalog[language].t180);
  await expect(page.locator('.seat')).toHaveCount(12);
  await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}
test('preference survives reload and query choice takes priority', async ({page}) => {
 await page.goto('/ambassades/index.html?lang=fr#posten');
 await ready(page);
 await page.locator('#language').selectOption('es');
 await page.reload();
 await ready(page);
 await expect(page.locator('html')).toHaveAttribute('lang','es');
 await expect(page).toHaveURL(/lang=es#posten$/);
 await page.goto('/ambassades/index.html?lang=de');
 await ready(page);
 await expect(page.locator('html')).toHaveAttribute('lang','de');
});
test('blocked browser storage still supports URL language and navigation', async ({page}) => {
 await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {get() {throw new Error('Storage disabled');}}));
 await page.goto('/ambassades/index.html?lang=it');
 await ready(page);
 await expect(page.locator('html')).toHaveAttribute('lang','it');
 await page.locator('nav a[href*="toegang.html"]').click();
 await ready(page);
 await expect(page.locator('html')).toHaveAttribute('lang','it');
});
test('missing translations leave Dutch content readable and access closed', async ({page}) => {
 await page.route('**/locales.json', route => route.abort());
 await page.route('**/api/auth/status', unavailable);
 await page.goto('/ambassades/toegang.html?lang=fr');
 await expect(page.locator('h1')).toContainText('Een eigen inlog.');
 await expect(page.locator('.language-picker')).toBeHidden();
 await expect(page.locator('#sign-in')).toBeHidden();
 await expect(page.locator('#workspace')).toBeHidden();
});
test('language data preserves all translation and replacement keys', async ({request}) => {
 const response = await request.get('/ambassades/locales.json');
 expect(response.ok()).toBe(true);
 const catalog = await response.json();
 expect(Object.keys(catalog).sort()).toEqual([...languages].sort());
 const keys = Object.keys(catalog.nl);
 expect(keys.length).toBeGreaterThan(150);
 const tokens = value => (value.match(/\{\w+\}/g) || []).sort();
 expect(tokens('x {seat} {count}')).toEqual(['{count}', '{seat}']);
 for (const language of languages) {
  expect(Object.keys(catalog[language]).sort()).toEqual([...keys].sort());
  for (const key of keys) {
   expect(catalog[language][key].trim()).not.toBe('');
   expect(tokens(catalog[language][key])).toEqual(tokens(catalog.nl[key]));
  }
 }
});
