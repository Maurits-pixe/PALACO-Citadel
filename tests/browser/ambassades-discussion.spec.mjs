import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const languages = ['nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ar', 'eo'];
const outcomes = ['IN_DOUBT', 'USABLE_FOR_DISCUSSION', 'CHANGE_SUGGESTED', 'INSUFFICIENT_SUPPORT', 'DISPUTED'];
// Independent source oracle: Issue #38 v0.2 §4 and its bound #37/R6.99 source versions.
const pairs = [
  'AMB01-F03@v0.2', 'AMB01-F05@v0.2', 'AMB01-F07@v0.2',
  'AMB02-F04@v0.2', 'AMB02-F03@v0.2', 'AMB02-F07@v0.2',
  'AMB03-F01@v0.2', 'AMB03-F03@v0.2', 'AMB03-F02@v0.2',
  'AMB04-F01@v0.2', 'AMB04-F03@v0.2', 'AMB04-F07@v0.2',
  'AMB05-F01@v0.2', 'AMB05-F02@v0.2', 'AMB05-F06@v0.2',
  'AMB06-F03@v0.2', 'AMB06-F04@v0.2', 'AMB06-F07@v0.2',
  'AMB07-F01@v0.2', 'AMB07-F03@v0.2', 'AMB07-F07@v0.2',
  'AMB08-F04@v0.2', 'AMB08-F03@v0.2', 'AMB08-F06@v0.2',
  'AMB09-F01@v0.2', 'AMB09-F02@v0.2', 'AMB09-F03@v0.2',
  'AMB10-F01@v0.2', 'AMB10-F02@v0.2', 'AMB10-F05@v0.2',
  'AMB11-F04@v0.2', 'AMB11-F05@v0.2', 'AMB11-F07@v0.2',
  'AMB12-F01@v0.2', 'AMB12-F06@v0.2', 'AMB12-F07@v0.2',
];
const A = 'AMB03-F02@v0.2';
const B = 'AMB05-F02@v0.2';
const expectedProposal = {
  issueUrl: 'https://github.com/Maurits-pixe/PALACO-Citadel/issues/38',
  version: 'v0.2', blob: '2293d1f957b4b69c99676824fe64fd9b62ad2333', snapshotDate: '2026-10-12',
  status: 'PROPOSED_NONBINDING', reviewStatus: 'DRAFT_REVIEW_OPEN',
};
const expectedSources = {
  historicalCommit: 'bcf2684d2d9c3ee5bf68a06ccf09bb856bb195bd',
  historicalBlob: '879c79b9558eef39563d55b4815c0924617148d1',
  bindingIssueUrl: 'https://github.com/Maurits-pixe/PALACO-Citadel/issues/37',
  seatIssueUrl: 'https://github.com/Maurits-pixe/PALACO-Citadel/issues/33',
};
const expectedRelationA = {
  id: A, seat: 'PALACO-AMB-03', functionId: 'F02', functionName: 'Representative',
  portfolio: 'Scientific method and evidence', titleDutch: 'Wetenschappelijke methode & bewijs',
  reasonDutch: 'Een onderzoeks- of gebruikersperspectief herkenbaar weergeven, met toegestane bronverwijzing en expliciete aanduiding van zelfomschrijving, aangeleverde bron of interpretatie; de weergave blijft betwistbaar.',
  sharedRow: {
    artifactDutch: 'Vragenlijst die claims, bronverwijzingen en onbeantwoorde verificatievragen onderscheidt.',
    boundaryDutch: 'Geen wetenschappelijke verificatie, bewijsvalidatie of waarheidsvaststelling.',
    reviewQuestionDutch: 'Welke bewijsclaims zijn nog niet zelfstandig gecontroleerd, ook als perspectieven overeenstemmen?',
  },
};
const expectedReviewer = { identityStatus: 'UNVERIFIED', eligibility: 'NOT_ESTABLISHED', conflictStatus: 'UNKNOWN' };
const expectedAuthority = {
  independentAcceptance: false, ratification: false, appointment: false, safetyApproval: false,
  accountAccess: false, merge: false, release: false, execution: false,
};
const draftA = {
  outcome: 'DISPUTED',
  argument: '  Bronherkomst vraagt uitleg.\nDeze notitie stelt geen waarheid vast.  ',
  sources: 'Issue #38 v0.2 §4; alleen een toegestane bronverwijzing.',
  concerns: 'Een aangeleverd perspectief blijft betwistbaar.',
  dissent: 'Ik betwist de herkomst; laat dit bezwaar staan.',
  reopenWhen: 'Heropen wanneer een nieuwe bronversie wordt ingebracht.',
};
const draftB = {
  outcome: 'CHANGE_SUGGESTED',
  argument: 'Bewaar de weigering voordat een vervolgstap wordt besproken.',
  sources: 'Issue #38, AMB05-F02@v0.2.',
  concerns: 'Een weergegeven belang verleent geen mandaat.',
  dissent: 'Een weigering wordt door instemming van anderen niet opgeheven.',
  reopenWhen: 'Bespreek opnieuw bij een expliciete, toegestane correctie.',
};
const fields = {
  argument: '#note-argument', sources: '#note-sources', concerns: '#note-concerns',
  dissent: '#note-dissent', reopenWhen: '#note-reopen',
};
async function ready(page) {
  await expect.poll(() => page.evaluate(async () => Boolean(await window.PalacoI18n?.ready))).toBe(true);
  await expect(page.locator('#functies [data-function="ALL"]')).toBeEnabled();
  await expect(page.locator('#discussion-form')).toBeVisible();
}
async function open(page, language = 'nl') {
  await page.goto('/ambassades/index.html?lang=' + language + '#functies');
  await ready(page);
}
async function bind(page, id) {
  await page.locator('#note-relation').selectOption(id);
  await expect(page.locator('#note-relation')).toHaveValue(id);
}
async function fillDraft(page, draft) {
  await page.locator('#note-assessment').selectOption(draft.outcome);
  for (const [name, selector] of Object.entries(fields)) await page.locator(selector).fill(draft[name]);
}
async function expectDraft(page, id, draft) {
  await expect(page.locator('#note-relation')).toHaveValue(id);
  await expect(page.locator('#note-assessment')).toHaveValue(draft.outcome);
  for (const [name, selector] of Object.entries(fields)) await expect(page.locator(selector)).toHaveValue(draft[name]);
}
async function downloadJSON(page, { keyboard = false } = {}) {
  const pending = page.waitForEvent('download');
  if (keyboard) {
    await page.locator('#note-download').focus();
    await page.keyboard.press('Enter');
  } else await page.locator('#note-download').click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.length).toBeGreaterThan(100);
  return { filename: download.suggestedFilename(), data: JSON.parse(bytes.toString('utf8')) };
}
function expectBinding(data, language) {
  expect(data.schemaVersion).toBe('palaco-contribution-discussion-note/0.1');
  expect(data.recordType).toBe('LOCAL_DISCUSSION_DRAFT');
  expect(new Date(data.createdAt).toISOString()).toBe(data.createdAt);
  expect(data.uiLanguage).toBe(language);
  expect(data.proposal).toEqual(expectedProposal);
  expect(data.sourceBindings).toEqual(expectedSources);
  expect(data.reviewer).toEqual(expectedReviewer);
  expect(data.authority).toEqual(expectedAuthority);
}
async function attemptInvalidSubmit(page, downloads) {
  const before = downloads.length;
  if (await page.locator('#note-download').isEnabled()) await page.locator('#note-download').click();
  expect(downloads).toHaveLength(before);
}

