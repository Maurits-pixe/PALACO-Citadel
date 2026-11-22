import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:4177/index.html';

test.beforeEach(async ({ page }) => {
  await page.goto(origin);
  await expect(page.locator('main')).toBeVisible();
  await page.getByRole('button', { name: 'Ontvangstruimte' }).click();
});

test('offline module navigates to the nine sections', async ({ page }) => {
  await expect(page.locator('nav [data-tab]')).toHaveCount(9);
  await expect(page.locator('#inbox')).toBeVisible();
  await page.getByRole('button', { name: 'Soortenbibliotheek' }).click();
  await expect(page.locator('#speciesCards article')).toHaveCount(8);
});

test('ten isolated receiver checks pass without changing local register', async ({ page }) => {
  const before = await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'));
  await page.locator('#handoffSelftest').click();
  await expect(page.locator('#handoffSelftestResult')).toContainText('10/10 controles geslaagd');
  const after = await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'));
  expect(after).toBe(before);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#handoffReport').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('citadel-ontvangst-qa-v08.json');
});

test('unverified full package requires consent and rejects replay', async ({ page }) => {
  const record = {
    id: 'playwright-import-001', title: 'Demo boom', category: 'Flora',
    conceptualArea: 'Het Woud', verification: 'persoonlijke observatie',
    description: 'Lokale testwaarneming', observedAt: '2026-11-01T12:00:00.000Z'
  };
  const packet = {
    schema: 'palaco-citadel-handoff-v1', source: 'citadel/samenleving-natuur',
    privacy: 'full-user-controlled', records: [record]
  };
  const file = { name: 'handoff.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) };
  await page.locator('#handoffFile').setInputFiles(file);
  await expect(page.locator('#handoffNew')).toHaveText('1');
  await expect(page.locator('#handoffAccept')).toBeDisabled();
  await page.locator('#handoffConsent').check();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#handoffAccept').click();
  await expect(page.locator('#handoffStatus')).toContainText('1 nieuwe registraties');
  await expect(page.locator('#handoffPreview')).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('palaco.citadel.samenleving-natuur.v1') || '[]'));
  expect(saved).toHaveLength(1);
  expect(saved[0].verification).toBe('nog te verifiëren');
  await page.locator('#handoffFile').setInputFiles(file);
  await expect(page.locator('#handoffNew')).toHaveText('0');
  await expect(page.locator('#handoffDuplicates')).toHaveText('1');
  await expect(page.locator('#handoffAccept')).toBeDisabled();
});

test('minimal handoff is view-only and cannot be imported', async ({ page }) => {
  const packet = {
    schema: 'palaco-citadel-handoff-v1', source: 'citadel/samenleving-natuur',
    privacy: 'minimal-user-controlled',
    records: [{sequence:1,category:'Flora',conceptualArea:'Het Woud',
      verification:'nog te verifiëren',recordedMonth:'2026-11'}]
  };
  await page.locator('#handoffFile').setInputFiles({
    name: 'minimal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet))
  });
  await expect(page.locator('#handoffStatus')).toContainText('Alleen inzage');
  await page.locator('#handoffConsent').check();
  await expect(page.locator('#handoffAccept')).toBeDisabled();
});

test('a local observation survives a page reload without server synchronization', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('Testboom in het woud');
  await page.locator('#notes').fill('Lokaal en zonder account geregistreerd');
  await page.locator('#entryform button[type="submit"]').click();
  await expect(page.locator('#message')).toContainText('lokaal opgeslagen');
  await page.reload();
  await page.getByRole('button', { name: 'Levend register' }).click();
  await expect(page.locator('#records')).toContainText('Testboom in het woud');
  await expect(page.locator('#count')).toHaveText('1');
});

test('invalid transfer is rejected without mutating stored observations', async ({ page }) => {
  const before = await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'));
  const malformed = {
    schema: 'palaco-citadel-handoff-v1', source: 'citadel/samenleving-natuur',
    privacy: 'full-user-controlled',
    records: [{ id:'bad-date', title:'Test', category:'Flora',
      conceptualArea:'Het Woud', verification:'nog te verifiëren',
      description:'', observedAt:'2999-01-01T00:00:00Z' }]
  };
  await page.locator('#handoffFile').setInputFiles({
    name:'invalid.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(malformed))
  });
  await expect(page.locator('#handoffStatus')).toContainText('afgewezen');
  await expect(page.locator('#handoffAccept')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'))).toBe(before);
});

test('default handoff export omits private note, title, and record IDs', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('VERTROUWELIJKE TITEL');
  await page.locator('#notes').fill('VERTROUWELIJKE INHOUD');
  await page.locator('#entryform button[type="submit"]').click();
  await page.getByRole('button', { name: 'Leefwereldatlas' }).click();
  await expect(page.locator('#packetMinimal')).toBeChecked();
  const pending = page.waitForEvent('download');
  await page.locator('#packetExport').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('citadel-wereldatlas-minimaal.json');
  const { readFile } = await import('node:fs/promises');
  const json = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(json.privacy).toBe('minimal-user-controlled');
  expect(json.records).toHaveLength(1);
  expect(json.records[0]).not.toHaveProperty('title');
  expect(json.records[0]).not.toHaveProperty('description');
  expect(json.records[0]).not.toHaveProperty('id');
  expect(JSON.stringify(json)).not.toContain('VERTROUWELIJKE');
});

test('a pending handoff is invalidated when another tab modifies the register', async ({ page, context }) => {
  const record = { id:'external-001', title:'Andere eik', category:'Flora',
    conceptualArea:'Het Woud', verification:'nog te verifiëren',
    description:'Cross-tab controle', observedAt:'2026-11-01T12:00:00Z' };
  await page.locator('#handoffFile').setInputFiles({
    name:'pending.json', mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      schema:'palaco-citadel-handoff-v1',
      source:'citadel/samenleving-natuur', privacy:'full-user-controlled',
      records:[record]
    }))
  });
  await expect(page.locator('#handoffNew')).toHaveText('1');
  await page.locator('#handoffConsent').check();
  await expect(page.locator('#handoffAccept')).toBeEnabled();
  const second = await context.newPage();
  await second.goto(origin);
  await second.getByRole('button', { name:'Levend register' }).click();
  await second.locator('#title').fill('Waarneming vanuit tweede tab');
  await second.locator('#entryform button[type="submit"]').click();
  await expect(second.locator('#message')).toContainText('lokaal opgeslagen');
  await expect(page.locator('#handoffPreview')).toBeHidden();
  await expect(page.locator('#handoffAccept')).toBeDisabled();
  await expect(page.locator('#records')).toContainText('Waarneming vanuit tweede tab');
  await second.close();
});

test('stale storage snapshot cannot overwrite a newer register', async ({ page }) => {
  await page.getByRole('button', { name:'Levend register' }).click();
  await page.locator('#title').fill('Oud voorstel');
  await page.evaluate(() => {
    const key = 'palaco.citadel.samenleving-natuur.v1';
    localStorage.setItem(key, JSON.stringify([{
      id:'preserved-001', title:'Bewaar deze observatie', kind:'Flora',
      area:'Het Woud', verification:'persoonlijke observatie',
      notes:'Nieuwe gegevens', time:'2026-11-01T12:00:00Z'
    }]));
  });
  await page.locator('#entryform button[type="submit"]').click();
  await expect(page.locator('#message')).toContainText('overschrijving geweigerd');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('palaco.citadel.samenleving-natuur.v1')));
  expect(saved).toHaveLength(1);
  expect(saved[0].title).toBe('Bewaar deze observatie');
});

test('chapter navigation remains keyboard accessible and reports active section', async ({ page }) => {
  await page.getByRole('button', { name:'Samenleving' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#society')).toBeVisible();
  await expect(page.locator('nav [data-tab="society"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#inbox')).toBeHidden();
  await page.getByRole('button', { name:'Seizoenen & ecologie' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#seasons')).toBeVisible();
});

test('mobile layout avoids horizontal page overflow across chapters', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'mobile-chromium') return;
  const ids = ['overview','nature','society','species','seasons','atlas','timeline','inbox','register'];
  for (const id of ids) {
    await page.locator('nav [data-tab="'+id+'"]').click();
    await expect(page.locator('#'+id)).toBeVisible();
    const sizes = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }));
    expect(sizes.documentWidth, 'overflow in chapter '+id).toBeLessThanOrEqual(sizes.viewportWidth + 2);
  }
});

test('keyboard skip link moves focus to main chapter content', async ({ page }) => {
  await page.reload();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Direct naar hoofdstukinhoud' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page).toHaveURL(/#main-content$/);
});

test('user provided markup is displayed as text, never executed', async ({ page }) => {
  await page.getByRole('button', { name:'Levend register' }).click();
  await page.locator('#title').fill('<img src=x onerror=alert(1)>');
  await page.locator('#notes').fill('<script>window.CITADEL_XSS=1</script>');
  await page.locator('#entryform button[type="submit"]').click();
  await expect(page.locator('#message')).toContainText('lokaal opgeslagen');
  await expect(page.locator('#records')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#records')).toContainText('<script>window.CITADEL_XSS=1</script>');
  await expect(page.locator('#records img')).toHaveCount(0);
  await expect(page.locator('#records script')).toHaveCount(0);
  expect(await page.evaluate(() => window.CITADEL_XSS)).toBeUndefined();
});

test('invalid handoff cannot activate import confirmation', async ({ page }) => {
  await page.locator('#handoffFile').setInputFiles({
    name:'wrong-schema.json', mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({schema:'other',source:'citadel/samenleving-natuur',records:[]}))
  });
  await expect(page.locator('#handoffStatus')).toContainText('afgewezen');
  await expect(page.locator('#handoffPreview')).toBeHidden();
  await expect(page.locator('#handoffAccept')).toBeDisabled();
});

const backupRecord = (id, title = 'Eik uit back-up') => ({
  id, title, kind: 'Flora', area: 'Het Woud',
  verification: 'persoonlijke observatie', notes: 'Herstelcontrole',
  time: '2026-11-01T12:00:00Z'
});
const backupFile = entries => ({
  name:'citadel-backup.json', mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify({schema:'palaco-citadel-natuur-v1',entries}))
});

test('duplicate backup record IDs are rejected without replacing local data', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('Bestaande registratie');
  await page.locator('#entryform button[type="submit"]').click();
  const before = await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'));
  await page.locator('#importFile').setInputFiles(backupFile([
    backupRecord('duplicate-01'), backupRecord('duplicate-01','Een andere titel')
  ]));
  await expect(page.locator('#message')).toContainText('Back-up afgewezen');
  expect(await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'))).toBe(before);
});

test('malformed timestamp in backup is rejected', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#importFile').setInputFiles(backupFile([
    {...backupRecord('invalid-time'),time:'2999-01-01T12:00:00Z'}
  ]));
  await expect(page.locator('#message')).toContainText('Back-up afgewezen');
  await expect(page.locator('#count')).toHaveText('0');
});

test('cancelled backup restore preserves the existing register', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('Niet overschrijven');
  await page.locator('#entryform button[type="submit"]').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#importFile').setInputFiles(backupFile([backupRecord('restore-cancel')]));
  await expect(page.locator('#message')).toContainText('Herstel geannuleerd');
  await expect(page.locator('#records')).toContainText('Niet overschrijven');
  await expect(page.locator('#count')).toHaveText('1');
});

