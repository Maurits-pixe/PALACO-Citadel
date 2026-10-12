import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { buildApp } from '../../auth/server.mjs';

const API = '/api/rio/nova';
let fixture;
const errors = new WeakMap();

async function startServer(novaOptions = {}) {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const app = buildApp({ env: { NODE_ENV: 'development', RIO_NOVA_BASE_URL: origin }, novaOptions });
  server.on('request', app);
  return { origin, app, server, async close() {
    app.locals.novaReception.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  } };
}

test.beforeAll(async () => { fixture = await startServer(); });
test.afterAll(async () => { await fixture.close(); });
test.beforeEach(async ({ page }) => {
  const collected = [];
  errors.set(page, collected);
  page.on('pageerror', error => collected.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page) || []).toEqual([]));

async function open(page, origin = fixture.origin) { await page.goto(origin + '/rio/nova/'); }
async function connect(page) {
  await page.locator('#nova-connect').click();
  await expect(page.locator('#nova-send')).toBeEnabled();
}
async function createReceipt(page, text = 'Een fictief verzoek voor de werkende NOVA-receptie.') {
  await page.locator('#nova-text').fill(text);
  await page.locator('#nova-send').click();
  await expect(page.locator('[data-receipt-id]')).toHaveCount(1);
  return page.locator('[data-receipt-id]').first();
}
async function ownSession(context, origin = fixture.origin) {
  const response = await context.request.post(origin + API + '/session', { headers: { Origin: origin }, data: {} });
  expect(response.status()).toBe(200);
  return (await response.json()).session;
}
async function receipts(context, origin = fixture.origin) {
  const response = await context.request.get(origin + API + '/requests');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  return (await response.json()).requests;
}

test('NOVA page calls a real running HTTP component and protected sources remain closed', async ({ page, request }) => {
  await open(page);
  await expect(page.locator('#nova-runtime-status')).toBeVisible();
  const runtime = await request.get(fixture.origin + API + '/runtime');
  expect(runtime.status()).toBe(200);
  expect(await runtime.json()).toMatchObject({ running: true, component: 'NOVA_RECEPTION', storage: 'volatile-memory', version: '0.3', receptionEnabled: true, firstAcceptanceEnabled: true, checkGateEnabled: true, guardianRuntimeConnected: false, stewardRuntimeConnected: false, finalConsentEnabled: false, chatEnabled: false });
  expect((await request.get(fixture.origin + API + '/requests')).status()).toBe(401);
  for (const path of ['/rio/nova/nova.spec.mjs', '/rio/nova/playwright.config.mjs', '/auth/nova-reception.mjs', '/nova-reception.mjs']) {
    expect((await request.get(fixture.origin + path)).status(), path).toBe(404);
  }
  for (const path of ['/api/me', '/api/seats/PALACO-AMB-01']) {
    const response = await request.get(fixture.origin + path);
    expect(response.status()).toBe(503);
    expect(await response.json()).toEqual({ error: 'AUTH_NOT_CONFIGURED' });
  }
});

