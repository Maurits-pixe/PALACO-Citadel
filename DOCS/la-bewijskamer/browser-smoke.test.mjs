import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname,sep,extname} from "node:path";
import {chromium,devices} from "playwright";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const types={".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
let server,base,browser;
const T="2026-11-17T12:00:00.000Z";
const handoff=()=>({
 schema:"PALACO-CITADEL-HANDOFF-DRAFT-1",
 documentType:"UNVERIFIED_MEMORY_REVIEW_REQUEST",
 origin:{module:"CITADEL_GEHEUGENKAMER",selectedRecordId:"rec-1"},
 destination:{module:"BEWIJSKAMER",nextGate:"ERA_EVIDENCE_REVIEW",mode:"MANUAL_FILE_TRANSFER_ONLY"},
 consent:{scope:"ONE_LOCAL_EXPORT",given:true,recordedAt:T},
 trust:{state:"SELF_REPORTED_NOT_VERIFIED",sourceVerified:false,clockAttested:false,review:"PENDING",edtrIssued:false,authority:"NONE"},
 lineage:[{recordId:"rec-1",previousId:"",version:1,createdAt:T,source:"Lokale notitie",category:"Citadel",title:"Verifieer mij niet"}],
 reviewChecklist:{sourceAuthenticity:"UNASSESSED",completeness:"UNASSESSED",identityBinding:"UNASSESSED",chronology:"UNASSESSED"},
 exportedAt:T
});

test.before(async()=>{
 server=createServer(async(req,res)=>{
   try{
     const path=new URL(req.url,"http://localhost").pathname;
     const target=resolve(root,"."+decodeURIComponent(path.endsWith("/")?path+"index.html":path));
     if(!target.startsWith(root+sep)){res.writeHead(403).end();return}
     const info=await stat(target);if(!info.isFile())throw Error("not file");
     res.writeHead(200,{"content-type":types[extname(target)]||"application/octet-stream","cache-control":"no-store"});
     res.end(await readFile(target));
   }catch{res.writeHead(404).end("Not found")}
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 base="http://127.0.0.1:"+server.address().port;
 browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();await new Promise(ok=>server?.close(ok))});

for(const [deviceName,viewport] of [["desktop",{viewport:{width:1280,height:800}}],["mobile",devices["iPhone 13"]]]){
 test("real browser "+deviceName+": memory, consent and review triage",async()=>{
   const context=await browser.newContext(viewport);
   const page=await context.newPage();
   const errs=[];page.on("pageerror",e=>errs.push(e.message));
   await page.goto(base+"/DOCS/la-geheugenkamer/");
   await assert.equal(await page.locator("h1").innerText(),"De Geheugenkamer");
   await page.locator("#title").fill("De eerste herinnering");
   await page.locator("#who").fill("Een bezoeker");
   await page.locator("#what").fill("Een testwaarneming");
   await page.locator("#source").fill("Bron A");
   await page.locator("#entryForm button[type=submit]").click();
   assert.equal(await page.locator("#count").innerText(),"1");
   assert.equal(await page.evaluate(()=>localStorage.length),0,"no default permanent storage");

   // No export without separate consent.
   await page.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).click();
   await page.locator("#contractExport").click();
   assert.match(await page.locator("#message").innerText(),/toestemming ontbreekt/);

   await page.locator("#handoffConsent").check();
   const [download]=await Promise.all([
     page.waitForEvent("download"),page.locator("#contractExport").click()
   ]);
   const bytes=await readFile(await download.path());
   const payload=JSON.parse(bytes.toString("utf8"));
   assert.equal(payload.trust.authority,"NONE");
   assert.equal(payload.trust.edtrIssued,false);
   assert.equal(await page.locator("#handoffConsent").isChecked(),false);

   await page.goto(base+"/DOCS/la-bewijskamer/");
   await page.locator("#handoff").setInputFiles({
     name:"handoff.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(payload))
   });
   await page.waitForFunction(()=>document.querySelector("#state").textContent==="CONCEPT ONTVANGEN");
   await assert.equal(await page.locator("#state").innerText(),"CONCEPT ONTVANGEN");
   await assert.equal(await page.locator("#triageStatus").innerText(),"READY_FOR_HUMAN_REVIEW");
   assert.match(await page.locator("#details").innerText(),/SELF_REPORTED_NOT_VERIFIED/);
   assert.equal(errs.length,0,"browser runtime errors: "+errs.join("; "));

   // A forged authority field must be rejected and previous dossier must not survive.
   payload.trust.authority="OWNER";
   await page.locator("#handoff").setInputFiles({
     name:"forged.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(payload))
   });
   await assert.equal(await page.locator("#state").innerText(),"GEEN DOSSIER");
   assert.match(await page.locator("#status").innerText(),/GEWEIGERD/);
   await context.close();
 });
}

test("real Chromium: injected markup stays inert in the receiving dossier",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 await page.goto(base+"/DOCS/la-bewijskamer/");
 const payload=handoff();
 payload.lineage[0].title='<img src=x onerror="window.__pwned=1">';
 payload.lineage[0].source="<script>window.__pwned=1</script>";
 await page.locator("#handoff").setInputFiles({name:"untrusted.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(payload))});
 assert.equal(await page.locator("#state").innerText(),"CONCEPT ONTVANGEN");
 assert.equal(await page.locator("#details img").count(),0);
 assert.equal(await page.locator("#details script").count(),0);
 assert.match(await page.locator("#details").innerText(),/<img src=x/);
 assert.equal(await page.evaluate(()=>window.__pwned),undefined);
 await context.close();
});

test("real Chromium: keyboard reachability and missing-source intake hold",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 await page.goto(base+"/DOCS/la-bewijskamer/");
 const file=page.locator("#handoff");
 await file.focus();
 assert.equal(await file.evaluate(el=>document.activeElement===el),true);
 const payload=handoff();payload.lineage[0].source="";
 await file.setInputFiles({name:"missing-source.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(payload))});
 assert.equal(await page.locator("#triageStatus").innerText(),"NEEDS_SOURCE_MATERIAL");
 assert.match(await page.locator("#triageIssues").innerText(),/MISSING_SOURCE/);
 assert.equal(await page.locator("#assessment").isVisible(),true);
 await page.locator("#discard").click();
 assert.equal(await page.locator("#assessment").isVisible(),false);
 assert.equal(await page.locator("#triageStatus").innerText(),"NOT_STARTED");
 assert.equal(await page.locator("#details").innerText(),"Geen dossier geladen.");
 await context.close();
});

test("offline archive: refresh requires explicit restore, consent can erase local copy",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 await page.goto(base+"/DOCS/la-geheugenkamer/");
 await page.locator("#title").fill("Offline geschiedenis");
 await page.locator("#who").fill("Waarnemer");
 await page.locator("#what").fill("Blijft op dit apparaat");
 await page.locator("#entryForm button[type=submit]").click();
 await page.locator("#persist").check();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("palaco.citadel.geheugenkamer.v1")).length),1);
 await page.reload();
 assert.equal(await page.locator("#count").innerText(),"0","No automatic archive restoration");
 assert.equal(await page.locator("#persist").isChecked(),false);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("palaco.citadel.geheugenkamer.v1")).length),1);
 await page.locator("#persist").click();
 assert.equal(await page.locator("#persist").isChecked(),false,"Reject toggling storage before restore");
 assert.match(await page.locator("#message").innerText(),/Laad eerder lokaal archief/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("palaco.citadel.geheugenkamer.v1")).length),1);
 await page.locator("#restore").click();
 assert.equal(await page.locator("#count").innerText(),"1");
 assert.equal(await page.locator("#persist").isChecked(),true);
 await page.locator("#persist").uncheck();
 assert.equal(await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.v1")),null);
 await context.close();
});

