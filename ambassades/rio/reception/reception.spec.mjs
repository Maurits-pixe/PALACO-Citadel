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

test('translated NOVA choices keep local runtime destinations and create no extra traffic on language changes', async ({ page, context }) => {
  const api = [], foreign = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) api.push([request.method(), url.pathname]);
    if (url.origin !== fixture.origin) foreign.push(request.url());
  });
  await open(page);
  await settled(page);
  await expect(page.locator('#nova-trial-destination')).toBeHidden();
  for (const language of ['ar', 'fr', 'nl']) {
    await page.locator('#nova-language').selectOption(language);
    for (const [id, path] of [['nova-guide-device', 'device-test'], ['nova-guide-reception', 'nova']]) {
      const link = page.locator('#' + id);
      await expect(link).toHaveAttribute('href', '/rio/' + path + '/');
      await expect(link).toHaveAttribute('hreflang', 'nl');
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
    await noConnectionClaim(page);
  }
  await page.evaluate(() => { location.hash = '#nova-explained:ar'; });
  await expect(page.locator('#nova-language')).toHaveValue('ar');
  await expect(page.locator('#nova-explained')).toBeFocused();
  await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state', 'available');
  await noConnectionClaim(page);
  expect(api.sort()).toEqual([['GET', DEVICE], ['GET', NOVA]].sort());
  expect(foreign).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
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

function recordApiRequests(page) {
  const requests = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/')) requests.push([request.method(), path]);
  });
  return requests;
}

async function expectUnconfirmedAvailability(page) {
  for (const id of ['runtime-nova', 'runtime-device']) {
    await expect(page.locator('#' + id)).toHaveText('Niet bevestigd');
    await expect(page.locator('#' + id)).toHaveAttribute('data-state', 'unconfirmed');
  }
  await expect(page.locator('#build-version')).toHaveText('Onbekend');
  await expect(page.locator('#refresh-availability')).toBeEnabled();
}

async function expectReadOnlyLifecycle(page, context, requests, pairs) {
  expect(requests.filter(([, path]) => path === NOVA)).toEqual(Array.from({ length: pairs }, () => ['GET', NOVA]));
  expect(requests.filter(([, path]) => path === DEVICE)).toEqual(Array.from({ length: pairs }, () => ['GET', DEVICE]));
  expect(requests).toHaveLength(pairs * 2);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await noConnectionClaim(page);
}

test('a real offline transition clears previous availability and reconnecting requires a fresh manual check', async ({ page, context }) => {
  const requests = recordApiRequests(page);
  await open(page);
  await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('#runtime-device')).toHaveAttribute('data-state', 'available');
  await page.locator('summary').click();
  await expect(page.locator('#build-version')).toHaveText('a'.repeat(12));

  await context.setOffline(true);
  await page.waitForFunction(() => navigator.onLine === false);
  await expectUnconfirmedAvailability(page);
  await expect(page.locator('#availability-feedback')).toContainText(/offline/i);
  await page.locator('#refresh-availability').click();
  await expectUnconfirmedAvailability(page);
  await page.clock.install();
  await page.clock.fastForward(60000);
  expect(requests).toHaveLength(2);

  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine === true);
  await expectUnconfirmedAvailability(page);
  await page.clock.fastForward(60000);
  expect(requests).toHaveLength(2);
  await page.locator('#refresh-availability').click();
  await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('#runtime-device')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('#build-version')).toHaveText('a'.repeat(12));
  await expectReadOnlyLifecycle(page, context, requests, 2);
});