test('real server receipt survives reload only after explicit reconnect and then supports hold, resume and withdraw', async ({ page, context }) => {
  await open(page);
  await connect(page);
  const marker = 'FICTITIOUS_RECEIPT_SERVER_428';
  const card = await createReceipt(page, marker);
  const id = await card.getAttribute('data-receipt-id');
  expect(id).toMatch(/^[a-f0-9]{32}$/);
  expect((await receipts(context))[0]).toMatchObject({ id, status: 'RECEIVED', text: marker, revision: 1 });
  await page.reload();
  await expect(page.locator('[data-receipt-id]')).toHaveCount(0);
  await connect(page);
  const restored = page.locator('[data-receipt-id="' + id + '"]');
  await expect(restored).toContainText(marker);
  await restored.locator('[data-action="hold"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'ON_HOLD');
  expect((await receipts(context))[0]).toMatchObject({ id, status: 'ON_HOLD', revision: 2 });
  await restored.locator('[data-action="resume"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'RECEIVED');
  expect((await receipts(context))[0].revision).toBe(3);
  await restored.locator('[data-action="withdraw"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'WITHDRAWN');
  await expect(restored).not.toContainText(marker);
  expect((await receipts(context))[0]).toMatchObject({ id, status: 'WITHDRAWN', text: '', revision: 4 });
  await expect(restored.locator('button[data-action]')).toHaveCount(0);
});

test('two independent real browser sessions cannot see or withdraw each other’s receipt', async ({ page, context, browser }) => {
  await open(page);
  await connect(page);
  const card = await createReceipt(page, 'FICTITIOUS_CONTEXT_A_PRIVATE_882');
  const id = await card.getAttribute('data-receipt-id');
  const second = await browser.newContext();
  const b = await second.newPage();
  const bErrors = [];
  b.on('pageerror', error => bErrors.push(error.message));
  try {
    await open(b);
    await connect(b);
    await expect(b.locator('[data-receipt-id]')).toHaveCount(0);
    expect(await receipts(second)).toEqual([]);
    const sessionB = await ownSession(second);
    const attempt = await second.request.post(fixture.origin + API + '/requests/' + id + '/actions', {
      headers: { Origin: fixture.origin, 'X-NOVA-CSRF': sessionB.csrfToken },
      data: { action: 'withdraw', revision: 1 },
    });
    expect(attempt.status()).toBe(404);
    expect(await attempt.json()).toEqual({ error: 'NOVA_REQUEST_NOT_FOUND' });
    expect((await receipts(context))[0].status).toBe('RECEIVED');
    await page.locator('#nova-refresh').click();
    await expect(card).toContainText('FICTITIOUS_CONTEXT_A_PRIVATE_882');
    const cookieA = (await context.cookies(fixture.origin)).find(cookie => cookie.name === 'palacoNova');
    const cookieB = (await second.cookies(fixture.origin)).find(cookie => cookie.name === 'palacoNova');
    expect(cookieA.value).not.toBe(cookieB.value);
    expect(cookieA.httpOnly).toBe(true);
    expect(cookieA.sameSite).toBe('Strict');
    expect(await page.evaluate(() => document.cookie.includes('palacoNova'))).toBe(false);
    expect(bErrors).toEqual([]);
  } finally { await second.close(); }
});

test('receipt text is literal DOM data and no session credentials or text enter web storage', async ({ page, context }) => {
  await open(page);
  await connect(page);
  const literal = '<img src=x onerror="window.NOVA_XSS=1"> FICTITIOUS_MARKUP_286';
  const card = await createReceipt(page, literal);
  await expect(card).toContainText(literal);
  await expect(card.locator('img, script, iframe')).toHaveCount(0);
  expect(await page.evaluate(() => window.NOVA_XSS)).toBeUndefined();
  const session = await ownSession(context);
  const stored = await page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])),
    url: location.href,
  }));
  expect(JSON.stringify(stored)).not.toContain(session.csrfToken);
  expect(JSON.stringify(stored)).not.toContain(literal);
  const cookie = (await context.cookies(fixture.origin)).find(cookie => cookie.name === 'palacoNova');
  expect(JSON.stringify(stored)).not.toContain(cookie.value);
});

test('ending a browser session destroys server receipts and reconnect starts an empty reception', async ({ page, context }) => {
  await open(page);
  await connect(page);
  await createReceipt(page);
  await page.locator('#nova-end').click();
  await expect(page.locator('[data-receipt-id]')).toHaveCount(0);
  await expect(page.locator('#nova-send')).toBeDisabled();
  const denied = await context.request.get(fixture.origin + API + '/requests');
  expect(denied.status()).toBe(401);
  await connect(page);
  expect(await receipts(context)).toEqual([]);
  await expect(page.locator('[data-receipt-id]')).toHaveCount(0);
});

