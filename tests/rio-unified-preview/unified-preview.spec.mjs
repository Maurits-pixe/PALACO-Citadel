import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { startStaticFixture } from './static-fixture.mjs';
import { CSP } from '../../scripts/build-rio-unified-preview.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(repository, 'render-dist');
const ROOT_CACHE = 'palaco-rio-shell-v50-destination-names';
const OLD_ROOT_CACHE = 'palaco-rio-shell-v35-guard-explanations';
const APP_CACHE = 'palaco-rio-start-v0.1-7';
const ROOT_ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/rio-engine-web.mjs', '/engine.mjs', '/chat-preview.mjs', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg', '/citadel-icon.png', '/integration.mjs', '/rio/reception/nova.png'].sort();
const APP_ASSETS = ['/rio/', '/rio/start.js', '/rio/manifest.webmanifest', '/rio/icon-192.png', '/rio/icon-512.png'].sort();
let fixture;
const errors = new WeakMap();
const external = new WeakMap();

test.beforeAll(async () => {
  execFileSync(process.execPath, ['scripts/build-rio-unified-preview.mjs'], { cwd: repository, stdio: 'pipe' });
  fixture = await startStaticFixture(output);
});
test.afterAll(async () => { await fixture?.close(); });
test.beforeEach(async ({ page, context }) => {
  const messages = []; const requests = [];
  errors.set(page, messages); external.set(page, requests);
  page.on('pageerror', error => messages.push(error.message));
  context.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== fixture.origin) requests.push(request.url());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(external.get(page)).toEqual([]);
});

async function cacheContents(page) {
  return page.evaluate(async () => {
    const result = [];
    for (const name of (await caches.keys()).sort()) {
      const cache = await caches.open(name);
      result.push({ name, paths: (await cache.keys()).map(request => new URL(request.url).pathname).sort() });
    }
    return result;
  });
}

async function rootInstalled(page, origin) {
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration(location.origin + '/');
    return registration?.active?.scriptURL;
  })).toBe(origin + '/sw.js');
  if (await page.evaluate(() => !navigator.serviceWorker.controller)) await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(origin + '/sw.js');
}

async function appInstalled(page, origin) {
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration(location.origin + '/rio/');
    return registration?.scope === location.origin + '/rio/' ? registration?.active?.scriptURL : null;
  })).toBe(origin + '/rio/sw.js');
  if (await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL !== location.origin + '/rio/sw.js')) await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(origin + '/rio/sw.js');
}

async function addContact(page, name) {
  await page.locator('#tab-contacts').click();
  await page.locator('#contact-name').fill(name);
  await page.locator('#add-contact').click();
}

async function removeDownloadFixture(directory) {
  const temporaryRoot = await realpath(tmpdir());
  const actual = await realpath(directory);
  const child = relative(temporaryRoot, actual);
  if (!child.startsWith('rio-unified-download-') || isAbsolute(child)
      || child.includes(sep) || actual === temporaryRoot) throw new Error('UNSAFE_DOWNLOAD_FIXTURE_DIRECTORY');
  await rm(actual, { recursive: true, force: true });
}

test('generated public bundle has working mutual navigation, seven VisitCard languages and RTL', async ({ page, request }) => {
  const response = await page.goto(fixture.origin + '/');
  expect(response.headers()['content-security-policy']).toContain("script-src 'self';");
  expect(response.headers()['content-security-policy']).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(response.headers()['access-control-allow-origin']).toBeUndefined();
  await expect(page.locator('#rio-title')).toContainText('RIO');
  const rootTitles = new Set();
  const integrationPolicies = new Set();
  for (const language of ['nl', 'en', 'de', 'fr', 'es', 'ar', 'zh']) {
    await page.locator('.lang-btn[data-lang="' + language + '"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    rootTitles.add((await page.locator('[data-i18n="tagline"]').textContent()).trim());
    integrationPolicies.add((await page.locator('[data-rio-integration="policy"]').textContent()).trim());
    await expect(page.locator('#rio-unified-offline')).toHaveAttribute('href', '/rio/');
    await expect(page.locator('#rio-unified-reception')).toHaveAttribute('href', '/rio/reception/#nova-explained:' + language);
    await expect(page.locator('#rio-unified-offline')).toBeVisible();
    await expect(page.locator('#rio-unified-reception')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), language).toBe(true);
  }
  expect(rootTitles.size).toBe(7);
  expect(integrationPolicies.size).toBe(7);
  await page.locator('#rio-unified-offline').click();
  await expect(page).toHaveURL(fixture.origin + '/rio/');
  await expect(page.locator('#unified-home')).toHaveAttribute('href', '/');
  await expect(page.locator('#unified-reception')).toHaveAttribute('href', '/rio/reception/#nova-explained:zh');
  await page.locator('#unified-reception').click();
  await expect(page).toHaveURL(fixture.origin + '/rio/reception/#nova-explained:zh');
  await page.locator('a.brand[href="/"]').click();
  await expect(page).toHaveURL(fixture.origin + '/');
  for (const path of ['/auth/server.mjs', '/api/me', '/api/rio/nova/runtime', '/api/rio/device-test/runtime', '/package.json', '/scripts/build-rio-unified-preview.mjs', '/ambassades/auth/server.mjs']) {
    const privateResponse = await request.get(fixture.origin + path);
    expect(privateResponse.status(), path).toBe(404);
    expect(await privateResponse.text()).toBe('');
  }
});

