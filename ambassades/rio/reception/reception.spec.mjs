import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { buildApp } from '../../auth/server.mjs';

const NOVA = '/api/rio/nova/runtime';
const DEVICE = '/api/rio/device-test/runtime';
const CANARY = 'PRIVATE_RESPONSE_CANARY_8e92';
let fixture;
let validNova;
let validDevice;
const errors = new WeakMap();

test.beforeAll(async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const app = buildApp({
    env: { NODE_ENV: 'development', RIO_NOVA_BASE_URL: origin, RIO_DEVICE_TEST_BASE_URL: origin },
    deviceTestOptions: { baseURL: origin, development: true, buildCommit: 'a'.repeat(40) },
  });
  server.on('request', app);
  fixture = { server, app, origin };
  validNova = await (await fetch(origin + NOVA)).json();
  validDevice = await (await fetch(origin + DEVICE)).json();
});

test.afterAll(async () => {
  fixture.app.locals.novaReception.close();
  fixture.app.locals.deviceTest.close();
  fixture.app.locals.authSafetyApproval.close();
  fixture.app.locals.authSafetyProvider?.close();
  fixture.server.closeAllConnections();
  await new Promise(resolve => fixture.server.close(resolve));
});

test.beforeEach(async ({ page }) => {
  const collected = [];
  errors.set(page, collected);
  page.on('pageerror', error => collected.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

async function open(page) { await page.goto(fixture.origin + '/rio/reception/'); }
async function settled(page) { await expect(page.locator('#refresh-availability')).toBeEnabled(); }
async function noConnectionClaim(page) {
  await expect(page.locator('#connection-boundary')).toHaveText('↔ Een verbinding is hier nog niet getest.');
  await expect(page.locator('#brigade .design-label')).toContainText('nog niet aangesloten');
}

test('real HTTP availability reads create no session, storage or connection claim', async ({ page, context }) => {
  const api = [];
  const responses = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) api.push([request.method(), new URL(request.url()).pathname]);
  });
  page.on('response', response => responses.push(response));
  await open(page);
  await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('#runtime-device')).toHaveAttribute('data-state', 'available');
  await page.locator('summary').click();
  await expect(page.locator('#build-version')).toHaveText('a'.repeat(12));
  expect(api.sort()).toEqual([['GET', DEVICE], ['GET', NOVA]].sort());
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  for (const response of responses) expect((await response.allHeaders())['set-cookie']).toBeUndefined();
  await expect(page.locator('#brigade-roles > li')).toHaveCount(9);
  await noConnectionClaim(page);
});

test('availability requests omit existing cookies and raw extra fields never enter the page', async ({ page, context }) => {
  await context.addCookies([{ name: 'unrelated_session', value: CANARY, url: fixture.origin }]);
  const cookies = [];
  await page.route('**/api/rio/**/runtime', async route => {
    cookies.push((await route.request().allHeaders()).cookie);
    const data = route.request().url().endsWith(NOVA) ? validNova : validDevice;
    await route.fulfill({ json: { ...data, privateValue: '<img src=x onerror=alert(1)>' + CANARY } });
  });
  await open(page);
  await expect(page.locator('#runtime-device')).toHaveAttribute('data-state', 'available');
  expect(cookies).toEqual([undefined, undefined]);
  await expect(page.locator('body')).not.toContainText(CANARY);
  expect((await context.cookies())[0].value).toBe(CANARY);
  await noConnectionClaim(page);
});

