import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startReviewServer } from '../../scripts/serve-rio-unified-preview.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(repository, 'render-dist');
const ROOT_CACHE = 'palaco-rio-shell-v67-private-workspace-entry';
const HARA_ASSETS = ['/hara/', '/hara/index.html', '/hara/app.css', '/hara/app.js', '/hara/reference.jpg'];
const REFERENCE_SHA256 = 'c6b7fa7adf66fbd6aeb58fbd0198e48f1c38fb1f5870aa87d7181076ee164de6';
const previousRelation = {
  statement: 'H∆R∆M is the Matriarch of H∆R∆',
  explicit_evidence: 'NOT_FOUND',
  provenance_level: 'INSUFFICIENT',
  registry_record: 'NOT_FOUND',
  status: 'NOT_ESTABLISHED'
};
const declaredReview = {
  matriarch_relation: {
    statement: 'H∆R∆M is the Matriarch of H∆R∆',
    relation_type: 'MATRIARCH',
    source: 'H∆R∆M',
    target: 'H∆R∆',
    status: 'CONFIRMED',
    basis: 'PERSONAL_DECLARATION',
    declared_by: 'Maurits',
    declared_on: '2026-10-26',
    scope: ['lineage', 'hierarchy', 'family_structure'],
    provenance_level: 'DIRECT_USER_DECLARATION',
    independent_verification: 'NOT_PERFORMED',
    registry_record: 'DRAFT_RECORD'
  },
  previous_r3c_result: previousRelation,
  effects: {
    identity_merge: false,
    capability_inheritance: false,
    authority_inheritance: false,
    namespace_inheritance: false,
    issuer_inheritance: false,
    signer_inheritance: false,
    runtime_execution: false,
    activation: 'INACTIVE'
  }
};
let fixture;

test.beforeAll(async () => {
  execFileSync(process.execPath, ['scripts/build-rio-unified-preview.mjs'], { cwd: repository, stdio: 'pipe' });
  fixture = await startReviewServer({ directory: output,
    manifestPath: resolve(repository, 'artifacts/rio-unified-preview-build.json'), port: 0 });
});
test.afterAll(async () => { await fixture?.close(); });

async function isolated(browser, project, overrides = {}) {
  const { viewport, isMobile, hasTouch } = project.use;
  const context = await browser.newContext({ viewport, isMobile, hasTouch, locale: 'en-US', ...overrides });
  const errors = [], traffic = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  context.on('request', request => traffic.push({ url: request.url(), method: request.method() }));
  return { context, errors, traffic, async verify() {
    expect(errors).toEqual([]);
    expect(traffic.filter(row => row.method !== 'GET')).toEqual([]);
    expect(traffic.filter(row => new URL(row.url).pathname.startsWith('/api/'))).toEqual([]);
    expect(traffic.filter(row => /^https?:/.test(row.url) && new URL(row.url).origin !== fixture.origin)).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  } };
}

async function reviewRecord(page) {
  const record = page.locator('#matriarch-record');
  await expect(record).toHaveJSProperty('tagName', 'PRE');
  const value = JSON.parse(await record.textContent());
  expect(value).toEqual(declaredReview);
  const canonical = JSON.parse(await readFile(resolve(repository,
    'docs/architecture/reviews/hara-matriarch-maurits-20261026.json'), 'utf8'));
  expect(canonical).toEqual(declaredReview);
  expect(value).toEqual(canonical);
  return value;
}

