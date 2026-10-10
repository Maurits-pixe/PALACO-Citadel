import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startRioContactPreview } from './server.mjs';

async function fixture(browser, testInfo, viewport = { width: 1280, height: 900 }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'rio-contact-browser-'));
  const app = await startRioContactPreview({
    databasePath: path.join(directory, 'contact.sqlite'),
    classification: 'SYNTHETIC_ONLY', port: 0
  });
  const contexts = {};
  const pages = {};
  try {
    for (const side of ['SENDER', 'RECEIVER']) {
      const context = await browser.newContext({ viewport });
      contexts[side] = context;
      await context.addCookies([{
        name: 'rio_' + side.toLowerCase(), value: app.credentials[side].sessionToken,
        url: app.origin, httpOnly: true, sameSite: 'Strict'
      }]);
      const page = await context.newPage();
      pages[side] = page;
      await page.goto(side === 'SENDER' ? app.senderUrl : app.receiverUrl);
      await expect(page.locator('#role-title')).toBeVisible();
    }
  } catch (error) {
    await Promise.all(Object.values(contexts).map(context => context.close()));
    await app.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    app, pages, contexts,
    async close() {
      await Promise.all(Object.values(contexts).map(context => context.close()));
      await app.close();
      await rm(directory, { recursive: true, force: true });
    },
    async screenshot(side, name) {
      await pages[side].screenshot({ path: testInfo.outputPath(name), fullPage: true });
    }
  };
}
async function refresh(page) {
  await page.locator('#refresh-button').click();
}
const card = page => page.locator('[data-request-id]').first();
async function phase(page, value) {
  await expect(card(page)).toHaveAttribute('data-phase', value);
}
async function action(page, name) {
  const button = card(page).locator('[data-action="' + name + '"]');
  await expect(button).toBeEnabled();
  await button.click();
}
async function compose(f, text) {
  await f.pages.SENDER.locator('#message-text').fill(text);
  await f.pages.SENDER.locator('#send-button').click();
  await phase(f.pages.SENDER, 'WAITING_NOVA');
  await refresh(f.pages.RECEIVER);
  await phase(f.pages.RECEIVER, 'WAITING_NOVA');
}
async function admission(f) {
  await action(f.pages.RECEIVER, 'NOVA_ADMIT');
  await phase(f.pages.RECEIVER, 'COMMIT_CONFIRMATION');
  await refresh(f.pages.SENDER);
  await phase(f.pages.SENDER, 'COMMIT_CONFIRMATION');
}
async function queue(f) {
  await compose(f, 'Een bericht tussen twee afzonderlijke testvensters.');
  await admission(f);
  await action(f.pages.SENDER, 'FINAL_ACCEPT');
  await phase(f.pages.SENDER, 'COMMIT_CONFIRMATION');
  await refresh(f.pages.RECEIVER);
  await action(f.pages.RECEIVER, 'FINAL_ACCEPT');
  await phase(f.pages.RECEIVER, 'QUEUED');
  await refresh(f.pages.SENDER);
  await phase(f.pages.SENDER, 'QUEUED');
}