test('explicitly approved backup restore replaces local records', async ({ page }) => {
  await page.getByRole('button', { name: 'Levend register' }).click();
  await page.locator('#title').fill('Oude observatie');
  await page.locator('#entryform button[type="submit"]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#importFile').setInputFiles(backupFile([backupRecord('restore-approved')]));
  await expect(page.locator('#message')).toContainText('Back-up veilig hersteld');
  await expect(page.locator('#records')).toContainText('Eik uit back-up');
  await expect(page.locator('#records')).not.toContainText('Oude observatie');
  await expect(page.locator('#count')).toHaveText('1');
});

test('corrupted local JSON blocks overwrites and permits raw recovery download', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('palaco.citadel.samenleving-natuur.v1', '{INVALID_JSON'));
  await page.reload();
  await page.getByRole('button', { name: 'Levend register' }).click();
  await expect(page.locator('#storageWarning')).toBeVisible();
  await expect(page.locator('#message')).toContainText('Opslaan geblokkeerd');
  await page.locator('#title').fill('Mag niet opgeslagen worden');
  await page.locator('#entryform button[type="submit"]').click();
  await expect(page.locator('#message')).toContainText('Opslaan geblokkeerd');
  expect(await page.evaluate(() => localStorage.getItem('palaco.citadel.samenleving-natuur.v1'))).toBe('{INVALID_JSON');
  const pending = page.waitForEvent('download');
  await page.locator('#rawStorageExport').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('citadel-onbewerkte-opslag.txt');
  const {readFile} = await import('node:fs/promises');
  expect(await readFile(await download.path(), 'utf8')).toBe('{INVALID_JSON');
});

test('invalid records are not silently dropped and replaced by later saves', async ({ page }) => {
  const key = 'palaco.citadel.samenleving-natuur.v1';
  const raw = JSON.stringify([{
    id:'preserve-but-invalid',title:'Oude waarneming',kind:'Flora',
    area:'Onbekend gebied',verification:'persoonlijke observatie',notes:'Unieke tekst',
    time:'2026-11-01T12:00:00Z'
  }]);
  await page.evaluate(({key,raw}) => localStorage.setItem(key,raw),{key,raw});
  await page.reload();
  await page.getByRole('button', { name: 'Levend register' }).click();
  await expect(page.locator('#storageWarning')).toBeVisible();
  await page.locator('#title').fill('Nieuwe registratie');
  await page.locator('#entryform button[type="submit"]').click();
  expect(await page.evaluate(key => localStorage.getItem(key),key)).toBe(raw);
});

test('corrupt storage can recover from a valid backup only after backup acknowledgement', async ({page}) => {
  const key='palaco.citadel.samenleving-natuur.v1';
  await page.evaluate(key=>localStorage.setItem(key,'{DAMAGED'),key);
  await page.reload();
  await page.getByRole('button',{name:'Levend register'}).click();
  await page.locator('#importFile').setInputFiles(backupFile([backupRecord('recovered-from-backup')]));
  await expect(page.locator('#message')).toContainText('Herstel geblokkeerd');
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe('{DAMAGED');
  await page.locator('#rawStorageExport').click();
  await page.locator('#recoverConsent').check();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#importFile').setInputFiles(backupFile([backupRecord('recovered-from-backup')]));
  await expect(page.locator('#message')).toContainText('Back-up veilig hersteld');
  await expect(page.locator('#storageWarning')).toBeHidden();
  await expect(page.locator('#records')).toContainText('Eik uit back-up');
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  expect(saved).toHaveLength(1);
  expect(saved[0].id).toBe('recovered-from-backup');
});

test('empty recovery requires two confirmations and can be cancelled safely', async ({page}) => {
  const key='palaco.citadel.samenleving-natuur.v1';
  await page.evaluate(key=>localStorage.setItem(key,'{BROKEN'),key);
  await page.reload();
  await page.getByRole('button',{name:'Levend register'}).click();
  await expect(page.locator('#recoverEmpty')).toBeDisabled();
  await page.locator('#rawStorageExport').click();
  await expect(page.locator('#recoverEmpty')).toBeDisabled();
  await page.locator('#recoverConsent').check();
  await expect(page.locator('#recoverEmpty')).toBeEnabled();
  const decisions=[false,true,false,true,true];
  const prompts=[];
  page.on('dialog',async dialog=>{
    prompts.push(dialog.message());
    const decision=decisions.shift();
    if(decision===undefined)throw new Error('Onverwachte hersteldialoog');
    if(decision)await dialog.accept();else await dialog.dismiss();
  });
  await page.locator('#recoverEmpty').click();
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe('{BROKEN');
  await page.locator('#recoverEmpty').click();
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe('{BROKEN');
  await page.locator('#recoverEmpty').click();
  expect(prompts).toHaveLength(5);
  expect(decisions).toHaveLength(0);
  await expect(page.locator('#message')).toContainText('Leeg register hersteld');
  await expect(page.locator('#storageWarning')).toBeHidden();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key)).toEqual([]);
});

test('geheugenkamer handoff is explicitly addressed and remains a manual local file', async ({page}) => {
  await page.getByRole('button',{name:'Levend register'}).click();
  await page.locator('#title').fill('Een bijzondere eik');
  await page.locator('#entryform button[type="submit"]').click();
  await page.getByRole('button',{name:'Leefwereldatlas'}).click();
  await page.locator('#packetDestination').selectOption('geheugenkamer');
  const requests=[];
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4177/'))requests.push(request.url())});
  const pending=page.waitForEvent('download');
  await page.locator('#packetExport').click();
  const download=await pending;
  expect(download.suggestedFilename()).toBe('citadel-geheugenkamer-minimaal.json');
  const {readFile}=await import('node:fs/promises');
  const data=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(data.intendedRecipient).toBe('geheugenkamer');
  expect(data.transferMode).toBe('manual-file-preview-only');
  expect(data.privacy).toBe('minimal-user-controlled');
  expect(data.records[0]).not.toHaveProperty('title');
  expect(data.records[0]).not.toHaveProperty('description');
  expect(requests).toEqual([]);
  await expect(page.locator('#atlasStatus')).toContainText('er is niets verzonden');
});

test('damaged local storage blocks misleading standard exports', async ({page}) => {
  const key='palaco.citadel.samenleving-natuur.v1';
  await page.evaluate(key=>localStorage.setItem(key,'{DAMAGED'),key);
  await page.reload();
  await page.getByRole('button',{name:'Leefwereldatlas'}).click();
  let downloads=0;
  page.on('download',()=>downloads++);
  await page.locator('#packetExport').click();
  await expect(page.locator('#atlasStatus')).toContainText('Export geblokkeerd');
  await page.getByRole('button',{name:'Levend register'}).click();
  await page.locator('#export').click();
  await expect(page.locator('#message')).toContainText('Back-upexport geblokkeerd');
  expect(downloads).toBe(0);
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe('{DAMAGED');
});

test('receiver preview reads minimal Atlas transfer without saving data', async ({page}) => {
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  const before=await page.evaluate(()=>({...localStorage}));
  const packet={
    schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
    intendedRecipient:'wereldatlas',transferMode:'manual-file-preview-only',
    privacy:'minimal-user-controlled',
    records:[{sequence:1,category:'Flora',conceptualArea:'Het Woud',
      verification:'persoonlijke observatie',recordedMonth:'2026-11'}]
  };
  await page.locator('#packet').setInputFiles({
    name:'atlas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packet))
  });
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#actualRecipient')).toHaveText('Wereldatlas');
  await expect(page.locator('#records')).toContainText('Observatie 1');
  await expect(page.locator('#records')).not.toContainText('title');
  expect(await page.evaluate(()=>({...localStorage}))).toEqual(before);
  await page.locator('#discard').click();
  await expect(page.locator('#preview')).toBeHidden();
});

test('receiver preview rejects wrongly addressed file', async ({page}) => {
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  await page.locator('#recipient').selectOption('geheugenkamer');
  const packet={
    schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
    intendedRecipient:'wereldatlas',transferMode:'manual-file-preview-only',
    privacy:'minimal-user-controlled',records:[]
  };
  await page.locator('#packet').setInputFiles({
    name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packet))
  });
  await expect(page.locator('#status')).toContainText('Pakket afgewezen');
  await expect(page.locator('#preview')).toBeHidden();
});

test('Geheugenkamer preview shows full text safely and requires no authority', async ({page}) => {
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  await page.locator('#recipient').selectOption('geheugenkamer');
  const packet={
    schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
    intendedRecipient:'geheugenkamer',transferMode:'manual-file-preview-only',
    privacy:'full-user-controlled',
    records:[{id:'preview-1',title:'<img src=x onerror=alert(1)>',
      category:'Flora',conceptualArea:'Het Woud',verification:'nog te verifiëren',
      description:'<script>window.citadelInjection=1</script>',observedAt:'2026-11-01T12:00:00Z'}]
  };
  await page.locator('#packet').setInputFiles({
    name:'memory.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packet))
  });
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#actualRecipient')).toHaveText('Geheugenkamer');
  await expect(page.locator('#records')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#records')).toContainText('<script>window.citadelInjection=1</script>');
  await expect(page.locator('#records img, #records script')).toHaveCount(0);
  expect(await page.evaluate(()=>window.citadelInjection)).toBeUndefined();
});

test('recipient preview refuses personal fields disguised as minimal data', async ({page}) => {
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  const packet={
    schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
    intendedRecipient:'wereldatlas',transferMode:'manual-file-preview-only',
    privacy:'minimal-user-controlled',
    records:[{sequence:1,category:'Flora',conceptualArea:'Het Woud',
      verification:'nog te verifiëren',recordedMonth:'2026-11',
      title:'PERSOONLIJKE TITEL',description:'GEVOELIGE NOTITIE'}]
  };
  await page.locator('#packet').setInputFiles({
    name:'leaking-minimal.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(packet))
  });
  await expect(page.locator('#preview')).toBeHidden();
  await expect(page.locator('#status')).toContainText('Pakket afgewezen');
  await expect(page.locator('#records')).not.toContainText('PERSOONLIJKE TITEL');
});

test('recipient preview rejects duplicate observation sequence in minimal packet', async ({page}) => {
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  const observation={sequence:1,category:'Flora',conceptualArea:'Het Woud',
    verification:'nog te verifiëren',recordedMonth:'2026-11'};
  await page.locator('#packet').setInputFiles({
    name:'duplicate.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
      intendedRecipient:'wereldatlas',privacy:'minimal-user-controlled',
      records:[observation,{...observation}]
    }))
  });
  await expect(page.locator('#status')).toContainText('Pakket afgewezen');
  await expect(page.locator('#preview')).toBeHidden();
});

test('changing recipient invalidates a previously rendered preview', async ({page}) => {
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  await page.locator('#packet').setInputFiles({
    name:'atlas.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
      intendedRecipient:'wereldatlas',privacy:'minimal-user-controlled',records:[]
    }))
  });
  await expect(page.locator('#preview')).toBeVisible();
  await page.locator('#recipient').selectOption('geheugenkamer');
  await expect(page.locator('#preview')).toBeHidden();
  await expect(page.locator('#packet')).toHaveValue('');
  await expect(page.locator('#status')).toContainText('Ontvanger gewijzigd');
});