async function boundaries(page) {
  await expect(page).toHaveTitle('HARA · H∆R∆M Human Interface');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('data-preview-mode', 'read-only');
  await expect(page.locator('#matriarch-review')).toBeVisible();
  await expect(page.locator('#matriarch-review')).toHaveAttribute('data-review-status', 'CONFIRMED');
  await expect(page.locator('#matriarch-review h2')).toHaveText('Door Maurits vastgesteld.');
  await expect(page.locator('#review-gate')).toContainText('OPEN');
  await expect(page.locator('#connect-elixers')).toBeDisabled();
  await expect(page.locator('#connect-elixers')).toHaveAttribute('aria-describedby', 'connection-boundary');
  await expect(page.locator('#hara-runtime-link')).toHaveAttribute('href', 'http://127.0.0.1:4193/');
  await expect(page.locator('#hara-runtime-link')).toHaveAttribute('target', '_blank');
  await expect(page.locator('#hara-runtime-link')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#hara-runtime-link')).toContainText('deze computer');
  await expect(page.locator('#connection-boundary')).toContainText('activatie blijven geblokkeerd');
  await expect(page.locator('form, input, textarea, select')).toHaveCount(0);
}

test('HARA preserves Maurits’s declared Matriarch relation, prior review and separate inactive authority boundaries', async ({ browser }, info) => {
  const checked = await isolated(browser, info.project), page = await checked.context.newPage();
  try {
    await page.goto(fixture.origin + '/hara/');
    await boundaries(page);
    const before = await reviewRecord(page);
    await expect(page.locator('.route-panel')).toHaveCount(4);
    for (const id of ['citadel', 'architecture', 'provenance', 'elixers']) {
      await expect(page.locator('#' + id)).toHaveJSProperty('tagName', 'DETAILS');
      await expect(page.locator('#' + id + ' > summary')).toHaveCount(1);
    }
    await expect(page.locator('#citadel')).toHaveAttribute('open', '');
    for (const id of ['architecture', 'provenance', 'elixers']) await page.locator('#' + id + ' > summary').click();
    const body = await page.locator('body').innerText();
    expect(body).toContain('Door Maurits vastgesteld.');
    const criteria = {
      M1: /expliciet[^.]*MATRIARCH/, M2: /H∆R∆ expliciet als doel/, M3: /H∆R∆M en H∆R∆ afzonderlijk/,
      P1: /architectuurdocumenten[^.]*registryrecords/, P2: /SOURCE → AUTHOR → REVIEW/, P3: /Minimaal REVIEWED/,
      G1: /identity-[^.]*capability-[^.]*authority-[^.]*provenancecontracten/,
      G2: /MATRIARCH verleent geen authority/, G3: /erft geen PRESENT, ISSUE, SIGN/
    };
    await expect(page.locator('.criteria > li')).toHaveCount(9);
    expect(await page.locator('.criteria').innerText()).not.toMatch(/\b(?:PASS|INDEPENDENTLY_VERIFIED)\b/);
    for (const [criterion, meaning] of Object.entries(criteria)) {
      const item = page.locator('#criterion-' + criterion);
      await expect(item).toBeVisible();
      const description = (await item.innerText()).replace(criterion, '').trim();
      expect(description.length, criterion + ' has its supplied definition').toBeGreaterThan(20);
      expect(description, criterion + ' is supplied text, not a missing-definition placeholder').not.toBe('UNKNOWN');
      expect(description, criterion + ' preserves its supplied boundary').toMatch(meaning);
    }
    const family = page.locator('#hara-family');
    await expect(family).toBeVisible();
    for (const name of ['HARA', 'HARAM', 'H∆R∆M', 'HARA-LAB-001', 'H∆R∆', 'CHING_CHING', 'HANNIE'])
      await expect(family).toContainText(name);
    await expect(family.locator('li')).toHaveCount(6);
    expect((await family.innerText()).match(/LEVEL_2_REVIEWED/g)?.length).toBeGreaterThanOrEqual(2);
    for (const name of ['CHING_CHING', 'HANNIE']) {
      const actor = family.locator('li').filter({ has: page.getByText(name, { exact: true }) });
      await expect(actor).toHaveCount(1);
      await expect(actor).toContainText('OBSERVED_IDENTITY / ACTOR_CANDIDATE');
      await expect(actor).toContainText('Aangeleverde R1- en R2-status: COMPLETE; LEVEL_2_REVIEWED');
      await expect(actor).toContainText('Canonical status: OPEN; capability: NOT_ASSIGNED');
    }
    await expect(family).toContainText('NOT_PROVEN_EQUIVALENT');
    await expect(page.locator('#architecture')).toContainText('geen hier onafhankelijk uitgevoerde reviews');
    await expect(page.locator('#architecture')).toContainText('Een runtime-permission voor PRESENT blijft een afzonderlijke menselijke reviewbeslissing');
    await page.locator('#architecture > summary').click();
    await page.locator('#provenance > summary').click();
    await page.locator('#elixers > summary').click();
    expect(await reviewRecord(page)).toEqual(before);
    await boundaries(page);
    await checked.verify();
  } finally { await checked.context.close(); }
});

test('explicit exploration uses native disclosures and leaves keyboard focus on the chosen summary', async ({ browser }, info) => {
  const checked = await isolated(browser, info.project), page = await checked.context.newPage();
  try {
    await page.goto(fixture.origin + '/hara/');
    const record = await reviewRecord(page);
    await page.locator('#citadel > summary').click();
    await expect(page.locator('#citadel')).not.toHaveAttribute('open', '');
    const begin = page.locator('#begin-exploration');
    await expect(begin).toHaveAttribute('href', '#citadel');
    await begin.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#citadel')).toHaveAttribute('open', '');
    await expect(page.locator('#citadel > summary')).toBeFocused();
    for (const id of ['architecture', 'provenance', 'elixers']) {
      const link = page.locator('a[data-guide][href="#' + id + '"]');
      await link.focus(); await page.keyboard.press('Enter');
      await expect(page.locator('#' + id)).toHaveAttribute('open', '');
      await expect(page.locator('#' + id + ' > summary')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#' + id)).not.toHaveAttribute('open', '');
    }
    expect(await reviewRecord(page)).toEqual(record);
    await checked.verify();
  } finally { await checked.context.close(); }
});

test('script-free HARA keeps its core content, native sections and honest inactive connection', async ({ browser }, info) => {
  const checked = await isolated(browser, info.project, { javaScriptEnabled: false }), page = await checked.context.newPage();
  let primaryError;
  try {
    await test.step('load the script-free public page', () => page.goto(fixture.origin + '/hara/'));
    await test.step('read the static boundaries and review record', async () => {
      await boundaries(page); await reviewRecord(page);
      await expect(page.locator('#begin-exploration')).toHaveAttribute('href', '#citadel');
    });
    for (const id of ['architecture', 'provenance', 'elixers']) await test.step('open native ' + id + ' with the keyboard', async () => {
      const details = page.locator('#' + id), summary = details.locator(':scope > summary');
      await summary.focus(); await expect(summary).toBeFocused(); await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await expect(details).toBeVisible();
    });
    await test.step('open the static record with native keyboard activation', async () => {
      // Keep the whole script-free route on native keyboard activation and
      // observe focus ownership before Enter toggles the record disclosure.
      const summary = page.locator('.record-detail:has(#matriarch-record) > summary');
      await summary.focus(); await expect(summary).toBeFocused(); await page.keyboard.press('Enter');
      await expect(page.locator('#matriarch-record')).toBeVisible();
    });
    await test.step('verify the script-free privacy boundaries', () => checked.verify());
  } catch (error) { primaryError = error; throw error; }
  finally {
    try { await checked.context.close(); }
    catch (error) {
      if (!primaryError) throw error;
      const detail = String(error.stack || error);
      try { await test.info().attach('script-free-secondary-cleanup-error', { body: detail, contentType: 'text/plain' }); }
      catch { console.warn('Secondary script-free cleanup failure: ' + detail); }
    }
  }
});

test('standalone HARA neither reads nor writes storage or cookies and serves the exact supplied JPEG', async ({ browser }, info) => {
  const checked = await isolated(browser, info.project);
  await checked.context.addInitScript(() => {
    window.__haraStorageAccess = [];
    for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, {
      get() { window.__haraStorageAccess.push(name); throw new Error('TST_HARA_STORAGE_FORBIDDEN'); }
    });
    Object.defineProperty(document, 'cookie', {
      get() { window.__haraStorageAccess.push('cookie:get'); return ''; },
      set() { window.__haraStorageAccess.push('cookie:set'); throw new Error('TST_HARA_COOKIE_FORBIDDEN'); }
    });
  });
  const page = await checked.context.newPage();
  try {
    await page.goto(fixture.origin + '/hara/');
    const record = await reviewRecord(page);
    await page.locator('#begin-exploration').click();
    for (const id of ['architecture', 'provenance', 'elixers']) await page.locator('#' + id + ' > summary').click();
    await expect.poll(() => page.locator('#hara-reference').evaluate(image => ({ complete: image.complete,
      width: image.naturalWidth, height: image.naturalHeight }))).toEqual({ complete: true, width: 506, height: 257 });
    await expect(page.locator('#hara-reference')).toHaveAttribute('src', '/hara/reference.jpg');
    const response = await checked.context.request.get(fixture.origin + '/hara/reference.jpg');
    expect(response.status()).toBe(200); expect(response.headers()['content-type']).toBe('image/jpeg');
    const bytes = await response.body(); expect(bytes.length).toBe(31511);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(REFERENCE_SHA256);
    expect(bytes.equals(await readFile(resolve(output, 'hara/reference.jpg')))).toBe(true);
    expect(await page.evaluate(() => window.__haraStorageAccess)).toEqual([]);
    expect(await reviewRecord(page)).toEqual(record);
    await checked.verify();
  } finally { await checked.context.close(); }
});

test('HARA stays readable with 320px doubled text and loads its complete reference genuinely offline', async ({ browser }, info) => {
  const checked = await isolated(browser, info.project), page = await checked.context.newPage();
  try {
    await page.goto(fixture.origin + '/');
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration(location.origin + '/'))?.active?.state)).toBe('activated');
    if (await page.evaluate(() => !navigator.serviceWorker.controller)) await page.reload();
    expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(fixture.origin + '/sw.js');
    expect(await page.evaluate(async ({ name, paths }) => {
      const cache = await caches.open(name); return Promise.all(paths.map(async path => Boolean(await cache.match(path))));
    }, { name: ROOT_CACHE, paths: HARA_ASSETS })).toEqual(HARA_ASSETS.map(() => true));
    await checked.context.setOffline(true);
    const response = await page.goto(fixture.origin + '/hara/');
    expect(response.fromServiceWorker()).toBe(true);
    for (const variant of [{ width: 320, height: 900, font: 32 }, { width: 1440, height: 900, font: 16 }]) {
      await page.setViewportSize({ width: variant.width, height: variant.height });
      await page.evaluate(font => {
        document.documentElement.style.fontSize = font + 'px'; document.body.style.fontSize = font + 'px';
      }, variant.font);
      await boundaries(page);
      const layout = await page.evaluate(() => ({
        width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
        font: parseFloat(getComputedStyle(document.documentElement).fontSize),
        headingWordLines: (() => {
          const node = document.querySelector('#review-title').firstChild;
          const range = document.createRange(), start = node.textContent.indexOf('vastgesteld.');
          range.setStart(node, start); range.setEnd(node, start + 'vastgesteld.'.length);
          return [...new Set([...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
            .map(rect => Math.round(rect.top)))].length;
        })(),
        controls: [...document.querySelectorAll('a[data-guide], details > summary, #connect-elixers')].map(element => {
          const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height };
        }).filter(rect => rect.width > 0 && rect.height > 0)
      }));
      expect(layout.font).toBe(variant.font); expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
      expect(layout.headingWordLines, 'vastgesteld remains a whole readable word').toBe(1);
      expect(layout.controls.length).toBeGreaterThanOrEqual(9);
      expect(layout.controls.every(rect => rect.width >= 44 && rect.height >= 44)).toBe(true);
      await page.locator('#begin-exploration').focus(); await page.keyboard.press('Enter');
      await expect(page.locator('#citadel > summary')).toBeFocused();
      await expect.poll(() => page.locator('#hara-reference').evaluate(image => image.complete && image.naturalWidth === 506 && image.naturalHeight === 257)).toBe(true);
      await reviewRecord(page);
    }
    const reload = await page.reload(); expect(reload.fromServiceWorker()).toBe(true);
    await reviewRecord(page); await boundaries(page); await checked.verify();
  } finally { await checked.context.close(); }
});
