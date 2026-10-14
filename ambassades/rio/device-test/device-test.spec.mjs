import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../../auth/server.mjs';

const API = '/api/rio/device-test';
const PATH = '/rio/device-test/';
const pageErrors = new WeakMap();
let fixture;

async function startServer(deviceTestOptions = {}) {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const app = buildApp({
    env: { NODE_ENV: 'development', RIO_NOVA_BASE_URL: origin, RIO_DEVICE_TEST_BASE_URL: origin },
    deviceTestOptions: { baseURL: origin, development: true, ...deviceTestOptions },
  });
  server.on('request', app);
  return {
    origin, app,
    async close() {
      app.locals.deviceTest.close();
      app.locals.novaReception.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

test.beforeAll(async () => { fixture = await startServer(); });
test.afterAll(async () => { if (fixture) await fixture.close(); });

async function newContext(browser, testInfo, opts = {}) {
  return browser.newContext({
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.name === 'mobile',
    hasTouch: testInfo.project.name === 'mobile',
    acceptDownloads: opts.acceptDownloads === true,
  });
}

async function open(context, origin = fixture.origin, inviteLink) {
  const page = await context.newPage();
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', () => errors.push(true));
  await page.goto(inviteLink || origin + PATH);
  await expect(page.locator('#create')).toBeVisible();
  await expect(page.locator('#create')).toBeEnabled();
  await expect(page.locator('#build')).toContainText('TEST_ONLY');
  return page;
}

async function readPair(context, origin = fixture.origin) {
  const response = await context.request.get(origin + API + '/pair');
  return { status: response.status(), data: response.ok() ? await response.json() : null };
}

async function createInvite(page) {
  return test.step('invitation', async () => {
    await page.locator('#create').click();
    await expect(page.locator('#invitation-panel')).toBeVisible();
    const value = await page.locator('#share-link').inputValue();
    const parsed = new URL(value);
    expect(parsed.origin === new URL(page.url()).origin).toBe(true);
    expect(parsed.pathname === PATH).toBe(true);
    expect(/^#invite=[a-f0-9]{64}$/.test(parsed.hash)).toBe(true);
    return value;
  });
}

async function join(page) {
  await page.locator('#join').click();
  await expect(page.locator('#pair-title')).toContainText('Telefoon B');
  await expect(page.locator('#state')).toContainText('Bevestig deelname');
}

async function acceptBoth(a, b) {
  await test.step('bilateral-acceptance', async () => {
    await expect(a.locator('#accept')).toBeVisible();
    await a.locator('#accept').click();
    await expect(a.locator('#accept')).toBeHidden();
    await expect(a.locator('#challenge')).toBeHidden();
    await b.locator('#accept').click();
    await expect(a.locator('#state')).toContainText('actief');
    await expect(b.locator('#state')).toContainText('actief');
    await expect(a.locator('#challenge')).toBeVisible();
    await expect(b.locator('#challenge')).toBeVisible();
  });
}

async function connectPair(browser, testInfo, origin = fixture.origin, opts = {}) {
  const aContext = await newContext(browser, testInfo, opts);
  const bContext = await newContext(browser, testInfo, opts);
  try {
    const a = await open(aContext, origin);
    const invite = await createInvite(a);
    const b = await open(bContext, origin, invite);
    await join(b);
    await acceptBoth(a, b);
    return { aContext, bContext, a, b, invite };
  } catch (error) {
    await Promise.all([aContext.close(), bContext.close()]);
    throw error;
  }
}

async function assertPageBoundary(page) {
  await test.step('fragment-and-storage', async () => {
    const state = await page.evaluate(() => ({
      fragmentEmpty: location.hash === '',
      localKeys: localStorage.length,
      sessionKeys: sessionStorage.length,
      scriptVisibleCookie: document.cookie.includes('palacoDeviceTest='),
    }));
    expect(state).toEqual({ fragmentEmpty: true, localKeys: 0, sessionKeys: 0, scriptVisibleCookie: false });
    expect((pageErrors.get(page) || []).length).toBe(0);
  });
  await test.step('mobile-layout', async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

test('[RIO-DEVICE-01] Two browser sessions exchange, acknowledge and close generated test codes', async ({ browser }, testInfo) => {
  const setup = await connectPair(browser, testInfo);
  const { aContext, bContext, a, b, invite } = setup;
  const third = await newContext(browser, testInfo);
  try {
    const aPair = (await readPair(aContext)).data.pair;
    const bPair = (await readPair(bContext)).data.pair;
    expect(aPair.id === bPair.id).toBe(true);
    expect(aPair.role).toBe('A');
    expect(bPair.role).toBe('B');
    expect(aPair.scope).toBe('RIO_DEVICE_CHALLENGE_V1');
    const cookieA = (await aContext.cookies(fixture.origin)).find(cookie => cookie.name === 'palacoDeviceTest');
    const cookieB = (await bContext.cookies(fixture.origin)).find(cookie => cookie.name === 'palacoDeviceTest');
    expect(Boolean(cookieA && cookieB && cookieA.value !== cookieB.value)).toBe(true);
    expect(cookieA.httpOnly && cookieB.httpOnly).toBe(true);
    expect(cookieA.sameSite).toBe('Strict');
    let challenge;
    await test.step('challenge', async () => {
      await a.locator('#challenge').click();
      await expect(a.locator('#messages li')).toHaveCount(1);
      await expect(b.locator('#messages li')).toHaveCount(1);
      challenge = (await readPair(aContext)).data.pair.messages[0];
      expect(challenge.kind).toBe('CHALLENGE');
      expect(challenge.from).toBe('A');
      expect(/^[a-f0-9]{32}$/.test(challenge.code)).toBe(true);
      expect(challenge.acknowledged).toBe(false);
      expect((await b.locator('#messages code').first().textContent()) === challenge.code).toBe(true);
      await expect(a.locator('#messages small')).toHaveText('Ontvangst nog niet bevestigd');
      await expect(a.locator('#proof')).toBeHidden();
      await expect(a.locator('[data-ack]')).toHaveCount(0);
      await expect(b.locator('[data-reply]')).toHaveCount(0);
    });
    await test.step('recipient-ack', async () => {
      await b.locator('[data-ack="' + challenge.id + '"]').click();
      await expect(a.locator('#messages small')).toHaveText('Ontvangst bevestigd door de andere browser');
      expect((await readPair(aContext)).data.pair.messages[0].acknowledged).toBe(true);
      await expect(b.locator('[data-reply="' + challenge.id + '"]')).toBeVisible();
    });
    let reply;
    await test.step('reply', async () => {
      await b.locator('[data-reply="' + challenge.id + '"]').click();
      await expect(b.locator('#messages li')).toHaveCount(2);
      await expect(a.locator('#messages li')).toHaveCount(2);
      reply = (await readPair(aContext)).data.pair.messages[1];
      expect(reply.kind).toBe('REPLY');
      expect(reply.from).toBe('B');
      expect(reply.replyTo === challenge.id && reply.code === challenge.code).toBe(true);
      expect(reply.acknowledged).toBe(false);
      await expect(a.locator('#proof')).toBeHidden();
      await expect(b.locator('#proof')).toBeHidden();
    });
    await test.step('return-ack', async () => {
      await a.locator('[data-ack="' + reply.id + '"]').click();
      await expect(a.locator('#proof')).toBeVisible();
      await expect(b.locator('#proof')).toBeVisible();
      const messages = (await readPair(bContext)).data.pair.messages;
      expect(messages.length).toBe(2);
      expect(messages.every(message => message.acknowledged)).toBe(true);
    });
    await assertPageBoundary(a);
    await assertPageBoundary(b);
    await test.step('third-session-denied', async () => {
      const c = await open(third);
      expect((await readPair(third)).status).toBe(404);
      await c.locator('#invitation').fill(invite);
      await c.locator('#join').click();
      await expect(c.locator('#feedback')).toContainText('niet meer bruikbaar');
      await expect(c.locator('#pair-panel')).toBeHidden();
      await expect(c.locator('#messages li')).toHaveCount(0);
      expect((await readPair(third)).status).toBe(404);
      const leakedSource = await third.request.get(fixture.origin + '/auth/device-test.mjs');
      expect(leakedSource.status()).toBe(404);
      await assertPageBoundary(c);
    });
    await test.step('closed-account-gates', async () => {
      const status = await aContext.request.get(fixture.origin + '/api/auth/status');
      const auth = await status.json();
      expect(auth.available).toBe(false);
      expect(auth.authenticated).toBe(false);
      expect(auth.securityApproval.outcome).toBe('HOLD');
      expect((await bContext.request.get(fixture.origin + '/api/me')).status()).toBe(503);
      const runtime = await aContext.request.get(fixture.origin + API + '/runtime');
      const facts = await runtime.json();
      expect(facts.mode).toBe('TEST_ONLY');
      expect(facts.authenticatedIdentity).toBe(false);
      expect(facts.accountActive).toBe(false);
      expect(facts.canOpenContact).toBe(false);
      expect(facts.operativeAuthority).toBe('NONE');
      expect(facts.endToEndEncrypted).toBe(false);
      const nova = await aContext.request.get(fixture.origin + '/api/rio/nova/runtime');
      expect((await nova.json()).chatEnabled).toBe(false);
    });
    await test.step('close', async () => {
      await a.locator('#close').click();
      await expect(a.locator('#messages li')).toHaveCount(0);
      await expect(b.locator('#messages li')).toHaveCount(0);
      await expect(a.locator('#proof')).toBeHidden();
      await expect(b.locator('#proof')).toBeHidden();
      await expect(a.locator('#share-link')).toHaveValue('');
      expect((await readPair(aContext)).status).toBe(404);
      expect((await readPair(bContext)).status).toBe(404);
    });
  } finally {
    await Promise.all([aContext.close(), bContext.close(), third.close()]);
  }
});

test('[RIO-DEVICE-02] Both sessions must accept and only the recipient can acknowledge', async ({ browser }, testInfo) => {
  const aContext = await newContext(browser, testInfo);
  const bContext = await newContext(browser, testInfo);
  try {
    const a = await open(aContext);
    const invite = await createInvite(a);
    await expect(a.locator('#challenge')).toBeHidden();
    const b = await open(bContext, fixture.origin, invite);
    await join(b);
    await expect(a.locator('#challenge')).toBeHidden();
    await expect(b.locator('#challenge')).toBeHidden();
    await acceptBoth(a, b);
    await a.locator('#challenge').click();
    await expect(b.locator('[data-ack]')).toHaveCount(1);
    const message = (await readPair(aContext)).data.pair.messages[0];
    await test.step('recipient-ack', async () => {
      const sessionResponse = await aContext.request.post(fixture.origin + API + '/session', {
        headers: { Origin: fixture.origin }, data: {},
      });
      const csrf = (await sessionResponse.json()).session.csrfToken;
      const current = (await readPair(aContext)).data.pair;
      const rejected = await aContext.request.post(fixture.origin + API + '/pair/actions', {
        headers: { Origin: fixture.origin, 'X-Device-Test-CSRF': csrf },
        data: { action: 'ack', pairId: current.id, revision: current.revision, idempotencyKey: '4'.repeat(32), messageId: message.id },
      });
      expect(rejected.status()).toBe(404);
      expect((await readPair(aContext)).data.pair.messages[0].acknowledged).toBe(false);
      await expect(a.locator('[data-ack]')).toHaveCount(0);
      await expect(b.locator('[data-reply]')).toHaveCount(0);
      await expect(a.locator('#proof')).toBeHidden();
    });
    await a.locator('#close').click();
    await expect(b.locator('#messages li')).toHaveCount(0);
  } finally {
    await Promise.all([aContext.close(), bContext.close()]);
  }
});

test('[RIO-DEVICE-03] Retry after a lost real response does not duplicate a challenge', async ({ browser }, testInfo) => {
  const { aContext, bContext, a, b } = await connectPair(browser, testInfo);
  let dropped = false;
  try {
    await a.route('**/api/rio/device-test/pair/actions', async route => {
      const body = route.request().postDataJSON();
      if (body?.action === 'challenge' && !dropped) {
        dropped = true;
        await route.fetch(); // The real backend commits; only this browser's response is lost.
        await route.abort('failed');
      } else await route.continue();
    });
    await test.step('lost-response', async () => {
      await a.locator('#challenge').click();
      await expect(a.locator('#retry')).toBeVisible();
      await expect(a.locator('#retry')).toBeEnabled();
      const messages = (await readPair(aContext)).data.pair.messages;
      expect(messages.length).toBe(1);
      expect(messages[0].acknowledged).toBe(false);
      await expect(a.locator('#proof')).toBeHidden();
    });
    await test.step('idempotent-retry', async () => {
      await a.locator('#retry').click();
      await expect(a.locator('#retry')).toBeHidden();
      await expect(a.locator('#messages li')).toHaveCount(1);
      await expect(b.locator('#messages li')).toHaveCount(1);
      const messages = (await readPair(aContext)).data.pair.messages;
      expect(messages.length).toBe(1);
      expect(messages[0].sequence).toBe(1);
      expect(messages[0].acknowledged).toBe(false);
      await expect(a.locator('#proof')).toBeHidden();
    });
    await a.unroute('**/api/rio/device-test/pair/actions');
    await a.locator('#close').click();
  } finally {
    await Promise.all([aContext.close(), bContext.close()]);
  }
});

test('[RIO-DEVICE-04] A lost invitation is not recovered or published on replay', async ({ browser }, testInfo) => {
  const context = await newContext(browser, testInfo);
  let dropped = false;
  try {
    const page = await open(context);
    await page.route('**/api/rio/device-test/pair', async route => {
      if (route.request().method() === 'POST' && !dropped) {
        dropped = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await page.locator('#create').click();
    await expect(page.locator('#retry')).toBeVisible();
    await expect(page.locator('#retry')).toBeEnabled();
    await test.step('invitation-not-recoverable', async () => {
      await page.locator('#retry').click();
      await expect(page.locator('#retry')).toBeHidden();
      await expect(page.locator('#pair-panel')).toBeVisible();
      await expect(page.locator('#invitation-panel')).toBeHidden();
      await expect(page.locator('#share-link')).toHaveValue('');
      await expect(page.locator('#feedback')).toContainText(/uitnodiging|nieuwe proef/i);
      expect((await readPair(context)).data.pair.state).toBe('WAITING_PEER');
    });
    await page.unroute('**/api/rio/device-test/pair');
    await page.locator('#close').click();
    await expect.poll(async () => (await readPair(context)).status).toBe(404);
  } finally {
    await context.close();
  }
});

test('[RIO-DEVICE-05] Expired codes disappear even while the browser is offline', async ({ browser }, testInfo) => {
  const timed = await startServer({ pairTtlMs: 15_000, sessionTtlMs: 30_000 });
  let setup;
  try {
    setup = await connectPair(browser, testInfo, timed.origin);
    const { aContext, bContext, a, b } = setup;
    await a.locator('#challenge').click();
    await expect(a.locator('#messages li')).toHaveCount(1);
    await expect(b.locator('#messages li')).toHaveCount(1);
    await test.step('offline-expiry', async () => {
      await aContext.setOffline(true);
      await expect(a.locator('#messages li')).toHaveCount(0, { timeout: 18_000 });
      await expect(a.locator('#proof')).toBeHidden();
      await expect(a.locator('#share-link')).toHaveValue('');
      await expect(a.locator('#retry')).toBeHidden();
      await expect(a.locator('#feedback')).toContainText(/verlopen|beëindigd|afgelopen/i);
      await aContext.setOffline(false);
      await expect.poll(async () => (await readPair(aContext, timed.origin)).status).toBe(404);
      await expect(b.locator('#messages li')).toHaveCount(0);
    });
  } finally {
    if (setup) await Promise.all([setup.aContext.close(), setup.bContext.close()]);
    await timed.close();
  }
});

async function carrierDeclarations(a,b) {
  await test.step('carrier-checklist', async () => {
    for(const page of [a,b]) {
      await expect(page.locator('#carrier-panel')).toBeVisible();
      await expect(page.locator('#carrier-confirm')).toBeDisabled();
      for (const id of ['wifi-off','data-on','providers-different','hotspot-off']) {
        await page.locator('#'+id).check();
      }
      await expect(page.locator('#carrier-confirm')).toBeEnabled();
      await page.locator('#carrier-confirm').click();
      await expect(page.locator('#carrier-confirm')).toBeHidden();
    }
    await expect(a.locator('#carrier-status')).toContainText('B / Lebara: bevestigd');
    await expect(b.locator('#carrier-status')).toContainText('A / Youfone: bevestigd');
    await expect(a.locator('#challenge')).toBeEnabled();
  });
}

test('[RIO-DEVICE-06] Both carriers attest their own network settings before transfer', async ({browser},testInfo) => {
  const {aContext,bContext,a,b}=await connectPair(browser,testInfo);
  try {
    await expect(a.locator('#carrier-title')).toContainText('Youfone');
    await expect(b.locator('#carrier-title')).toContainText('Lebara');
    await expect(a.locator('#carrier-confirm')).toBeDisabled();
    for(const id of ['wifi-off','data-on','providers-different','hotspot-off']) await a.locator('#'+id).check();
    await a.locator('#carrier-confirm').click();
    await expect(a.locator('#carrier-status')).toContainText('A / Youfone: bevestigd');
    await expect(a.locator('#challenge')).toBeDisabled();
    const blocked = await readPair(aContext);
    expect(blocked.data.pair.carrier).toEqual({mode:true,A:true,B:false});
    for(const id of ['wifi-off','data-on','providers-different','hotspot-off']) await b.locator('#'+id).check();
    await b.locator('#carrier-confirm').click();
    await expect(a.locator('#challenge')).toBeEnabled();
    expect((await readPair(bContext)).data.pair.carrier).toEqual({mode:true,A:true,B:true});
    await a.locator('#close').click();
    await expect(a.locator('#messages li')).toHaveCount(0);
  } finally { await Promise.all([aContext.close(),bContext.close()]); }
});

test('[RIO-DEVICE-07] Download belongs to exact closed carrier pair and excludes codes',async ({browser},testInfo) => {
  const {aContext,bContext,a,b}=await connectPair(browser,testInfo,fixture.origin,{acceptDownloads:true});
  try {
    await carrierDeclarations(a,b);
    const before=(await readPair(aContext)).data.pair;
    await a.locator('#challenge').click();
    const challenge=(await readPair(bContext)).data.pair.messages[0];
    await b.locator('[data-ack="'+challenge.id+'"]').click();
    await b.locator('[data-reply="'+challenge.id+'"]').click();
    const reply=(await readPair(aContext)).data.pair.messages[1];
    await a.locator('[data-ack="'+reply.id+'"]').click();
    await expect(a.locator('#proof')).toBeVisible();
    await test.step('carrier-export',async ()=>{
      await a.locator('#close').click();
      await expect(a.locator('#download-result')).toBeVisible();
      await expect(a.locator('#messages li')).toHaveCount(0);
      await expect(a.locator('#proof')).toBeHidden();
      const downloadEvent=a.waitForEvent('download');
      await a.locator('#download-result').click();
      const file=await downloadEvent;
      const data=JSON.parse(await readFile(await file.path(),'utf8'));
      expect(data.schema).toBe('rio-carrier-result/v1');
      expect(data.testId).toBe(before.id);
      expect(data.closedRevision).toBeGreaterThan(before.revision);
      expect(data.providers).toEqual({A:'Youfone',B:'Lebara'});
      expect(data.declarations).toEqual({A:true,B:true});
      expect(data.roundTripConfirmed).toBe(true);
      expect(data.challengeReceived && data.replyReceived).toBe(true);
      expect(data.physicalCarrierVerified).toBe(false);
      expect(data.canOpenContact).toBe(false);
      expect(data.account1).toBe('HOLD');
      expect(JSON.stringify(data)).not.toContain(challenge.code);
      expect(JSON.stringify(data)).not.toContain(reply.code);
      expect((await readPair(aContext)).status).toBe(404);
    });
  } finally {await Promise.all([aContext.close(),bContext.close()]);}
});

test('[RIO-DEVICE-08] Wrong pair on close reply blocks export; replay recovers exact receipt',async ({browser},testInfo) => {
  const {aContext,bContext,a,b}=await connectPair(browser,testInfo);
  let tampered=false;
  try {
    await carrierDeclarations(a,b);
    await a.route('**/api/rio/device-test/pair/actions',async route=>{
      if(!tampered && route.request().postDataJSON()?.action==='close'){
        tampered=true;
        const actual=await route.fetch();
        const value=await actual.json();
        value.carrierResult.pairId='f'.repeat(32);
        await route.fulfill({response:actual,body:JSON.stringify(value)});
      } else await route.continue();
    });
    await test.step('invalid-close-receipt',async ()=>{
      await a.locator('#close').click();
      await expect(a.locator('#retry')).toBeVisible();
      await expect(a.locator('#download-result')).toBeHidden();
      await expect(a.locator('#messages li')).toHaveCount(0);
      await a.locator('#retry').click();
      await expect(a.locator('#retry')).toBeHidden();
      await expect(a.locator('#download-result')).toBeVisible();
    });
  }finally{await Promise.all([aContext.close(),bContext.close()]);}
});

test('[RIO-DEVICE-09] Late old pair response cannot resurrect codes after close',async ({browser},testInfo) => {
  const {aContext,bContext,a,b}=await connectPair(browser,testInfo);
  let release,markStarted;
  const started=new Promise(resolve=>{markStarted=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  let held=false;
  try {
    await carrierDeclarations(a,b);
    await a.locator('#challenge').click();
    await expect(a.locator('#messages li')).toHaveCount(1);
    await a.route('**/api/rio/device-test/pair',async route=>{
      if(!held && route.request().method()==='GET'){
        held=true;
        const old=await route.fetch();
        markStarted();
        await gate;
        await route.fulfill({response:old});
      }else await route.continue();
    });
    await test.step('stale-readback',async ()=>{
      await a.evaluate(()=>window.dispatchEvent(new Event('online')));
      await started;
      await a.locator('#close').click();
      await expect(a.locator('#download-result')).toBeVisible();
      release();
      await expect(a.locator('#messages li')).toHaveCount(0);
      await expect(a.locator('#proof')).toBeHidden();
      await expect(a.locator('#share-link')).toHaveValue('');
      await a.waitForTimeout(100);
      await expect(a.locator('#messages code')).toHaveCount(0);
    });
  }finally{if(release)release();await Promise.all([aContext.close(),bContext.close()]);}
});