test('receiver rejects unknown fields in minimal records rather than concealing them', async ({page}) => {
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  await page.locator('#packet').setInputFiles({
    name:'unknown-minimal.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
      intendedRecipient:'wereldatlas',privacy:'minimal-user-controlled',
      records:[{sequence:1,category:'Flora',conceptualArea:'Het Woud',
        verification:'nog te verifiëren',recordedMonth:'2026-11',privateMemo:'EXTRA PERSOONLIJKE DATA'}]
    }))
  });
  await expect(page.locator('#status')).toContainText('Pakket afgewezen');
  await expect(page.locator('#preview')).toBeHidden();
  await expect(page.locator('#records')).not.toContainText('EXTRA PERSOONLIJKE DATA');
});

test('receiver rejects unexpected fields in full records', async ({page}) => {
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  await page.locator('#recipient').selectOption('geheugenkamer');
  await page.locator('#packet').setInputFiles({
    name:'unknown-full.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
      intendedRecipient:'geheugenkamer',privacy:'full-user-controlled',
      records:[{id:'strict-001',title:'Testboom',category:'Flora',conceptualArea:'Het Woud',
        verification:'nog te verifiëren',description:'Notitie',
        observedAt:'2026-11-01T12:00:00Z',hiddenDeviceId:'DEVICE-PRIVATE'}]
    }))
  });
  await expect(page.locator('#status')).toContainText('Pakket afgewezen');
  await expect(page.locator('#preview')).toBeHidden();
});

test('receiver rejects a minimal record missing its required month', async ({page}) => {
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  await page.locator('#packet').setInputFiles({
    name:'incomplete.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
      privacy:'minimal-user-controlled',
      records:[{sequence:1,category:'Flora',conceptualArea:'Het Woud',
        verification:'nog te verifiëren'}]
    }))
  });
  await expect(page.locator('#status')).toContainText('Pakket afgewezen');
  await expect(page.locator('#preview')).toBeHidden();
});

test('receiver rejects false authority assertions in package metadata', async ({page})=>{
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  await page.locator('#packet').setInputFiles({
    name:'fake-authority.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
      intendedRecipient:'wereldatlas',privacy:'minimal-user-controlled',
      authority:'independently-verified',records:[]
    }))
  });
  await expect(page.locator('#status')).toContainText('Pakket afgewezen');
  await expect(page.locator('#preview')).toBeHidden();
});

test('receiver rejects a tampered summary even when record fields are valid', async ({page})=>{
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  const areas=['Het Woud','De Velden','Het Waterland','De Heuvels','De Tuinen','Het Stiltegebied'];
  const packet={schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
    privacy:'minimal-user-controlled',records:[{sequence:1,category:'Flora',conceptualArea:'Het Woud',
      verification:'nog te verifiëren',recordedMonth:'2026-11'}],
    summary:{total:999,pending:1,activeZones:1,
      byZone:areas.map(zone=>({zone,total:zone==='Het Woud'?1:0,flora:zone==='Het Woud'?1:0,fauna:0}))}};
  await page.locator('#packet').setInputFiles({
    name:'tampered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packet))
  });
  await expect(page.locator('#status')).toContainText('Pakket afgewezen');
  await expect(page.locator('#preview')).toBeHidden();
});

test('receiver accepts a consistent full handoff including summary and metadata', async ({page})=>{
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
  await page.locator('#recipient').selectOption('geheugenkamer');
  const areas=['Het Woud','De Velden','Het Waterland','De Heuvels','De Tuinen','Het Stiltegebied'];
  const packet={schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
    intendedRecipient:'geheugenkamer',transferMode:'manual-file-preview-only',
    privacy:'full-user-controlled',authority:'unverified-user-observations',
    exported:'2026-11-18T08:00:00Z',destinationHints:['wereldatlas','geheugenkamer'],
    records:[{id:'summary-001',title:'Eik',category:'Flora',conceptualArea:'Het Woud',
      verification:'persoonlijke observatie',description:'Leefgebied',observedAt:'2026-11-01T12:00:00Z'}],
    summary:{total:1,pending:1,activeZones:1,
      byZone:areas.map(zone=>({zone,total:zone==='Het Woud'?1:0,
        flora:zone==='Het Woud'?1:0,fauna:0}))}};
  await page.locator('#packet').setInputFiles({
    name:'consistent.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packet))
  });
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#total')).toHaveText('1');
  await expect(page.locator('#status')).toContainText('lokaal gevalideerd');
});

test('exported SHA-256 packet is verified by recipient preview',async ({page})=>{
 await page.getByRole('button',{name:'Leefwereldatlas'}).click();
 const pending=page.waitForEvent('download');
 await page.locator('#packetExport').click();
 const file=await pending;
 const {readFile}=await import('node:fs/promises');
 const bytes=await readFile(await file.path());
 const data=JSON.parse(bytes.toString('utf8'));
 expect(data.integrity.algorithm).toBe('SHA-256');
 expect(data.integrity.canonicalization).toBe('palaco-sorted-json-v1');
 expect(data.integrity.digest).toMatch(/^[0-9a-f]{64}$/);
 await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
 await page.locator('#packet').setInputFiles({name:'signed.json',mimeType:'application/json',buffer:bytes});
 await expect(page.locator('#preview')).toBeVisible();
 await expect(page.locator('#status')).toContainText('SHA-256-integriteit klopt');
 await expect(page.locator('#status')).toContainText('herkomst en identiteit niet geverifieerd');
});

test('recipient detects tampering of a SHA-256 protected record',async ({page})=>{
 await page.getByRole('button',{name:'Leefwereldatlas'}).click();
 const pending=page.waitForEvent('download');
 await page.locator('#packetExport').click();
 const file=await pending;
 const {readFile}=await import('node:fs/promises');
 const data=JSON.parse(await readFile(await file.path(),'utf8'));
 data.exported='2026-11-01T13:00:00Z';
 await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
 await page.locator('#packet').setInputFiles({
  name:'tampered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))
 });
 await expect(page.locator('#preview')).toBeHidden();
 await expect(page.locator('#status')).toContainText('Pakket afgewezen');
});

test('legacy handoff remains readable but is explicitly unverified',async ({page})=>{
 await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
 await page.locator('#packet').setInputFiles({
  name:'legacy.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify({
   schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
   privacy:'minimal-user-controlled',records:[]
  }))
 });
 await expect(page.locator('#preview')).toBeVisible();
 await expect(page.locator('#status')).toContainText('zonder SHA-256-hash');
 await expect(page.locator('#status')).toContainText('niet cryptografisch geverifieerd');
});

test('unsigned handoff is blocked by default and requires explicit legacy permission',async ({page})=>{
 await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await expect(page.locator('#allowLegacy')).not.toBeChecked();
 const packet={
  schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
  privacy:'minimal-user-controlled',records:[]
 };
 const file={name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packet))};
 await page.locator('#packet').setInputFiles(file);
 await expect(page.locator('#preview')).toBeHidden();
 await expect(page.locator('#status')).toContainText('zonder SHA-256-hash geblokkeerd');
 await page.locator('#allowLegacy').check();
 await expect(page.locator('#packet')).toHaveValue('');
 await page.locator('#packet').setInputFiles(file);
 await expect(page.locator('#preview')).toBeVisible();
 await expect(page.locator('#status')).toContainText('niet cryptografisch geverifieerd');
});

test('revoking legacy permission clears the open unsigned preview',async ({page})=>{
 await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await page.locator('#allowLegacy').check();
 await page.locator('#packet').setInputFiles({
  name:'unsigned.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify({
   schema:'palaco-citadel-handoff-v1',source:'citadel/samenleving-natuur',
   privacy:'minimal-user-controlled',records:[]
  }))
 });
 await expect(page.locator('#preview')).toBeVisible();
 await page.locator('#allowLegacy').uncheck();
 await expect(page.locator('#preview')).toBeHidden();
 await expect(page.locator('#status')).toContainText('Integriteitsbeleid gewijzigd');
 await expect(page.locator('#packet')).toHaveValue('');
});

test('SHA-256 handoff is readable without legacy exception',async ({page})=>{
 await page.getByRole('button',{name:'Leefwereldatlas'}).click();
 const pending=page.waitForEvent('download');
 await page.locator('#packetExport').click();
 const download=await pending;
 const {readFile}=await import('node:fs/promises');
 const bytes=await readFile(await download.path());
 await page.goto('http://127.0.0.1:4177/recipient-preview.html');
 await expect(page.locator('#allowLegacy')).not.toBeChecked();
 await page.locator('#packet').setInputFiles({
  name:'hashed.json',mimeType:'application/json',buffer:bytes
 });
 await expect(page.locator('#preview')).toBeVisible();
 await expect(page.locator('#status')).toContainText('SHA-256-integriteit klopt');
});

async function signedPreviewFixture(page){
  await page.getByRole('button',{name:'Leefwereldatlas'}).click();
  const pending=page.waitForEvent('download');
  await page.locator('#packetExport').click();
  const exported=await pending;
  const {readFile}=await import('node:fs/promises');
  const bytes=await readFile(await exported.path());
  await page.goto('http://127.0.0.1:4177/recipient-preview.html');
  await page.locator('#packet').setInputFiles({name:'packet.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#preview')).toBeVisible();
  const fixture=await page.evaluate(async data=>{
    const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
    const kp=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
    const full=await crypto.subtle.exportKey('jwk',kp.publicKey);
    const jwk={kty:'EC',crv:'P-256',x:full.x,y:full.y};
    const fingerprint=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(jwk)));
    const digest=Array.from(new Uint8Array(fingerprint),v=>v.toString(16).padStart(2,'0')).join('');
    const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},kp.privateKey,new TextEncoder().encode(canonical(data)));
    const encoded=btoa(String.fromCharCode(...new Uint8Array(signature)));
    return {jwk,detached:{schema:'palaco-citadel-signature-v1',algorithm:'ECDSA-P256-SHA256',keyFingerprint:digest,signature:encoded}};
  },JSON.parse(bytes.toString('utf8')));
  await page.locator('#publicKey').fill(JSON.stringify(fixture.jwk));
  return fixture;
}

test('detached ECDSA P-256 signature verifies without granting PALACO trust',async ({page})=>{
  const fixture=await signedPreviewFixture(page);
  await page.locator('#signatureFile').setInputFiles({
    name:'signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))
  });
  await page.locator('#verifySignature').click();
  await expect(page.locator('#signatureStatus')).toContainText('cryptografisch GELDIG');
  await expect(page.locator('#signatureStatus')).toContainText('NIET VERTROUWD');
  await expect(page.locator('#signatureStatus')).toContainText('Geen PALACO-autorisatie');
});

test('tampered detached signature fails while read-only packet remains intact',async ({page})=>{
  const fixture=await signedPreviewFixture(page);
  const raw=Buffer.from(fixture.detached.signature,'base64');raw[0]^=255;
  fixture.detached.signature=raw.toString('base64');
  await page.locator('#signatureFile').setInputFiles({
    name:'tampered-signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))
  });
  await page.locator('#verifySignature').click();
  await expect(page.locator('#signatureStatus')).toContainText('Handtekening ONGELDIG');
  await expect(page.locator('#preview')).toBeVisible();
  await page.locator('#discard').click();
  await expect(page.locator('#preview')).toBeHidden();
});