test("offline archive: invalid stored data cannot be restored or overwritten by consent",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 await page.goto(base+"/DOCS/la-geheugenkamer/");
 await page.evaluate(()=>localStorage.setItem("palaco.citadel.geheugenkamer.v1",'{"records":"tampered"}'));
 await page.locator("#restore").click();
 assert.equal(await page.locator("#count").innerText(),"0");
 assert.match(await page.locator("#message").innerText(),/Herstel geweigerd/);
 await page.locator("#persist").click();
 assert.equal(await page.locator("#persist").isChecked(),false);
 assert.equal(await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.v1")),'{"records":"tampered"}');
 await context.close();
});

test("portable archive: export on one device and import on another",async()=>{
 const sender=await browser.newContext({viewport:{width:1280,height:800}});
 const a=await sender.newPage();await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Wereldherinnering");
 await a.locator("#who").fill("Waarnemer");
 await a.locator("#what").fill("Een offline overdracht");
 await a.locator("#category").selectOption("Wereld");
 await a.locator("#entryForm button[type=submit]").click();
 const [download]=await Promise.all([a.waitForEvent("download"),a.locator("#export").click()]);
 const archive=await readFile(await download.path());
 const receiver=await browser.newContext({viewport:{width:390,height:844}});
 const b=await receiver.newPage();await b.goto(base+"/DOCS/la-geheugenkamer/");
 assert.equal(await b.evaluate(()=>localStorage.length),0);
 await b.locator("#file").setInputFiles({name:"memory.json",mimeType:"application/json",buffer:archive});
 assert.equal(await b.locator("#count").innerText(),"1");
 assert.match(await b.locator("#timeline").innerText(),/Wereldherinnering/);
 assert.equal(await b.evaluate(()=>localStorage.length),0,"Import does not silently persist");
 await b.locator("#file").setInputFiles({name:"memory.json",mimeType:"application/json",buffer:archive});
 assert.equal(await b.locator("#count").innerText(),"1","Reimport is idempotent");
 await sender.close();await receiver.close();
});
test("portable archive: forged authority and unknown record fields fail closed",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();await page.goto(base+"/DOCS/la-geheugenkamer/");
 const entry={id:"arch-1",createdAt:T,previousId:"",version:1,trust:"SELF_REPORTED_NOT_VERIFIED",title:"Eerste",who:"W",what:"X",where:"",why:"",how:"",source:"",category:"Persoonlijk"};
 const pkg={schema:"PALACO-CITADEL-GEHEUGEN-1",issuedAt:null,authority:"OWNER",status:"LOCAL_DRAFT_ONLY",exportedAt:T,entries:[entry]};
 await page.locator("#file").setInputFiles({name:"forged.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(pkg))});
 assert.equal(await page.locator("#count").innerText(),"0");
 assert.match(await page.locator("#message").innerText(),/geweigerd/);
 pkg.authority="NONE";pkg.entries[0].verified=true;
 await page.locator("#file").setInputFiles({name:"extra.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(pkg))});
 assert.equal(await page.locator("#count").innerText(),"0");
 assert.match(await page.locator("#message").innerText(),/geweigerd/);
 await context.close();
});

test("SHA-256 portable archive: refuse changed title and digest after export",async()=>{
 const from=await browser.newContext({viewport:{width:1280,height:800}});
 const a=await from.newPage();await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Verzegelde notitie");
 await a.locator("#who").fill("Waarnemer");
 await a.locator("#what").fill("Originele inhoud");
 await a.locator("#entryForm button[type=submit]").click();
 const [download]=await Promise.all([a.waitForEvent("download"),a.locator("#export").click()]);
 const original=JSON.parse((await readFile(await download.path())).toString("utf8"));
 assert.equal(original.schema,"PALACO-CITADEL-GEHEUGEN-2");
 assert.match(original.integrity.digest,/^[0-9a-f]{64}$/);
 const to=await browser.newContext({viewport:{width:390,height:844}});
 const b=await to.newPage();await b.goto(base+"/DOCS/la-geheugenkamer/");
 original.entries[0].title="Vervalsing";
 await b.locator("#file").setInputFiles({name:"tampered.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(original))});
 assert.equal(await b.locator("#count").innerText(),"0");
 assert.match(await b.locator("#message").innerText(),/SHA-256 checksum wijkt af/);
 await from.close();await to.close();
});
test("legacy archive remains importable but warns checksum unverified",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();await page.goto(base+"/DOCS/la-geheugenkamer/");
 const entry={id:"legacy-record",createdAt:T,previousId:"",version:1,trust:"SELF_REPORTED_NOT_VERIFIED",title:"Historisch archief",who:"W",what:"X",where:"",why:"",how:"",source:"",category:"Persoonlijk"};
 const legacy={schema:"PALACO-CITADEL-GEHEUGEN-1",issuedAt:null,authority:"NONE",status:"LOCAL_DRAFT_ONLY",exportedAt:T,entries:[entry]};
 await page.locator("#file").setInputFiles({name:"legacy.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(legacy))});
 assert.equal(await page.locator("#count").innerText(),"1");
 assert.match(await page.locator("#message").innerText(),/zonder checksum/);
 await context.close();
});

test("encrypted archive: AES-GCM roundtrip on separate browser context",async()=>{
 const src=await browser.newContext({viewport:{width:1280,height:800}}),a=await src.newPage();
 await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Privé herinnering");
 await a.locator("#who").fill("Waarnemer");
 await a.locator("#what").fill("Versleutelde inhoud");
 await a.locator("#entryForm button[type=submit]").click();
 await a.locator("#archivePassphrase").fill("Test wachtzin nummer 123!");
 const [download]=await Promise.all([a.waitForEvent("download"),a.locator("#encryptedExport").click()]);
 const bytes=await readFile(await download.path()),doc=JSON.parse(bytes.toString("utf8"));
 assert.equal(doc.schema,"PALACO-CITADEL-GEHEUGEN-ENCRYPTED-1");
 assert.equal(doc.kdf.iterations,310000);
 assert.equal(doc.cipher.name,"AES-256-GCM");
 assert.equal(bytes.includes(Buffer.from("Privé herinnering")),false,"No plaintext title in encrypted file");
 assert.equal(await a.locator("#archivePassphrase").inputValue(),"","No persistent passphrase in UI");
 const dest=await browser.newContext({viewport:{width:390,height:844}}),b=await dest.newPage();
 await b.goto(base+"/DOCS/la-geheugenkamer/");
 await b.locator("#archivePassphrase").fill("Test wachtzin nummer 123!");
 await b.locator("#file").setInputFiles({name:"encrypted.json",mimeType:"application/json",buffer:bytes});
 await b.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 assert.equal(await b.locator("#count").innerText(),"1");
 assert.match(await b.locator("#timeline").innerText(),/Privé herinnering/);
 assert.equal(await b.locator("#archivePassphrase").inputValue(),"");
 assert.equal(await b.evaluate(()=>localStorage.length),0);
 await src.close();await dest.close();
});
test("encrypted archive: wrong passphrase and corrupted ciphertext cannot be imported",async()=>{
 const c=await browser.newContext({viewport:{width:1280,height:800}}),a=await c.newPage();
 await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Beschermd");await a.locator("#who").fill("W");await a.locator("#what").fill("Geheim");
 await a.locator("#entryForm button[type=submit]").click();
 await a.locator("#archivePassphrase").fill("Geheime wachtzin 123");
 const [file]=await Promise.all([a.waitForEvent("download"),a.locator("#encryptedExport").click()]);
 const obj=JSON.parse((await readFile(await file.path())).toString("utf8"));
 const receiver=await browser.newContext({viewport:{width:390,height:844}}),b=await receiver.newPage();
 await b.goto(base+"/DOCS/la-geheugenkamer/");
 await b.locator("#archivePassphrase").fill("Verkeerde wachtzin 456");
 await b.locator("#file").setInputFiles({name:"wrong.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(obj))});
 assert.equal(await b.locator("#count").innerText(),"0");
 await b.waitForFunction(()=>document.querySelector("#message").textContent.includes("verkeerde wachtzin"));
 assert.match(await b.locator("#message").innerText(),/verkeerde wachtzin/);
 await b.locator("#archivePassphrase").fill("Geheime wachtzin 123");
 const original=obj.cipher.data;obj.cipher.data=(original[0]==="A"?"B":"A")+original.slice(1);
 await b.locator("#file").setInputFiles({name:"changed.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(obj))});
 assert.equal(await b.locator("#count").innerText(),"0");
 await b.waitForFunction(()=>document.querySelector("#message").textContent.includes("beschadigd bestand"));
 assert.match(await b.locator("#message").innerText(),/beschadigd bestand/);
 await c.close();await receiver.close();
});

test("encrypted local vault: manual save, reload stays locked, unlock and lock",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();await page.goto(base+"/DOCS/la-geheugenkamer/");
 await page.locator("#title").fill("Versleutelde apparaatnotitie");
 await page.locator("#who").fill("Eigenaar");
 await page.locator("#what").fill("Privé");
 await page.locator("#entryForm button[type=submit]").click();
 await page.locator("#archivePassphrase").fill("Sterke lokale wachtzin 123!");
 await page.locator("#vaultSave").click();
 await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const raw=await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 assert.ok(raw);assert.equal(raw.includes("Versleutelde apparaatnotitie"),false);
 assert.equal(await page.locator("#archivePassphrase").inputValue(),"");
 assert.equal(await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.v1")),null);
 await page.reload();
 assert.equal(await page.locator("#count").innerText(),"0","Vault never auto-unlocks");
 await page.locator("#archivePassphrase").fill("Onjuiste kluiswachtzin 456");
 await page.locator("#vaultUnlock").click();
 await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("verkeerde wachtzin"));
 assert.equal(await page.locator("#count").innerText(),"0");
 await page.locator("#archivePassphrase").fill("Sterke lokale wachtzin 123!");
 await page.locator("#vaultUnlock").click();
 await page.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 assert.equal(await page.locator("#archivePassphrase").inputValue(),"");
 page.once("dialog",dialog=>dialog.accept());
 await page.locator("#vaultLock").click();
 assert.equal(await page.locator("#count").innerText(),"0");
 assert.ok(await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")));
 await context.close();
});

test("encrypted local vault: refuse plaintext opt-in and vault save over plaintext",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();await page.goto(base+"/DOCS/la-geheugenkamer/");
 await page.locator("#title").fill("Geen dubbele opslag");
 await page.locator("#who").fill("W");
 await page.locator("#what").fill("X");
 await page.locator("#entryForm button[type=submit]").click();
 await page.locator("#persist").check();
 await page.locator("#archivePassphrase").fill("Geheim apparaat 123!");
 await page.locator("#vaultSave").click();
 assert.match(await page.locator("#message").innerText(),/schakel eerst onversleutelde/);
 assert.equal(await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),null);
 await page.locator("#vaultLock").click();
 assert.equal(await page.locator("#count").innerText(),"1","Refuse misleading lock");
 await page.locator("#persist").uncheck();
 await page.locator("#archivePassphrase").fill("Geheim apparaat 123!");
 await page.locator("#vaultSave").click();
 await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 await page.locator("#persist").click();
 assert.equal(await page.locator("#persist").isChecked(),false);
 assert.match(await page.locator("#message").innerText(),/Onversleuteld opslaan geweigerd/);
 await context.close();
});

test("vault save cannot commit a stale snapshot after a memory edit",async()=>{
 const c=await browser.newContext({viewport:{width:390,height:844}});
 const p=await c.newPage();await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Eerste");await p.locator("#who").fill("W");await p.locator("#what").fill("A");await p.locator("#entryForm button[type=submit]").click();
 await p.evaluate(()=>{
   const real=SubtleCrypto.prototype.deriveKey;
   window.__cryptoPending=false;
   SubtleCrypto.prototype.deriveKey=function(...args){
     window.__cryptoPending=true;
     return new Promise((resolve,reject)=>{window.__releaseCrypto=()=>real.apply(this,args).then(resolve,reject)});
   };
 });
 await p.locator("#archivePassphrase").fill("Kluis geheim voor test 123");
 await p.locator("#vaultSave").click();
 await p.waitForFunction(()=>window.__cryptoPending);
 await p.locator("#title").fill("Tweede");await p.locator("#who").fill("W");await p.locator("#what").fill("B");await p.locator("#entryForm button[type=submit]").click();
 await p.evaluate(()=>window.__releaseCrypto());
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Kluisopslag geweigerd"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),null);
 assert.equal(await p.locator("#count").innerText(),"2");
 await c.close();
});

test("vault unlock cannot resurrect entries after explicit lock",async()=>{
 const c=await browser.newContext({viewport:{width:390,height:844}});
 const p=await c.newPage();await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Kluisrecord");await p.locator("#who").fill("W");await p.locator("#what").fill("C");await p.locator("#entryForm button[type=submit]").click();
 await p.locator("#archivePassphrase").fill("Kluis wachtzin voor test 123");
 await p.locator("#vaultSave").click();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 await p.reload();
 await p.evaluate(()=>{
   const real=SubtleCrypto.prototype.deriveKey;window.__cryptoPending=false;
   SubtleCrypto.prototype.deriveKey=function(...args){
     window.__cryptoPending=true;
     return new Promise((resolve,reject)=>{window.__releaseCrypto=()=>real.apply(this,args).then(resolve,reject)});
   };
 });
 await p.locator("#archivePassphrase").fill("Kluis wachtzin voor test 123");
 await p.locator("#vaultUnlock").click();
 await p.waitForFunction(()=>window.__cryptoPending);
 await p.locator("#vaultLock").click();
 assert.equal(await p.locator("#count").innerText(),"0");
 await p.evaluate(()=>window.__releaseCrypto());
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Ontgrendeling geweigerd"));
 assert.equal(await p.locator("#count").innerText(),"0");
 await c.close();
});

test("cross-tab change interrupts pending vault unlock and prevents stale reveal",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const a=await context.newPage();await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Andere tab");await a.locator("#who").fill("W");await a.locator("#what").fill("Geheim");await a.locator("#entryForm button[type=submit]").click();
 await a.locator("#archivePassphrase").fill("Kluis wachtzin tussen tabs 123");
 await a.locator("#vaultSave").click();
 await a.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 await a.reload();
 const b=await context.newPage();await b.goto(base+"/DOCS/la-geheugenkamer/");
 await a.evaluate(()=>{
   const real=SubtleCrypto.prototype.deriveKey;window.__pending=false;
   SubtleCrypto.prototype.deriveKey=function(...args){
     window.__pending=true;
     return new Promise((resolve,reject)=>{window.__release=()=>real.apply(this,args).then(resolve,reject)});
   };
 });
 await a.locator("#archivePassphrase").fill("Kluis wachtzin tussen tabs 123");
 await a.locator("#vaultUnlock").click();
 await a.waitForFunction(()=>window.__pending);
 await b.evaluate(()=>localStorage.removeItem("palaco.citadel.geheugenkamer.vault.v1"));
 await a.waitForFunction(()=>document.querySelector("#message").textContent.includes("Kluis elders gewijzigd"));
 await a.evaluate(()=>window.__release());
 await a.waitForFunction(()=>document.querySelector("#message").textContent.includes("Ontgrendeling geweigerd"));
 assert.equal(await a.locator("#count").innerText(),"0");
 assert.equal(await a.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),null);
 await context.close();
});

test("cross-tab storage event reports modification of plaintext store",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const a=await context.newPage();await a.goto(base+"/DOCS/la-geheugenkamer/");
 const b=await context.newPage();await b.goto(base+"/DOCS/la-geheugenkamer/");
 await b.evaluate(()=>localStorage.setItem("palaco.citadel.geheugenkamer.v1","[]"));
 await a.waitForFunction(()=>document.querySelector("#message").textContent.includes("andere tab gewijzigd"));
 assert.equal(await a.locator("#count").innerText(),"0");
 await context.close();
});

test("vault revision increments only from a known unlocked snapshot",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const a=await context.newPage();await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("v1");await a.locator("#who").fill("W");await a.locator("#what").fill("Een");await a.locator("#entryForm button[type=submit]").click();
 await a.locator("#archivePassphrase").fill("Versie wachtzin nummer 123!");
 await a.locator("#vaultSave").click();
 await a.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")).revision),1);
 await a.locator("#title").fill("v2");await a.locator("#who").fill("W");await a.locator("#what").fill("Twee");await a.locator("#entryForm button[type=submit]").click();
 a.once("dialog",d=>d.accept());
 await a.locator("#archivePassphrase").fill("Versie wachtzin nummer 123!");
 await a.locator("#vaultSave").click();
 await a.waitForFunction(()=>document.querySelector("#message").textContent.includes("versie 2"));
 const wrapped=await a.evaluate(()=>JSON.parse(localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")));
 assert.equal(wrapped.revision,2);
 assert.match(wrapped.parentDigest,/^[0-9a-f]{64}$/);
 await context.close();
});

test("stale tab cannot overwrite newer vault and must unlock first",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const a=await context.newPage(),b=await context.newPage();
 await a.goto(base+"/DOCS/la-geheugenkamer/");await b.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Nieuwste notitie");await a.locator("#who").fill("W");await a.locator("#what").fill("Niet wissen");await a.locator("#entryForm button[type=submit]").click();
 await a.locator("#archivePassphrase").fill("Gedeeld geheim nummer 123!");
 await a.locator("#vaultSave").click();
 await a.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await a.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 await b.locator("#title").fill("Oud tabvenster");await b.locator("#who").fill("W");await b.locator("#what").fill("Oude data");await b.locator("#entryForm button[type=submit]").click();
 await b.locator("#archivePassphrase").fill("Gedeeld geheim nummer 123!");
 await b.locator("#vaultSave").click();
 await b.waitForFunction(()=>document.querySelector("#message").textContent.includes("Kluisconflict"));
 assert.equal(await b.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 b.once("dialog",d=>d.accept());
 await b.locator("#vaultLock").click();
 await b.locator("#archivePassphrase").fill("Gedeeld geheim nummer 123!");
 await b.locator("#vaultUnlock").click();
 await b.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 assert.match(await b.locator("#timeline").innerText(),/Nieuwste notitie/);
 await context.close();
});

test("Web Locks: encrypted vault write waits for other tab's exclusive lock",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const holder=await context.newPage(),writer=await context.newPage();
 await holder.goto(base+"/DOCS/la-geheugenkamer/");
 await writer.goto(base+"/DOCS/la-geheugenkamer/");
 await holder.evaluate(()=>{
   window.__held=false;
   window.__locked=navigator.locks.request("palaco.citadel.geheugenkamer.vault.write",{mode:"exclusive"},async()=>{
      window.__held=true;await new Promise(resolve=>window.__unlock=resolve);
   });
 });
 await holder.waitForFunction(()=>window.__held);
 await writer.locator("#title").fill("Exclusieve kluis");
 await writer.locator("#who").fill("W");await writer.locator("#what").fill("Een");
 await writer.locator("#entryForm button[type=submit]").click();
 await writer.locator("#archivePassphrase").fill("Wachtzin met exclusieve lock 123");
 await writer.locator("#vaultSave").click();
 await writer.waitForFunction(async()=>{const q=await navigator.locks.query();return q.pending.some(x=>x.name==="palaco.citadel.geheugenkamer.vault.write")});
 assert.equal(await writer.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),null,"No write while lock held");
 await holder.evaluate(()=>window.__unlock());
 await writer.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 assert.equal(await writer.evaluate(()=>JSON.parse(localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")).revision),1);
 await context.close();
});

test("Web Locks: deleting a known vault waits for exclusive lock and then removes it",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage(),holder=await context.newPage();
 await page.goto(base+"/DOCS/la-geheugenkamer/");
 await holder.goto(base+"/DOCS/la-geheugenkamer/");
 await page.locator("#title").fill("Verwijderen onder slot");
 await page.locator("#who").fill("W");await page.locator("#what").fill("T");
 await page.locator("#entryForm button[type=submit]").click();
 await page.locator("#archivePassphrase").fill("Verwijder wachtzin lokaal 123!");
 await page.locator("#vaultSave").click();
 await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 await holder.evaluate(()=>{
   window.__held=false;
   window.__locked=navigator.locks.request("palaco.citadel.geheugenkamer.vault.write",{mode:"exclusive"},async()=>{
      window.__held=true;await new Promise(resolve=>window.__unlock=resolve);
   });
 });
 await holder.waitForFunction(()=>window.__held);
 await page.locator("#archivePassphrase").fill("Verwijder wachtzin lokaal 123!");
 page.once("dialog",d=>d.accept());
 await page.locator("#vaultDelete").click();
 await page.waitForFunction(async()=>{const q=await navigator.locks.query();return q.pending.some(x=>x.name==="palaco.citadel.geheugenkamer.vault.write")});
 assert.ok(await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")));
 await holder.evaluate(()=>window.__unlock());
 await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde apparaatkluis verwijderd"));
 assert.equal(await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),null);
 await context.close();
});

test("Web Locks: concurrent writers serialize and reject stale second snapshot",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const holder=await context.newPage(),first=await context.newPage(),second=await context.newPage();
 await Promise.all([holder,first,second].map(p=>p.goto(base+"/DOCS/la-geheugenkamer/")));
 await holder.evaluate(()=>{
  window.__held=false;
  window.__request=navigator.locks.request("palaco.citadel.geheugenkamer.vault.write",{mode:"exclusive"},async()=>{
    window.__held=true;await new Promise(ok=>window.__release=ok);
  });
 });
 await holder.waitForFunction(()=>window.__held);
 for(const [page,name] of [[first,"Eerste schrijver"],[second,"Tweede schrijver"]]){
  await page.locator("#title").fill(name);
  await page.locator("#who").fill("W");
  await page.locator("#what").fill("Gelijktijdige opslag");
  await page.locator("#entryForm button[type=submit]").click();
  await page.locator("#archivePassphrase").fill("Wachtzin voor gelijktijdige opslag 123");
 }
 await first.locator("#vaultSave").click();
 await second.locator("#vaultSave").click();
 await first.waitForFunction(async()=> (await navigator.locks.query()).pending.filter(x=>x.name==="palaco.citadel.geheugenkamer.vault.write").length===2);
 assert.equal(await first.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),null);
 await holder.evaluate(()=>window.__release());
 await first.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 await second.waitForFunction(()=>document.querySelector("#message").textContent.includes("Kluisopslag geweigerd"));
 const blob=await first.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 assert.equal(JSON.parse(blob).revision,1);
 assert.equal(blob,await second.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")));
 await context.close();
});

test("Web Locks unavailable: vault write is refused without unencrypted fallback",async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>Object.defineProperty(navigator,"locks",{value:undefined,configurable:true}));
 const page=await context.newPage();await page.goto(base+"/DOCS/la-geheugenkamer/");
 await page.locator("#title").fill("Geen lock beschikbaar");
 await page.locator("#who").fill("W");
 await page.locator("#what").fill("Blijft alleen in tab");
 await page.locator("#entryForm button[type=submit]").click();
 await page.locator("#archivePassphrase").fill("Wachtzin zonder browser-lock 123");
 await page.locator("#vaultSave").click();
 await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("Kluisopslag geweigerd"));
 assert.match(await page.locator("#message").innerText(),/Web Locks/);
 assert.equal(await page.evaluate(()=>localStorage.length),0);
 assert.equal(await page.locator("#count").innerText(),"1");
 await context.close();
});

test("mobile acceptance: narrow phone can use vault save, reload, unlock and lock",async()=>{
 const context=await browser.newContext({viewport:{width:320,height:640},isMobile:true,deviceScaleFactor:2,hasTouch:true});
 const page=await context.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base+"/DOCS/la-geheugenkamer/");
 assert.equal(await page.locator("h1").isVisible(),true);
 await page.locator("#title").fill("Mobiele kluisnotitie");
 await page.locator("#who").fill("Mobiele waarnemer");
 await page.locator("#what").fill("Offline op een smal scherm");
 await page.locator("#entryForm button[type=submit]").tap();
 assert.equal(await page.locator("#count").innerText(),"1");
 await page.locator("#archivePassphrase").fill("Mobiele wachtzin 123! veilig");
 await page.locator("#vaultSave").tap();
 await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 assert.equal(await page.locator("#archivePassphrase").inputValue(),"");
 assert.equal(await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.v1")),null);
 await page.reload();
 assert.equal(await page.locator("#count").innerText(),"0");
 await page.locator("#archivePassphrase").fill("Mobiele wachtzin 123! veilig");
 await page.locator("#vaultUnlock").tap();
 await page.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 assert.match(await page.locator("#timeline").innerText(),/Mobiele kluisnotitie/);
 page.once("dialog",dialog=>dialog.accept());
 await page.locator("#vaultLock").tap();
 assert.equal(await page.locator("#count").innerText(),"0");
 assert.ok(await page.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")));
 assert.deepEqual(errors,[]);
 await context.close();
});

test("mobile acceptance: encrypted file import has no automatic storage or plaintext",async()=>{
 const sender=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true});
 const a=await sender.newPage();
 await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Mobiele archiefoverdracht");
 await a.locator("#who").fill("Waarnemer");
 await a.locator("#what").fill("Privé verplaatsbaar dossier");
 await a.locator("#entryForm button[type=submit]").tap();
 await a.locator("#archivePassphrase").fill("Bestandswachtzin mobiel 123!");
 const [download]=await Promise.all([a.waitForEvent("download"),a.locator("#encryptedExport").tap()]);
 const file=await readFile(await download.path());
 assert.equal(file.includes(Buffer.from("Mobiele archiefoverdracht")),false);
 const receiver=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
 const b=await receiver.newPage();
 await b.goto(base+"/DOCS/la-geheugenkamer/");
 await b.locator("#archivePassphrase").fill("Bestandswachtzin mobiel 123!");
 await b.locator("#file").setInputFiles({name:"mobile-encrypted.json",mimeType:"application/json",buffer:file});
 await b.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 assert.equal(await b.evaluate(()=>localStorage.length),0);
 assert.equal(await b.locator("#archivePassphrase").inputValue(),"");
 assert.match(await b.locator("#timeline").innerText(),/Mobiele archiefoverdracht/);
 await sender.close();await receiver.close();
});

test("mobile recovery: locking during delayed encrypted file import must not reopen memories",async()=>{
 const sender=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true}),a=await sender.newPage();
 await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Geen heropening na slot");
 await a.locator("#who").fill("W");await a.locator("#what").fill("Afgeschermde herinnering");
 await a.locator("#entryForm button[type=submit]").tap();
 await a.locator("#archivePassphrase").fill("Herstelwachtzin mobiel 123");
 const [download]=await Promise.all([a.waitForEvent("download"),a.locator("#encryptedExport").tap()]);
 const file=await readFile(await download.path());
 const receiver=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),b=await receiver.newPage();
 await b.goto(base+"/DOCS/la-geheugenkamer/");
 await b.evaluate(()=>{
  const original=SubtleCrypto.prototype.deriveKey;
  window.__cryptoPending=false;
  SubtleCrypto.prototype.deriveKey=function(...args){
    window.__cryptoPending=true;
    return new Promise((resolve,reject)=>{window.__releaseCrypto=()=>original.apply(this,args).then(resolve,reject)});
  };
 });
 await b.locator("#archivePassphrase").fill("Herstelwachtzin mobiel 123");
 await b.locator("#file").setInputFiles({name:"delayed.json",mimeType:"application/json",buffer:file});
 await b.waitForFunction(()=>window.__cryptoPending);
 await b.locator("#vaultLock").tap();
 assert.equal(await b.locator("#count").innerText(),"0");
 await b.evaluate(()=>window.__releaseCrypto());
 await b.waitForFunction(()=>document.querySelector("#message").textContent.includes("Import afgebroken"));
 assert.equal(await b.locator("#count").innerText(),"0");
 assert.equal(await b.evaluate(()=>localStorage.length),0);
 await sender.close();await receiver.close();
});

