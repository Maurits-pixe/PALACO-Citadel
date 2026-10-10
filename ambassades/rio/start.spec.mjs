import { test, expect } from '@playwright/test';
import { buildApp } from '../auth/server.mjs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

let server;
let origin;
const errors = new WeakMap();

test.beforeAll(async () => {
  server = buildApp({ env: {} }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
    server.once('error', reject);
  });
  origin = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
test.beforeEach(async ({ page }) => {
  const collected = [];
  errors.set(page, collected);
  page.on('pageerror', error => collected.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page) || []).toEqual([]));

async function open(page) {
  await page.goto(origin + '/rio/');
}
async function cachedPaths(page) {
  return page.evaluate(async () => {
    const values = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      values.push({ name, paths: (await cache.keys()).map(request => new URL(request.url).pathname).sort() });
    }
    return values;
  });
}
async function installed(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
  });
  const registration = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration(location.href);
    return { scope: registration.scope, script: registration.active.scriptURL };
  });
  expect(registration).toEqual({ scope: origin + '/rio/', script: origin + '/rio/sw.js' });
}

test('public software endpoints keep authentication and source files closed', async ({ request }) => {
  for (const path of ['/auth/server.mjs', '/rio/auth/server.mjs', '/rio/%2e%2e/auth/server.mjs', '/rio/%2e%2e%2fauth/server.mjs', '/rio/README.md', '/rio/start.spec.mjs', '/.env', '/package.json']) {
    const response = await request.get(origin + path);
    expect(response.status(), path).toBe(404);
    expect((await response.text())).not.toContain('clientSecret');
  }
  for (const path of ['/api/me', '/api/seats/PALACO-AMB-01', '/login?seat=PALACO-AMB-01']) {
    const response = await request.get(origin + path);
    expect(response.status(), path).toBe(503);
    expect(await response.json()).toEqual({ error: 'AUTH_NOT_CONFIGURED' });
  }
  const response = await request.get(origin + '/rio/download');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/octet-stream');
  expect(response.headers()['content-disposition']).toBe('attachment; filename="PALACO-RIO-v0.1.html"');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['cache-control']).toBe('no-store');
  const worker = await request.get(origin + '/rio/sw.js');
  expect(worker.headers()['service-worker-allowed']).toBe('/rio/');
});

test('install metadata and actual PNG assets fit the app scope', async ({ page, request }) => {
  const manifestResponse = await request.get(origin + '/rio/manifest.webmanifest');
  expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await manifestResponse.json();
  expect(manifest.id).toBe('/rio/');
  expect(manifest.name).toBe('PALACO RIO');
  expect(manifest.start_url).toBe('/rio/');
  expect(manifest.scope).toBe('/rio/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map(icon => [icon.src, icon.sizes, icon.type])).toEqual([
    ['/rio/icon-192.png', '192x192', 'image/png'],
    ['/rio/icon-512.png', '512x512', 'image/png'],
  ]);
  await open(page);
  for (const size of [192, 512]) {
    const response = await request.get(origin + '/rio/icon-' + size + '.png');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const dimensions = await page.evaluate(async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, origin + '/rio/icon-' + size + '.png');
    expect(dimensions).toEqual([size, size]);
  }
});

test('service worker installs only public RIO assets and genuinely reloads offline', async ({ page, context }) => {
  await open(page);
  await installed(page);
  const paths = ['/rio/', '/rio/manifest.webmanifest', '/rio/icon-192.png', '/rio/icon-512.png'].sort();
  expect(await cachedPaths(page)).toEqual([{ name: 'palaco-rio-start-v0.1-1', paths }]);
  const privateResults = await page.evaluate(async () => {
    const values = [];
    for (const path of ['/api/me', '/api/seats/PALACO-AMB-01', '/auth/server.mjs', '/rio/download', '/rio/manifest.webmanifest?probe=1']) {
      const response = await fetch(path, { credentials: 'omit' });
      values.push([path, response.status]);
    }
    return values;
  });
  expect(privateResults).toEqual([
    ['/api/me', 503], ['/api/seats/PALACO-AMB-01', 503], ['/auth/server.mjs', 404],
    ['/rio/download', 200], ['/rio/manifest.webmanifest?probe=1', 200],
  ]);
  expect(await cachedPaths(page)).toEqual([{ name: 'palaco-rio-start-v0.1-1', paths }]);
  await addContact(page, 'Fictieve offline bezoeker');
  await context.setOffline(true);
  const response = await page.reload();
  expect(response.status()).toBe(200);
  expect(response.fromServiceWorker()).toBe(true);
  await expect(page.locator('.brand strong')).toHaveText('PALACO RIO');
  await expect(page.locator('#language')).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(origin + '/rio/sw.js');
  await expect(page.locator('#contact-list .name')).toHaveText('Fictieve offline bezoeker');
  await addContact(page, 'Fictieve tweede offline bezoeker');
  await page.reload();
  await expect(page.locator('#contact-list li')).toHaveCount(2);
});