test('locally listed revoked fingerprint blocks an otherwise valid signature',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 await page.locator('#signatureFile').setInputFiles({
  name:'signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))
 });
 await page.locator('#revocations').setInputFiles({
  name:'revocations.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify({
   schema:'palaco-citadel-revocations-v1',fingerprints:[fixture.detached.keyFingerprint]
  }))
 });
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('SLEUTEL INGETROKKEN');
 await expect(page.locator('#signatureStatus')).toContainText('geen PALACO-autorisatie');
 await expect(page.locator('#preview')).toBeVisible();
});

test('unlisted signature remains cryptographically valid but explicitly untrusted',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 await page.locator('#signatureFile').setInputFiles({
  name:'signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))
 });
 await page.locator('#revocations').setInputFiles({
  name:'empty-revocations.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify({schema:'palaco-citadel-revocations-v1',fingerprints:[]}))
 });
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('cryptografisch GELDIG');
 await expect(page.locator('#signatureStatus')).toContainText('NIET VERTROUWD');
});

test('changing revocation list invalidates a previous signature result',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 await page.locator('#signatureFile').setInputFiles({
  name:'signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))
 });
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('cryptografisch GELDIG');
 await page.locator('#revocations').setInputFiles({
  name:'revocations.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify({
   schema:'palaco-citadel-revocations-v1',fingerprints:[fixture.detached.keyFingerprint]
  }))
 });
 await expect(page.locator('#signatureStatus')).toContainText('Intrekkingslijst gewijzigd');
 await expect(page.locator('#signatureStatus')).not.toContainText('cryptografisch GELDIG');
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('SLEUTEL INGETROKKEN');
});

async function signedRevocationFixture(page,fingerprint,{expired=false,tamper=false}={}){
 return page.evaluate(async ({fingerprint,expired,tamper})=>{
   const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
   const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
   const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
   const publicKey={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
   const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(publicKey)));
   const issuerFingerprint=Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('');
   const t=Date.now(),day=86400000;
   const list={schema:'palaco-citadel-revocations-v2',issuerFingerprint,
     issuedAt:new Date(t-(expired?3:1)*day).toISOString(),
     expiresAt:new Date(t+(expired?-1:1)*day).toISOString(),
     fingerprints:[fingerprint]};
   const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(canonical(list)));
   const signed={...list,signature:btoa(String.fromCharCode(...new Uint8Array(signature)))};
   if(tamper)signed.fingerprints=[];
   return {publicKey,signed};
 },{fingerprint,expired,tamper});
}

test('signed local revocation v2 denies listed key but never grants trust',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 const signed=await signedRevocationFixture(page,fixture.detached.keyFingerprint);
 await page.locator('#signatureFile').setInputFiles({name:'sig.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#revocationIssuerKey').fill(JSON.stringify(signed.publicKey));
 await page.locator('#revocations').setInputFiles({name:'v2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(signed.signed))});
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('SLEUTEL INGETROKKEN');
 await expect(page.locator('#signatureStatus')).toContainText('NIET VERTROUWDE');
});

test('expired signed revocation v2 fails closed',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 const signed=await signedRevocationFixture(page,fixture.detached.keyFingerprint,{expired:true});
 await page.locator('#signatureFile').setInputFiles({name:'sig.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#revocationIssuerKey').fill(JSON.stringify(signed.publicKey));
 await page.locator('#revocations').setInputFiles({name:'expired.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(signed.signed))});
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('niet geldig of niet verifieerbaar');
 await expect(page.locator('#signatureStatus')).not.toContainText('cryptografisch GELDIG');
});

test('tampered signed revocation v2 fails closed',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 const signed=await signedRevocationFixture(page,fixture.detached.keyFingerprint,{tamper:true});
 await page.locator('#signatureFile').setInputFiles({name:'sig.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#revocationIssuerKey').fill(JSON.stringify(signed.publicKey));
 await page.locator('#revocations').setInputFiles({name:'tampered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(signed.signed))});
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('niet geldig of niet verifieerbaar');
 await expect(page.locator('#signatureStatus')).not.toContainText('cryptografisch GELDIG');
});

test('explicitly pinned signed revocation v2 persists a local per-issuer rollback floor',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 const signed=await signedRevocationFixture(page,fixture.detached.keyFingerprint);
 await page.locator('#signatureFile').setInputFiles({name:'sig.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#revocationIssuerKey').fill(JSON.stringify(signed.publicKey));
 await page.locator('#revocations').setInputFiles({name:'v2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(signed.signed))});
 await expect(page.locator('#pinRevocation')).toBeDisabled();
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('SLEUTEL INGETROKKEN');
 await expect(page.locator('#pinRevocation')).toBeEnabled();
 page.once('dialog',d=>d.accept());
 await page.locator('#pinRevocation').click();
 await expect(page.locator('#signatureStatus')).toContainText('ANTI-ROLLBACK VASTGELEGD');
 await expect(page.locator('#pinRevocation')).toBeDisabled();
 const key='palaco.citadel.revocation-pin.v1.'+signed.signed.issuerFingerprint;
 expect(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key)).issuedAt).toBe(signed.signed.issuedAt);
 expect(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key)).digest).toMatch(/^[0-9a-f]{64}$/);
});

test('rollback floor blocks previously signed revocation v2 with older timestamp',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 const signed=await signedRevocationFixture(page,fixture.detached.keyFingerprint);
 const key='palaco.citadel.revocation-pin.v1.'+signed.signed.issuerFingerprint;
 const newer=new Date(Date.parse(signed.signed.issuedAt)+3600000).toISOString();
 await page.evaluate(([key,value])=>localStorage.setItem(key,value),[key,newer]);
 await page.locator('#signatureFile').setInputFiles({name:'sig.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#revocationIssuerKey').fill(JSON.stringify(signed.publicKey));
 await page.locator('#revocations').setInputFiles({name:'v2-older.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(signed.signed))});
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('ROLLBACK GEBLOKKEERD');
 await expect(page.locator('#pinRevocation')).toBeDisabled();
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(newer);
});

test('same-timestamp signed revocation with a conflicting pinned digest is blocked',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 const signed=await signedRevocationFixture(page,fixture.detached.keyFingerprint);
 const key='palaco.citadel.revocation-pin.v1.'+signed.signed.issuerFingerprint;
 await page.evaluate(([key,issuedAt])=>localStorage.setItem(key,JSON.stringify({issuedAt,digest:'0'.repeat(64)})),[key,signed.signed.issuedAt]);
 await page.locator('#signatureFile').setInputFiles({name:'sig.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#revocationIssuerKey').fill(JSON.stringify(signed.publicKey));
 await page.locator('#revocations').setInputFiles({name:'same-date.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(signed.signed))});
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('ROLLBACK GEBLOKKEERD');
 await expect(page.locator('#signatureStatus')).toContainText('hetzelfde uitgiftetijdstip');
 await expect(page.locator('#pinRevocation')).toBeDisabled();
});

test('same-timestamp identical signed v2 list remains valid against its pinned digest',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 const signed=await signedRevocationFixture(page,fixture.detached.keyFingerprint);
 const key='palaco.citadel.revocation-pin.v1.'+signed.signed.issuerFingerprint;
 const digest=await page.evaluate(async data=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(data)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 },signed.signed);
 await page.evaluate(([key,issuedAt,digest])=>localStorage.setItem(key,JSON.stringify({issuedAt,digest})),[key,signed.signed.issuedAt,digest]);
 await page.locator('#signatureFile').setInputFiles({name:'sig.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#revocationIssuerKey').fill(JSON.stringify(signed.publicKey));
 await page.locator('#revocations').setInputFiles({name:'identical.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(signed.signed))});
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('SLEUTEL INGETROKKEN');
 await expect(page.locator('#pinRevocation')).toBeEnabled();
});

test('legacy timestamp-only pin blocks ambiguous equal-date v2 replacement',async ({page})=>{
 const fixture=await signedPreviewFixture(page);
 const signed=await signedRevocationFixture(page,fixture.detached.keyFingerprint);
 const key='palaco.citadel.revocation-pin.v1.'+signed.signed.issuerFingerprint;
 await page.evaluate(([key,date])=>localStorage.setItem(key,date),[key,signed.signed.issuedAt]);
 await page.locator('#signatureFile').setInputFiles({name:'sig.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#revocationIssuerKey').fill(JSON.stringify(signed.publicKey));
 await page.locator('#revocations').setInputFiles({name:'legacy-date.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(signed.signed))});
 await page.locator('#verifySignature').click();
 await expect(page.locator('#signatureStatus')).toContainText('ROLLBACK GEBLOKKEERD');
 await expect(page.locator('#pinRevocation')).toBeDisabled();
});

async function rotationFixture(page,{tamper=false,mismatch=false}={}){
 return page.evaluate(async ({tamper,mismatch})=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const old=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const next=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const oldJwk=await crypto.subtle.exportKey('jwk',old.publicKey),newJwk=await crypto.subtle.exportKey('jwk',next.publicKey);
  const oldKey={kty:'EC',crv:'P-256',x:oldJwk.x,y:oldJwk.y};
  const newKey={kty:'EC',crv:'P-256',x:newJwk.x,y:newJwk.y};
  const fingerprint=async k=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(k)))),b=>b.toString(16).padStart(2,'0')).join('');
  const doc={schema:'palaco-citadel-key-rotation-v1',epoch:2,issuedAt:new Date(Date.now()-60000).toISOString(),
    oldFingerprint:await fingerprint(oldKey),newFingerprint:await fingerprint(newKey)};
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},old.privateKey,new TextEncoder().encode(canonical(doc)));
  const rotation={...doc,signature:btoa(String.fromCharCode(...new Uint8Array(sig)))};
  if(tamper)rotation.epoch=3;
  if(mismatch)rotation.newFingerprint='0'.repeat(64);
  return {oldKey,newKey,rotation};
 },{tamper,mismatch});
}

test('signed key rotation proves succession but grants no trust',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page);
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'rotation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#rotationStatus')).toContainText('NIET VERTROUWD');
 await expect(page.locator('#rotationStatus')).toContainText('Geen PALACO-autorisatie');
});

test('mutated key rotation epoch invalidates signature',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page,{tamper:true});
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'tamper.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('SLEUTELOPVOLGING ONGELDIG');
});

test('key rotation with a mismatching successor fingerprint is rejected',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page,{mismatch:true});
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'mismatch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('niet geldig of niet verifieerbaar');
});

test('read-only key registry accepts matching active fingerprint and preceding epoch without activation',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page);
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'rotation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 const registry={schema:'palaco-citadel-key-registry-v1',epoch:fixture.rotation.epoch-1,
   activeFingerprint:fixture.rotation.oldFingerprint,status:'active'};
 await page.locator('#rotationRegistry').setInputFiles({name:'registry.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(registry))});
 const before=await page.evaluate(()=>({...localStorage}));
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#rotationStatus')).toContainText('NIET VERTROUWD');
 expect(await page.evaluate(()=>({...localStorage}))).toEqual(before);
});