test("mobile recovery: a new memory during delayed import prevents stale merge",async()=>{
 const sender=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true}),a=await sender.newPage();
 await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Inhoud uit bestand");
 await a.locator("#who").fill("W");await a.locator("#what").fill("Oude momentopname");
 await a.locator("#entryForm button[type=submit]").tap();
 await a.locator("#archivePassphrase").fill("Test import geheugen 123");
 const [download]=await Promise.all([a.waitForEvent("download"),a.locator("#encryptedExport").tap()]);
 const file=await readFile(await download.path());
 const receiver=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),b=await receiver.newPage();
 await b.goto(base+"/DOCS/la-geheugenkamer/");
 await b.evaluate(()=>{
  const original=SubtleCrypto.prototype.deriveKey;
  window.__cryptoPending=false;
  SubtleCrypto.prototype.deriveKey=function(...args){
    window.__cryptoPending=true;
    return new Promise((resolve,reject)=>{window.__releaseCrypto=()=>original.apply(this,args).then(resolve,reject)});
  };
 });
 await b.locator("#archivePassphrase").fill("Test import geheugen 123");
 await b.locator("#file").setInputFiles({name:"delayed.json",mimeType:"application/json",buffer:file});
 await b.waitForFunction(()=>window.__cryptoPending);
 await b.locator("#title").fill("Nieuw lokaal record");
 await b.locator("#who").fill("W");await b.locator("#what").fill("Wijziging tijdens import");
 await b.locator("#entryForm button[type=submit]").tap();
 await b.evaluate(()=>window.__releaseCrypto());
 await b.waitForFunction(()=>document.querySelector("#message").textContent.includes("Import afgebroken"));
 assert.equal(await b.locator("#count").innerText(),"1");
 assert.match(await b.locator("#timeline").innerText(),/Nieuw lokaal record/);
 assert.doesNotMatch(await b.locator("#timeline").innerText(),/Inhoud uit bestand/);
 await sender.close();await receiver.close();
});