test('static reception explains PHONE or EMAIL without runtime requests, storage or connection claims', async ({ page, context }) => {
  const api = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.method()); });
  await page.goto(fixture.origin + '/rio/reception/');
  await expect(page.locator('html')).toHaveAttribute('data-runtime-mode', 'static-preview');
  for (const id of ['runtime-nova', 'runtime-device']) {
    await expect(page.locator('#' + id)).toHaveAttribute('data-state', 'unconfirmed');
    await expect(page.locator('#' + id)).toHaveText('Niet bevestigd');
  }
  await expect(page.locator('#build-version')).toHaveText('Onbekend');
  await expect(page.locator('#start-nova')).toHaveAttribute('href', 'https://palaco-ambassades.onrender.com/rio/nova/');
  await expect(page.locator('#start-device-test')).toHaveAttribute('href', 'https://palaco-ambassades.onrender.com/rio/device-test/');
  await expect(page.locator('#connection-boundary')).toHaveText('↔ Een verbinding is hier nog niet getest.');
  await expect(page.locator('#brigade .design-label')).toContainText('nog niet aangesloten');
  await expect(page.locator('#pp-identity input, #pp-identity textarea')).toHaveCount(0);
  for (const contact of ['UNCONFIRMED', 'PHONE', 'EMAIL']) {
    let previous;
    for (const transport of ['WIFI', 'MOBILE', 'OTHER']) {
      await page.locator('#pp-example-contact').selectOption(contact);
      await page.locator('#pp-example-transport').selectOption(transport);
      await page.locator('#pp-example-show').click();
      await expect(page.locator('#pp-example-result')).toHaveAttribute('data-state', contact === 'UNCONFIRMED' ? 'not-confirmed' : 'eligible');
      const text = await page.locator('#pp-example-result').textContent();
      if (previous !== undefined) expect(text).toBe(previous);
      previous = text;
    }
  }
  await expect(page.locator('#refresh-availability')).toBeDisabled();
  await page.locator('#refresh-availability').dispatchEvent('click');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await page.clock.install(); await page.clock.fastForward(60000);
  expect(api).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('online app guide is translated and the exact small download works as a genuinely offline file', async ({ page, context }) => {
  await page.goto(fixture.origin + '/rio/');
  const policies = new Set();
  const receptionLabels = new Set();
  await page.locator('#pp-identity-guide summary').click();
  for (const language of ['nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ar', 'eo']) {
    await page.locator('#language').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    policies.add((await page.locator('[data-i18n="ppGuidePolicy"]').textContent()).trim());
    await expect(page.locator('#unified-home')).not.toBeEmpty();
    await expect(page.locator('#unified-reception')).not.toBeEmpty();
    receptionLabels.add((await page.locator('#unified-reception').textContent()).trim());
  }
  expect(policies.size).toBe(11);
  expect(receptionLabels.size).toBe(11);
  await page.locator('#language').selectOption('nl');
  await page.locator('#tab-install').click();
  const event = page.waitForEvent('download');
  await page.locator('#download-app').click();
  const download = await event;
  expect(download.suggestedFilename()).toBe('PALACO-RIO-v0.1.html');
  const directory = await mkdtemp(join(tmpdir(), 'rio-unified-download-'));
  try {
    const filename = join(directory, download.suggestedFilename());
    await download.saveAs(filename);
    const bytes = await readFile(filename);
    expect(bytes.equals(await readFile(join(output, 'rio', 'download')))).toBe(true);
    expect(bytes.byteLength).toBeLessThan(100 * 1024);
    await context.setOffline(true);
    const file = await context.newPage();
    const traffic = []; const fileErrors = [];
    file.on('request', request => { if (/^https?:/.test(request.url())) traffic.push(request.url()); });
    file.on('pageerror', error => fileErrors.push(error.message));
    await file.goto(pathToFileURL(filename).href);
    await expect(file.locator('.brand strong')).toHaveText('PALACO RIO');
    await file.locator('#pp-identity-guide summary').click();
    await expect(file.locator('[data-i18n="ppGuidePolicy"]')).toBeVisible();
    await addContact(file, 'TST offline bezoeker');
    await expect(file.locator('#contact-list .name')).toHaveText('TST offline bezoeker');
    await file.locator('#tab-install').click();
    await expect(file.locator('#download-app')).toBeHidden();
    expect(traffic).toEqual([]); expect(fileErrors).toEqual([]);
    await file.close();
  } finally { await removeDownloadFixture(directory); }
});