test('key registry blocks stale epoch during rotation',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page);
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'rotation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 const registry={schema:'palaco-citadel-key-registry-v1',epoch:fixture.rotation.epoch,
   activeFingerprint:fixture.rotation.oldFingerprint,status:'active'};
 await page.locator('#rotationRegistry').setInputFiles({name:'stale.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(registry))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('REGISTERCONFLICT');
});

test('key registry rejects disabled old key and invalidates previous result on changes',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page);
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'rotation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('CRYPTOGRAFISCH GELDIG');
 const registry={schema:'palaco-citadel-key-registry-v1',epoch:fixture.rotation.epoch-1,
   activeFingerprint:fixture.rotation.oldFingerprint,status:'revoked'};
 await page.locator('#rotationRegistry').setInputFiles({name:'revoked.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(registry))});
 await expect(page.locator('#rotationStatus')).toContainText('opnieuw verifiëren vereist');
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('niet geldig of niet verifieerbaar');
 await expect(page.locator('#rotationStatus')).not.toContainText('CRYPTOGRAFISCH GELDIG');
});

async function signedRegistryFixture(page,rotation,{expired=false,tampered=false}={}){
 return page.evaluate(async ({rotation,expired,tampered})=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const pub=await crypto.subtle.exportKey('jwk',keys.publicKey),issuer={kty:'EC',crv:'P-256',x:pub.x,y:pub.y};
  const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(issuer)));
  const issuerFingerprint=Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('');
  const t=Date.now(),day=86400000;
  const data={schema:'palaco-citadel-key-registry-v2',epoch:rotation.epoch-1,
    activeFingerprint:rotation.oldFingerprint,status:'active',issuerFingerprint,
    issuedAt:new Date(t-(expired?3:1)*day).toISOString(),
    expiresAt:new Date(t+(expired?-1:1)*day).toISOString()};
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(canonical(data)));
  const snapshot={...data,signature:btoa(String.fromCharCode(...new Uint8Array(signature)))};
  if(tampered)snapshot.epoch=rotation.epoch;
  return {issuer,snapshot};
 },{rotation,expired,tampered});
}

async function uploadSignedRegistry(page,fixture,snapshot){
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'rotation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 await page.locator('#registryIssuerKey').fill(JSON.stringify(snapshot.issuer));
 await page.locator('#rotationRegistry').setInputFiles({name:'signed-registry.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot.snapshot))});
}

test('signed v2 registry matches rotation but does not grant PALACO trust',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page),snapshot=await signedRegistryFixture(page,fixture.rotation);
 await uploadSignedRegistry(page,fixture,snapshot);
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#rotationStatus')).toContainText('NIET VERTROUWD');
 await expect(page.locator('#rotationStatus')).toContainText('Geen PALACO-autorisatie');
});

test('expired signed v2 registry snapshot fails closed',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page),snapshot=await signedRegistryFixture(page,fixture.rotation,{expired:true});
 await uploadSignedRegistry(page,fixture,snapshot);
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('niet geldig of niet verifieerbaar');
 await expect(page.locator('#rotationStatus')).not.toContainText('CRYPTOGRAFISCH GELDIG');
});

test('modified signed v2 registry snapshot fails signature verification',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page),snapshot=await signedRegistryFixture(page,fixture.rotation,{tampered:true});
 await uploadSignedRegistry(page,fixture,snapshot);
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('niet geldig of niet verifieerbaar');
 await expect(page.locator('#rotationStatus')).not.toContainText('CRYPTOGRAFISCH GELDIG');
});

async function checkerApprovalFixture(page,snapshot,{tamper=false,sameKey=false}={}){
 return page.evaluate(async ({snapshot,tamper,sameKey})=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const signer=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicRaw=await crypto.subtle.exportKey('jwk',signer.publicKey);
  const publicKey={kty:'EC',crv:'P-256',x:publicRaw.x,y:publicRaw.y};
  const fingerprint=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(v)))),b=>b.toString(16).padStart(2,'0')).join('');
  const approval={schema:'palaco-citadel-registry-approval-v1',decision:'approve',
   issuedAt:new Date(Date.parse(snapshot.issuedAt)+60000).toISOString(),
   registryDigest:await fingerprint(snapshot),checkerFingerprint:await fingerprint(publicKey)};
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,new TextEncoder().encode(canonical(approval)));
  const result={...approval,signature:btoa(String.fromCharCode(...new Uint8Array(signature)))};
  if(tamper)result.registryDigest='0'.repeat(64);
  return {publicKey,approval:result};
 },{snapshot,tamper,sameKey});
}

test('maker checker validates two signatures without conferring trust',async ({page})=>{
 await signedPreviewFixture(page);
 const rotation=await rotationFixture(page),registry=await signedRegistryFixture(page,rotation.rotation);
 const checker=await checkerApprovalFixture(page,registry.snapshot);
 await uploadSignedRegistry(page,rotation,registry);
 await page.locator('#requireChecker').check();
 await page.locator('#checkerKey').fill(JSON.stringify(checker.publicKey));
 await page.locator('#checkerFile').setInputFiles({name:'checker.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(checker.approval))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#rotationStatus')).toContainText('NIET VERTROUWD');
 await expect(page.locator('#rotationStatus')).toContainText('Geen PALACO-autorisatie');
});

test('maker checker refuses approval bound to different registry digest',async ({page})=>{
 await signedPreviewFixture(page);
 const rotation=await rotationFixture(page),registry=await signedRegistryFixture(page,rotation.rotation);
 const checker=await checkerApprovalFixture(page,registry.snapshot,{tamper:true});
 await uploadSignedRegistry(page,rotation,registry);
 await page.locator('#requireChecker').check();
 await page.locator('#checkerKey').fill(JSON.stringify(checker.publicKey));
 await page.locator('#checkerFile').setInputFiles({name:'checker-wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(checker.approval))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('niet geldig of niet verifieerbaar');
});

test('maker checker refuses absent approval in strict mode',async ({page})=>{
 await signedPreviewFixture(page);
 const rotation=await rotationFixture(page),registry=await signedRegistryFixture(page,rotation.rotation);
 await uploadSignedRegistry(page,rotation,registry);
 await page.locator('#requireChecker').check();
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('niet geldig of niet verifieerbaar');
 await expect(page.locator('#rotationStatus')).not.toContainText('CRYPTOGRAFISCH GELDIG');
});

test('successful verification exports a local audit with explicit DENY and file fingerprints',async ({page})=>{
 await signedPreviewFixture(page);
 const rotation=await rotationFixture(page),registry=await signedRegistryFixture(page,rotation.rotation);
 const checker=await checkerApprovalFixture(page,registry.snapshot);
 await uploadSignedRegistry(page,rotation,registry);
 await page.locator('#requireChecker').check();
 await page.locator('#checkerKey').fill(JSON.stringify(checker.publicKey));
 await page.locator('#checkerFile').setInputFiles({name:'checker.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(checker.approval))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#exportRotationAudit')).toBeEnabled();
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#exportRotationAudit').click();
 const download=await downloadPromise;
 const {readFile}=await import('node:fs/promises');
 const report=JSON.parse(await readFile(await download.path(),'utf8'));
 expect(report.schema).toBe('palaco-citadel-rotation-audit-v1');
 expect(report.result).toBe('CRYPTOGRAPHICALLY_VALID_UNTRUSTED');
 expect(report.policy).toBe('maker-checker-required');
 expect(report.authorization).toBe('DENY');
 expect(report.issuance).toBe('HOLD');
 expect(report.trust).toBe('untrusted-local-inputs');
 expect(report.epoch).toBe(rotation.rotation.epoch);
 expect(report.fileSha256.rotation).toMatch(/^[a-f0-9]{64}$/);
 expect(report.fileSha256.registry).toMatch(/^[a-f0-9]{64}$/);
 expect(report.fileSha256.checker).toMatch(/^[a-f0-9]{64}$/);
 expect(report.integrity.algorithm).toBe('SHA-256');
 expect(report.integrity.digest).toMatch(/^[a-f0-9]{64}$/);
 expect(JSON.stringify(report)).not.toContain('"d":');
});

test('rejected signature still exports a denied audit with no authority',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page,{tamper:true});
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'invalid-rotation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#rotationStatus')).toContainText('SLEUTELOPVOLGING ONGELDIG');
 const promise=page.waitForEvent('download');
 await page.locator('#exportRotationAudit').click();
 const download=await promise;
 const {readFile}=await import('node:fs/promises');
 const report=JSON.parse(await readFile(await download.path(),'utf8'));
 expect(report.result).toBe('DENIED_SIGNATURE');
 expect(report.authorization).toBe('DENY');
 expect(report.issuance).toBe('HOLD');
 expect(report.fileSha256.rotation).toMatch(/^[a-f0-9]{64}$/);
});

test('audit is invalidated when signer input changes',async ({page})=>{
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page);
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'rotation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#exportRotationAudit')).toBeEnabled();
 await page.locator('#rotationOldKey').fill('{"kty":"EC"}');
 await expect(page.locator('#exportRotationAudit')).toBeDisabled();
 await expect(page.locator('#rotationStatus')).toContainText('opnieuw verifiëren vereist');
});