test('a real downloaded note binds the exact v0.2 relation and grants no authority', async ({ page }) => {
  await open(page, 'en');
  expect(await page.locator('#note-relation option').evaluateAll(options =>
    options.map(option => option.value).filter(Boolean).sort())).toEqual([...pairs].sort());
  expect(await page.locator('#note-assessment option').evaluateAll(options =>
    options.map(option => option.value).sort())).toEqual([...outcomes].sort());
  const row = page.locator('.fx-row[data-seat="PALACO-AMB-03"]');
  await row.locator('summary').click();
  await row.locator('[data-note-relation="' + A + '"]').click();
  await expect(page.locator('#note-argument')).toBeFocused();
  await expect(page.locator('#note-context')).toContainText(A);
  await expect(page.locator('#note-context')).toContainText('Representative');
  await fillDraft(page, draftA);
  const result = await downloadJSON(page);
  expect(result.filename).toBe('PALACO-bespreeknotitie-AMB03-F02-v0.2.json');
  expectBinding(result.data, 'en');
  expect(result.data.relation).toEqual(expectedRelationA);
  expect(result.data.assessment).toEqual(draftA);
  await expectDraft(page, A, draftA);
});

test('A to B to A restores separate bound drafts and all outcomes preserve dissent', async ({ page }) => {
  await open(page);
  await bind(page, A);
  await fillDraft(page, draftA);
  await bind(page, B);
  await fillDraft(page, draftB);
  await bind(page, A);
  await expectDraft(page, A, draftA);
  for (const outcome of outcomes) {
    await page.locator('#note-assessment').selectOption(outcome);
    const expected = { ...draftA, outcome };
    await expectDraft(page, A, expected);
    const { data } = await downloadJSON(page);
    expectBinding(data, 'nl');
    expect(data.relation).toEqual(expectedRelationA);
    expect(data.assessment).toEqual(expected);
  }
  await bind(page, B);
  await expectDraft(page, B, draftB);
  const { data } = await downloadJSON(page);
  expect(data.relation.id).toBe(B);
  expect(data.relation.seat).toBe('PALACO-AMB-05');
  expect(data.assessment).toEqual(draftB);
  expect(data.authority).toEqual(expectedAuthority);
});

