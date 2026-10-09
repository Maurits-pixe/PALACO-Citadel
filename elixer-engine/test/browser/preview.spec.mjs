import { test, expect } from '@playwright/test';

async function selectScenario(page, scenario) {
  await page.locator('#scenario').selectOption(scenario);
  await expect(page.locator('#views')).toBeVisible();
  await expect(page.locator('#status')).toContainText('ELIXER en widget delen resultaat');
}
async function expectSharedSurfaces(page) {
  const full = page.locator('#full');
  const widget = page.locator('#widget');
  const id = await full.getAttribute('data-canonical-result-id');
  const digest = await full.getAttribute('data-canonical-digest');
  expect(id).toBeTruthy();
  expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  await expect(widget).toHaveAttribute('data-canonical-result-id', id);
  await expect(widget).toHaveAttribute('data-canonical-digest', digest);
  for (const field of ['resultType', 'state-package', 'state-conformance', 'state-authority', 'state-distribution', 'state-activation', 'state-freshness', 'state-execution', 'scope', 'consent', 'authorization', 'provenance', 'verification', 'uncertainty', 'reasonCodes', 'dissent', 'receiptId', 'traceHash']) {
    const fullValue = await full.locator('[data-field="' + field + '"]').textContent();
    expect(await widget.locator('[data-field="' + field + '"]').textContent()).toBe(fullValue);
  }
  for (const surface of [full, widget]) {
    await expect(surface.locator('[data-field="state-authority"]')).toHaveText('NONE');
    await expect(surface.locator('[data-field="state-distribution"]')).toHaveText('NOT_ALLOWED');
    await expect(surface.locator('[data-field="state-activation"]')).toHaveText('INACTIVE');
    await expect(surface.locator('[data-field="state-execution"]')).not.toHaveText('COMMITTED');
  }
}

test('full ELIXER and widget show the same canonical state and all independent axes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#views')).toBeVisible();
  await expect(page.locator('.lab-notice')).toContainText('Synthetisch laboratorium');
  await expectSharedSurfaces(page);
  await expect(page.locator('#full [data-field="receiptId"]')).not.toHaveText('UNKNOWN');
});

test('revocation, expiry, tampering and execution limits remain visible on both surfaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#views')).toBeVisible();
  for (const [scenario, expectedType] of [['revoked', 'REVOKED'], ['expired', 'EXPIRED'], ['tampered', 'BLOCKED']]) {
    await selectScenario(page, scenario);
    await expect(page.locator('#full [data-field="resultType"]')).toHaveText(expectedType);
    await expectSharedSurfaces(page);
  }
  await selectScenario(page, 'execution');
  await expect(page.locator('#full [data-field="resultType"]')).not.toHaveText('EXECUTED_WITH_RECEIPT');
  await expectSharedSurfaces(page);
});

test('missing consent removes private scope and persona dissent remains visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#views')).toBeVisible();
  await selectScenario(page, 'no-consent');
  await expect(page.locator('#full [data-field="scope"]')).not.toContainText('household.read');
  await expectSharedSurfaces(page);
  await selectScenario(page, 'conflict');
  await expect(page.locator('#full [data-field="dissent"]')).not.toContainText('Geen vermeldingen.');
  await expectSharedSurfaces(page);
});

test('the widget retains all state fields on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#views')).toBeVisible();
  await expectSharedSurfaces(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the local preview rejects mutation, arbitrary scenarios and foreign origins', async ({ request }) => {
  expect((await request.post('/api/state?scenario=ready', { data: { execute: true } })).status()).toBe(405);
  expect((await request.get('/api/state?scenario=private-data')).status()).toBe(400);
  expect((await request.get('/api/state?scenario=ready&scenario=revoked')).status()).toBe(400);
  expect((await request.get('/api/state?scenario=ready&actor=someone')).status()).toBe(400);
  expect((await request.get('/api/state?scenario=ready', { headers: { Origin: 'https://example.invalid' } })).status()).toBe(403);
  expect((await request.get('/api/state?scenario=ready', { headers: { Host: 'example.invalid' } })).status()).toBe(403);
  expect((await request.get('/src/fixtures.mjs')).status()).toBe(404);
  const response = await request.get('/api/state?scenario=ready');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  const data = await response.json();
  expect(data.full.result).toEqual(data.canonical);
  expect(data.widget.result).toEqual(data.canonical);
  expect(data.full.canonicalDigest).toBe(data.widget.canonicalDigest);
});