async function exportedAuditFixture(page){
 await signedPreviewFixture(page);
 const fixture=await rotationFixture(page);
 await page.locator('#rotationOldKey').fill(JSON.stringify(fixture.oldKey));
 await page.locator('#rotationNewKey').fill(JSON.stringify(fixture.newKey));
 await page.locator('#rotationFile').setInputFiles({name:'rotation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.rotation))});
 await page.locator('#verifyRotation').click();
 await expect(page.locator('#exportRotationAudit')).toBeEnabled();
 const promised=page.waitForEvent('download');
 await page.locator('#exportRotationAudit').click();
 const download=await promised;
 const {readFile}=await import('node:fs/promises');
 return JSON.parse(await readFile(await download.path(),'utf8'));
}

test('local audit SHA-256 verifier accepts unmodified exported receipt without granting trust',async ({page})=>{
 const report=await exportedAuditFixture(page);
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('SHA-256 AUDITINTEGRITEIT GELDIG');
 await expect(page.locator('#auditVerifyStatus')).toContainText('NIET ONDERTEKEND');
 await expect(page.locator('#auditVerifyStatus')).toContainText('Geen PALACO-autorisatie');
 expect(report.authorization).toBe('DENY');
});

test('audit verifier rejects modified decision after export',async ({page})=>{
 const report=await exportedAuditFixture(page);
 report.result='DENIED_SIGNATURE';
 await page.locator('#auditVerifyFile').setInputFiles({name:'modified.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('audit verifier rejects unsigned legacy report and clears previous result on file change',async ({page})=>{
 const report=await exportedAuditFixture(page);
 await page.locator('#auditVerifyFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('SHA-256 AUDITINTEGRITEIT GELDIG');
 delete report.integrity;
 await page.locator('#auditVerifyFile').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await expect(page.locator('#auditVerifyStatus')).toContainText('opnieuw controleren vereist');
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

async function detachedAuditSignature(page,report,{tamper=false}={}){
 return page.evaluate(async ({report,tamper})=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const raw=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const publicKey={kty:'EC',crv:'P-256',x:raw.x,y:raw.y};
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(publicKey)));
  const fp=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(canonical(report)));
  const detached={schema:'palaco-citadel-audit-signature-v1',algorithm:'ECDSA-P256-SHA256',
    signerFingerprint:fp,reportDigest:report.integrity.digest,
    signature:btoa(String.fromCharCode(...new Uint8Array(signature)))};
  if(tamper)detached.signature=btoa('wrong signature bytes');
  return {publicKey,detached};
 },{report,tamper});
}

test('detached audit signature is cryptographically valid with untrusted signer',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#auditSignerKey').fill(JSON.stringify(fixture.publicKey));
 await page.locator('#auditSignatureFile').setInputFiles({name:'signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT-HANDTEKENING CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#auditVerifyStatus')).toContainText('NIET VERTROUWD');
 await expect(page.locator('#auditVerifyStatus')).toContainText('Geen PALACO-autorisatie');
});

test('tampered detached audit signature fails closed',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report,{tamper:true});
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#auditSignerKey').fill(JSON.stringify(fixture.publicKey));
 await page.locator('#auditSignatureFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('audit signature bound to another digest is rejected',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 fixture.detached.reportDigest='0'.repeat(64);
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#auditSignerKey').fill(JSON.stringify(fixture.publicKey));
 await page.locator('#auditSignatureFile').setInputFiles({name:'wrong-digest.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('changing audit signer key revokes earlier verification result',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#auditSignerKey').fill(JSON.stringify(fixture.publicKey));
 await page.locator('#auditSignatureFile').setInputFiles({name:'signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT-HANDTEKENING CRYPTOGRAFISCH GELDIG');
 await page.locator('#auditSignerKey').fill('{}');
 await expect(page.locator('#auditVerifyStatus')).toContainText('opnieuw controleren vereist');
 await expect(page.locator('#auditVerifyStatus')).not.toContainText('CRYPTOGRAFISCH GELDIG');
});

test('required audit signature policy refuses hash-only report',async ({page})=>{
 const report=await exportedAuditFixture(page);
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#requireAuditSignature').check();
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
 await expect(page.locator('#auditVerifyStatus')).not.toContainText('SHA-256 AUDITINTEGRITEIT GELDIG');
});

test('required audit signature policy accepts valid detached signature without granting trust',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#auditSignerKey').fill(JSON.stringify(fixture.publicKey));
 await page.locator('#auditSignatureFile').setInputFiles({name:'signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#requireAuditSignature').check();
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT-HANDTEKENING CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#auditVerifyStatus')).toContainText('NIET VERTROUWD');
 await expect(page.locator('#auditVerifyStatus')).toContainText('Geen PALACO-autorisatie');
});

test('switching to required signature policy invalidates earlier hash-only result',async ({page})=>{
 const report=await exportedAuditFixture(page);
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('SHA-256 AUDITINTEGRITEIT GELDIG');
 await page.locator('#requireAuditSignature').check();
 await expect(page.locator('#auditVerifyStatus')).toContainText('opnieuw controleren vereist');
 await expect(page.locator('#auditVerifyStatus')).not.toContainText('SHA-256 AUDITINTEGRITEIT GELDIG');
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

async function attachAuditRegistry(page,report,fixture,{status='active',fingerprint=fixture.detached.signerFingerprint,expired=false}={}){
 const checked=Date.parse(report.checkedAt);
 const registry={schema:'palaco-citadel-audit-key-registry-v1',role:'audit-signer',status,fingerprint,
  notBefore:new Date(checked-3600000).toISOString(),notAfter:new Date(expired?checked-1000:checked+3600000).toISOString()};
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#auditSignerKey').fill(JSON.stringify(fixture.publicKey));
 await page.locator('#auditSignatureFile').setInputFiles({name:'signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#auditKeyRegistry').setInputFiles({name:'registry.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(registry))});
}

test('local audit registry accepts active matching signer while never trusting it',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 await attachAuditRegistry(page,report,fixture);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT-HANDTEKENING CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#auditVerifyStatus')).toContainText('NIET VERTROUWD');
 await expect(page.locator('#auditVerifyStatus')).toContainText('Geen PALACO-autorisatie');
});

test('local audit registry rejects revoked audit signer',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 await attachAuditRegistry(page,report,fixture,{status:'revoked'});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('local audit registry rejects expired signer even if signature is valid',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 await attachAuditRegistry(page,report,fixture,{expired:true});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('local audit registry requires matching signer fingerprint',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 await attachAuditRegistry(page,report,fixture,{fingerprint:'0'.repeat(64)});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('local audit registry forbids silent hash-only fallback and invalidates earlier result',async ({page})=>{
 const report=await exportedAuditFixture(page);
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('SHA-256 AUDITINTEGRITEIT GELDIG');
 const registry={schema:'palaco-citadel-audit-key-registry-v1',role:'audit-signer',status:'active',fingerprint:'0'.repeat(64),
   notBefore:new Date(Date.now()-3600000).toISOString(),notAfter:new Date(Date.now()+3600000).toISOString()};
 await page.locator('#auditKeyRegistry').setInputFiles({name:'registry.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(registry))});
 await expect(page.locator('#auditVerifyStatus')).toContainText('opnieuw controleren vereist');
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

async function signedAuditRegistryFixture(page,report,detached,{expired=false,tampered=false}={}){
 return page.evaluate(async ({report,detached,expired,tampered})=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',key.publicKey),issuer={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(issuer)));
  const issuerFingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const now=Date.now();
  const snapshot={schema:'palaco-citadel-audit-key-registry-v2',role:'audit-signer',status:'active',
   fingerprint:detached.signerFingerprint,
   notBefore:new Date(now-3600000).toISOString(),notAfter:new Date(now+3600000).toISOString(),
   issuedAt:new Date(now-7200000).toISOString(),
   expiresAt:new Date(now+(expired?-3600000:3600000)).toISOString(),issuerFingerprint};
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.privateKey,new TextEncoder().encode(canonical(snapshot)));
  const signed={...snapshot,signature:btoa(String.fromCharCode(...new Uint8Array(sig)))};
  if(tampered)signed.status='revoked';
  return {issuer,signed};
 },{report,detached,expired,tampered});
}
async function uploadSignedAuditRegistry(page,report,fixture,registry){
 await page.locator('#auditVerifyFile').setInputFiles({name:'audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.locator('#auditSignerKey').fill(JSON.stringify(fixture.publicKey));
 await page.locator('#auditSignatureFile').setInputFiles({name:'sig.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
 await page.locator('#auditRegistryIssuerKey').fill(JSON.stringify(registry.issuer));
 await page.locator('#auditKeyRegistry').setInputFiles({name:'registry-v2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(registry.signed))});
}

test('signed audit registry v2 verifies a valid snapshot but never upgrades trust',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT-HANDTEKENING CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#auditVerifyStatus')).toContainText('NIET VERTROUWD');
 await expect(page.locator('#auditVerifyStatus')).toContainText('Geen PALACO-autorisatie');
});

test('signed audit registry v2 rejects expired snapshots',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached,{expired:true});
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('signed audit registry v2 rejects modified signature-bound status',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached,{tampered:true});
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('signed audit registry v2 rejects an unrelated issuer JWK',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#auditRegistryIssuerKey').fill(JSON.stringify(fixture.publicKey));
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('changing signed registry issuer key invalidates the previous audit result',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT-HANDTEKENING CRYPTOGRAFISCH GELDIG');
 await page.locator('#auditRegistryIssuerKey').fill('{}');
 await expect(page.locator('#auditVerifyStatus')).toContainText('opnieuw controleren vereist');
 await expect(page.locator('#auditVerifyStatus')).not.toContainText('CRYPTOGRAFISCH GELDIG');
});

test('valid signed audit registry can be locally pinned after explicit consent',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#pinAuditRegistry')).toBeEnabled();
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#pinAuditRegistry').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDITREGISTER-PIN LOKAAL VASTGELEGD');
 const key='palaco.citadel.audit-registry-pin.v1.'+registry.signed.issuerFingerprint;
 const pin=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 expect(pin.issuedAt).toBe(registry.signed.issuedAt);
 expect(pin.digest).toMatch(/^[a-f0-9]{64}$/);
 await expect(page.locator('#pinAuditRegistry')).toBeDisabled();
});

test('audit registry rollback pin rejects an older signed snapshot from same issuer',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 const key='palaco.citadel.audit-registry-pin.v1.'+registry.signed.issuerFingerprint;
 const future=new Date(Date.parse(registry.signed.issuedAt)+1000).toISOString();
 await page.evaluate(([key,future])=>localStorage.setItem(key,JSON.stringify({issuedAt:future,digest:'a'.repeat(64)})),[key,future]);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
 await expect(page.locator('#pinAuditRegistry')).toBeDisabled();
});

test('audit registry rollback pin rejects conflicting content at equal issue timestamp',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 const key='palaco.citadel.audit-registry-pin.v1.'+registry.signed.issuerFingerprint;
 await page.evaluate(([key,when])=>localStorage.setItem(key,JSON.stringify({issuedAt:when,digest:'0'.repeat(64)})),[key,registry.signed.issuedAt]);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
 await expect(page.locator('#pinAuditRegistry')).toBeDisabled();
});

test('changing registry snapshot clears any uncommitted local anti-rollback candidate',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#pinAuditRegistry')).toBeEnabled();
 await page.locator('#auditRegistryIssuerKey').fill('{}');
 await expect(page.locator('#pinAuditRegistry')).toBeDisabled();
 await expect(page.locator('#auditVerifyStatus')).toContainText('opnieuw controleren vereist');
});

test('issuer fingerprint is pinned only with explicit local confirmation',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#pinAuditIssuer')).toBeEnabled();
 const before=await page.evaluate(()=>localStorage.getItem('palaco.citadel.audit-issuer-pin.v1'));
 expect(before).toBeNull();
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('#pinAuditIssuer').click();
 expect(await page.evaluate(()=>localStorage.getItem('palaco.citadel.audit-issuer-pin.v1'))).toBeNull();
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#pinAuditIssuer').click();
 const value=await page.evaluate(()=>JSON.parse(localStorage.getItem('palaco.citadel.audit-issuer-pin.v1')));
 expect(value.fingerprint).toBe(registry.signed.issuerFingerprint);
 expect(value.schema).toBe('palaco-citadel-local-issuer-pin-v1');
 await expect(page.locator('#pinAuditIssuer')).toBeDisabled();
});

test('a locally pinned issuer rejects a second valid but different register issuer',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 const another=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,another);
 await page.evaluate(([fingerprint])=>localStorage.setItem('palaco.citadel.audit-issuer-pin.v1',JSON.stringify({schema:'palaco-citadel-local-issuer-pin-v1',fingerprint})),[registry.signed.issuerFingerprint]);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
 await expect(page.locator('#pinAuditIssuer')).toBeDisabled();
});

test('locally pinned issuer cannot be bypassed using unsigned legacy audit registry',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const signed=await signedAuditRegistryFixture(page,report,fixture.detached);
 await attachAuditRegistry(page,report,fixture);
 await page.evaluate(([fingerprint])=>localStorage.setItem('palaco.citadel.audit-issuer-pin.v1',JSON.stringify({schema:'palaco-citadel-local-issuer-pin-v1',fingerprint})),[signed.signed.issuerFingerprint]);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('invalid issuer pin is fail-closed rather than silently ignored',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.evaluate(()=>localStorage.setItem('palaco.citadel.audit-issuer-pin.v1','{"schema":"corrupt"}'));
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
 await expect(page.locator('#pinAuditIssuer')).toBeDisabled();
});

test('issuer confirmation candidate is invalidated by key input change',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#pinAuditIssuer')).toBeEnabled();
 await page.locator('#auditRegistryIssuerKey').fill('{}');
 await expect(page.locator('#pinAuditIssuer')).toBeDisabled();
 await expect(page.locator('#auditVerifyStatus')).toContainText('opnieuw controleren vereist');
});

async function issuerSuccessionFixture(page,{tamperOld=false,tamperNew=false,expired=false}={}){
 return page.evaluate(async ({tamperOld,tamperNew,expired})=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const pairs=await Promise.all([0,1].map(()=>crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])));
  const pubs=await Promise.all(pairs.map(async p=>{const j=await crypto.subtle.exportKey('jwk',p.publicKey);return {kty:'EC',crv:'P-256',x:j.x,y:j.y}}));
  const fingerprint=async j=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(j)))),b=>b.toString(16).padStart(2,'0')).join('');
  const now=Date.now(),data={schema:'palaco-citadel-audit-issuer-rotation-v1',epoch:2,
   issuedAt:new Date(now-3600000).toISOString(),expiresAt:new Date(now+(expired?-1000:3600000)).toISOString(),
   oldFingerprint:await fingerprint(pubs[0]),newFingerprint:await fingerprint(pubs[1])};
  const payload=new TextEncoder().encode(canonical(data));
  const sigs=await Promise.all(pairs.map(p=>crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},p.privateKey,payload)));
  const b64=s=>btoa(String.fromCharCode(...new Uint8Array(s)));
  const declaration={...data,oldSignature:b64(sigs[0]),newSignature:b64(sigs[1])};
  if(tamperOld)declaration.oldSignature=btoa('incorrect old signer signature');
  if(tamperNew)declaration.newSignature=btoa('incorrect new signer signature');
  return {oldKey:pubs[0],newKey:pubs[1],declaration};
 },{tamperOld,tamperNew,expired});
}
async function uploadIssuerSuccession(page,f){
 await page.evaluate(fp=>localStorage.setItem('palaco.citadel.audit-issuer-pin.v1',JSON.stringify({schema:'palaco-citadel-local-issuer-pin-v1',fingerprint:fp})),f.declaration.oldFingerprint);
 await page.locator('#issuerRotationOldKey').fill(JSON.stringify(f.oldKey));
 await page.locator('#issuerRotationNewKey').fill(JSON.stringify(f.newKey));
 await page.locator('#issuerRotationFile').setInputFiles({name:'issuer-succession.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.declaration))});
}

test('dual issuer succession signature validates without activating new issuer',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerSuccessionFixture(page);
 await uploadIssuerSuccession(page,f);
 await page.locator('#verifyIssuerRotation').click();
 await expect(page.locator('#issuerRotationStatus')).toContainText('DUBBELE UITGEVERSOPVOLGING CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#issuerRotationStatus')).toContainText('NIET GEACTIVEERD');
 const pinned=await page.evaluate(()=>JSON.parse(localStorage.getItem('palaco.citadel.audit-issuer-pin.v1')));
 expect(pinned.fingerprint).toBe(f.declaration.oldFingerprint);
});