test('two separate participant contexts complete both explicit approval checkpoints', async ({ browser }, testInfo) => {
  const f = await fixture(browser, testInfo);
  try {
    await queue(f);
    await action(f.pages.SENDER, 'PREPARE_DELIVERY');
    await phase(f.pages.SENDER, 'WAITING_DELIVERY_NOVA');
    await refresh(f.pages.RECEIVER);
    await phase(f.pages.RECEIVER, 'WAITING_DELIVERY_NOVA');
    await action(f.pages.RECEIVER, 'ADMIT_DELIVERY');
    await phase(f.pages.RECEIVER, 'DELIVERY_CONFIRMATION');
    await refresh(f.pages.SENDER);
    await action(f.pages.SENDER, 'FINAL_ACCEPT');
    await phase(f.pages.SENDER, 'DELIVERY_CONFIRMATION');
    await refresh(f.pages.RECEIVER);
    await action(f.pages.RECEIVER, 'FINAL_ACCEPT');
    await phase(f.pages.RECEIVER, 'DELIVERED');
    await expect(card(f.pages.RECEIVER)).toContainText('Een bericht tussen twee afzonderlijke testvensters.');
    await refresh(f.pages.SENDER);
    await phase(f.pages.SENDER, 'DELIVERED');
    await f.screenshot('SENDER', 'rio-contact-sender-delivered.png');
    await f.screenshot('RECEIVER', 'rio-contact-receiver-delivered.png');
    for (const page of Object.values(f.pages)) {
      const html = await page.content();
      for (const side of ['SENDER', 'RECEIVER']) {
        expect(html).not.toContain(f.app.credentials[side].sessionToken);
      }
    }
  } finally { await f.close(); }
});
test('NOVA reception hides message contents until the receiver explicitly admits them', async ({ browser }, testInfo) => {
  const f = await fixture(browser, testInfo);
  try {
    const message = 'INHOUD-ALLEEN-NA-NOVA-731';
    await compose(f, message);
    await expect(card(f.pages.RECEIVER)).not.toContainText(message);
    await expect(card(f.pages.RECEIVER).locator('[data-action="FINAL_ACCEPT"]:visible')).toHaveCount(0);
    await admission(f);
    await expect(card(f.pages.RECEIVER)).toContainText(message);
    await phase(f.pages.RECEIVER, 'COMMIT_CONFIRMATION');
  } finally { await f.close(); }
});
test('message HTML is displayed as text and cannot execute in either participant context', async ({ browser }, testInfo) => {
  const f = await fixture(browser, testInfo);
  try {
    const payload = '<img src=x onerror="globalThis.__rioXss=true"><script>globalThis.__rioXss=true</script>';
    await compose(f, payload);
    await admission(f);
    for (const page of Object.values(f.pages)) {
      await expect(card(page)).toContainText(payload);
      await expect(card(page).locator('img,script')).toHaveCount(0);
      expect(await page.evaluate(() => globalThis.__rioXss ?? false)).toBe(false);
    }
  } finally { await f.close(); }
});
test('receiver declining gives a closed outcome without opening contact', async ({ browser }, testInfo) => {
  const f = await fixture(browser, testInfo);
  try {
    await compose(f, 'Af te wijzen synthetisch verzoek.');
    await action(f.pages.RECEIVER, 'DECLINE');
    await phase(f.pages.RECEIVER, 'CLOSED');
    await refresh(f.pages.SENDER);
    await phase(f.pages.SENDER, 'CLOSED');
    await expect(card(f.pages.SENDER).locator('[data-action="FINAL_ACCEPT"]:visible')).toHaveCount(0);
  } finally { await f.close(); }
});
test('revoking a queued request removes delivery actions from both participant windows', async ({ browser }, testInfo) => {
  const f = await fixture(browser, testInfo);
  try {
    await queue(f);
    await action(f.pages.SENDER, 'REVOKE');
    await phase(f.pages.SENDER, 'CLOSED');
    await refresh(f.pages.RECEIVER);
    await phase(f.pages.RECEIVER, 'CLOSED');
    await expect(card(f.pages.SENDER).locator('[data-action="PREPARE_DELIVERY"]:visible')).toHaveCount(0);
  } finally { await f.close(); }
});
test('new guard evidence requires the sender to choose again', async ({ browser }, testInfo) => {
  const f = await fixture(browser, testInfo);
  try {
    await compose(f, 'Opnieuw te bevestigen testbericht.'); await admission(f);
    await action(f.pages.SENDER, 'FINAL_ACCEPT');
    await expect(card(f.pages.SENDER).locator('[data-action="FINAL_ACCEPT"]:visible')).toHaveCount(0);
    await refresh(f.pages.RECEIVER);
    await action(f.pages.RECEIVER, 'REFRESH_GUARDS');
    await refresh(f.pages.SENDER);
    await expect(card(f.pages.SENDER).locator('[data-action="FINAL_ACCEPT"]')).toBeVisible();
    await phase(f.pages.SENDER, 'COMMIT_CONFIRMATION');
  } finally { await f.close(); }
});
test('mobile windows keep long messages and digests inside the viewport', async ({ browser }, testInfo) => {
  const f = await fixture(browser, testInfo, { width: 390, height: 844 });
  try {
    await compose(f, 'langtest'.repeat(100));
    await admission(f);
    for (const page of Object.values(f.pages)) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await expect(page.locator('#role-title')).toBeVisible();
    }
    await f.screenshot('RECEIVER', 'rio-contact-receiver-mobile.png');
  } finally { await f.close(); }
});
