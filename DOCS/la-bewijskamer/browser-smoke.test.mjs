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