test("mobile recovery: wrong passphrase preserves active memories and stored vault",async()=>{
 const ctx=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await ctx.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Bewaarde veilige herinnering");
 await p.locator("#who").fill("Waarnemer");await p.locator("#what").fill("Moet onveranderd blijven");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Correcte mobiele kluiszin 123");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 await p.locator("#archivePassphrase").fill("Verkeerde mobiele wachtzin 456");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Ontgrendeling geweigerd"));
 assert.equal(await p.locator("#count").innerText(),"1");
 assert.match(await p.locator("#timeline").innerText(),/Bewaarde veilige herinnering/);
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 assert.equal(await p.locator("#archivePassphrase").inputValue(),"");
 await ctx.close();
});

test("mobile recovery: tampered encrypted file cannot alter an existing local memory",async()=>{
 const source=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true}),a=await source.newPage();
 await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Externe beschadigde herinnering");
 await a.locator("#who").fill("W");await a.locator("#what").fill("Niet accepteren");
 await a.locator("#entryForm button[type=submit]").tap();
 await a.locator("#archivePassphrase").fill("Bestand wachtzin controle 123");
 const [download]=await Promise.all([a.waitForEvent("download"),a.locator("#encryptedExport").tap()]);
 const corrupted=JSON.parse((await readFile(await download.path())).toString("utf8"));
 corrupted.cipher.data=(corrupted.cipher.data[0]==="A"?"B":"A")+corrupted.cipher.data.slice(1);
 const target=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),b=await target.newPage();
 await b.goto(base+"/DOCS/la-geheugenkamer/");
 await b.locator("#title").fill("Bestaande herinnering");
 await b.locator("#who").fill("W");await b.locator("#what").fill("Blijft beschikbaar");
 await b.locator("#entryForm button[type=submit]").tap();
 await b.locator("#archivePassphrase").fill("Bestand wachtzin controle 123");
 await b.locator("#file").setInputFiles({name:"tampered.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(corrupted))});
 await b.waitForFunction(()=>document.querySelector("#message").textContent.includes("Import geweigerd"));
 assert.equal(await b.locator("#count").innerText(),"1");
 assert.match(await b.locator("#timeline").innerText(),/Bestaande herinnering/);
 assert.doesNotMatch(await b.locator("#timeline").innerText(),/Externe beschadigde herinnering/);
 assert.equal(await b.locator("#archivePassphrase").inputValue(),"");
 assert.equal(await b.evaluate(()=>localStorage.length),0);
 await source.close();await target.close();
});