test('the real app service worker never caches NOVA API data and offline operations show failure', async ({ page, context }) => {
  await page.goto(fixture.origin + '/rio/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await open(page);
  await connect(page);
  const card = await createReceipt(page, 'FICTITIOUS_API_NOT_CACHED_783');
  await page.locator('#nova-refresh').click();
  const cachePaths = await page.evaluate(async () => {
    const paths = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      paths.push(...(await cache.keys()).map(request => new URL(request.url).pathname));
    }
    return paths;
  });
  expect(cachePaths.some(path => path.startsWith('/api/rio/nova'))).toBe(false);
  expect(cachePaths.some(path => path.startsWith('/rio/nova'))).toBe(false);
  const nativeResponse = await page.evaluate(async () => {
    const response = await fetch('/api/rio/nova/requests', { cache: 'no-store' });
    return { status: response.status, text: await response.text() };
  });
  expect(nativeResponse.status).toBe(200);
  expect(nativeResponse.text).toContain('FICTITIOUS_API_NOT_CACHED_783');
  await context.setOffline(true);
  try {
    await page.locator('#nova-refresh').click();
    await expect(page.locator('#nova-notice')).toBeVisible();
    await expect(page.locator('#nova-notice')).not.toHaveText('');
    const unavailable = await page.evaluate(async () => {
      try { await fetch('/api/rio/nova/requests', { cache: 'no-store' }); return false; } catch { return true; }
    });
    expect(unavailable).toBe(true);
    await card.locator('[data-action="withdraw"]').click();
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'RECEIVED');
  } finally { await context.setOffline(false); }
  await page.locator('#nova-refresh').click();
  expect((await receipts(context))[0].status).toBe('RECEIVED');
});

test('server expiry reaches the browser as a scrubbed closed receipt', async ({ browser }) => {
  let clock = Date.now();
  const timed = await startServer({ now: () => clock, sessionTtlMs: 10000, requestTtlMs: 1000 });
  const context = await browser.newContext();
  const page = await context.newPage();
  const collected = [];
  page.on('pageerror', error => collected.push(error.message));
  try {
    await open(page, timed.origin);
    await connect(page);
    const card = await createReceipt(page, 'FICTITIOUS_BROWSER_EXPIRE_384');
    await card.locator('[data-action="to_reception"]').click();
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
    await card.locator('[data-action="accept"]').click();
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
    await expect(card.locator('.nova-acceptance')).toHaveAttribute('data-scope', 'reception-only');
    clock += 1001;
    await page.locator('#nova-refresh').click();
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'EXPIRED');
    await expect(card).not.toContainText('FICTITIOUS_BROWSER_EXPIRE_384');
    await expect(card.locator('button[data-action]')).toHaveCount(0);
    await expect(card.locator('.nova-acceptance')).toHaveCount(0);
    expect((await receipts(context, timed.origin))[0]).toMatchObject({ text: '', resumeTo: null, firstAcceptance: null });
    expect(collected).toEqual([]);
  } finally { await context.close(); await timed.close(); }
});