test('root worker excludes private, query, download, POST and real loopback cross-origin requests from its cache', async ({ browser }, testInfo) => {
  // Only this isolated probe extends connect-src to loopback: otherwise production
  // CSP blocks the cross-origin request before the worker can be exercised.
  const isolated = await startStaticFixture(output, { csp: CSP.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:*") });
  const other = await startStaticFixture(output, { allowCrossOrigin: true });
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({ viewport, isMobile, hasTouch });
  const page = await context.newPage();
  const pageErrors = []; const externalRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  context.on('request', request => {
    if (/^https?:/.test(request.url()) && ![isolated.origin, other.origin].includes(new URL(request.url()).origin)) externalRequests.push(request.url());
  });
  try {
    await page.goto(isolated.origin + '/');
    await rootInstalled(page, isolated.origin);
    expect(await cacheContents(page)).toEqual([{ name: ROOT_CACHE, paths: ROOT_ASSETS }]);
    await page.evaluate(async name => {
      const cache = await caches.open(name);
      await cache.put('/styles.css', new Response('TST_QUERY_CACHE_SENTINEL'));
    }, ROOT_CACHE);
    const before = isolated.requests.length;
    const results = await page.evaluate(async otherOrigin => {
      const result = [];
      for (const path of ['/api/me', '/auth/server.mjs', '/rio/download', '/?probe=1', '/styles.css?probe=1']) {
        const response = await fetch(path, { credentials: 'omit' });
        result.push([path, response.status]);
      }
      result.push(['POST', (await fetch('/', { method: 'POST', body: 'TST_CACHE_EXCLUSION', credentials: 'omit' })).status]);
      result.push(['cross-origin', (await fetch(otherOrigin + '/icon-192.svg', { mode: 'cors', credentials: 'omit' })).status]);
      return result;
    }, other.origin);
    expect(results).toEqual([['/api/me', 404], ['/auth/server.mjs', 404], ['/rio/download', 200], ['/?probe=1', 200], ['/styles.css?probe=1', 200], ['POST', 405], ['cross-origin', 200]]);
    expect(isolated.requests.slice(before)).toEqual(expect.arrayContaining([
      { method: 'GET', path: '/api/me', search: '' }, { method: 'GET', path: '/auth/server.mjs', search: '' },
      { method: 'GET', path: '/rio/download', search: '' }, { method: 'GET', path: '/', search: '?probe=1' },
      { method: 'GET', path: '/styles.css', search: '?probe=1' }, { method: 'POST', path: '/', search: '' },
    ]));
    expect(other.requests).toEqual([{ method: 'GET', path: '/icon-192.svg', search: '' }]);
    expect(await page.evaluate(async name => (await (await caches.open(name)).match('/styles.css')).text(), ROOT_CACHE)).toBe('TST_QUERY_CACHE_SENTINEL');
    expect(await cacheContents(page)).toEqual([{ name: ROOT_CACHE, paths: ROOT_ASSETS }]);
    expect(externalRequests).toEqual([]); expect(pageErrors).toEqual([]);
  } finally { await context.close(); await isolated.close(); await other.close(); }
});

test('fixed v35 root update to v50 genuinely waits and preserves the active RIO worker, contacts and unrelated cache', async ({ browser }, testInfo) => {
  const legacyWorker = await readFile(new URL('./fixtures/root-v35-sw.js', import.meta.url), 'utf8');
  const currentWorker = await readFile(join(output, 'sw.js'), 'utf8');
  expect(currentWorker).not.toContain('skipWaiting');
  expect(currentWorker).not.toContain('clients.claim');
  let legacy = true;
  const isolated = await startStaticFixture(output, { rootWorker: () => legacy ? legacyWorker : currentWorker });
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({ viewport, isMobile, hasTouch });
  const web = []; const pageErrors = [];
  context.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== isolated.origin) web.push(request.url()); });
  context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
  try {
    const root = await context.newPage();
    await root.goto(isolated.origin + '/');
    await rootInstalled(root, isolated.origin);
    expect((await cacheContents(root)).map(cache => cache.name)).toEqual([OLD_ROOT_CACHE]);
    // The exact historical v35 worker is active before other caches are created;
    // its destructive historical activation is not rerun or misrepresented as safe.
    const app = await context.newPage();
    await app.goto(isolated.origin + '/rio/');
    await appInstalled(app, isolated.origin);
    await addContact(app, 'TST updatebezoeker');
    await app.evaluate(async () => {
      const unknown = await caches.open('unrelated-app-public');
      await unknown.put('/unrelated-public', new Response('preserve'));
    });
    expect(await cacheContents(app)).toEqual([
      { name: OLD_ROOT_CACHE, paths: ROOT_ASSETS.filter(path => !['/integration.mjs', '/rio/reception/nova.png', '/citadel-icon.png'].includes(path)) },
      { name: APP_CACHE, paths: APP_ASSETS },
      { name: 'unrelated-app-public', paths: ['/unrelated-public'] },
    ].sort((a, b) => a.name.localeCompare(b.name)));
    let navigations = 0;
    root.on('framenavigated', frame => { if (frame === root.mainFrame()) navigations++; });
    legacy = false;
    await root.evaluate(async () => { await (await navigator.serviceWorker.getRegistration(location.origin + '/')).update(); });
    await expect.poll(() => root.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration(location.origin + '/')).waiting))).toBe(true);
    expect(navigations).toBe(0);
    await expect(app.locator('#contact-list .name')).toHaveText('TST updatebezoeker');
    expect(await app.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(isolated.origin + '/rio/sw.js');
    await root.close();
    await expect.poll(() => app.evaluate(async name => (await caches.keys()).includes(name), OLD_ROOT_CACHE)).toBe(false);
    const current = await context.newPage();
    await current.goto(isolated.origin + '/');
    await rootInstalled(current, isolated.origin);
    expect(await cacheContents(current)).toEqual([
      { name: ROOT_CACHE, paths: ROOT_ASSETS }, { name: APP_CACHE, paths: APP_ASSETS },
      { name: 'unrelated-app-public', paths: ['/unrelated-public'] },
    ].sort((a, b) => a.name.localeCompare(b.name)));
    const registrations = await app.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => [registration.scope, registration.active.scriptURL]).sort());
    expect(registrations).toEqual([[isolated.origin + '/', isolated.origin + '/sw.js'], [isolated.origin + '/rio/', isolated.origin + '/rio/sw.js']]);
    await context.setOffline(true);
    const response = await app.reload();
    expect(response.fromServiceWorker()).toBe(true);
    await expect(app.locator('#contact-list .name')).toHaveText('TST updatebezoeker');
    await app.locator('#pp-identity-guide summary').click();
    await expect(app.locator('[data-i18n="ppGuidePolicy"]')).toBeVisible();
    await expect(app.locator('#unified-home')).toHaveAttribute('href', '/');
    const rootResponse = await current.reload();
    expect(rootResponse.fromServiceWorker()).toBe(true);
    await expect(current.locator('#rio-unified-reception')).toBeVisible();
    expect(await current.locator('img[data-rio-integration-alt]').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(web).toEqual([]); expect(pageErrors).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  } finally { await context.close(); await isolated.close(); }
});