async function addContact(page, name) {
  await page.locator('#tab-contacts').click();
  await page.locator('#contact-name').fill(name);
  await page.locator('#add-contact').click();
}
async function startTrial(page, text = 'Een fictief RIO-proefbericht.') {
  await page.locator('#tab-trial').click();
  await page.locator('#trial-message').fill(text);
  await page.locator('#new-trial').click();
  await expect(page.locator('#notification-badge')).toHaveText('1');
  await expect(page.locator('#receive-nova')).toBeVisible();
}
async function reviewTrial(page, text) {
  await startTrial(page, text);
  await page.locator('#receive-nova').click();
  await page.locator('#first-accept').click();
  await page.locator('#run-checks').click();
  await expect(page.locator('#guard-list li')).toHaveCount(9);
  await expect(page.locator('#sender-accept')).toBeVisible();
}

test('explicit NOVA, first acceptance and two final choices are all required', async ({ page }) => {
  await open(page);
  const text = '<img src=x onerror="window.MESSAGE_XSS=1"> fictieve proef';
  await startTrial(page, text);
  await expect(page.locator('#delivered-message')).toBeHidden();
  await expect(page.locator('#first-accept')).toBeHidden();
  await expect(page.locator('#run-checks')).toBeHidden();
  await page.locator('#open-contact').evaluate(button => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(page.locator('#delivered-message')).toBeHidden();
  await page.locator('#receive-nova').click();
  await expect(page.locator('#first-accept')).toBeVisible();
  await expect(page.locator('#run-checks')).toBeHidden();
  await expect(page.locator('#delivered-message')).toBeHidden();
  await page.locator('#first-accept').click();
  await expect(page.locator('#run-checks')).toBeVisible();
  await expect(page.locator('#sender-accept')).toBeHidden();
  await page.locator('#run-checks').click();
  await expect(page.locator('#guard-list li')).toHaveCount(9);
  await expect(page.locator('#guard-section')).toContainText('Voorbeeld');
  await expect(page.locator('#open-contact')).toBeDisabled();
  await page.locator('#sender-accept').click();
  await expect(page.locator('#sender-accept')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#open-contact')).toBeDisabled();
  await expect(page.locator('#delivered-message')).toBeHidden();
  await page.locator('#receiver-accept').click();
  await expect(page.locator('#open-contact')).toBeEnabled();
  await expect(page.locator('#delivered-message')).toBeHidden();
  await page.locator('#open-contact').click();
  await expect(page.locator('#message-content')).toHaveText(text);
  await expect(page.locator('#message-content img')).toHaveCount(0);
  expect(await page.evaluate(() => window.MESSAGE_XSS)).toBeUndefined();
  await expect(page.locator('#notification-badge')).toHaveText('0');
  await expect(page.locator('#trial-status')).toContainText('Proefcontact geopend');
});

test('wait removes both choices, resume asks again, revocation clears the message', async ({ page }) => {
  await open(page);
  await reviewTrial(page);
  await page.locator('#sender-accept').click();
  await page.locator('#receiver-accept').click();
  await page.locator('#wait-trial').click();
  await expect(page.locator('#trial-status')).toContainText('op wacht');
  await expect(page.locator('#delivered-message')).toBeHidden();
  await expect(page.locator('#open-contact')).toBeHidden();
  await page.locator('#resume-trial').click();
  await expect(page.locator('#sender-accept')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#receiver-accept')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#open-contact')).toBeDisabled();
  await page.locator('#sender-accept').click();
  await page.locator('#receiver-accept').click();
  await page.locator('#open-contact').click();
  await expect(page.locator('#delivered-message')).toBeVisible();
  await page.locator('#revoke-trial').click();
  await expect(page.locator('#trial-status')).toHaveText('Proef ingetrokken.');
  await expect(page.locator('#delivered-message')).toBeHidden();
  await expect(page.locator('#message-content')).toHaveText('');
  await expect(page.locator('#notification-badge')).toHaveText('0');
});

test('decline is terminal and messages and consent never survive reload', async ({ page }) => {
  await open(page);
  const text = 'FICTIONAL_MESSAGE_NEVER_PERSIST_482';
  await startTrial(page, text);
  await page.locator('#decline-trial').click();
  await expect(page.locator('#trial-status')).toHaveText('Proef geweigerd.');
  await expect(page.locator('#notification-badge')).toHaveText('0');
  await expect(page.locator('#delivered-message')).toBeHidden();
  await reviewTrial(page, text);
  await page.locator('#sender-accept').click();
  await page.locator('#receiver-accept').click();
  const stored = await page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])),
    url: location.href,
  }));
  expect(JSON.stringify(stored)).not.toContain(text);
  await page.reload();
  await page.locator('#tab-reception').click();
  await expect(page.locator('#trial-status')).toHaveText('Er wacht geen contactproef.');
  await expect(page.locator('#notification-badge')).toHaveText('0');
  await expect(page.locator('#sender-accept')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#receiver-accept')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#message-content')).toHaveText('');
});