test('all eleven languages render a real receipt with Arabic RTL and fitting mobile layouts', async ({ page }, testInfo) => {
  await open(page);
  await connect(page);
  const card = await createReceipt(page, 'Fictieve bezoeker: een kleine eerste online ontvangst.');
  await card.locator('[data-action="to_reception"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
  await card.locator('[data-action="accept"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
  await card.locator('[data-action="request_checks"]').click();
  await expectGatePanel(card);
  const languages = ['nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ar', 'eo'];
  expect(await page.locator('#language option').evaluateAll(options => options.map(option => option.value))).toEqual(languages);
  const headings = new Set();
  for (const language of languages) {
    await page.locator('#language').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language === 'zh' ? 'zh-Hans' : language);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    headings.add(await page.locator('h1').textContent());
    await expect(page.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
    await expect(card.locator('.nova-acceptance')).toHaveAttribute('data-scope', 'reception-only');
    expect((await card.locator('.nova-acceptance').textContent()).trim().length).toBeGreaterThan(10);
    await expectGatePanel(card);
    expect((await card.locator('.nova-check-gate').textContent()).trim().length).toBeGreaterThan(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), language + '/' + testInfo.project.name).toBe(true);
    expect(await page.locator('[data-i18n]').evaluateAll(elements => elements.every(element => element.textContent.trim().length > 0))).toBe(true);
  }
  expect(headings.size).toBe(11);
  await page.locator('#language').selectOption('nl');
  const image = await page.screenshot({ fullPage: true });
  console.log('NOVA_ONLINE_SCREENSHOT_' + testInfo.project.name + ' ' + image.toString('base64'));
});

test('NOVA UI cannot bypass origin, CSRF or revision checks and cannot open a chat', async ({ page, context }) => {
  await open(page);
  await connect(page);
  const card = await createReceipt(page);
  const id = await card.getAttribute('data-receipt-id');
  const session = await ownSession(context);
  const options = { data: { action: 'hold', revision: 1 } };
  const missingToken = await context.request.post(fixture.origin + API + '/requests/' + id + '/actions', { ...options, headers: { Origin: fixture.origin } });
  expect(missingToken.status()).toBe(403);
  const foreign = await context.request.post(fixture.origin + API + '/requests/' + id + '/actions', { ...options, headers: { Origin: 'https://attacker.example', 'X-NOVA-CSRF': session.csrfToken } });
  expect(foreign.status()).toBe(403);
  await card.locator('[data-action="hold"]').click();
  const stale = await context.request.post(fixture.origin + API + '/requests/' + id + '/actions', { ...options, headers: { Origin: fixture.origin, 'X-NOVA-CSRF': session.csrfToken } });
  expect(stale.status()).toBe(409);
  const openChat = await context.request.post(fixture.origin + API + '/requests/' + id + '/actions', { headers: { Origin: fixture.origin, 'X-NOVA-CSRF': session.csrfToken }, data: { action: 'open', revision: 2 } });
  expect(openChat.status()).toBe(400);
  expect((await receipts(context))[0].status).toBe('ON_HOLD');
  const runtime = await context.request.get(fixture.origin + API + '/runtime');
  expect((await runtime.json()).chatEnabled).toBe(false);
});

test('device clocks one hour ahead or behind do not control a real NOVA session', async ({ browser }, testInfo) => {
  for (const offset of [3600000, -3600000]) {
    const context = await browser.newContext({ viewport: testInfo.project.use.viewport });
    const page = await context.newPage();
    const collected = [];
    page.on('pageerror', error => collected.push(error.message));
    await page.addInitScript(milliseconds => {
      const originalNow = Date.now;
      Date.now = () => originalNow() + milliseconds;
    }, offset);
    try {
      await open(page);
      const browserNow = await page.evaluate(() => Date.now());
      expect(Math.abs(browserNow - Date.now() - offset)).toBeLessThan(5000);
      await connect(page);
      const card = await createReceipt(page, 'Fictieve ontvangst met afwijkende apparaatklok.');
      const id = await card.getAttribute('data-receipt-id');
      const [serverReceipt] = await receipts(context);
      expect(serverReceipt).toMatchObject({ id, status: 'RECEIVED', revision: 1 });
      expect(Date.parse(serverReceipt.expiresAt) - Date.parse(serverReceipt.createdAt)).toBe(300000);
      await page.locator('#nova-refresh').click();
      await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'RECEIVED');
      await card.locator('[data-action="hold"]').click();
      await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'ON_HOLD');
      expect((await receipts(context))[0]).toMatchObject({ id, status: 'ON_HOLD', revision: 2 });
      await page.reload();
      await connect(page);
      await expect(page.locator('[data-receipt-id="' + id + '"] .nova-status')).toHaveAttribute('data-status', 'ON_HOLD');
      await page.locator('#nova-end').click();
      expect((await context.request.get(fixture.origin + API + '/requests')).status()).toBe(401);
      expect(collected).toEqual([]);
    } finally { await context.close(); }
  }
});

