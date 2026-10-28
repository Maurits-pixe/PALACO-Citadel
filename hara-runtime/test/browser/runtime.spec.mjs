import { test, expect } from '@playwright/test';
import { startRuntimeServer } from '../../server.mjs';

let fixture;
let providerRequests;
test.beforeEach(async () => {
  providerRequests = 0;
  fixture = await startRuntimeServer({ port: 0, filename: ':memory:', providerConfigured: true, brain: {
    async respond({ input, readHousehold, proposeChange }) {
      providerRequests += 1;
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

async function addLocal(page, kind, title, details = '', dueDate = '') {
  const panel = page.locator('#local-entry-panel');
  if (await panel.getAttribute('open') === null) await panel.locator('summary').click();
  await page.locator('#local-kind').selectOption(kind);
  await page.locator('#local-title').fill(title);
  await page.locator('#local-details').fill(details);
  await page.locator('#local-date').fill(dueDate);
  await page.locator('#local-preview').click();
  const proposal = page.locator('#proposals-list article[data-proposal-origin="LOCAL_OPERATOR"]').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).last();
  await expect(proposal).toBeVisible();
  await expect(proposal).toBeFocused();
  await expect(proposal).toContainText('Door jou ingevoerd');
  await expect(page.locator('#local-title')).toHaveValue('');
  return proposal;
}

test('local tasks, shopping and memory use explicit proposals without provider requests or AI consent', async ({ page }) => {
  await fixture.close();
  fixture = await startRuntimeServer({ port: 0, filename: ':memory:', providerConfigured: false, brain: {
    async respond() { providerRequests += 1; throw new Error('The local flow must not call a provider.'); }
  } });
  const checked = await openRuntime(page);
  const aiRequests = [];
  page.on('request', request => { if (request.url().endsWith('/api/chat') || request.url().endsWith('/api/consent')) aiRequests.push(request.url()); });
  await expect(page.locator('#context-status')).toContainText('zelf lokaal bijhouden');
  await page.locator('#local-entry-panel summary').click();
  await expect(page.locator('#local-entry-help')).toContainText('stuurt niets naar OpenAI');
  await expect(page.locator('.local-entry-content')).toContainText('later toestemming');

  // A failed local request retains the exact draft for correction or retry.
  await page.locator('#local-title').fill('Mijn ongewijzigde concept');
  await page.route('**/api/local/proposals', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'LOCAL_PROPOSALS_FULL' } }) }), { times: 1 });
  await page.locator('#local-preview').click();
  await expect(page.locator('#feedback')).toContainText('Rond eerst een open lokaal voorstel af');
  await expect(page.locator('#local-title')).toHaveValue('Mijn ongewijzigde concept');

  const title = 'Ramen <img src=x onerror=alert(1)> wassen';
  const task = await addLocal(page, 'task', title, 'Zelf ingevoerd · geen AI nodig', '2026-10-30');
  await expect(task).toContainText('30 oktober 2026');
  await expect(page.locator('#tasks-list')).not.toContainText(title);
  await task.locator('[data-proposal-action="approve"]').click();
  await expect(page.locator('#proposals-title')).toBeFocused();
  const taskRow = page.locator('#tasks-list [data-item-id]').filter({ hasText: title });
  await expect(taskRow).toContainText(title);
  await expect(page.locator('#tasks-list img, #tasks-list script')).toHaveCount(0);
  await taskRow.getByRole('button', { name: `Afronden: ${title}`, exact: true }).click();
  const completing = page.locator('#proposals-list article').first();
  await expect(completing).toBeFocused();
  await expect(taskRow).not.toContainText('Afgerond');
  await completing.locator('[data-proposal-action="approve"]').click();
  await expect(taskRow).toBeFocused();
  await expect(taskRow).toContainText('Afgerond');
  await taskRow.getByRole('button', { name: `Heropenen: ${title}`, exact: true }).click();
  await expect(page.locator('#proposals-list article')).toContainText('Heropenen');
  await page.locator('#proposals-list [data-proposal-action="approve"]').click();
  await expect(taskRow).not.toContainText('Afgerond');
  await expect(page.locator('#receipts-list')).toContainText('Afvinkstatus wijzigen vastgelegd');

  const shopping = await addLocal(page, 'shopping', 'Appels');
  await shopping.locator('[data-proposal-action="approve"]').click();
  await expect(page.locator('#shopping-list')).toContainText('Appels');
  const memory = await addLocal(page, 'memory', 'Sleutelplek', 'De reservesleutel ligt in de blauwe doos.');
  await memory.locator('[data-proposal-action="approve"]').click();
  await page.locator('#memory-list').getByRole('button', { name: 'Vergeten: Sleutelplek', exact: true }).click();
  await expect(page.locator('#memory-list')).toContainText('Sleutelplek');
  await expect(page.locator('#proposals-list article')).toBeFocused();
  await page.locator('#proposals-list [data-proposal-action="approve"]').click();
  await expect(page.locator('#memory-list')).not.toContainText('Sleutelplek');
  await expect(page.locator('#proposals-title')).toBeFocused();

  const rejection = await addLocal(page, 'shopping', 'Niet opslaan');
  await rejection.locator('[data-proposal-action="reject"]').click();
  await expect(page.locator('#shopping-list')).not.toContainText('Niet opslaan');
  await expect(page.locator('#proposals-title')).toBeFocused();
  await expect(page.locator('#receipts-list [data-receipt-id]')).toHaveCount(6);
  await page.reload();
  await expect(page.locator('#tasks-list')).toContainText(title);
  await expect(page.locator('#shopping-list')).toContainText('Appels');
  await expect(page.locator('#chat-consent')).not.toBeChecked();
  await expect(page.locator('#household-consent')).not.toBeChecked();
  expect((await (await page.request.get(`${fixture.origin}/api/state`)).json()).consent).toEqual({ chat: false, household: false });
  expect(providerRequests).toBe(0);
  expect(aiRequests).toEqual([]);
  checked.verify();
});