test("mobile vault status is read-only across save, reload, unlock and delete",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
 const p=await c.newPage();await p.goto(base+"/DOCS/la-geheugenkamer/");
 assert.match(await p.locator("#vaultStatus").innerText(),/niet aanwezig/);
 assert.equal(await p.locator("#count").innerText(),"0");
 await p.locator("#title").fill("Status zonder blootstelling");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Privé");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Status test wachtzin mobiel 123");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#vaultStatus").textContent.includes("versie 1"));
 assert.doesNotMatch(await p.locator("#vaultStatus").innerText(),/Status zonder blootstelling/);
 await p.reload();
 assert.match(await p.locator("#vaultStatus").innerText(),/Gesloten na herladen/);
 assert.equal(await p.locator("#count").innerText(),"0");
 await p.locator("#archivePassphrase").fill("Status test wachtzin mobiel 123");
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 await p.locator("#archivePassphrase").fill("Status test wachtzin mobiel 123");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultDelete").tap();
 await p.waitForFunction(()=>document.querySelector("#vaultStatus").textContent.includes("niet aanwezig"));
 assert.equal(await p.locator("#count").innerText(),"1");
 await c.close();
});

test("mobile vault status handles invalid storage without revealing sensitive data",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
 const p=await c.newPage();await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.evaluate(()=>localStorage.setItem("palaco.citadel.geheugenkamer.vault.v1","not-json-private-secret"));
 await p.reload();
 assert.match(await p.locator("#vaultStatus").innerText(),/beschadigd/);
 assert.doesNotMatch(await p.locator("#vaultStatus").innerText(),/not-json-private-secret/);
 assert.equal(await p.locator("#count").innerText(),"0");
 await c.close();
});

