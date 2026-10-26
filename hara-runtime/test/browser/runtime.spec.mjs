import { test, expect } from '@playwright/test';
import { startRuntimeServer } from '../../server.mjs';

let fixture;
test.beforeEach(async () => {
  fixture = await startRuntimeServer({ port: 0, filename: ':memory:', providerConfigured: true, brain: {
    async respond({ input, readHousehold, proposeChange }) {
      if (input.includes('was')) {
        await readHousehold();
        await proposeChange({ operation: 'add', kind: 'task', title: 'Was ophangen', details: 'Synthetische testtaak', dueDate: null });
        return 'Zal ik de was als taak toevoegen? Jij beslist.';
      }
      if (input.includes('koffie')) {
        await proposeChange({ operation: 'add', kind: 'shopping', title: 'Koffie', details: '', dueDate: null });
        return 'Zal ik koffie op je boodschappenlijst zetten?';
      }
      return `Ik ben HARAM. Jij beslist wat wordt bewaard. <img src="https://attacker.invalid/pixel"> ${'huishoudgeheugen'.repeat(12)}`;
    }
  } });
});
test.afterEach(async () => { await fixture?.close(); });

async function openRuntime(page) {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== fixture.origin) external.push(request.url());
  });
  await page.goto(fixture.origin);
  await expect(page.locator('#runtime-status')).toContainText(/pauze|gepauzeerd|PAUSED/i);
  await expect(page.locator('#send-message')).toBeDisabled();
  await expect(page.locator('#chat-consent')).not.toBeChecked();
  await expect(page.locator('#household-consent')).not.toBeChecked();
  return { verify() { expect(errors).toEqual([]); expect(external).toEqual([]); } };
}

async function start(page, household = true) {
  await page.locator('#chat-consent').check();
  if (household) await page.locator('#household-consent').check();
  await page.locator('#start-session').click();
  await expect(page.locator('#message-input')).toBeEnabled();
}

async function send(page, message) {
  await page.locator('#message-input').fill(message);
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url() === `${fixture.origin}/api/chat` && response.request().method() === 'POST'),
    page.locator('#send-message').click()
  ]);
  expect(response.status()).toBe(200);
  await expect(page.locator('#message-input')).toBeEnabled();
}

test('chat consent enables a real runtime turn; household changes wait for approval and survive reload', async ({ page }) => {
  const checked = await openRuntime(page);
  await start(page);
  await send(page, 'Plan de was');
  await expect(page.locator('#conversation')).toContainText('Jij beslist.');
  const proposal = page.locator('#proposals-list article[data-proposal-id]').filter({ has: page.locator('button[data-proposal-action="approve"]') }).first();
  await expect(proposal).toContainText('Was ophangen');
  await expect(page.locator('#tasks-list')).not.toContainText('Was ophangen');
  await proposal.locator('[data-proposal-action="approve"]').click();
  await expect(page.locator('#tasks-list')).toContainText('Was ophangen');
  await expect(page.locator('#receipts-list [data-receipt-id]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#tasks-list')).toContainText('Was ophangen');
  await expect(page.locator('#receipts-list [data-receipt-id]')).toHaveCount(1);
  const cookies = await page.context().cookies();
  expect(cookies.find(cookie => cookie.name === 'hara_session')).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
  expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))).toEqual({ local: [], session: [] });
  checked.verify();
});

test('rejection, reset and revocation preserve the distinction between proposals and confirmed household data', async ({ page }) => {
  const checked = await openRuntime(page);
  await start(page);
  await send(page, 'Koop koffie');
  const rejected = page.locator('#proposals-list article[data-proposal-id]').first();
  await rejected.locator('[data-proposal-action="reject"]').click();
  await expect(page.locator('#shopping-list')).not.toContainText('Koffie');
  await expect(page.locator('#proposals-list article[data-proposal-id]')).toHaveCount(0);
  await expect(page.locator('#feedback')).toContainText('Voorstel afgewezen');
  await send(page, 'Plan de was');
  await page.locator('#proposals-list [data-proposal-action="approve"]').click();
  await expect(page.locator('#tasks-list')).toContainText('Was ophangen');
  await page.locator('#reset-conversation').click();
  await expect(page.locator('#conversation')).not.toContainText('Plan de was');
  await expect(page.locator('#proposals-list article[data-proposal-id]')).toHaveCount(0);
  await expect(page.locator('#tasks-list')).toContainText('Was ophangen');
  await page.locator('#pause-runtime').click();
  await expect(page.locator('#send-message')).toBeDisabled();
  await expect(page.locator('#runtime-status')).toContainText(/pauze|gepauzeerd|PAUSED/i);
  await expect(page.locator('#chat-consent')).not.toBeChecked();
  await expect(page.locator('#household-consent')).not.toBeChecked();
  await expect(page.locator('#tasks-list')).toContainText('Was ophangen');
  checked.verify();
});

test('keyboard operation, large text and a 320px surface retain readable controls without horizontal overflow', async ({ page }) => {
  const checked = await openRuntime(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
    document.body.style.fontSize = '32px';
  });
  await page.locator('#chat-consent').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#chat-consent')).toBeChecked();
  await page.locator('#start-session').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#message-input')).toBeEnabled();
  await page.locator('#message-input').focus();
  await page.keyboard.type('Hallo HARAM');
  await page.keyboard.press('Tab');
  await expect(page.locator('#send-message')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#conversation')).toContainText('Ik ben HARAM.');
  await expect(page.locator('#conversation')).toContainText('<img src="https://attacker.invalid/pixel">');
  await expect(page.locator('#conversation img, #conversation script')).toHaveCount(0);
  const metrics = await page.evaluate(() => ({
    rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
    shoppingWordLines: (() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#shopping-title'));
      return new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size;
    })(),
    viewport: document.documentElement.clientWidth,
    width: document.documentElement.scrollWidth,
    controls: [...document.querySelectorAll('button:not([hidden]), textarea, input[type="checkbox"]')]
      .filter(element => element.getClientRects().length && !element.closest('[hidden]'))
      .map(element => {
        const target = element.matches('input[type="checkbox"]') ? element.closest('label') ?? element : element;
        const box = target.getBoundingClientRect();
        return { id: element.id, width: box.width, height: box.height };
      })
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.rootFont).toBe(32);
  expect(metrics.shoppingWordLines).toBe(1);
  for (const control of metrics.controls) {
    expect(control.width, control.id).toBeGreaterThanOrEqual(44);
    expect(control.height, control.id).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#pause-runtime').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#send-message')).toBeDisabled();
  checked.verify();
});