test('function filtering and eleven languages never rebind draft prose or erase another relation', async ({ page, request }) => {
  const catalog = await (await request.get('/ambassades/locales.json')).json();
  await open(page);
  await bind(page, A);
  await fillDraft(page, draftA);
  await bind(page, B);
  await fillDraft(page, draftB);
  await bind(page, A);
  await page.locator('#functies [data-function="F07"]').click();
  await expect(page.locator('.fx-row[data-seat="PALACO-AMB-03"]')).toHaveCount(0);
  await expectDraft(page, A, draftA);
  for (const language of languages) {
    await page.locator('#language').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    await expectDraft(page, A, draftA);
    await expect(page.locator('#functies [data-function="F07"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#note-context')).toContainText(A);
    await expect(page.locator('#note-context')).toContainText('Representative');
    await expect(page.locator('#note-context')).toContainText(catalog[language].fx_AMB03_F02_reason);
    await expect(page.locator('#note-context')).toContainText(catalog[language].fx_AMB03_bound);
    await expect(page.locator('#note-context')).toContainText(catalog[language].fx_AMB03_question);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const { data } = await downloadJSON(page);
  expectBinding(data, 'eo');
  expect(data.relation).toEqual(expectedRelationA);
  expect(data.assessment).toEqual(draftA);
  await bind(page, B);
  await expectDraft(page, B, draftB);
});

test('native keyboard activation reaches the bound argument and downloads a note', async ({ page }) => {
  await open(page);
  const row = page.locator('.fx-row[data-seat="PALACO-AMB-03"]');
  await row.locator('summary').focus();
  await page.keyboard.press('Enter');
  await row.locator('[data-note-relation="' + A + '"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#note-argument')).toBeFocused();
  await page.keyboard.type('Een vraag via het toetsenbord.');
  for (const selector of ['#note-relation', '#note-assessment', ...Object.values(fields)]) {
    await expect(page.locator(selector)).toHaveAccessibleName(/\S/);
  }
  for (const [name, selector] of Object.entries(fields)) {
    await expect(page.locator(selector)).toHaveAttribute('maxlength', name === 'reopenWhen' ? '1000' : '2000');
  }
  const { data } = await downloadJSON(page, { keyboard: true });
  expectBinding(data, 'nl');
  expect(data.relation).toEqual(expectedRelationA);
  expect(data.assessment.argument).toBe('Een vraag via het toetsenbord.');
  expect(data.assessment.outcome).toBe('IN_DOUBT');
  expect(data.assessment.dissent).toBe('');
});

