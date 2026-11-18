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
