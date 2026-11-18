import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname,sep,extname} from "node:path";
import {firefox,webkit} from "playwright";

const engine=process.env.PALACO_BROWSER;
if(!["firefox","webkit"].includes(engine))throw Error("PALACO_BROWSER must be firefox or webkit");
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
let server,base,browser;
test.before(async()=>{
 server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,"http://localhost").pathname;
   const target=resolve(root,"."+decodeURIComponent(path.endsWith("/")?path+"index.html":path));
   if(!target.startsWith(root+sep)){res.writeHead(403).end();return}
   if(!(await stat(target)).isFile())throw Error("not a file");
   const mime=extname(target)===".html"?"text/html; charset=utf-8":"application/octet-stream";
   res.writeHead(200,{"content-type":mime,"cache-control":"no-store"});
   res.end(await readFile(target));
  }catch{res.writeHead(404).end("Not found")}
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 base="http://127.0.0.1:"+server.address().port;
 browser=await {firefox,webkit}[engine].launch({headless:true});
});
test.after(async()=>{await browser?.close();await new Promise(ok=>server?.close(ok))});

test(engine+": encrypted archive roundtrip across isolated contexts",async()=>{
 const sender=await browser.newContext(),a=await sender.newPage();
 const errors=[];a.on("pageerror",e=>errors.push(e.message));
 await a.goto(base+"/DOCS/la-geheugenkamer/");
 await a.locator("#title").fill("Cross-browser geheime herinnering");
 await a.locator("#who").fill("Waarnemer");
 await a.locator("#what").fill("Geheim");
 await a.locator("#entryForm button[type=submit]").click();
 await a.locator("#archivePassphrase").fill("Lange testwachtzin voor browser 123");
 const [download]=await Promise.all([a.waitForEvent("download"),a.locator("#encryptedExport").click()]);
 const bytes=await readFile(await download.path());
 assert.equal(JSON.parse(bytes.toString("utf8")).schema,"PALACO-CITADEL-GEHEUGEN-ENCRYPTED-1");
 assert.equal(bytes.includes(Buffer.from("Cross-browser geheime herinnering")),false);
 const receiver=await browser.newContext(),b=await receiver.newPage();
 b.on("pageerror",e=>errors.push(e.message));
 await b.goto(base+"/DOCS/la-geheugenkamer/");
 await b.locator("#archivePassphrase").fill("Lange testwachtzin voor browser 123");
 await b.locator("#file").setInputFiles({name:"memory.json",mimeType:"application/json",buffer:bytes});
 await b.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 assert.match(await b.locator("#timeline").innerText(),/Cross-browser geheime herinnering/);
 assert.equal(await b.evaluate(()=>localStorage.length),0);
 assert.deepEqual(errors,[]);
 await sender.close();await receiver.close();
});

test(engine+": encrypted vault is either Web-Locks protected or fails closed",async()=>{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto(base+"/DOCS/la-geheugenkamer/");
 const supported=await page.evaluate(()=>typeof navigator.locks?.request==="function");
 await page.locator("#title").fill("Browsercompatibiliteit");
 await page.locator("#who").fill("Waarnemer");
 await page.locator("#what").fill("Geen stille fallback");
 await page.locator("#entryForm button[type=submit]").click();
 await page.locator("#archivePassphrase").fill("Lange browserkluistest wachtzin 123");
 await page.locator("#vaultSave").click();
 if(supported){
  await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("Versleutelde kluis bewust opgeslagen"));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("palaco.citadel.geheugenkamer.vault.v1")).revision),1);
  await page.reload();
  assert.equal(await page.locator("#count").innerText(),"0");
  await page.locator("#archivePassphrase").fill("Lange browserkluistest wachtzin 123");
  await page.locator("#vaultUnlock").click();
  await page.waitForFunction(()=>document.querySelector("#count").textContent==="1");
 }else{
  await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("Web Locks"));
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.equal(await page.locator("#count").innerText(),"1");
 }
 await context.close();
});