test('expiry and clock rollback close a pending route before it can open', async ({ page }) => {
  await open(page);
  await reviewTrial(page);
  await page.locator('#sender-accept').click();
  await page.locator('#receiver-accept').click();
  await page.evaluate(() => {
    const original = Date.now;
    Date.now = () => original() + 300001;
    document.getElementById('open-contact').click();
  });
  await expect(page.locator('#trial-status')).toHaveText('Proef verlopen. Start een nieuwe proef.');
  await expect(page.locator('#delivered-message')).toBeHidden();
  await page.reload();
  await reviewTrial(page);
  await page.locator('#sender-accept').click();
  await page.locator('#receiver-accept').click();
  await page.evaluate(() => {
    const original = Date.now;
    Date.now = () => original() - 10000;
    document.getElementById('open-contact').click();
  });
  await expect(page.locator('#trial-status')).toHaveText('De klok is gewijzigd. Start voor deze proef opnieuw.');
  await expect(page.locator('#delivered-message')).toBeHidden();
});

test('contacts persist safely, normalize duplicates and stop at twenty four', async ({ page }) => {
  await open(page);
  const literal = '<img src=x onerror="window.CONTACT_XSS=1">';
  await addContact(page, literal);
  await expect(page.locator('#contact-list .name')).toHaveText(literal);
  await expect(page.locator('#contact-list img')).toHaveCount(0);
  expect(await page.evaluate(() => window.CONTACT_XSS)).toBeUndefined();
  await addContact(page, 'Fictieve Zoë');
  await addContact(page, 'ＦＩＣＴＩＥＶＥ ＺＯË');
  await expect(page.locator('#contact-list li')).toHaveCount(2);
  await expect(page.locator('#notice')).toHaveText('Deze naam staat al in je lijst.');
  await page.reload();
  await expect(page.locator('#contact-list li')).toHaveCount(2);
  await expect(page.locator('#contact-list .name').first()).toHaveText(literal);
  for (let i = 3; i <= 24; i++) await addContact(page, 'Fictief contact ' + i);
  await expect(page.locator('#contact-list li')).toHaveCount(24);
  await expect(page.locator('#contact-count')).toHaveText('24 / 24');
  await expect(page.locator('#add-contact')).toBeDisabled();
  await page.locator('#contact-name').fill('Fictief contact 25');
  await page.locator('#contact-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(page.locator('#contact-list li')).toHaveCount(24);
  await expect(page.locator('#notice')).toHaveText('Je lijst bevat al 24 contacten.');
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('palaco.rio.start.contacts.v1')));
  expect(record.version).toBe(1);
  expect(record.names).toHaveLength(24);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-contacts').click();
  await expect(page.locator('#contact-list li')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#contact-count')).toHaveText('0 / 24');
});