test('issuer succession refuses invalid signature by existing issuer',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerSuccessionFixture(page,{tamperOld:true});
 await uploadIssuerSuccession(page,f);
 await page.locator('#verifyIssuerRotation').click();
 await expect(page.locator('#issuerRotationStatus')).toContainText('UITGEVERSOPVOLGING AFGEWEZEN');
});

test('issuer succession refuses invalid signature by incoming issuer',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerSuccessionFixture(page,{tamperNew:true});
 await uploadIssuerSuccession(page,f);
 await page.locator('#verifyIssuerRotation').click();
 await expect(page.locator('#issuerRotationStatus')).toContainText('UITGEVERSOPVOLGING AFGEWEZEN');
});

test('issuer succession requires pinned current issuer rather than unpinned claims',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerSuccessionFixture(page);
 await page.locator('#issuerRotationOldKey').fill(JSON.stringify(f.oldKey));
 await page.locator('#issuerRotationNewKey').fill(JSON.stringify(f.newKey));
 await page.locator('#issuerRotationFile').setInputFiles({name:'issuer-succession.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.declaration))});
 await page.locator('#verifyIssuerRotation').click();
 await expect(page.locator('#issuerRotationStatus')).toContainText('UITGEVERSOPVOLGING AFGEWEZEN');
});

test('issuer succession expires and input edits invalidate previous results',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerSuccessionFixture(page,{expired:true});
 await uploadIssuerSuccession(page,f);
 await page.locator('#verifyIssuerRotation').click();
 await expect(page.locator('#issuerRotationStatus')).toContainText('UITGEVERSOPVOLGING AFGEWEZEN');
 const valid=await issuerSuccessionFixture(page);
 await uploadIssuerSuccession(page,valid);
 await page.locator('#verifyIssuerRotation').click();
 await expect(page.locator('#issuerRotationStatus')).toContainText('DUBBELE UITGEVERSOPVOLGING CRYPTOGRAFISCH GELDIG');
 await page.locator('#issuerRotationNewKey').fill('{}');
 await expect(page.locator('#issuerRotationStatus')).toContainText('opnieuw controleren vereist');
});

async function issuerRevocationFixture(page,{badIssuer=false,badReviewer=false,expired=false,future=false}={}){
 return page.evaluate(async ({badIssuer,badReviewer,expired,future})=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const pairs=await Promise.all([0,1].map(()=>crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])));
  const pubs=await Promise.all(pairs.map(async p=>{const j=await crypto.subtle.exportKey('jwk',p.publicKey);return {kty:'EC',crv:'P-256',x:j.x,y:j.y}}));
  const fingerprint=async j=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(j)))),b=>b.toString(16).padStart(2,'0')).join('');
  const now=Date.now(),data={schema:'palaco-citadel-audit-issuer-revocation-v1',epoch:4,reason:'security-revocation',
    issuedAt:new Date(now-7200000).toISOString(),effectiveAt:new Date(now+(future?3600000:-3600000)).toISOString(),
    expiresAt:new Date(now+(expired?-1000:3600000)).toISOString(),
    issuerFingerprint:await fingerprint(pubs[0]),reviewerFingerprint:await fingerprint(pubs[1])};
  const payload=new TextEncoder().encode(canonical(data));
  const sigs=await Promise.all(pairs.map(p=>crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},p.privateKey,payload)));
  const b64=x=>btoa(String.fromCharCode(...new Uint8Array(x)));
  const revocation={...data,issuerSignature:badIssuer?btoa('bad issuer signature'):b64(sigs[0]),reviewerSignature:badReviewer?btoa('bad reviewer signature'):b64(sigs[1])};
  return {issuer:pubs[0],reviewer:pubs[1],revocation};
 },{badIssuer,badReviewer,expired,future});
}
async function uploadIssuerRevocation(page,f,{pin=true}={}){
 if(pin)await page.evaluate(fp=>localStorage.setItem('palaco.citadel.audit-issuer-pin.v1',JSON.stringify({schema:'palaco-citadel-local-issuer-pin-v1',fingerprint:fp})),f.revocation.issuerFingerprint);
 await page.locator('#issuerRevokeKey').fill(JSON.stringify(f.issuer));
 await page.locator('#issuerRevokeReviewer').fill(JSON.stringify(f.reviewer));
 await page.locator('#issuerRevokeFile').setInputFiles({name:'issuer-revoke.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.revocation))});
}
test('dual signed audit issuer revocation verifies without altering pinned issuer',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerRevocationFixture(page);
 await uploadIssuerRevocation(page,f);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVERSINTREKKING DUBBEL CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#issuerRevokeStatus')).toContainText('GEEN AUTOMATISCHE INTREKKING');
 const pin=await page.evaluate(()=>JSON.parse(localStorage.getItem('palaco.citadel.audit-issuer-pin.v1')));
 expect(pin.fingerprint).toBe(f.revocation.issuerFingerprint);
});

test('issuer revocation rejects incorrect pinned issuer or absent pin',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerRevocationFixture(page);
 await uploadIssuerRevocation(page,f,{pin:false});
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVERSINTREKKING AFGEWEZEN');
 await page.evaluate(()=>localStorage.setItem('palaco.citadel.audit-issuer-pin.v1',JSON.stringify({schema:'palaco-citadel-local-issuer-pin-v1',fingerprint:'0'.repeat(64)})));
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVERSINTREKKING AFGEWEZEN');
});

test('issuer revocation rejects forged issuer signature',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerRevocationFixture(page,{badIssuer:true});
 await uploadIssuerRevocation(page,f);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVERSINTREKKING AFGEWEZEN');
});

test('issuer revocation rejects forged independent reviewer signature',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerRevocationFixture(page,{badReviewer:true});
 await uploadIssuerRevocation(page,f);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVERSINTREKKING AFGEWEZEN');
});

test('issuer revocation rejects expired or future-effective attestations and invalidates stale results',async ({page})=>{
 await signedPreviewFixture(page);
 const expired=await issuerRevocationFixture(page,{expired:true});
 await uploadIssuerRevocation(page,expired);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVERSINTREKKING AFGEWEZEN');
 const future=await issuerRevocationFixture(page,{future:true});
 await uploadIssuerRevocation(page,future);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVERSINTREKKING AFGEWEZEN');
 const valid=await issuerRevocationFixture(page);
 await uploadIssuerRevocation(page,valid);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVERSINTREKKING DUBBEL CRYPTOGRAFISCH GELDIG');
 await page.locator('#issuerRevokeReviewer').fill('{}');
 await expect(page.locator('#issuerRevokeStatus')).toContainText('opnieuw controleren vereist');
});

test('verified issuer revocation requires explicit user confirmation before local block',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerRevocationFixture(page);
 await uploadIssuerRevocation(page,f);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#confirmIssuerRevoke')).toBeEnabled();
 const key='palaco.citadel.audit-issuer-revoked.v1.'+f.revocation.issuerFingerprint;
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('#confirmIssuerRevoke').click();
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#confirmIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVER LOKAAL GEBLOKKEERD');
 const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 expect(stored.schema).toBe('palaco-citadel-local-issuer-revoked-v1');
 expect(stored.epoch).toBe(f.revocation.epoch);
 expect(stored.digest).toMatch(/^[a-f0-9]{64}$/);
});

test('locally revoked issuer blocks otherwise valid signed audit register',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT-HANDTEKENING CRYPTOGRAFISCH GELDIG');
 const key='palaco.citadel.audit-issuer-revoked.v1.'+registry.signed.issuerFingerprint;
 const record={schema:'palaco-citadel-local-issuer-revoked-v1',epoch:4,effectiveAt:new Date(Date.now()-1000).toISOString(),digest:'a'.repeat(64)};
 await page.evaluate(([key,record])=>localStorage.setItem(key,JSON.stringify(record)),[key,record]);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
 await expect(page.locator('#pinAuditIssuer')).toBeDisabled();
});

