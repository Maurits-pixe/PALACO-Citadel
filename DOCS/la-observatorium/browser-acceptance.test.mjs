import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const pageHtml=readFileSync(new URL('./index.html',import.meta.url));

async function withPage(viewport,run) {
 const server=createServer((req,res)=>{
  if(req.url==='/DOCS/la-observatorium/'||req.url==='/DOCS/la-observatorium/index.html'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
   res.end(pageHtml);
  } else {res.writeHead(404);res.end('Not found');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 let browser;
 try {
  browser=await chromium.launch({headless:true,timeout:20000});
  const context=await browser.newContext({viewport,acceptDownloads:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${address.port}/DOCS/la-observatorium/`,{timeout:10000});
  await run(page);
  assert.deepEqual(errors,[],'Browser should have no JS runtime errors');
 } finally {
  if(browser)await browser.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
 }
}

for (const width of [320,390,1280]) {
 test(`Citadel Observatory browser roundtrip and tamper check at ${width}px`,{timeout:90000},async()=>{
  await withPage({width,height:800},async page=>{
   assert.equal(await page.locator('#persist').isChecked(),false);
   assert.equal(await page.locator('[role="tab"]').count(),5);
   assert.equal(await page.locator('[role="tablist"]').count(),1);
   assert.equal(await page.locator('[role="tabpanel"]').count(),5);
   await page.locator('#tab-uitkijk').focus();
   await page.keyboard.press('ArrowRight');
   assert.equal(await page.locator('#tab-bewijs').getAttribute('aria-selected'),'true');
   assert.equal(await page.locator('#tab-bewijs').getAttribute('tabindex'),'0');
   await page.keyboard.press('Home');
   assert.equal(await page.locator('#tab-uitkijk').getAttribute('aria-selected'),'true');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
   assert.equal(overflow,false,`Horizontal overflow at ${width}px`);
   console.log('Observatorium browser journey: chapter navigation');
   await page.locator('[data-tab="atelier"]').click();
   await page.locator('#subject').fill('Mobiele waarneming');
   await page.locator('#kind').selectOption('OBSERVED');
   await page.locator('#reference').fill('QUAY: lokaal');
   await page.locator('#notes').fill('Alleen lokaal, niet geverifieerd.');
   await page.getByRole('button',{name:'Voeg lokale waarneming toe'}).click();
   await page.locator('[data-tab="geheugen"]').click();
   assert.match(await page.locator('#count').innerText(),/1 \/ 1/);
   await page.locator('#events button').click();
   assert.equal(await page.locator('#inspection-reference-state').innerText(),'NIET GEVERIFIEERD');
   assert.match(await page.locator('#inspection-reference-type').innerText(),/QUAY/);
   console.log('Observatorium browser journey: inspection dossier export');
   const downloadPromise=page.waitForEvent('download',{timeout:10000});
   await page.locator('#inspection-export').click();
   const download=await downloadPromise;
   const bytes=await readFile(await download.path());
   const packet=JSON.parse(bytes.toString('utf8'));
   assert.equal(packet.source_status,'SELF_REPORTED_NOT_VERIFIED');
   assert.equal(packet.verification.authority,'NONE');
   console.log('Observatorium browser journey: intact dossier verification');
   await page.locator('#dossier-file').setInputFiles({name:'dossier.json',mimeType:'application/json',buffer:bytes});
   await page.locator('#verify-dossier').click();
   await page.waitForFunction(()=>document.querySelector('#dossier-verdict')?.textContent?.includes('INTEGRITEIT KOMT OVEREEN'),null,{timeout:10000});
   console.log('Observatorium browser journey: tampered dossier rejection');
   const tampered=structuredClone(packet);
   tampered.observation.notes='Aangepaste tekst zonder nieuwe hash';
   await page.locator('#dossier-file').setInputFiles({name:'aangepast.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tampered))});
   assert.match(await page.locator('#dossier-verdict').innerText(),/controle nog niet uitgevoerd/,'Previously successful verdict must reset on new file');
   await page.locator('#verify-dossier').click();
   await page.waitForFunction(()=>document.querySelector('#dossier-verdict')?.textContent?.includes('INTEGRITEIT AFGEWEZEN'),null,{timeout:10000});
   assert.match(await page.locator('#dossier-verdict').innerText(),/geen bewijs of mandaat/);
   assert.equal(await page.locator('#persist').isChecked(),false);
   assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
   assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),null);
  });
 });
}

test('non-consented notes disappear after reload without device persistence',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.locator('#subject').fill('Tijdelijke notitie');
  await page.locator('#notes').fill('Geen toestemming tot bewaren');
  await page.locator('#form button[type="submit"]').click();
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/1 \/ 1/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
  await page.reload();
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
  assert.equal(await page.locator('#persist').isChecked(),false);
 });
});

test('explicit opt-in survives reload; revocation erases saved copy',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.locator('#persist').check();
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),'yes');
  await page.locator('#subject').fill('Bewaarproef');
  await page.locator('#notes').fill('Alleen met toestemming');
  await page.locator('#form button[type="submit"]').click();
  assert.ok(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')));
  await page.reload();
  assert.equal(await page.locator('#persist').isChecked(),true);
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/1 \/ 1/);
  await page.locator('#tab-atelier').click();
  await page.locator('#persist').uncheck();
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),null);
  await page.reload();
  assert.equal(await page.locator('#persist').isChecked(),false);
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
 });
});

test('orphaned local note copy is purged when no consent marker exists',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  const orphan=[{id:'orphan-1',at:'2026-11-17T07:00:00.000Z',subject:'Old copy',kind:'OBSERVED',reference:'',notes:'No current consent'}];
  await page.evaluate(items=>{
   localStorage.setItem('palaco_la_observatory_notes_v1',JSON.stringify(items));
   localStorage.removeItem('palaco_la_observatory_consent_v1');
  },orphan);
  await page.reload();
  assert.equal(await page.locator('#persist').isChecked(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
 });
});

test('corrupt consented local memory is quarantined until explicit reset',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  const corrupt='{not valid JSON';
  await page.evaluate(raw=>{
   localStorage.setItem('palaco_la_observatory_consent_v1','yes');
   localStorage.setItem('palaco_la_observatory_notes_v1',raw);
  },corrupt);
  await page.reload();
  assert.equal(await page.locator('#persist').isDisabled(),true);
  assert.match(await page.locator('#storage').innerText(),/HERSTEL VEREIST/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),corrupt,
    'Damaged local copy must not be overwritten during startup');
  await page.locator('#tab-geheugen').click();
  assert.match(await page.locator('#count').innerText(),/0 \/ 0/);
  await page.locator('#tab-atelier').click();
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('#storage-reset').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),corrupt,
    'Cancelling the reset retains the original');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#storage-reset').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_consent_v1')),null);
  assert.equal(await page.locator('#persist').isDisabled(),false);
 });
});
test('schema-invalid consented memory is not silently filtered or overwritten',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  const malformed=JSON.stringify([{id:'bad',at:'not-a-date',subject:'Bad',kind:'OBSERVED',reference:'',notes:'Invalid timestamp'}]);
  await page.evaluate(raw=>{
   localStorage.setItem('palaco_la_observatory_consent_v1','yes');
   localStorage.setItem('palaco_la_observatory_notes_v1',raw);
  },malformed);
  await page.reload();
  assert.equal(await page.locator('#persist').isDisabled(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')),malformed);
 });
});

test('failed local wipe never claims success or releases storage guard',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.locator('#persist').check();
  await page.locator('#subject').fill('Wisfout controle');
  await page.locator('#notes').fill('Alleen lokaal met toestemming');
  await page.locator('#form button[type="submit"]').click();
  assert.ok(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')));
  await page.evaluate(()=>{
   const remove=Storage.prototype.removeItem;
   Storage.prototype.removeItem=function(key){
    if(key==='palaco_la_observatory_notes_v1')throw new Error('Simulated storage remove failure');
    return remove.call(this,key);
   };
  });
  await page.locator('#persist').uncheck();
  assert.equal(await page.locator('#persist').isDisabled(),true);
  assert.match(await page.locator('#storage').innerText(),/WISSEN NIET BEVESTIGD/);
  assert.doesNotMatch(await page.locator('#announce').innerText(),/aantoonbaar verwijderd/);
  assert.ok(await page.evaluate(()=>localStorage.getItem('palaco_la_observatory_notes_v1')));
  assert.equal(await page.locator('#storage-reset').isVisible(),true);
 });
});
test('failed local write does not claim storage enabled',{timeout:60000},async()=>{
 await withPage({width:390,height:800},async page=>{
  await page.locator('#tab-atelier').click();
  await page.evaluate(()=>{
   const set=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){
    if(key==='palaco_la_observatory_notes_v1')throw new Error('Simulated storage write failure');
    return set.call(this,key,value);
   };
  });
  await page.locator('#persist').check();
  assert.equal(await page.locator('#persist').isDisabled(),true);
  assert.match(await page.locator('#storage').innerText(),/OPSLAG ONBEVESTIGD/);
  assert.doesNotMatch(await page.locator('#announce').innerText(),/Opslag bevestigd/);
 });
});
