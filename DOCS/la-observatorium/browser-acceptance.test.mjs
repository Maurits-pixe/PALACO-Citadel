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
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport,acceptDownloads:true});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(`http://127.0.0.1:${address.port}/DOCS/la-observatorium/`);
  await run(page);
  assert.deepEqual(errors,[],'Browser should have no JS runtime errors');
 } finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}

for (const width of [320,390,1280]) {
 test(`Citadel Observatory browser roundtrip and tamper check at ${width}px`,{timeout:90000},async()=>{
  await withPage({width,height:800},async page=>{
   assert.equal(await page.locator('#persist').isChecked(),false);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
   assert.equal(overflow,false,`Horizontal overflow at ${width}px`);
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
   const downloadPromise=page.waitForEvent('download');
   await page.locator('#inspection-export').click();
   const download=await downloadPromise;
   const bytes=await readFile(await download.path());
   const packet=JSON.parse(bytes.toString('utf8'));
   assert.equal(packet.source_status,'SELF_REPORTED_NOT_VERIFIED');
   assert.equal(packet.verification.authority,'NONE');
   await page.locator('#dossier-file').setInputFiles({name:'dossier.json',mimeType:'application/json',buffer:bytes});
   await page.locator('#verify-dossier').click();
   await page.waitForFunction(()=>document.querySelector('#dossier-verdict')?.textContent?.includes('INTEGRITEIT KOMT OVEREEN'));
   const tampered=structuredClone(packet);
   tampered.observation.notes='Aangepaste tekst zonder nieuwe hash';
   await page.locator('#dossier-file').setInputFiles({name:'aangepast.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tampered))});
   await page.locator('#verify-dossier').click();
   await page.waitForFunction(()=>document.querySelector('#dossier-verdict')?.textContent?.includes('INTEGRITEIT AFGEWEZEN'));
   assert.match(await page.locator('#dossier-verdict').innerText(),/geen bewijs of mandaat/);
   assert.equal(await page.locator('#persist').isChecked(),false);
  });
 });
}