test('corrupted local issuer revocation record fails closed',async ({page})=>{
 const report=await exportedAuditFixture(page),fixture=await detachedAuditSignature(page,report);
 const registry=await signedAuditRegistryFixture(page,report,fixture.detached);
 await uploadSignedAuditRegistry(page,report,fixture,registry);
 await page.evaluate(fp=>localStorage.setItem('palaco.citadel.audit-issuer-revoked.v1.'+fp,'{"epoch":0}'),registry.signed.issuerFingerprint);
 await page.locator('#verifyAuditFile').click();
 await expect(page.locator('#auditVerifyStatus')).toContainText('AUDIT AFGEWEZEN');
});

test('invalid revocation or changed reviewer does not enable local blocking',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerRevocationFixture(page,{badReviewer:true});
 await uploadIssuerRevocation(page,f);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVERSINTREKKING AFGEWEZEN');
 await expect(page.locator('#confirmIssuerRevoke')).toBeDisabled();
 const valid=await issuerRevocationFixture(page);
 await uploadIssuerRevocation(page,valid);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#confirmIssuerRevoke')).toBeEnabled();
 await page.locator('#issuerRevokeReviewer').fill('{}');
 await expect(page.locator('#confirmIssuerRevoke')).toBeDisabled();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('opnieuw controleren vereist');
});

test('existing stronger local revocation cannot be overwritten by older epoch',async ({page})=>{
 await signedPreviewFixture(page);
 const f=await issuerRevocationFixture(page);
 await uploadIssuerRevocation(page,f);
 const key='palaco.citadel.audit-issuer-revoked.v1.'+f.revocation.issuerFingerprint;
 const original={schema:'palaco-citadel-local-issuer-revoked-v1',epoch:f.revocation.epoch+1,effectiveAt:new Date(Date.now()-1000).toISOString(),digest:'f'.repeat(64)};
 await page.evaluate(([key,value])=>localStorage.setItem(key,JSON.stringify(value)),[key,original]);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#confirmIssuerRevoke')).toBeEnabled();
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#confirmIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('LOKALE INTREKKINGSBLOKKADE MISLUKT');
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key)).toEqual(original);
});

async function localRevocationReceiptFixture(page){
 await signedPreviewFixture(page);
 const f=await issuerRevocationFixture(page);
 await uploadIssuerRevocation(page,f);
 await page.locator('#verifyIssuerRevoke').click();
 await expect(page.locator('#confirmIssuerRevoke')).toBeEnabled();
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#confirmIssuerRevoke').click();
 await expect(page.locator('#issuerRevokeStatus')).toContainText('UITGEVER LOKAAL GEBLOKKEERD');
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#exportIssuerRevocation').click();
 const download=await downloadPromise;
 const {readFile}=await import('node:fs/promises');
 return JSON.parse(await readFile(await download.path(),'utf8'));
}
test('local issuer revocation receipt exports and verifies without importing authority',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page);
 expect(receipt.schema).toBe('palaco-citadel-local-revocation-receipt-v1');
 expect(receipt.authorization).toBe('DENY');
 expect(receipt.issuance).toBe('HOLD');
 expect(receipt.integrity.digest).toMatch(/^[a-f0-9]{64}$/);
 const key='palaco.citadel.audit-issuer-revoked.v1.'+receipt.issuerFingerprint;
 await page.evaluate(key=>localStorage.removeItem(key),key);
 await page.locator('#issuerRevocationReceipt').setInputFiles({name:'receipt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('SHA-256 BEWIJSINTEGRITEIT GELDIG');
 await expect(page.locator('#issuerReceiptStatus')).toContainText('GEEN INTREKKING GEÏMPORTEERD');
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
});

test('modified issuer revocation receipt is rejected',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page);
 receipt.revocation.epoch+=1;
 await page.locator('#issuerRevocationReceipt').setInputFiles({name:'tampered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS AFGEWEZEN');
});

test('missing revocation or unsigned legacy export is rejected',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page);
 delete receipt.integrity;
 await page.locator('#issuerRevocationReceipt').setInputFiles({name:'unsigned.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS AFGEWEZEN');
 receipt.integrity={algorithm:'SHA-256',canonicalization:'palaco-sorted-json-v1',digest:'0'.repeat(64)};
 receipt.revocation=null;
 await page.locator('#issuerRevocationReceipt').setInputFiles({name:'missing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS AFGEWEZEN');
});

test('receipt verification outcome is invalidated after file replacement',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page);
 await page.locator('#issuerRevocationReceipt').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('SHA-256 BEWIJSINTEGRITEIT GELDIG');
 await page.locator('#issuerRevocationReceipt').setInputFiles({name:'new.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await expect(page.locator('#issuerReceiptStatus')).toContainText('opnieuw controleren vereist');
});

test('receipt export refuses absent local revocation without creating a download',async ({page})=>{
 await signedPreviewFixture(page);
 await page.locator('#exportIssuerRevocation').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('EXPORT AFGEWEZEN');
});

async function signedLocalReceiptFixture(page,receipt,{tampered=false,wrongDigest=false}={}){
 return page.evaluate(async ({receipt,tampered,wrongDigest})=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicJwk=await crypto.subtle.exportKey('jwk',pair.publicKey),publicKey={kty:'EC',crv:'P-256',x:publicJwk.x,y:publicJwk.y};
  const fp=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(publicKey)))),b=>b.toString(16).padStart(2,'0')).join('');
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(canonical(receipt)));
  const detached={schema:'palaco-citadel-revocation-receipt-signature-v1',algorithm:'ECDSA-P256-SHA256',
   receiptDigest:wrongDigest?'0'.repeat(64):receipt.integrity.digest,signerFingerprint:fp,
   signature:btoa(String.fromCharCode(...new Uint8Array(sig)))};
  if(tampered)detached.signature=btoa('invalid signature bytes');
  return {publicKey,detached};
 },{receipt,tampered,wrongDigest});
}
async function uploadSignedLocalReceipt(page,receipt,fixture){
 await page.locator('#issuerRevocationReceipt').setInputFiles({name:'receipt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
 await page.locator('#issuerReceiptSignerKey').fill(JSON.stringify(fixture.publicKey));
 await page.locator('#issuerReceiptSignatureFile').setInputFiles({name:'detached.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.detached))});
}

test('locally signed revocation receipt verifies but never imports revocation',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page),fixture=await signedLocalReceiptFixture(page,receipt);
 const key='palaco.citadel.audit-issuer-revoked.v1.'+receipt.issuerFingerprint;
 await page.evaluate(key=>localStorage.removeItem(key),key);
 await uploadSignedLocalReceipt(page,receipt,fixture);
 await page.locator('#requireIssuerReceiptSignature').check();
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJSHANDTEKENING CRYPTOGRAFISCH GELDIG');
 await expect(page.locator('#issuerReceiptStatus')).toContainText('NIET ONAFHANKELIJK VERTROUWD');
 await expect(page.locator('#issuerReceiptStatus')).toContainText('GEEN INTREKKING GEÏMPORTEERD');
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
});

test('mandatory revocation receipt signature refuses valid hash-only evidence',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page);
 await page.locator('#issuerRevocationReceipt').setInputFiles({name:'receipt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
 await page.locator('#requireIssuerReceiptSignature').check();
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS AFGEWEZEN');
 await expect(page.locator('#issuerReceiptStatus')).not.toContainText('SHA-256 BEWIJSINTEGRITEIT GELDIG');
});

test('revocation receipt verifier rejects changed signature and wrong digest',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page);
 const wrong=await signedLocalReceiptFixture(page,receipt,{tampered:true});
 await uploadSignedLocalReceipt(page,receipt,wrong);
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS AFGEWEZEN');
 const digest=await signedLocalReceiptFixture(page,receipt,{wrongDigest:true});
 await uploadSignedLocalReceipt(page,receipt,digest);
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS AFGEWEZEN');
});

test('revocation receipt signature input changes invalidate previous verification',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page),fixture=await signedLocalReceiptFixture(page,receipt);
 await uploadSignedLocalReceipt(page,receipt,fixture);
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJSHANDTEKENING CRYPTOGRAFISCH GELDIG');
 await page.locator('#issuerReceiptSignerKey').fill('{}');
 await expect(page.locator('#issuerReceiptStatus')).toContainText('opnieuw controleren vereist');
 await expect(page.locator('#issuerReceiptStatus')).not.toContainText('CRYPTOGRAFISCH GELDIG');
});

test('receipt signer pin is recorded only after explicit confirmation',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page),fixture=await signedLocalReceiptFixture(page,receipt);
 await uploadSignedLocalReceipt(page,receipt,fixture);
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#pinIssuerReceiptSigner')).toBeEnabled();
 const key='palaco.citadel.receipt-signer-pin.v1';
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('#pinIssuerReceiptSigner').click();
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#pinIssuerReceiptSigner').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS-ONDERTEKENAAR LOKAAL BEVESTIGD');
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 expect(saved.schema).toBe('palaco-citadel-local-receipt-signer-pin-v1');
 expect(saved.fingerprint).toBe(fixture.detached.signerFingerprint);
 await expect(page.locator('#pinIssuerReceiptSigner')).toBeDisabled();
});

test('receipt signer pin rejects second independently valid but different signer',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page);
 const old=await signedLocalReceiptFixture(page,receipt),another=await signedLocalReceiptFixture(page,receipt);
 await uploadSignedLocalReceipt(page,receipt,another);
 await page.evaluate(fp=>localStorage.setItem('palaco.citadel.receipt-signer-pin.v1',JSON.stringify({schema:'palaco-citadel-local-receipt-signer-pin-v1',fingerprint:fp})),old.detached.signerFingerprint);
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS AFGEWEZEN');
 await expect(page.locator('#pinIssuerReceiptSigner')).toBeDisabled();
});

test('receipt signer pin forbids unsigned SHA-256 downgrade even when strict checkbox is off',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page),fixture=await signedLocalReceiptFixture(page,receipt);
 await page.evaluate(fp=>localStorage.setItem('palaco.citadel.receipt-signer-pin.v1',JSON.stringify({schema:'palaco-citadel-local-receipt-signer-pin-v1',fingerprint:fp})),fixture.detached.signerFingerprint);
 await page.locator('#issuerRevocationReceipt').setInputFiles({name:'unsigned.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
 await expect(page.locator('#requireIssuerReceiptSignature')).not.toBeChecked();
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS AFGEWEZEN');
});

test('corrupt receipt signer pin fails closed',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page),fixture=await signedLocalReceiptFixture(page,receipt);
 await uploadSignedLocalReceipt(page,receipt,fixture);
 await page.evaluate(()=>localStorage.setItem('palaco.citadel.receipt-signer-pin.v1','{"schema":"invalid"}'));
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('BEWIJS AFGEWEZEN');
 await expect(page.locator('#pinIssuerReceiptSigner')).toBeDisabled();
});

test('receipt signer pin candidate disappears after changing signing key input',async ({page})=>{
 const receipt=await localRevocationReceiptFixture(page),fixture=await signedLocalReceiptFixture(page,receipt);
 await uploadSignedLocalReceipt(page,receipt,fixture);
 await page.locator('#verifyIssuerRevocationReceipt').click();
 await expect(page.locator('#pinIssuerReceiptSigner')).toBeEnabled();
 await page.locator('#issuerReceiptSignerKey').fill('{}');
 await expect(page.locator('#pinIssuerReceiptSigner')).toBeDisabled();
 await expect(page.locator('#issuerReceiptStatus')).toContainText('opnieuw controleren vereist');
});