test("mobile lock revokes authorization to overwrite existing encrypted vault",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
 const p=await c.newPage();await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Niet overschrijven na slot");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Oorspronkelijke data");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Veilige wachtzin kluis slot 123");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultLock").tap();
 assert.equal(await p.locator("#count").innerText(),"0");
 await p.locator("#title").fill("Nieuwe onontgrendelde data");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Mag niet overschrijven");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Nieuwe wachtzin kluis slot 456");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Kluisconflict"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 await c.close();
});

test("mobile lock revokes deletion privilege until original vault is unlocked again",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
 const p=await c.newPage();await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Niet verwijderen zonder herontgrendelen");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Behouden");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Oorspronkelijke kluiswachtzin 123");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultLock").tap();
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultDelete").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Verwijderen geweigerd"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 await p.locator("#archivePassphrase").fill("Oorspronkelijke kluiswachtzin 123");
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 await p.locator("#archivePassphrase").fill("Oorspronkelijke kluiswachtzin 123");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultDelete").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde apparaatkluis verwijderd"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),null);
 await c.close();
});

test("vault overwrite rejects wrong passphrase and keeps ciphertext unchanged",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Originele kluisinhoud");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Niet overschrijven");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Oorspronkelijk geheim 123!");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 await p.locator("#title").fill("Nieuwe aanvulling");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Mag niet verloren");
 await p.locator("#entryForm button[type=submit]").tap();
 p.once("dialog",d=>d.accept());
 await p.locator("#archivePassphrase").fill("Andere verkeerde wachtzin 456!");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("oorspronkelijke wachtzin"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 assert.equal(await p.locator("#count").innerText(),"2");
 p.once("dialog",d=>d.accept());
 await p.locator("#archivePassphrase").fill("Oorspronkelijk geheim 123!");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("versie 2"));
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")).revision),2);
 await c.close();
});

test("vault overwrite refuses losing records from previously encrypted snapshot",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Bewaarde oorsprong");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Blijft bewaard");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Volledigheid wachtzin 123!");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 p.once("dialog",d=>d.accept());
 await p.locator("#clear").tap();
 assert.equal(await p.locator("#count").innerText(),"0");
 p.once("dialog",d=>d.accept());
 await p.locator("#archivePassphrase").fill("Volledigheid wachtzin 123!");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("eerder opgeslagen herinneringen ontbreken"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 await c.close();
});

test("vault deletion refuses wrong passphrase and preserves original ciphertext",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Kluis blijft na fout");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Geen verwijdering");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Oorspronkelijke verwijderwachtzin 123");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 await p.locator("#archivePassphrase").fill("Verkeerde verwijderwachtzin 456");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultDelete").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("onjuiste wachtzin"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 assert.equal(await p.locator("#archivePassphrase").inputValue(),"");
 assert.equal(await p.locator("#count").innerText(),"1");
 await p.locator("#archivePassphrase").fill("Oorspronkelijke verwijderwachtzin 123");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultDelete").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde apparaatkluis verwijderd"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),null);
 await c.close();
});

test("vault deletion interrupted by tab lock during slow authentication keeps the vault",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Verwijdering mag niet doorgaan");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Slot verbreekt de operatie");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Wachtzin onder tijdslot 123");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 await p.evaluate(()=>{
   const original=SubtleCrypto.prototype.deriveKey;
   window.__pendingDelete=false;
   SubtleCrypto.prototype.deriveKey=function(...args){
     window.__pendingDelete=true;
     return new Promise((resolve,reject)=>{window.__releaseDelete=()=>original.apply(this,args).then(resolve,reject)});
   };
 });
 await p.locator("#archivePassphrase").fill("Wachtzin onder tijdslot 123");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultDelete").tap();
 await p.waitForFunction(()=>window.__pendingDelete);
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultLock").tap();
 await p.evaluate(()=>window.__releaseDelete());
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Verwijderen geweigerd"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 assert.equal(await p.locator("#count").innerText(),"0");
 await c.close();
});

test("legacy encrypted vault unlocks read-only and migrates on explicit authenticated save",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Historische herinnering");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Mag nooit verdwijnen");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Erfgoed wachtzin kluis 123!");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const legacy=await p.evaluate(()=>{
   const key="palaco.citadel.geheugenkamer.vault.v1";
   const old=JSON.parse(localStorage.getItem(key)).encrypted;
   const serialized=JSON.stringify(old);
   localStorage.setItem(key,serialized);
   return serialized;
 });
 await p.reload();
 assert.match(await p.locator("#vaultStatus").innerText(),/ouder formaat/i);
 assert.equal(await p.locator("#count").innerText(),"0");
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),legacy);
 await p.locator("#archivePassphrase").fill("Erfgoed wachtzin kluis 123!");
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 assert.match(await p.locator("#timeline").innerText(),/Historische herinnering/);
 assert.match(await p.locator("#message").innerText(),/oud formaat/);
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),legacy,"unlock must not migrate");
 await p.locator("#archivePassphrase").fill("Erfgoed wachtzin kluis 123!");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("versie 2"));
 const upgraded=await p.evaluate(()=>JSON.parse(localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")));
 assert.equal(upgraded.schema,"PALACO-CITADEL-VAULT-2");
 assert.equal(upgraded.revision,2);
 assert.match(upgraded.parentDigest,/^[0-9a-f]{64}$/);
 assert.match(await p.locator("#vaultStatus").innerText(),/versie 2/);
 await p.reload();
 assert.equal(await p.locator("#count").innerText(),"0");
 await p.locator("#archivePassphrase").fill("Erfgoed wachtzin kluis 123!");
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 assert.match(await p.locator("#timeline").innerText(),/Historische herinnering/);
 await c.close();
});

