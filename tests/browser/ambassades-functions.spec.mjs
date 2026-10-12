import { test, expect } from '@playwright/test';

const languages = ['nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ar', 'eo'];
const functions = [
  ['F01', 'Listener'], ['F02', 'Representative'], ['F03', 'Translator'],
  ['F04', 'Connector'], ['F05', 'Reconciler'], ['F06', 'Mediator'], ['F07', 'Memory Keeper'],
];
// Independent oracle transcribed from Issue #38, v0.2 §4. Do not derive expected pairs from the UI data.
const proposalPairs = [
  ['AMB01-F03@v0.2', 'AMB01-F05@v0.2', 'AMB01-F07@v0.2'],
  ['AMB02-F04@v0.2', 'AMB02-F03@v0.2', 'AMB02-F07@v0.2'],
  ['AMB03-F01@v0.2', 'AMB03-F03@v0.2', 'AMB03-F02@v0.2'],
  ['AMB04-F01@v0.2', 'AMB04-F03@v0.2', 'AMB04-F07@v0.2'],
  ['AMB05-F01@v0.2', 'AMB05-F02@v0.2', 'AMB05-F06@v0.2'],
  ['AMB06-F03@v0.2', 'AMB06-F04@v0.2', 'AMB06-F07@v0.2'],
  ['AMB07-F01@v0.2', 'AMB07-F03@v0.2', 'AMB07-F07@v0.2'],
  ['AMB08-F04@v0.2', 'AMB08-F03@v0.2', 'AMB08-F06@v0.2'],
  ['AMB09-F01@v0.2', 'AMB09-F02@v0.2', 'AMB09-F03@v0.2'],
  ['AMB10-F01@v0.2', 'AMB10-F02@v0.2', 'AMB10-F05@v0.2'],
  ['AMB11-F04@v0.2', 'AMB11-F05@v0.2', 'AMB11-F07@v0.2'],
  ['AMB12-F01@v0.2', 'AMB12-F06@v0.2', 'AMB12-F07@v0.2'],
];
const proposalURL = 'https://github.com/Maurits-pixe/PALACO-Citadel/issues/38';
const sourceURL = 'https://github.com/Maurits-pixe/PALACO-Citadel/issues/37';
const HOLD_SECURITY = Object.freeze({
  required: true, available: false, outcome: 'HOLD', reason: 'TRUSTED_SAFETY_APPROVAL_MISSING',
  loginAllowed: false, signupAllowed: false,
});
// This HOLD fixture tests navigation/rendering only; it cannot approve the deployed server.
const rows = page => page.locator('#function-results .fx-row');
const contributions = page => page.locator('#function-results [data-relation]');
const button = (page, id) => page.locator('#functies [data-function="' + id + '"]');
const pairsFor = id => proposalPairs.flat().filter(pair => id === 'ALL' || pair.includes('-' + id + '@'));
const seatsFor = id => proposalPairs.flatMap((pairs, index) =>
  pairs.some(pair => id === 'ALL' || pair.includes('-' + id + '@'))
    ? ['PALACO-AMB-' + String(index + 1).padStart(2, '0')] : []);