test('invalid inputs produce no download and cannot alter source binding or unrelated draft text', async ({ page }) => {
  const downloads = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await open(page);
  await bind(page, A);
  await fillDraft(page, draftA);
  for (const [selector, invalid] of [
    ['#note-argument', '   '],
    ['#note-argument', 'x'.repeat(2001)],
    ['#note-sources', 'x'.repeat(2001)],
    ['#note-reopen', 'x'.repeat(1001)],
  ]) {
    await page.locator(selector).evaluate((element, value) => {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, invalid);
    await attemptInvalidSubmit(page, downloads);
    await expect(page.locator('#note-dissent')).toHaveValue(draftA.dissent);
    await fillDraft(page, draftA);
  }
  await page.locator('#note-assessment').evaluate(element => {
    element.add(new Option('Invalid authority claim', 'RATIFIED'));
    element.value = 'RATIFIED';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await attemptInvalidSubmit(page, downloads);
  await page.locator('#note-assessment').selectOption(draftA.outcome);
  await page.locator('#note-relation').evaluate(element => {
    element.add(new Option('Old proposal version', 'AMB03-F02@v0.1'));
    element.value = 'AMB03-F02@v0.1';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#note-relation')).toHaveValue(A);
  await expectDraft(page, A, draftA);
  expect(downloads).toEqual([]);
  // Bypass the rejected change handler to verify the submit guard independently.
  await page.locator('#note-relation').evaluate(element => { element.value = 'AMB03-F02@v0.1'; });
  await attemptInvalidSubmit(page, downloads);
  expect(downloads).toEqual([]);
  await bind(page, A);
  await expectDraft(page, A, draftA);
  const { data } = await downloadJSON(page);
  expectBinding(data, 'nl');
  expect(data.relation).toEqual(expectedRelationA);
  expect(data.assessment).toEqual(draftA);
});

test('clear resets only the selected draft and preserves another relation and function selection', async ({ page }) => {
  await open(page);
  await bind(page, A);
  await fillDraft(page, draftA);
  await bind(page, B);
  await fillDraft(page, draftB);
  await bind(page, A);
  await page.locator('#functies [data-function="F07"]').click();
  await page.locator('#note-clear').click();
  await expect(page.locator('#note-argument')).toBeFocused();
  const empty = { outcome: 'IN_DOUBT', argument: '', sources: '', concerns: '', dissent: '', reopenWhen: '' };
  await expectDraft(page, A, empty);
  await expect(page.locator('#functies [data-function="F07"]')).toHaveAttribute('aria-pressed', 'true');
  await bind(page, B);
  await expectDraft(page, B, draftB);
  const { data } = await downloadJSON(page);
  expect(data.relation.id).toBe(B);
  expect(data.assessment).toEqual(draftB);
  await bind(page, A);
  await expectDraft(page, A, empty);
});

test('missing data, altered source bytes and missing WebCrypto keep the discussion form closed', async ({ page, request }) => {
  const catalog = await (await request.get('/ambassades/locales.json')).json();
  const sourceResponse = await request.get('/ambassades/function-contributions.json');
  expect(sourceResponse.ok()).toBe(true);
  const sourceBody = await sourceResponse.text();
  expect(createHash('sha256').update(sourceBody, 'utf8').digest('hex'))
    .toBe('a0bec5d1eca6a0f73b855d833d691ad4dfaac1d581c831fd33fd8d06be53af2a');
  const alter = (before, after) => {
    expect(sourceBody).toContain(before);
    const changed = sourceBody.replace(before, after);
    expect(changed).not.toBe(sourceBody);
    return changed;
  };
  const changedReason = alter(expectedRelationA.reasonDutch, expectedRelationA.reasonDutch + ' Deze reden is veranderd.');
  const changedPortfolio = alter(expectedRelationA.portfolio, 'Altered portfolio');
  // These two fixtures retain valid version/blob/status metadata; the text change must still close the form.
  for (const changed of [changedReason, changedPortfolio]) {
    const parsed = JSON.parse(changed);
    expect(parsed.proposalVersion).toBe('v0.2');
    expect(parsed.sources.proposalBlob).toBe(expectedProposal.blob);
    expect(parsed.status).toBe('PROPOSED_NONBINDING');
    expect(parsed.reviewStatus).toBe('DRAFT_REVIEW_OPEN');
    expect(parsed.authorityGranted).toBe(false);
  }
  let responses = 0;
  let currentBody = sourceBody;
  await page.route('**/function-contributions.json', route => {
    responses++;
    return currentBody === null ? route.abort() : route.fulfill({
      contentType: 'application/json', body: currentBody,
    });
  });
  // A control uses the actual canonical bytes, not JSON that was parsed and serialized again.
  await open(page, 'en');
  await expect(page.locator('#note-relation option')).toHaveCount(37);
  async function expectClosed(body) {
    currentBody = body;
    const previous = responses;
    await page.goto('/ambassades/index.html?lang=en#functies');
    await expect.poll(() => page.evaluate(async () => Boolean(await window.PalacoI18n?.ready))).toBe(true);
    await expect.poll(() => responses).toBe(previous + 1);
    await expect(page.locator('#function-status')).toHaveText(catalog.en.fx_unavailable);
    await expect(page.locator('#discussion-form')).toBeHidden();
    await expect(page.locator('#note-download')).toBeHidden();
    await expect(page.locator('.post:visible')).toHaveCount(12);
    await expect(page.locator('#function-results [data-relation]')).toHaveCount(36);
  }
  for (const body of [
    null,
    alter('"proposalVersion": "v0.2"', '"proposalVersion": "v0.1"'),
    alter(expectedProposal.blob, '0000000000000000000000000000000000000000'),
    changedReason,
    changedPortfolio,
  ]) await expectClosed(body);
  await page.addInitScript(() => Object.defineProperty(window.crypto, 'subtle', {
    value: undefined, configurable: true,
  }));
  await expectClosed(sourceBody);
  expect(await page.evaluate(() => typeof window.crypto.subtle)).toBe('undefined');
});

test('discussion notes use no network or browser storage and reload loses all drafts', async ({ page }) => {
  await open(page);
  const requests = [];
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  await page.evaluate(() => {
    window.discussionStorageCalls = [];
    for (const name of ['getItem', 'setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function (...args) {
        window.discussionStorageCalls.push(name);
        return Reflect.apply(original, this, args);
      };
    }
  });
  await bind(page, A);
  await fillDraft(page, draftA);
  await bind(page, B);
  await fillDraft(page, draftB);
  await bind(page, A);
  await downloadJSON(page);
  await page.locator('#note-clear').click();
  await bind(page, B);
  await expectDraft(page, B, draftB);
  await downloadJSON(page);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => window.discussionStorageCalls)).toEqual([]);
  await page.reload();
  await ready(page);
  await expect(page.locator('#note-relation')).toHaveValue('');
  const empty = { outcome: 'IN_DOUBT', argument: '', sources: '', concerns: '', dissent: '', reopenWhen: '' };
  await bind(page, A);
  await expectDraft(page, A, empty);
  await bind(page, B);
  await expectDraft(page, B, empty);
});