test('unexpected enabled authority or unknown shape cannot be presented as an available closed trial', async ({ page }) => {
  const unsafe = [
    [NOVA, { ...validNova, guardianRuntimeConnected: true }],
    [NOVA, { ...validNova, finalConsentEnabled: true }],
    [DEVICE, { ...validDevice, accountActive: true }],
    [DEVICE, { ...validDevice, canOpenContact: true }],
    [DEVICE, { ...validDevice, endToEndEncrypted: true }],
    [DEVICE, { component: 'UNKNOWN', privateValue: CANARY }],
  ];
  for (const [path, value] of unsafe) {
    await page.route('**' + path, route => route.fulfill({ json: value }));
    await open(page);
    const changed = path === NOVA ? '#runtime-nova' : '#runtime-device';
    const other = path === NOVA ? '#runtime-device' : '#runtime-nova';
    await expect(page.locator(changed)).toHaveAttribute('data-state', 'unconfirmed');
    await expect(page.locator(other)).toHaveAttribute('data-state', 'available');
    await expect(page.locator('body')).not.toContainText(CANARY);
    await noConnectionClaim(page);
    await page.unroute('**' + path);
  }
});

test('partial HTTP failure stays independent and has no automatic retry or polling', async ({ page }) => {
  let count = 0;
  page.on('request', request => { if (request.url().includes('/runtime')) count++; });
  await page.route('**' + NOVA, route => route.fulfill({ status: 503, contentType: 'text/html', body: CANARY }));
  await open(page);
  await expect(page.locator('#runtime-nova')).toHaveText('Niet bevestigd');
  await expect(page.locator('#runtime-device')).toHaveText('Bereikbaar');
  await expect(page.locator('#availability-feedback')).toContainText('Eén proefroute');
  await page.clock.install();
  await page.clock.fastForward(60000);
  expect(count).toBe(2);
  await expect(page.locator('body')).not.toContainText(CANARY);
  await noConnectionClaim(page);
});

test('explicit refresh performs one bounded pair of reads and prevents overlapping runs', async ({ page }) => {
  await open(page);
  await expect(page.locator('#runtime-device')).toHaveText('Bereikbaar');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let reads = 0;
  await page.route('**/api/rio/**/runtime', async route => {
    reads++;
    await gate;
    await route.fulfill({ json: route.request().url().endsWith(NOVA) ? validNova : validDevice });
  });
  await page.locator('#refresh-availability').click();
  await expect(page.locator('#refresh-availability')).toBeDisabled();
  await expect.poll(() => reads).toBe(2);
  await page.locator('#refresh-availability').dispatchEvent('click');
  expect(reads).toBe(2);
  release();
  await settled(page);
  await expect(page.locator('#runtime-device')).toHaveText('Bereikbaar');
  expect(reads).toBe(2);
});