test('unavailable storage uses explicit memory fallback without breaking the flow', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage disabled for this test', 'SecurityError'); } });
  });
  await open(page);
  await expect(page.locator('#storage-status')).toHaveClass(/memory/);
  await addContact(page, 'Fictieve tijdelijke bezoeker');
  await expect(page.locator('#contact-list li')).toHaveCount(1);
  await reviewTrial(page);
  await page.locator('#sender-accept').click();
  await page.locator('#receiver-accept').click();
  await page.locator('#open-contact').click();
  await expect(page.locator('#delivered-message')).toBeVisible();
  await page.reload();
  await expect(page.locator('#contact-list li')).toHaveCount(0);
  await expect(page.locator('#storage-status')).toHaveClass(/memory/);
});

test('eleven languages switch the whole interface with RTL and no horizontal overflow', async ({ page }, testInfo) => {
  await open(page);
  const languages = ['nl','en','de','fr','es','it','pt','ru','zh','ar','eo'];
  expect(await page.locator('#language option').evaluateAll(options => options.map(option => option.value))).toEqual(languages);
  const titles = new Set();
  for (const language of languages) {
    await page.locator('#language').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language === 'zh' ? 'zh-Hans' : language);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    titles.add(await page.locator('h1').textContent());
    for (const tab of ['contacts', 'trial', 'reception', 'install']) {
      await page.locator('#tab-' + tab).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), language + '/' + tab + '/' + testInfo.project.name).toBe(true);
    }
    expect(await page.locator('[data-i18n]').evaluateAll(elements => elements.every(element => element.textContent.trim().length > 0))).toBe(true);
  }
  expect(titles.size).toBe(11);
  await page.locator('#language').selectOption('nl');
  await page.locator('#tab-contacts').click();
  await addContact(page, 'Fictieve bezoeker');
  const screenshot = await page.screenshot({ fullPage: true });
  console.log('RIO_START_SCREENSHOT_' + testInfo.project.name + ' ' + screenshot.toString('base64'));
});

test('download saves the exact small app and genuinely runs as an offline file', async ({ page, context, request }) => {
  await open(page);
  await page.locator('#tab-install').click();
  const downloaded = page.waitForEvent('download');
  await page.locator('#download-app').click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('PALACO-RIO-v0.1.html');
  const directory = await mkdtemp(join(tmpdir(), 'palaco-rio-download-test-'));
  const filename = join(directory, download.suggestedFilename());
  try {
    await download.saveAs(filename);
    const bytes = await readFile(filename);
    const canonical = await request.get(origin + '/rio/index.html');
    expect(bytes.equals(await canonical.body())).toBe(true);
    expect(bytes.byteLength).toBeLessThan(100 * 1024);
    expect(bytes.toString('utf8')).toContain('<!doctype html>');
    await context.setOffline(true);
    const local = await context.newPage();
    const fileErrors = [];
    const webRequests = [];
    local.on('pageerror', error => fileErrors.push(error.message));
    local.on('request', request => { if (/^https?:/.test(request.url())) webRequests.push(request.url()); });
    await local.goto(pathToFileURL(filename).href);
    await expect(local.locator('.brand strong')).toHaveText('PALACO RIO');
    await local.locator('#tab-install').click();
    await expect(local.locator('#download-app')).toBeHidden();
    await expect(local.locator('#ambassador-link')).toBeHidden();
    await addContact(local, 'Fictief offline contact');
    await expect(local.locator('#contact-list .name')).toHaveText('Fictief offline contact');
    await reviewTrial(local, 'Fictief bericht uit het gedownloade bestand.');
    await local.locator('#sender-accept').click();
    await local.locator('#receiver-accept').click();
    await local.locator('#open-contact').click();
    await expect(local.locator('#message-content')).toHaveText('Fictief bericht uit het gedownloade bestand.');
    expect(webRequests).toEqual([]);
    expect(fileErrors).toEqual([]);
    await local.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid stored lists never become active contacts or executable markup', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('palaco.rio.start.contacts.v1', JSON.stringify({
    version: 1,
    names: Array.from({ length: 25 }, (_, index) => '<script>window.STORED_XSS=' + index + '</script>'),
  })));
  await open(page);
  await expect(page.locator('#contact-list li')).toHaveCount(0);
  await expect(page.locator('#storage-status')).toHaveClass(/memory/);
  expect(await page.evaluate(() => window.STORED_XSS)).toBeUndefined();
  await addContact(page, 'Fictief contact uit geheugen');
  await expect(page.locator('#contact-list .name')).toHaveText('Fictief contact uit geheugen');
});