test('local proposal origin and scope survive AI consent changes, reset and pause', async ({ page }) => {
  const checked = await openRuntime(page);
  await addLocal(page, 'shopping', 'Door mij voorgesteld');
  await start(page);
  const local = page.locator('#proposals-list article[data-proposal-origin="LOCAL_OPERATOR"]');
  await expect(local).toHaveCount(1);
  await send(page, 'Plan de was');
  await expect(page.locator('#proposals-list article[data-proposal-origin="AGENT_MODEL"]')).toContainText('Voorstel van HARAM');
  await page.locator('#reset-conversation').click();
  await expect(local).toHaveCount(1);
  await expect(page.locator('#proposals-list article[data-proposal-origin="AGENT_MODEL"]')).toHaveCount(0);
  await send(page, 'Koop koffie');
  await page.locator('#pause-runtime').click();
  await expect(local).toHaveCount(1);
  await expect(page.locator('#proposals-list article[data-proposal-origin="AGENT_MODEL"]')).toHaveCount(0);
  await expect(local.locator('[data-proposal-action="approve"]')).toBeEnabled();
  // A missing/legacy origin is displayed honestly and never inherits the local gate.
  await page.route('**/api/state', async route => {
    const response = await route.fetch();
    const payload = await response.json();
    await route.fulfill({ response, json: { ...payload, proposals: payload.proposals.map(proposal => ({ ...proposal, origin: 'LEGACY_UNSPECIFIED' })) } });
  }, { times: 1 });
  await page.reload();
  await expect(page.locator('#proposals-list article')).toContainText('Herkomst onbekend');
  await expect(page.locator('#proposals-list [data-proposal-action="approve"]')).toBeDisabled();
  await expect(page.locator('#proposal-consent-help')).toBeVisible();
  await page.reload();
  await local.locator('[data-proposal-action="approve"]').click();
  await expect(page.locator('#shopping-list')).toContainText('Door mij voorgesteld');
  await expect(page.locator('#chat-consent')).not.toBeChecked();
  await expect(page.locator('#household-consent')).not.toBeChecked();
  expect(providerRequests).toBe(2);
  checked.verify();
});

test('local controls pause during an AI turn and recover after revoking AI consent', async ({ page }) => {
  await fixture.close();
  let release;
  const answer = new Promise(resolve => { release = resolve; });
  fixture = await startRuntimeServer({ port: 0, filename: ':memory:', providerConfigured: true, brain: {
    async respond() { providerRequests += 1; return answer; }
  } });
  const checked = await openRuntime(page);
  const first = await addLocal(page, 'task', 'Kleine lokale taak');
  await first.locator('[data-proposal-action="approve"]').click();
  await addLocal(page, 'memory', 'Nog niet vastgelegd');
  await start(page);
  try {
    await page.locator('#message-input').fill('Denk even met mij mee');
    await page.locator('#send-message').click();
    await expect(page.locator('#runtime-status')).toContainText('HARAM denkt mee');
    for (const selector of ['#local-kind', '#local-title', '#local-details', '#local-date', '#local-preview', '#tasks-list [data-local-item-action]', '#proposals-list [data-proposal-action="approve"]', '#proposals-list [data-proposal-action="reject"]']) {
      await expect(page.locator(selector)).toBeDisabled();
    }
    await page.locator('#pause-runtime').click();
    await expect(page.locator('#local-preview')).toBeEnabled();
    await expect(page.locator('#tasks-list [data-local-item-action]')).toBeEnabled();
    await expect(page.locator('#proposals-list [data-proposal-action="approve"]')).toBeEnabled();
    await expect(page.locator('#chat-consent')).not.toBeChecked();
    await expect(page.locator('#conversation')).not.toContainText('Laat antwoord');
  } finally { release('Laat antwoord dat na intrekken niet in het gesprek mag komen.'); }
  expect(providerRequests).toBe(1);
  checked.verify();
});

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
  await addLocal(page, 'task', 'Een lokale taak met extra grote tekst');
  await page.locator('#proposals-list [data-proposal-action="approve"]').click();
  await addLocal(page, 'memory', 'Nog te bekijken');
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
    welcomeWordLines: (() => {
      const heading = document.querySelector('#welcome-title'), text = heading.firstChild;
      const range = document.createRange();
      range.setStart(text, text.textContent.indexOf('overzicht.'));
      range.setEnd(text, text.textContent.length);
      return new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size;
    })(),
    shoppingWordLines: (() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#shopping-title'));
      return new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size;
    })(),
    viewport: document.documentElement.clientWidth,
    width: document.documentElement.scrollWidth,
    controls: [...document.querySelectorAll('button:not([hidden]), textarea, input, select, summary')]
      .filter(element => element.getClientRects().length && !element.closest('[hidden]'))
      .map(element => {
        const target = element.matches('input[type="checkbox"]') ? element.closest('label') ?? element : element;
        const box = target.getBoundingClientRect();
        return { id: element.id, width: box.width, height: box.height };
      })
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.rootFont).toBe(32);
  expect(metrics.welcomeWordLines).toBe(1);
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