test("legacy encrypted vault cannot migrate with wrong password",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Legacy niet overschrijven");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Blijft");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Correcte erfgoedzin 123!");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const legacy=await p.evaluate(()=>{
   const key="palaco.citadel.geheugenkamer.vault.v1";
   const old=JSON.parse(localStorage.getItem(key)).encrypted;
   localStorage.setItem(key,JSON.stringify(old));
   return JSON.stringify(old);
 });
 await p.reload();
 await p.locator("#archivePassphrase").fill("Correcte erfgoedzin 123!");
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 await p.locator("#archivePassphrase").fill("Verkeerde erfgoedzin 456!");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("oorspronkelijke wachtzin"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),legacy);
 await c.close();
});

test("legacy unknown vault schema is refused without mutation or opening",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 const raw=JSON.stringify({schema:"PALACO-CITADEL-VAULT-UNKNOWN",encrypted:{},note:"never expose"});
 await p.evaluate(v=>localStorage.setItem("palaco.citadel.geheugenkamer.vault.v1",v),raw);
 await p.reload();
 await p.locator("#archivePassphrase").fill("Test unknown vault 123");
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("onbekend of ongeldig kluisformaat"));
 assert.equal(await p.locator("#count").innerText(),"0");
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),raw);
 assert.doesNotMatch(await p.locator("#message").innerText(),/never expose/);
 await c.close();
});

test("legacy malformed or oversized vault cannot be migrated",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 const key="palaco.citadel.geheugenkamer.vault.v1";
 const malformed=JSON.stringify({schema:"PALACO-CITADEL-VAULT-2",revision:"not-a-number",parentDigest:null,encrypted:{schema:"PALACO-CITADEL-GEHEUGEN-ENCRYPTED-1"}});
 await p.evaluate(([k,v])=>localStorage.setItem(k,v),[key,malformed]);
 await p.reload();
 await p.locator("#archivePassphrase").fill("Malformed envelope pass 123");
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("ongeldige kluisversie"));
 assert.equal(await p.locator("#count").innerText(),"0");
 assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),malformed);
 // A fully authenticated saved vault remains protected against size exhaustion.
 await p.evaluate(k=>localStorage.setItem(k,"x".repeat(256*1024+1)),key);
 await p.reload();
 await p.locator("#archivePassphrase").fill("Oversized envelope pass 123");
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("te groot"));
 assert.equal(await p.locator("#count").innerText(),"0");
 assert.equal((await p.evaluate(k=>localStorage.getItem(k).length,key)),256*1024+1);
 await c.close();
});

test("vault overwrite refuses a conflicting historical record with the same ID",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
 await c.addInitScript(()=>Object.defineProperty(crypto,"randomUUID",{value:()=>"citadel-historic-fixed-id",configurable:true}));
 const p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Historische originele titel");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Originele ongewijzigde inhoud");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Lineage conflict wachtzin 123");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 p.once("dialog",d=>d.accept());
 await p.locator("#clear").tap();
 await p.locator("#title").fill("Vervalste titel hetzelfde ID");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Conflicterende inhoud");
 await p.locator("#entryForm button[type=submit]").tap();
 assert.equal(await p.locator("#count").innerText(),"1");
 await p.locator("#archivePassphrase").fill("Lineage conflict wachtzin 123");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("afwijkende inhoud"));
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 assert.match(await p.locator("#timeline").innerText(),/Vervalste titel hetzelfde ID/);
 await c.close();
});

test("encrypted vault unlock refuses conflicting local record with the same ID",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
 await c.addInitScript(()=>Object.defineProperty(crypto,"randomUUID",{value:()=>"citadel-historic-fixed-id",configurable:true}));
 const p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Origineel lineage-record");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Oude inhoud");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Lineage merge wachtzin 123");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 const original=await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1"));
 p.once("dialog",d=>d.accept());
 await p.locator("#clear").tap();
 await p.locator("#title").fill("Niet-identieke lokale versie");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Nieuwe andere inhoud");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#archivePassphrase").fill("Lineage merge wachtzin 123");
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("conflicterende IDs"));
 assert.equal(await p.locator("#count").innerText(),"1");
 assert.match(await p.locator("#timeline").innerText(),/Niet-identieke lokale versie/);
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),original);
 await c.close();
});

test("vault save refuses incomplete historical predecessor chain after legacy import",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Voorbeeldbron");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Voorbeeldinhoud");
 await p.locator("#entryForm button[type=submit]").tap();
 const [download]=await Promise.all([p.waitForEvent("download"),p.locator("#export").tap()]);
 const exported=JSON.parse((await readFile(await download.path())).toString("utf8"));
 const orphan={...exported.entries[0],id:"orphan-child-v2",previousId:"missing-historical-parent",version:2,title:"Ontbrekende voorganger"};
 p.once("dialog",d=>d.accept());
 await p.locator("#clear").tap();
 const legacy={schema:"PALACO-CITADEL-GEHEUGEN-1",authority:"NONE",status:"LOCAL_DRAFT_ONLY",issuedAt:null,exportedAt:new Date().toISOString(),entries:[orphan]};
 await p.locator("#file").setInputFiles({name:"partial-lineage.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(legacy))});
 await p.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 await p.locator("#archivePassphrase").fill("Historische lijn wachtzin 123!");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("historische lineage onvolledig"));
 assert.equal(await p.locator("#count").innerText(),"1");
 assert.equal(await p.evaluate(()=>localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")),null);
 assert.match(await p.locator("#timeline").innerText(),/Ontbrekende voorganger/);
 await c.close();
});

test("vault save preserves complete root-to-successor chain across reload and unlock",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Lineage oorsprong");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Origineel");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#timeline button").filter({hasText:"Nieuwe versie"}).first().tap();
 await p.locator("#title").fill("Lineage opvolger");
 await p.locator("#entryForm button[type=submit]").tap();
 assert.equal(await p.locator("#count").innerText(),"2");
 await p.locator("#archivePassphrase").fill("Volledige lineage wachtzin 123!");
 await p.locator("#vaultSave").tap();
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
 await p.reload();
 assert.equal(await p.locator("#count").innerText(),"0");
 await p.locator("#archivePassphrase").fill("Volledige lineage wachtzin 123!");
 await p.locator("#vaultUnlock").tap();
 await p.waitForFunction(()=>document.querySelector("#count").textContent==="2");
 assert.match(await p.locator("#timeline").innerText(),/Lineage oorsprong/);
 assert.match(await p.locator("#timeline").innerText(),/Lineage opvolger/);
 await c.close();
});

test("narrow 320px mobile dossier controls avoid horizontal overflow and retain touch targets",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Een lange titel voor mobiele toegankelijkheid");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Een lokaal concept");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).tap();
 const metrics=await p.evaluate(()=>{
  const controls=[...document.querySelectorAll("#dossier .actions button")];
  return {viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
   controls:controls.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),
   detail:document.querySelector("#dossierDetails").textContent};
 });
 assert.ok(metrics.scroll<=metrics.viewport+1,JSON.stringify(metrics));
 assert.ok(metrics.controls.every(x=>x.width>150&&x.height>=44),JSON.stringify(metrics.controls));
 assert.match(metrics.detail,/Lineage-status/);
 await c.close();
});

test("keyboard dossier inspection moves focus to labelled dossier heading",async()=>{
 const c=await browser.newContext({viewport:{width:390,height:844}}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Toegankelijke dossiernavigatie");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Toetsenbord");
 await p.locator("#entryForm button[type=submit]").click();
 await p.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).focus();
 await p.keyboard.press("Enter");
 assert.equal(await p.evaluate(()=>document.activeElement?.id),"dossierTitle");
 assert.equal(await p.locator("#dossier").getAttribute("aria-labelledby"),"dossierTitle");
 assert.match(await p.locator("#dossierDetails").innerText(),/EDTR: HOLD/);
 await c.close();
});

test("keyboard Escape closes mobile dossier and returns focus to its inspect action",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Historische focus");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Keyboard");
 await p.locator("#entryForm button[type=submit]").tap();
 const open=p.locator("#timeline button").filter({hasText:"Inspecteer dossier"});
 await open.focus();
 await p.keyboard.press("Enter");
 assert.equal(await p.evaluate(()=>document.activeElement.id),"dossierTitle");
 await p.keyboard.press("Escape");
 assert.equal(await p.locator("#dossier").isVisible(),false);
 assert.match(await p.evaluate(()=>document.activeElement.textContent),/Inspecteer dossier/);
 await c.close();
});