const refs = page => contributions(page).evaluateAll(elements => elements.map(element => element.dataset.relation).sort());
const seats = page => rows(page).evaluateAll(elements => elements.map(element => element.dataset.seat));
async function ready(page) {
  await expect.poll(() => page.evaluate(async () => Boolean(await window.PalacoI18n?.ready))).toBe(true);
}
async function loaded(page) {
  await expect(rows(page)).toHaveCount(12);
  await expect(contributions(page)).toHaveCount(36);
  await expect(button(page, 'ALL')).toBeVisible();
  await expect(button(page, 'ALL')).toBeEnabled();
}
async function openRows(page) {
  for (const row of await rows(page).all()) {
    const detail = row.locator('details');
    if (await detail.getAttribute('open') === null) await detail.locator('summary').click();
  }
}
async function expectSelection(page, id) {
  await expect(button(page, id)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => refs(page)).toEqual(pairsFor(id).sort());
  await expect.poll(() => seats(page)).toEqual(seatsFor(id));
  for (const other of ['ALL', ...functions.map(([value]) => value)].filter(value => value !== id)) {
    await expect(button(page, other)).toHaveAttribute('aria-pressed', 'false');
  }
}
async function catalogFor(request) {
  const response = await request.get('/ambassades/locales.json');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('v0.2 proposal keeps its exact 36 contributions, shared row context and source boundaries', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const catalog = await catalogFor(request);
  await page.goto('/ambassades/index.html?lang=nl#functies');
  await ready(page);
  await loaded(page);
  await expect(page.locator('nav a[href="#functies"]')).toBeVisible();
  await expectSelection(page, 'ALL');
  await expect(page.locator('#function-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#functies')).toContainText(catalog.nl.fx_status);
  await expect(page.locator('#functies a[href="' + sourceURL + '"]').first()).toBeVisible();
  await expect(page.locator('#functies a[href="' + proposalURL + '"]').first()).toBeVisible();
  for (const [id, name] of functions) await expect(button(page, id)).toContainText(name);
  for (let line = 46148; line <= 46154; line++) {
    await expect(page.locator('#functies a[href*="/blob/bcf2684d2d9c3ee5bf68a06ccf09bb856bb195bd/ARCHIVE/legacy-sources/"][href$="#L' + line + '"]')).toHaveCount(1);
  }
  await openRows(page);
  for (let index = 0; index < proposalPairs.length; index++) {
    const key = 'AMB' + String(index + 1).padStart(2, '0');
    const row = rows(page).nth(index);
    await expect(row.locator('[data-relation]')).toHaveCount(3);
    await expect(row.locator('[data-artifact]')).toHaveText(catalog.nl['fx_' + key + '_artifact']);
    await expect(row.locator('[data-boundary]')).toHaveText(catalog.nl['fx_' + key + '_bound']);
    await expect(row.locator('[data-question]')).toHaveText(catalog.nl['fx_' + key + '_question']);
    await expect(row.locator('[data-reason]')).toHaveCount(3);
    for (const pair of proposalPairs[index]) {
      const link = row.locator('[data-relation="' + pair + '"]');
      await expect(link).toContainText(pair);
      await expect(link).toHaveAttribute('href', proposalURL);
      await expect(row).toContainText(catalog.nl['fx_' + pair.split('@')[0].replace('-', '_') + '_reason']);
    }
  }
  // The two r1 provenance findings must use the clarified v0.2 wording, not the old v0.1 reasons.
  for (const seat of ['03', '05']) {
    const row = page.locator('.fx-row[data-seat="PALACO-AMB-' + seat + '"]');
    await expect(row).toContainText('zelfomschrijving, aangeleverde bron of interpretatie');
    await expect(row).toContainText('toegestane bronverwijzing');
  }
  await expect(page.locator('.governance-status')).toContainText('Review en ratificatie open');
  await expect(page.locator('.post')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('function selection filters contributions independently of the twelve-post search', async ({ page }) => {
  await page.goto('/ambassades/index.html?lang=nl#functies');
  await ready(page);
  await loaded(page);
  await page.locator('#category').selectOption('Kaders');
  await expect(page.locator('.post:visible')).toHaveCount(2);
  const originalCount = await page.locator('#count').innerText();
  for (const [id] of functions) {
    await button(page, id).click();
    await expectSelection(page, id);
    await expect(page.locator('#category')).toHaveValue('Kaders');
    await expect(page.locator('#search')).toHaveValue('');
    await expect(page.locator('#count')).toHaveText(originalCount);
    await expect(page.locator('.post:visible')).toHaveCount(2);
    await expect(page.locator('.post')).toHaveCount(12);
  }
  await page.locator('#search').fill('no-post-matches-this-phrase');
  await expect(page.locator('.post:visible')).toHaveCount(0);
  await button(page, 'ALL').click();
  await expectSelection(page, 'ALL');
  await page.locator('#reset').click();
  await expect(page.locator('.post:visible')).toHaveCount(12);
  await expectSelection(page, 'ALL');
});

test('all eleven languages retain canonical names and the selected contribution context', async ({ page, request }) => {
  const catalog = await catalogFor(request);
  await page.goto('/ambassades/index.html?lang=nl#functies');
  await ready(page);
  await loaded(page);
  await button(page, 'F02').click();
  for (const language of languages) {
    await page.locator('#language').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    await expect(page).toHaveURL(new RegExp('lang=' + language + '#functies$'));
    await expectSelection(page, 'F02');
    await expect(page.locator('#functies')).toContainText(catalog[language].fx_title);
    await expect(page.locator('#functies a[href="' + sourceURL + '"]').first()).toContainText(catalog[language].fx_source_version);
    await expect(page.locator('#function-description')).toContainText(catalog[language].fx_F02_desc);
    await expect(page.locator('#function-description')).toContainText(catalog[language].fx_F02_bound);
    await expect(page.locator('#function-status')).toContainText(catalog[language].fx_count.replace('{count}', '4'));
    for (const [id, name] of functions) await expect(button(page, id)).toContainText(name);
    await openRows(page);
    for (const seat of ['03', '05', '09', '10']) {
      const key = 'AMB' + seat;
      const row = page.locator('.fx-row[data-seat="PALACO-AMB-' + seat + '"]');
      await expect(row.locator('[data-artifact]')).toHaveText(catalog[language]['fx_' + key + '_artifact']);
      await expect(row.locator('[data-boundary]')).toHaveText(catalog[language]['fx_' + key + '_bound']);
      await expect(row.locator('[data-question]')).toHaveText(catalog[language]['fx_' + key + '_question']);
      await expect(row.locator('[data-reason]')).toHaveText(catalog[language]['fx_' + key + '_F02_reason']);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('keyboard controls and Arabic mobile reading preserve references and account HOLD', async ({ page, request }) => {
  const catalog = await catalogFor(request);
  const accountRequests = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/(?:api\/(?:auth\/status|me|seats(?:\/|$))|login|signup|callback)(?:\/|$)/.test(path)) accountRequests.push(path);
  });
  let privateReads = 0;
  await page.route('**/api/auth/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ configured: true, available: false, authenticated: false, securityApproval: HOLD_SECURITY }),
  }));
  await page.route('**/api/me', route => { privateReads++; return route.abort(); });
  await page.goto('/ambassades/index.html?lang=ar#functies');
  await ready(page);
  await loaded(page);
  const target = button(page, 'F03');
  await target.focus();
  await page.keyboard.press('Space');
  await expectSelection(page, 'F03');
  await expect(target).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button(page, 'F04')).toBeFocused();
  await page.keyboard.press('Enter');
  await expectSelection(page, 'F04');
  await button(page, 'ALL').focus();
  await page.keyboard.press('Enter');
  await expectSelection(page, 'ALL');
  await openRows(page);
  expect(await contributions(page).evaluateAll(elements =>
    elements.every(element => getComputedStyle(element.querySelector('bdi, [dir="ltr"]') || element).direction === 'ltr'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(accountRequests).toEqual([]);
  const post = page.locator('.post').first();
  await post.locator('summary').click();
  await post.locator('a[href*="toegang.html"]').click();
  await ready(page);
  await expect(page).toHaveURL(/toegang\.html\?lang=ar#PALACO-AMB-01$/);
  const holdKey = Object.keys(catalog.nl).find(key => catalog.nl[key] === 'Veiligheidsgoedkeuring nog niet beschikbaar');
  expect(holdKey).toBeDefined();
  await expect(page.locator('#access-state')).toHaveText(catalog.ar[holdKey]);
  await expect(page.locator('#sign-in')).toBeHidden();
  await expect(page.locator('#sign-in')).not.toHaveAttribute('href', /login/);
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('a[href*="signup"]')).toHaveCount(0);
  expect(privateReads).toBe(0);
});

test('URL choice and blocked storage still support the function explorer', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
    get() { throw new Error('Storage disabled'); },
  }));
  await page.goto('/ambassades/index.html?lang=it#functies');
  await ready(page);
  await loaded(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await button(page, 'F07').click();
  await expectSelection(page, 'F07');
  await page.locator('#language').selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expectSelection(page, 'F07');
  await expect(page).toHaveURL(/lang=de#functies$/);
  await page.reload();
  await ready(page);
  await loaded(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

test('missing locales leave the complete Dutch proposal readable', async ({ page, request }) => {
  const catalog = await catalogFor(request);
  await page.route('**/locales.json', route => route.abort());
  await page.goto('/ambassades/index.html?lang=fr#functies');
  await expect.poll(() => page.evaluate(async () => await window.PalacoI18n?.ready)).toBe(false);
  await loaded(page);
  await expect(page.locator('.language-picker')).toBeHidden();
  await expect(page.locator('#functies')).toContainText(catalog.nl.fx_title);
  await button(page, 'F02').click();
  await expectSelection(page, 'F02');
  await openRows(page);
  await expect(page.locator('.fx-row[data-seat="PALACO-AMB-03"] [data-reason]')).toHaveText(catalog.nl.fx_AMB03_F02_reason);
  await expect(page.locator('.post')).toHaveCount(12);
});

test('unavailable proposal data preserves the saved proposal and Retry restores filtering', async ({ page, request }) => {
  const catalog = await catalogFor(request);
  const failedData = route => route.abort();
  await page.route('**/function-contributions.json', failedData);
  await page.goto('/ambassades/index.html?lang=en#functies');
  await ready(page);
  await expect(page.locator('#function-retry')).toBeVisible();
  await expect(page.locator('#function-status')).toHaveText(catalog.en.fx_unavailable);
  expect(await button(page, 'F01').isVisible() && await button(page, 'F01').isEnabled()).toBe(false);
  await expect(rows(page)).toHaveCount(12);
  await expect(contributions(page)).toHaveCount(36);
  await expect.poll(() => refs(page)).toEqual(pairsFor('ALL').sort());
  await openRows(page);
  await expect(page.locator('.post:visible')).toHaveCount(12);
  await expect(page.locator('#functies a[href="' + sourceURL + '"]').first()).toBeVisible();
  await expect(page.locator('#functies a[href="' + proposalURL + '"]').first()).toBeVisible();
  await page.locator('#language').selectOption('ar');
  await expect(page.locator('#function-retry')).toBeVisible();
  await expect(page.locator('#function-status')).toHaveText(catalog.ar.fx_unavailable);
  await expect(rows(page)).toHaveCount(12);
  await expect(contributions(page)).toHaveCount(36);
  await page.unroute('**/function-contributions.json', failedData);
  await page.locator('#function-retry').click();
  await loaded(page);
  await expect(page.locator('#function-retry')).toBeHidden();
  await expectSelection(page, 'ALL');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});

test('following a proposal seat reveals its filtered post without changing the chosen function', async ({ page }) => {
  await page.goto('/ambassades/index.html?lang=nl#functies');
  await ready(page);
  await loaded(page);
  await page.locator('#category').selectOption('Kaders');
  await page.locator('#search').fill(await page.locator('#post-01 h3').innerText());
  await expect(page.locator('#post-03')).toBeHidden();
  await button(page, 'F03').click();
  await expectSelection(page, 'F03');
  await expect(page.locator('#post-03')).toBeHidden();
  await page.locator('.fx-row[data-seat="PALACO-AMB-03"] a[href="#post-03"]').click();
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('#category')).toHaveValue('all');
  await expect(page.locator('.post:visible')).toHaveCount(12);
  await expect(page.locator('#post-03')).toBeVisible();
  await expect(page.locator('#post-03 details')).toHaveAttribute('open', '');
  await expect(page.locator('#post-03 summary')).toBeFocused();
  await expect(page).toHaveURL(/lang=nl#post-03$/);
  await expectSelection(page, 'F03');
});