test('reception UI records a narrow acceptance, preserves it on explicit reconnect and revokes it on hold', async ({ page, context }) => {
  await open(page);
  await connect(page);
  const card = await createReceipt(page, 'FICTITIOUS_BROWSER_FIRST_ACCEPTANCE_426');
  const id = await card.getAttribute('data-receipt-id');
  await expect(card.locator('[data-action="accept"]')).toHaveCount(0);
  await card.locator('[data-action="to_reception"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
  await card.locator('[data-action="accept"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
  await expect(card.locator('.nova-acceptance')).toHaveAttribute('data-scope', 'reception-only');
  const [accepted] = await receipts(context);
  expect(accepted).toMatchObject({
    id, status: 'FIRST_ACCEPTED', revision: 3, resumeTo: null,
    firstAcceptance: { scope: 'reception-only', actor: 'browser-test-session' },
  });
  expect(Date.parse(accepted.firstAcceptance.acceptedAt)).toBeGreaterThanOrEqual(Date.parse(accepted.createdAt));
  await page.reload();
  await expect(page.locator('[data-receipt-id]')).toHaveCount(0);
  await connect(page);
  const restored = page.locator('[data-receipt-id="' + id + '"]');
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
  await expect(restored.locator('.nova-acceptance')).toHaveAttribute('data-scope', 'reception-only');
  expect((await receipts(context))[0].firstAcceptance).toEqual(accepted.firstAcceptance);
  await restored.locator('[data-action="hold"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'ON_HOLD');
  await expect(restored.locator('.nova-acceptance')).toHaveCount(0);
  expect((await receipts(context))[0]).toMatchObject({ status: 'ON_HOLD', revision: 4, resumeTo: 'AT_RECEPTION', firstAcceptance: null });
  await restored.locator('[data-action="resume"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
  await expect(restored.locator('.nova-acceptance')).toHaveCount(0);
  await restored.locator('[data-action="accept"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
  expect((await receipts(context))[0]).toMatchObject({
    status: 'FIRST_ACCEPTED', revision: 6, expiresAt: accepted.expiresAt,
    firstAcceptance: { scope: 'reception-only', actor: 'browser-test-session' },
  });
  await restored.locator('[data-action="withdraw"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'WITHDRAWN');
  await expect(restored.locator('.nova-acceptance')).toHaveCount(0);
  await expect(restored).not.toContainText('FICTITIOUS_BROWSER_FIRST_ACCEPTANCE_426');
  await expect(restored.locator('button[data-action]')).toHaveCount(0);
  expect((await receipts(context))[0]).toMatchObject({ text: '', firstAcceptance: null, resumeTo: null });
});

test('the real reception refuse button erases text and cannot be undone or replayed', async ({ page, context }) => {
  await open(page);
  await connect(page);
  const marker = 'FICTITIOUS_BROWSER_REFUSE_572';
  const card = await createReceipt(page, marker);
  await card.locator('[data-action="to_reception"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
  await card.locator('[data-action="refuse"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'REFUSED');
  await expect(card).not.toContainText(marker);
  await expect(card.locator('.nova-acceptance, .nova-check-gate, button[data-action]')).toHaveCount(0);
  const [refused] = await receipts(context);
  expect(refused).toMatchObject({ status: 'REFUSED', revision: 3, text: '', firstAcceptance: null, resumeTo: null });
  const session = await ownSession(context);
  const replay = await context.request.post(fixture.origin + API + '/requests/' + refused.id + '/actions', {
    headers: { Origin: fixture.origin, 'X-NOVA-CSRF': session.csrfToken },
    data: { action: 'accept', revision: refused.revision },
  });
  expect(replay.status()).toBe(410);
  await page.reload();
  await connect(page);
  const restored = page.locator('[data-receipt-id="' + refused.id + '"]');
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'REFUSED');
  await expect(restored).not.toContainText(marker);
  await expect(restored.locator('button[data-action]')).toHaveCount(0);
});

test('offline first acceptance does not display a consent record or advance the server state', async ({ page, context }) => {
  await open(page);
  await connect(page);
  const card = await createReceipt(page, 'FICTITIOUS_OFFLINE_CONSENT_711');
  await card.locator('[data-action="to_reception"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
  await context.setOffline(true);
  try {
    await card.locator('[data-action="accept"]').click();
    await expect(page.locator('#nova-notice')).not.toHaveText('');
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
    await expect(card.locator('.nova-acceptance')).toHaveCount(0);
  } finally { await context.setOffline(false); }
  await page.locator('#nova-refresh').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
  expect((await receipts(context))[0]).toMatchObject({ status: 'AT_RECEPTION', revision: 2, firstAcceptance: null });
  await card.locator('[data-action="accept"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
  await expect(card.locator('.nova-acceptance')).toHaveAttribute('data-scope', 'reception-only');
  expect((await receipts(context))[0].firstAcceptance.scope).toBe('reception-only');
});

test('real server deadline hides accepted consent and text while offline until expiry is confirmed by refresh', async ({ page, context }) => {
  const timed = await startServer({ requestTtlMs: 3000, sessionTtlMs: 10000 });
  const marker = 'FICTITIOUS_OFFLINE_EXPIRED_CONSENT_925';
  try {
    await open(page, timed.origin);
    await connect(page);
    const card = await createReceipt(page, marker);
    await card.locator('[data-action="to_reception"]').click();
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
    await card.locator('[data-action="accept"]').click();
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
    await expect(card.locator('.nova-acceptance')).toHaveAttribute('data-scope', 'reception-only');
    await card.locator('[data-action="request_checks"]').click();
    await expectGatePanel(card);
    const [accepted] = await receipts(context, timed.origin);
    expect(accepted.status).toBe('FIRST_ACCEPTED');
    expect(accepted.checkGate.outcome).toBe('HOLD');
    expect(Date.parse(accepted.expiresAt) - Date.parse(accepted.createdAt)).toBe(3000);
    await context.setOffline(true);
    await expect(card).toHaveAttribute('data-expiry-pending', 'true', { timeout: 7000 });
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'EXPIRY_PENDING');
    await expect(card.locator('.nova-acceptance, .nova-check-gate, button[data-action]')).toHaveCount(0);
    await expect(card).not.toContainText(marker);
    await context.setOffline(false);
    await page.locator('#nova-refresh').click();
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'EXPIRED');
    await expect(card.locator('.nova-acceptance, .nova-check-gate, button[data-action]')).toHaveCount(0);
    await expect(card).not.toContainText(marker);
    expect((await receipts(context, timed.origin))[0]).toMatchObject({
      status: 'EXPIRED', text: '', firstAcceptance: null, resumeTo: null, checkGate: null,
    });
  } finally {
    await context.setOffline(false);
    await timed.close();
  }
});

const EXPECTED_GUARD_ROLES = ['IDENTITY', 'ADDRESS', 'HUMAN_CONSENT', 'SCOPE_POLICY', 'E2EE_KEYS', 'CONTENT_INTEGRITY', 'REPLAY_ORDER', 'PRIVACY', 'DELIVERY_REVOCATION'];
async function expectGatePanel(card) {
  const panel = card.locator('.nova-check-gate');
  await expect(panel).toHaveAttribute('data-outcome', 'HOLD');
  await expect(panel.locator('.nova-guard')).toHaveCount(9);
  expect(await panel.locator('.nova-guard').evaluateAll(rows => rows.map(row => row.dataset.roleCode))).toEqual(EXPECTED_GUARD_ROLES);
  await expect(panel.locator('.nova-guard-side[data-status="UNKNOWN"]')).toHaveCount(18);
  for (const role of EXPECTED_GUARD_ROLES) {
    const guard = panel.locator('.nova-guard[data-role-code="' + role + '"]');
    await expect(guard.locator('.nova-guard-side[data-side="SENDER"]')).toHaveAttribute('data-status', 'UNKNOWN');
    await expect(guard.locator('.nova-guard-side[data-side="RECEIVER"]')).toHaveAttribute('data-status', 'UNKNOWN');
  }
  await expect(panel.locator('.nova-steward')).toHaveAttribute('data-status', 'UNKNOWN');
  await expect(panel.locator('.nova-local-check[data-status="CONFIRMED"]')).toHaveCount(4);
  for (const check of ['session', 'receptionChoice', 'scope', 'expiry']) {
    await expect(panel.locator('.nova-local-check[data-check="' + check + '"]')).toHaveAttribute('data-status', 'CONFIRMED');
  }
}
async function createAccepted(page) {
  const card = await createReceipt(page, 'Fictieve controlepoortproef voor de NOVA-receptie.');
  await card.locator('[data-action="to_reception"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
  await card.locator('[data-action="accept"]').click();
  await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
  return card;
}

test('real server assessment shows missing integrations, survives explicit reconnect and is revoked by hold', async ({ page, context }) => {
  await open(page);
  await connect(page);
  const card = await createAccepted(page);
  const id = await card.getAttribute('data-receipt-id');
  const [accepted] = await receipts(context);
  expect(accepted.checkGate).toBeNull();
  await card.locator('[data-action="request_checks"]').click();
  await expectGatePanel(card);
  const [checked] = await receipts(context);
  expect(checked).toMatchObject({ id, status: 'FIRST_ACCEPTED', revision: 4, expiresAt: accepted.expiresAt, firstAcceptance: accepted.firstAcceptance });
  expect(checked.checkGate).toMatchObject({
    receiptId: id, currentRevision: 4, receptionAcceptedAt: accepted.firstAcceptance.acceptedAt,
    scope: 'reception-only', outcome: 'HOLD', reason: 'CONNECTIONS_MISSING', steward: 'UNKNOWN',
    canOpenContact: false, finalConsentEnabled: false,
  });
  expect(checked.checkGate.guards.every(guard => guard.sender === 'UNKNOWN' && guard.receiver === 'UNKNOWN')).toBe(true);
  await card.locator('[data-action="request_checks"]').click();
  await expect.poll(async () => (await receipts(context))[0].revision).toBe(5);
  expect((await receipts(context))[0].checkGate.currentRevision).toBe(5);
  await page.reload();
  await expect(page.locator('.nova-check-gate')).toHaveCount(0);
  await connect(page);
  const restored = page.locator('[data-receipt-id="' + id + '"]');
  await expectGatePanel(restored);
  expect((await receipts(context))[0].firstAcceptance).toEqual(accepted.firstAcceptance);
  await restored.locator('[data-action="hold"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'ON_HOLD');
  await expect(restored.locator('.nova-check-gate, .nova-acceptance')).toHaveCount(0);
  expect((await receipts(context))[0]).toMatchObject({ status: 'ON_HOLD', checkGate: null, firstAcceptance: null });
  await restored.locator('[data-action="resume"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
  await restored.locator('[data-action="accept"]').click();
  await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
  await expect(restored.locator('.nova-check-gate')).toHaveCount(0);
  expect((await receipts(context))[0].checkGate).toBeNull();
});

test('a second independent browser session cannot see or evaluate the first session’s assessment', async ({ page, context, browser }, testInfo) => {
  await open(page);
  await connect(page);
  const card = await createAccepted(page);
  await card.locator('[data-action="request_checks"]').click();
  await expectGatePanel(card);
  const [checked] = await receipts(context);
  const second = await browser.newContext({ viewport: testInfo.project.use.viewport });
  const b = await second.newPage();
  const secondErrors = [];
  b.on('pageerror', error => secondErrors.push(error.message));
  try {
    await open(b);
    await connect(b);
    await expect(b.locator('.nova-check-gate, [data-receipt-id]')).toHaveCount(0);
    const sessionB = await ownSession(second);
    const denied = await second.request.post(fixture.origin + API + '/requests/' + checked.id + '/actions', {
      headers: { Origin: fixture.origin, 'X-NOVA-CSRF': sessionB.csrfToken },
      data: { action: 'request_checks', revision: checked.revision },
    });
    expect(denied.status()).toBe(404);
    expect(await denied.json()).toEqual({ error: 'NOVA_REQUEST_NOT_FOUND' });
    expect(await receipts(second)).toEqual([]);
    expect((await receipts(context))[0]).toEqual(checked);
    await b.locator('#nova-refresh').click();
    await expect(b.locator('.nova-check-gate')).toHaveCount(0);
    expect(secondErrors).toEqual([]);
  } finally { await second.close(); }
});

test('offline check request never displays a fabricated assessment and a deliberate retry records a real HOLD', async ({ page, context }) => {
  await open(page);
  await connect(page);
  const card = await createAccepted(page);
  await context.setOffline(true);
  try {
    await card.locator('[data-action="request_checks"]').click();
    await expect(page.locator('#nova-notice')).not.toHaveText('');
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
    await expect(card.locator('.nova-check-gate')).toHaveCount(0);
  } finally { await context.setOffline(false); }
  await page.locator('#nova-refresh').click();
  expect((await receipts(context))[0]).toMatchObject({ status: 'FIRST_ACCEPTED', revision: 3, checkGate: null });
  await card.locator('[data-action="request_checks"]').click();
  await expectGatePanel(card);
  expect((await receipts(context))[0]).toMatchObject({
    revision: 4, checkGate: { currentRevision: 4, outcome: 'HOLD', canOpenContact: false },
  });
});

test('browser cannot forge guardian results or unlock contact through the HOLD assessment', async ({ page, context }) => {
  await open(page);
  await connect(page);
  const card = await createAccepted(page);
  await card.locator('[data-action="request_checks"]').click();
  await expectGatePanel(card);
  const [checked] = await receipts(context);
  const session = await ownSession(context);
  const headers = { Origin: fixture.origin, 'X-NOVA-CSRF': session.csrfToken };
  const url = fixture.origin + API + '/requests/' + checked.id + '/actions';
  for (const extra of [{ outcome: 'PASS' }, { canOpenContact: true }, { finalConsentEnabled: true }, { guards: [{ id: '6RI9ADE-BG-01', sender: 'PASS', receiver: 'PASS' }] }]) {
    const spoof = await context.request.post(url, { headers, data: { action: 'request_checks', revision: checked.revision, ...extra } });
    expect(spoof.status()).toBe(400);
  }
  for (const action of ['open', 'final_accept', 'execute']) {
    expect((await context.request.post(url, { headers, data: { action, revision: checked.revision } })).status()).toBe(400);
  }
  await expect(card.locator('[data-action="open"], [data-action="final_accept"], [data-action="execute"]')).toHaveCount(0);
  expect((await receipts(context))[0]).toEqual(checked);
  await expectGatePanel(card);
  const runtime = await context.request.get(fixture.origin + API + '/runtime');
  expect(await runtime.json()).toMatchObject({
    checkGateEnabled: true, guardianRuntimeConnected: false, stewardRuntimeConnected: false,
    finalConsentEnabled: false, chatEnabled: false,
  });
});

test('a delayed session reply cannot redisplay expired text, acceptance or a guard assessment', async ({ page, context }) => {
  const timed = await startServer({ requestTtlMs: 3000, sessionTtlMs: 10000 });
  const marker = 'FICTITIOUS_DELAYED_SESSION_GATE_619';
  const routePattern = '**/api/rio/nova/session';
  try {
    await open(page, timed.origin);
    await connect(page);
    const card = await createReceipt(page, marker);
    await card.locator('[data-action="to_reception"]').click();
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'AT_RECEPTION');
    await card.locator('[data-action="accept"]').click();
    await expect(card.locator('.nova-status')).toHaveAttribute('data-status', 'FIRST_ACCEPTED');
    await card.locator('[data-action="request_checks"]').click();
    await expectGatePanel(card);
    const [checked] = await receipts(context, timed.origin);
    await page.reload();
    let capturedStatus;
    await page.route(routePattern, async route => {
      const response = await route.fetch();
      const snapshot = await response.json();
      capturedStatus = snapshot.requests[0]?.status;
      // Delay an actually live server snapshot until its receipt lifetime has passed.
      await new Promise(resolve => setTimeout(resolve, 3500));
      await route.fulfill({ response });
    });
    await connect(page);
    expect(capturedStatus).toBe('FIRST_ACCEPTED');
    const restored = page.locator('[data-receipt-id="' + checked.id + '"]');
    await expect(restored).toHaveAttribute('data-expiry-pending', 'true');
    await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'EXPIRY_PENDING');
    await expect(restored).not.toContainText(marker);
    await expect(restored.locator('.nova-acceptance, .nova-check-gate, button[data-action]')).toHaveCount(0);
    await page.unroute(routePattern);
    await page.locator('#nova-refresh').click();
    await expect(restored.locator('.nova-status')).toHaveAttribute('data-status', 'EXPIRED');
    expect((await receipts(context, timed.origin))[0]).toMatchObject({
      status: 'EXPIRED', text: '', firstAcceptance: null, checkGate: null,
    });
  } finally {
    await page.unroute(routePattern);
    await timed.close();
  }
});