test("dossier close restores focus to matching inspect button after sorting",async()=>{
 const c=await browser.newContext({viewport:{width:390,height:844}}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Selectie verdwijnt bij sorteren");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Nieuwe volgorde");
 await p.locator("#entryForm button[type=submit]").click();
 await p.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).click();
 assert.equal(await p.evaluate(()=>document.activeElement.id),"dossierTitle");
 await p.locator("#sort").click();
 assert.equal(await p.locator("#dossier").isVisible(),true);
 await p.locator("#dossierClose").click();
 assert.equal(await p.evaluate(()=>document.activeElement.textContent.trim()),"Inspecteer dossier");
 assert.equal(await p.locator("#dossier").isVisible(),false);
 await c.close();
});

test("dossier close returns focus to timeline if filtering hides selected record",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Eerste lokaal dossier");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Historie");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).tap();
 assert.equal(await p.evaluate(()=>document.activeElement.id),"dossierTitle");
 await p.locator("#search").fill("onvindbare-vermelding");
 assert.equal(await p.locator("#timeline button").count(),0);
 assert.equal(await p.locator("#dossier").isVisible(),true);
 await p.locator("#dossierClose").tap();
 assert.equal(await p.evaluate(()=>document.activeElement.id),"timeline");
 assert.equal(await p.locator("#dossier").isVisible(),false);
 await c.close();
});

test("clearing an open mobile dossier revokes consent and focuses timeline",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Wissen tijdens dossierinzage");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Lokaal synthetisch");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).tap();
 await p.locator("#handoffConsent").check();
 p.once("dialog",d=>d.accept());
 await p.locator("#clear").tap();
 assert.equal(await p.evaluate(()=>document.activeElement?.id),"timeline");
 assert.equal(await p.locator("#dossier").isVisible(),false);
 assert.equal(await p.locator("#handoffConsent").isChecked(),false);
 assert.equal(await p.locator("#count").innerText(),"0");
 await c.close();
});

test("locking an open mobile dossier revokes selection and focuses timeline",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Vergrendelen tijdens dossierinzage");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Lokaal synthetisch");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).tap();
 await p.locator("#handoffConsent").check();
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultLock").tap();
 assert.equal(await p.evaluate(()=>document.activeElement?.id),"timeline");
 assert.equal(await p.locator("#dossier").isVisible(),false);
 assert.equal(await p.locator("#handoffConsent").isChecked(),false);
 assert.equal(await p.locator("#count").innerText(),"0");
 await c.close();
});

test("mobile legacy import invalidates earlier dossier consent and restores timeline focus",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Voor import geselecteerd");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Bestaande herinnering");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).tap();
 await p.locator("#handoffConsent").check();
 const record={id:"browser-import-v39",createdAt:"2026-11-17T12:00:00.000Z",previousId:"",version:1,trust:"SELF_REPORTED_NOT_VERIFIED",title:"Nieuw geïmporteerd dossier",who:"W",what:"Synthetische gegevens",where:"",why:"",how:"",source:"",category:"Persoonlijk"};
 const body={schema:"PALACO-CITADEL-GEHEUGEN-1",authority:"NONE",status:"LOCAL_DRAFT_ONLY",issuedAt:null,exportedAt:"2026-11-17T12:00:00.000Z",entries:[record]};
 await p.locator("#file").setInputFiles({name:"legacy-v39.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(body))});
 await p.waitForFunction(()=>document.querySelector("#count").textContent==="2");
 assert.equal(await p.locator("#dossier").isVisible(),false);
 assert.equal(await p.locator("#handoffConsent").isChecked(),false);
 assert.equal(await p.evaluate(()=>document.activeElement.id),"timeline");
 assert.equal(await p.locator("#contractExport").isVisible(),false,"Export action must be hidden after import");
 await p.evaluate(()=>document.querySelector("#contractExport").click());
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("geen geldig dossier geselecteerd"));
 await c.close();
});

test("SHA-256 archive export aborts when memory is cleared during digest",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true,acceptDownloads:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Concept vóór SHA-export");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Synthetisch");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.evaluate(()=>{
   const real=SubtleCrypto.prototype.digest;
   window.__digestHeld=false;window.__downloadCount=0;
   const original=HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click=function(...args){window.__downloadCount++;return original.apply(this,args)};
   SubtleCrypto.prototype.digest=function(...args){
     window.__digestHeld=true;
     return new Promise((resolve,reject)=>{window.__releaseDigest=()=>real.apply(this,args).then(resolve,reject)});
   };
 });
 await p.locator("#export").tap();
 await p.waitForFunction(()=>window.__digestHeld);
 p.once("dialog",d=>d.accept());
 await p.locator("#clear").tap();
 await p.evaluate(()=>window.__releaseDigest());
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Export afgebroken"));
 assert.equal(await p.evaluate(()=>window.__downloadCount),0);
 assert.equal(await p.locator("#count").innerText(),"0");
 await c.close();
});

test("encrypted archive export aborts if tab locks during encryption",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true,acceptDownloads:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Concept vóór encrypted export");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Synthetisch");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.evaluate(()=>{
   const real=SubtleCrypto.prototype.deriveKey;
   window.__deriveHeld=false;window.__downloadCount=0;
   const original=HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click=function(...args){window.__downloadCount++;return original.apply(this,args)};
   SubtleCrypto.prototype.deriveKey=function(...args){
     window.__deriveHeld=true;
     return new Promise((resolve,reject)=>{window.__releaseDerive=()=>real.apply(this,args).then(resolve,reject)});
   };
 });
 await p.locator("#archivePassphrase").fill("Exportconcurrentie testzin 1234");
 await p.locator("#encryptedExport").tap();
 await p.waitForFunction(()=>window.__deriveHeld);
 p.once("dialog",d=>d.accept());
 await p.locator("#vaultLock").tap();
 await p.evaluate(()=>window.__releaseDerive());
 await p.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde export afgebroken"));
 assert.equal(await p.evaluate(()=>window.__downloadCount),0);
 assert.equal(await p.locator("#count").innerText(),"0");
 await c.close();
});

test("rapid repeated handoff export consumes consent before second click",async()=>{
 const c=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true,acceptDownloads:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Eén toestemming");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Eenmaal exporteren");
 await p.locator("#entryForm button[type=submit]").tap();
 await p.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).tap();
 await p.locator("#handoffConsent").check();
 await p.evaluate(()=>{
   window.__downloadCount=0;
   const real=HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click=function(...args){window.__downloadCount++;return real.apply(this,args)};
   const exportButton=document.querySelector("#contractExport");
   exportButton.click();exportButton.click();
 });
 assert.equal(await p.evaluate(()=>window.__downloadCount),1);
 assert.equal(await p.locator("#handoffConsent").isChecked(),false);
 assert.match(await p.locator("#message").innerText(),/exporttoestemming ontbreekt/);
 await c.close();
});

test("hidden dossier export is refused despite stale consent and selected record",async()=>{
 const c=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true}),p=await c.newPage();
 await p.goto(base+"/DOCS/la-geheugenkamer/");
 await p.locator("#title").fill("Verborgen inspectie");
 await p.locator("#who").fill("W");await p.locator("#what").fill("Dossier");
 await p.locator("#entryForm button[type=submit]").click();
 await p.locator("#timeline button").filter({hasText:"Inspecteer dossier"}).click();
 await p.locator("#handoffConsent").check();
 await p.evaluate(()=>{
   window.__downloadCount=0;
   const real=HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click=function(...args){window.__downloadCount++;return real.apply(this,args)};
   document.querySelector("#dossier").className="panel hidden";
   document.querySelector("#contractExport").click();
   document.querySelector("#dossierExport").click();
 });
 assert.equal(await p.evaluate(()=>window.__downloadCount),0);
 assert.match(await p.locator("#message").innerText(),/dossierinspectie is gesloten/);
 await c.close();
});