test('simulated persisted pagehide/pageshow abort a partial check and keep restored labels unconfirmed without new traffic', async ({ page, context }) => {
  // These events exercise the lifecycle handlers; this does not assert actual BFCache admission.
  await page.addInitScript(({ novaPath, devicePath }) => {
    const nativeFetch = window.fetch.bind(window);
    window.__deviceLifecycleSignals = [];
    window.__novaLifecycleReads = 0;
    window.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === devicePath) window.__deviceLifecycleSignals.push(options.signal);
      return nativeFetch(input, options).then(response => {
        if (url.pathname === novaPath) {
          const getReader = response.body.getReader.bind(response.body);
          response.body.getReader = (...args) => {
            const reader = getReader(...args), read = reader.read.bind(reader);
            reader.read = async (...readArgs) => {
              const result = await read(...readArgs);
              if (result.done) window.__novaLifecycleReads++;
              return result;
            };
            return reader;
          };
        }
        return response;
      });
    };
  }, { novaPath: NOVA, devicePath: DEVICE });
  const requests = recordApiRequests(page);
  await open(page);
  await expect(page.locator('#runtime-device')).toHaveAttribute('data-state', 'available');
  await page.locator('summary').click();
  let release;
  let finished;
  const gate = new Promise(resolve => { release = resolve; });
  const routeFinished = new Promise(resolve => { finished = resolve; });
  await page.route('**' + DEVICE, async route => {
    await gate;
    await route.fulfill({ json: validDevice }).catch(() => {});
    finished();
  });
  await page.locator('#refresh-availability').click();
  // Observe the actual native reader reaching EOF. The app then aborts its controller
  // in finally; waiting for separate browser-network bookkeeping can race that abort.
  await page.waitForFunction(() => window.__novaLifecycleReads === 2 && window.__deviceLifecycleSignals.length === 2);
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  expect(await page.evaluate(() => window.__deviceLifecycleSignals.at(-1).aborted)).toBe(true);
  await expectUnconfirmedAvailability(page);
  await page.locator('#refresh-availability').dispatchEvent('click');
  expect(requests).toHaveLength(4);
  await expectUnconfirmedAvailability(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expectUnconfirmedAvailability(page);
  release();
  await routeFinished;
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  await expectUnconfirmedAvailability(page);
  await expectReadOnlyLifecycle(page, context, requests, 2);
});

test('late results from an invalidated run cannot finish or overwrite a newer manual check', async ({ page, context }) => {
  // Only response delivery is held here. Both generations still make real, local HTTP GETs.
  // Fully read response bytes deliberately outlive abort to exercise the generation guard.
  await page.addInitScript(({ novaPath, devicePath }) => {
    const nativeFetch = window.fetch.bind(window);
    const resolvers = [];
    const gates = [0, 1].map(index => new Promise(resolve => { resolvers[index] = resolve; }));
    const signals = [[], []];
    let reads = 0;
    window.__lateLifecycleFixture = {
      completed: [0, 0], delivered: [0, 0], signals,
      release: index => resolvers[index](),
    };
    window.fetch = async (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (![novaPath, devicePath].includes(url.pathname)) return nativeFetch(input, options);
      const generation = Math.floor(reads++ / 2);
      const response = await nativeFetch(input, options);
      if (generation > 1) return response;
      const bytes = await response.arrayBuffer();
      signals[generation].push(options.signal);
      window.__lateLifecycleFixture.completed[generation]++;
      await gates[generation];
      window.__lateLifecycleFixture.delivered[generation]++;
      return new Response(bytes, { status: response.status, headers: response.headers });
    };
  }, { novaPath: NOVA, devicePath: DEVICE });
  const requests = recordApiRequests(page);
  await open(page);
  await page.waitForFunction(() => window.__lateLifecycleFixture.completed[0] === 2);
  await expect(page.locator('#refresh-availability')).toBeDisabled();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  expect(await page.evaluate(() => window.__lateLifecycleFixture.signals[0].every(signal => signal.aborted))).toBe(true);
  await expectUnconfirmedAvailability(page);
  expect(requests).toHaveLength(2);
  await page.locator('#refresh-availability').click();
  await page.waitForFunction(() => window.__lateLifecycleFixture.completed[1] === 2);
  await page.evaluate(async () => {
    window.__lateLifecycleFixture.release(0);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await page.waitForFunction(() => window.__lateLifecycleFixture.delivered[0] === 2);
  for (const id of ['runtime-nova', 'runtime-device']) {
    await expect(page.locator('#' + id)).toHaveAttribute('data-state', 'checking');
  }
  await expect(page.locator('#build-version')).toHaveText('Onbekend');
  await expect(page.locator('#refresh-availability')).toBeDisabled();
  await expect(page.locator('#availability-feedback')).toContainText('NOVA kijkt');
  await page.locator('#refresh-availability').dispatchEvent('click');
  expect(requests).toHaveLength(4);
  await page.evaluate(() => window.__lateLifecycleFixture.release(1));
  await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('#runtime-device')).toHaveAttribute('data-state', 'available');
  await settled(page);
  await page.locator('summary').click();
  await expect(page.locator('#build-version')).toHaveText('a'.repeat(12));
  await expectReadOnlyLifecycle(page, context, requests, 2);
});