test('content type, malformed JSON, over-limit bytes and invalid UTF-8 fail without response disclosure', async ({ page }) => {
  const cases = [
    { contentType: 'text/plain', body: JSON.stringify(validNova) },
    { contentType: 'application/json', body: '{' + CANARY },
    { contentType: 'application/json', body: JSON.stringify(validNova).padEnd(8193, ' ') },
    { contentType: 'application/json', body: Buffer.concat([Buffer.from(JSON.stringify(validNova).slice(0, -1) + ',"extra":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]) },
  ];
  for (const response of cases) {
    await page.route('**' + NOVA, route => route.fulfill(response));
    await open(page);
    await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state', 'unconfirmed');
    await expect(page.locator('#runtime-device')).toHaveAttribute('data-state', 'available');
    await expect(page.locator('body')).not.toContainText(CANARY);
    await page.unroute('**' + NOVA);
  }
  await page.route('**' + NOVA, route => route.fulfill({ contentType: 'application/json; charset=utf-8', body: JSON.stringify(validNova).padEnd(8192, ' ') }));
  await open(page);
  await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state', 'available');
});

test('stalled requests time out and allow a new human initiated check', async ({ page }) => {
  await page.clock.install();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**' + NOVA, async route => { await gate; await route.abort().catch(() => {}); });
  await open(page);
  await expect(page.locator('#refresh-availability')).toBeDisabled();
  await page.clock.fastForward(8100);
  await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state', 'unconfirmed');
  await expect(page.locator('#runtime-device')).toHaveAttribute('data-state', 'available');
  await settled(page);
  release();
  await page.unroute('**' + NOVA);
  await page.locator('#refresh-availability').click();
  await expect(page.locator('#runtime-nova')).toHaveText('Bereikbaar');
});

test('NOVA, nine role descriptions, keyboard navigation and narrow layouts remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ik ben NOVA');
  await expect(page.getByRole('img', { name: /NOVA/ })).toBeVisible();
  expect(await page.getByRole('img', { name: /NOVA/ }).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  await expect(page.locator('[aria-live="assertive"]')).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), String(width)).toBe(true);
    for (const id of ['start-device-test', 'start-nova', 'refresh-availability']) {
      const box = await page.locator('#' + id).boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details')).toHaveAttribute('open', '');
  await expect(page.locator('details')).toContainText('End-to-endversleuteling is niet aangesloten');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('both chosen routes open the existing local applications through same-origin links', async ({ page }) => {
  await open(page);
  await expect(page.locator('#start-nova')).toHaveAttribute('href', '/rio/nova/');
  await page.locator('#start-nova').click();
  await expect(page).toHaveURL(fixture.origin + '/rio/nova/');
  await expect(page.locator('#nova-connect')).toBeVisible();
  await open(page);
  await expect(page.locator('#start-device-test')).toHaveAttribute('href', '/rio/device-test/');
  await page.locator('#start-device-test').click();
  await expect(page).toHaveURL(fixture.origin + '/rio/device-test/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the PP guide explains PHONE or EMAIL over any transport without creating registration or traffic', async ({ page, context }) => {
  const api = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) api.push([request.method(), new URL(request.url()).pathname]);
  });
  await open(page);
  await expect(page.locator('#runtime-device')).toHaveText('Bereikbaar');
  await expect(page.locator('#pp-identity-steps > *')).toHaveCount(3);
  await expect(page.locator('#pp-example-boundary')).toContainText(/voorbeeld/i);
  await expect(page.locator('#pp-identity input[type="tel"], #pp-identity input[type="email"], #pp-identity input[type="text"], #pp-identity textarea')).toHaveCount(0);
  for (const contact of ['UNCONFIRMED', 'PHONE', 'EMAIL']) {
    let first;
    for (const transport of ['WIFI', 'MOBILE', 'OTHER']) {
      await page.locator('#pp-example-contact').selectOption(contact);
      await page.locator('#pp-example-transport').selectOption(transport);
      await page.locator('#pp-example-show').click();
      const result = page.locator('#pp-example-result');
      await expect(result).toHaveAttribute('data-state', contact === 'UNCONFIRMED' ? 'not-confirmed' : 'eligible');
      await expect(result).toBeFocused();
      const text = await result.textContent();
      if (first === undefined) first = text;
      else expect(text).toBe(first);
      await expect(page.locator('#pp-example-boundary')).toBeVisible();
    }
  }
  expect(api.sort()).toEqual([['GET', DEVICE], ['GET', NOVA]].sort());
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await noConnectionClaim(page);
});

test('changing an example neutralizes its old result and PP controls remain accessible on narrow screens', async ({ page }) => {
  await open(page);
  await page.locator('#pp-example-contact').selectOption('PHONE');
  await page.locator('#pp-example-show').click();
  await expect(page.locator('#pp-example-result')).toHaveAttribute('data-state', 'eligible');
  await page.locator('#pp-example-contact').focus();
  await page.locator('#pp-example-contact').selectOption('UNCONFIRMED');
  await expect(page.locator('#pp-example-result')).toHaveAttribute('data-state', 'not-confirmed');
  await expect(page.locator('#pp-example-contact')).toBeFocused();
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const id of ['pp-example-contact', 'pp-example-transport', 'pp-example-show']) {
      const box = await page.locator('#' + id).boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await page.locator('#' + id).getAttribute('aria-label') || await page.locator('label[for="' + id + '"]').count() || id === 'pp-example-show').toBeTruthy();
    }
  }
});