test('retained subjects, ELIXER dossier, consented Engine evidence and separate local chat work without a service', async ({ page, context }) => {
  const api = []; const mutations = [];
  context.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url());
    if (request.method() !== 'GET') mutations.push([request.method(), request.url()]);
  });
  await page.goto(fixture.origin + '/');
  await page.locator('.lang-btn[data-lang="nl"]').click();

  await page.locator('[data-subject="photo"]').click();
  const subject = page.locator('#subject-dialog');
  await expect(subject).toBeVisible();
  await expect(subject).toHaveAttribute('data-subject-type', 'ILLUSTRATION');
  await expect(subject).toHaveAttribute('data-subject-state', 'DESIGN_ONLY');
  await expect(subject).toHaveAttribute('data-provenance-reference', 'rio-local-css-landscape-v1');
  await expect(subject).toHaveAttribute('data-presentation-effect', 'NONE');
  await expect(page.locator('#subject-dialog-description')).toContainText('geen foto van een echte plek');
  await expect(page.locator('#subject-dialog-source')).toContainText('Lokaal getekend');
  await expect(page.locator('#subject-dialog-status')).toContainText('geen locatiebewijs');
  const landscape = await page.locator('#subject-preview').evaluate(element => getComputedStyle(element).backgroundImage);
  expect(landscape).toContain('gradient(');
  expect(landscape).not.toMatch(/url\(|https?:/i);
  await page.locator('#subject-close').click();

  await page.locator('[data-subject="elixer"]').click();
  await page.locator('#elixer-dossier > summary').click();
  await expect(page.locator('#elixer-dossier')).toHaveAttribute('open', '');
  await expect(page.locator('.elixer-candidate-plain')).toContainText('niet officieel uitgegeven of geactiveerd');
  await page.locator('.elixer-technical-details > summary').click();
  const missing = page.locator('#elixer-dossier [data-i18n="elixerEvidenceUnavailable"]');
  await expect(missing).toHaveCount(4);
  for (const field of await missing.all()) await expect(field).toHaveText('Niet beschikbaar in deze preview');
  await page.locator('#subject-close').click();

  const memory = 'TST-afspraak is dinsdag om 10 uur.';
  await expect(page.locator('#question-input')).toBeDisabled();
  await expect(page.locator('#memory-consent')).not.toBeChecked();
  await page.locator('#memory-input').fill(memory);
  await page.locator('#memory-form button[type="submit"]').click();
  await expect(page.locator('#dossier-output')).toHaveAttribute('data-state', 'CONSENT_REQUIRED');
  await expect(page.locator('#question-input')).toBeDisabled();
  await page.locator('#memory-consent').check();
  await page.locator('#memory-form button[type="submit"]').click();
  await expect(page.locator('#dossier-output')).toHaveAttribute('data-state', 'READY');
  await expect(page.locator('#memory-consent')).not.toBeChecked();
  await page.locator('#question-input').fill('Wanneer is de TST-afspraak?');
  await page.locator('#question-form button[type="submit"]').click();
  await expect(page.locator('#engine-answer-state')).toHaveText('ANTWOORD MET BEWIJS');
  await expect(page.locator('#engine-answer-text')).toHaveText(memory);
  await expect(page.locator('#engine-answer-sources')).toHaveText(/^rio:memory:[a-f0-9-]{36}$/);

  await page.locator('#chat-preview-toggle').click();
  await expect(page.locator('.chat-preview-boundary')).toContainText('geen persoon of live dienst verbonden');
  const message = 'TST-chatvraag: wanneer is de TST-afspraak?';
  await page.locator('#chat-preview-input').fill(message);
  await page.locator('#chat-preview-send').click();
  await expect(page.locator('#chat-preview-messages .is-visitor').last()).toContainText(message);
  await expect(page.locator('#chat-preview-messages .is-rio').last()).toContainText('alleen iets vertellen over RIO');
  await expect(page.locator('#chat-preview-messages')).not.toContainText(memory);
  await expect(page.locator('#engine-answer-text')).toHaveText(memory);
  await page.locator('#chat-preview-clear').click();
  await page.locator('#chat-preview-clear-confirm').click();
  await expect(page.locator('#chat-preview-messages .is-visitor')).toHaveCount(0);
  await expect(page.locator('#engine-answer-text')).toHaveText(memory);
  const stored = await page.evaluate(() => JSON.stringify({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  expect(stored).not.toContain(memory); expect(stored).not.toContain(message);
  await page.reload();
  await expect(page.locator('#dossier-output')).toHaveAttribute('data-state', 'CONSENT_REQUIRED');
  await expect(page.locator('#engine-answer')).toBeHidden();
  await expect(page.locator('#chat-preview-messages .is-visitor')).toHaveCount(0);
  expect(api).toEqual([]); expect(mutations).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
