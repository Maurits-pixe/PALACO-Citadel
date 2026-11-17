import {test,expect} from "@playwright/test";
const root="/wereldatlas/";
const routes=[
 ["Atlas", ""],
 ["Kaartkamer","kaartkamer.html"],
 ["Dossierinspectie","dossierinspectie.html"],
 ["Wereldregister","wereldregister.html"],
 ["Atlas Archief","atlas-archief.html"],
 ["Verificatiekamer","atlas-verificatie.html"],
 ["Bewijskamer","atlas-bewijs.html"],
 ["Provenance Centrum","atlas-provenance.html"],
 ["Trust & Lineage Gateway","atlas-trust-gateway.html"],
 ["Integratiekern","atlas-integratie.html"],
 ["Acceptatiekamer","atlas-acceptatie.html"],
 ["Release Evidence Review","atlas-release-review.html"],
 ["Release Readiness","atlas-readiness.html"]
];
test("alle tien Atlas-pagina's laden lokaal zonder script- of netwerkfouten",async({page})=>{
 const failures=[];
 page.on("pageerror",e=>failures.push(e.message));
 page.on("requestfailed",r=>failures.push(r.url()+" "+r.failure()?.errorText));
 for(const [label,path] of routes){
  const response=await page.goto(root+path,{waitUntil:"networkidle"});
  expect(response?.status(),label).toBe(200);
  await expect(page.locator("h1").first(),label).toBeVisible();
 }
 expect(failures).toEqual([]);
});
test("Integratiekern toont negen modules en vier offline koppelingen",async({page})=>{
 await page.goto(root+"atlas-integratie.html");
 const links=page.locator("#modules a.tool");
 await expect(links).toHaveCount(9);
 await expect(page.locator("#external li")).toHaveCount(4);
 await expect(page.locator("#integrity")).toContainText("Intern gegevenscontract consistent");
 await expect(page.locator("#world option")).toHaveCount(7);
 await expect(page.locator("body")).toContainText("HOLD");
});
test("wereldselectie heeft een werkende deeplink",async({page})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#world").selectOption("W-0002");
 await expect(page.locator("#world-detail h3")).toContainText("PLUTO");
 await expect(page.locator("#world-detail a").first()).toHaveAttribute("href","./?world=W-0002");
});
test("interactieve Kaartkamer toont conceptdossier",async({page})=>{
 await page.goto(root+"kaartkamer.html");
 await page.getByRole("button",{name:"LA PAZ"}).click();
 await expect(page.locator("#detail-title")).toHaveText("LA PAZ");
 await expect(page.locator("#detail-status")).toContainText("DRAFT");
});
test("Wereldregister en Archief tonen conceptdossiers",async({page})=>{
 await page.goto(root+"wereldregister.html");
 await expect(page.locator("#worlds .world")).toHaveCount(7);
 await page.goto(root+"atlas-archief.html");
 await expect(page.locator("#entries .entry")).toHaveCount(13);
});
test("Verificatiekamer kan geen goedkeuring afgeven",async({page})=>{
 await page.goto(root+"atlas-verificatie.html");
 await page.locator("#review").click();
 await expect(page.locator("#result")).toContainText("DENY");
});
test("Integratiekern past binnen mobiele breedte",async({page},testInfo)=>{
 test.skip(!testInfo.project.name.startsWith("mobile"),"Alleen mobiele viewport");
 await page.goto(root+"atlas-integratie.html");
 const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
 expect(widths.scroll).toBeLessThanOrEqual(widths.client+1);
});

test("offlinemodus bewaart alleen de vaste Atlas-shell en opent archief zonder netwerk",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 const paths=await page.evaluate(async()=>{
  const cache=await caches.open("palaco-atlas-shell-v1-rc6");
  const keys=await cache.keys();
  return keys.map(r=>new URL(r.url).pathname);
 });
 expect(paths).toHaveLength(26);
 expect(paths.every(p=>p.startsWith("/wereldatlas/"))).toBe(true);
 expect(paths.some(p=>p.endsWith(".json")||p.includes("admin")||p.includes("api/"))).toBe(false);
 await context.setOffline(true);
 await page.goto(root+"atlas-archief.html");
 await expect(page.locator("#entries .entry")).toHaveCount(13);
 await page.goto(root+"atlas-integratie.html");
 await expect(page.locator("#modules a.tool")).toHaveCount(9);
});
test("offline installatie kan cachegegevens wissen",async({page})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.locator("#offline-clear").click();
 await expect(page.locator("#offline-status")).toContainText("Offline Atlasgegevens verwijderd");
 const names=await page.evaluate(()=>caches.keys());
 expect(names.filter(n=>n.startsWith("palaco-atlas-shell-"))).toEqual([]);
});

test("Acceptatiekamer blijft HOLD wanneer alle stappen PASS zijn",async({page})=>{
 await page.goto(root+"atlas-acceptatie.html");
 await expect(page.locator("#steps .step")).toHaveCount(8);
 const selects=page.locator("#steps select");
 for(let index=0;index<8;index++)await selects.nth(index).selectOption("PASS");
 await expect(page.locator("#summary")).toContainText("PASS: 8");
 await expect(page.locator("#summary")).toContainText("Beslissing: HOLD");
 await expect(page.locator("#summary")).toContainText("Autorisatie: DENY");
 const report=JSON.parse(await page.locator("#preview").innerText());
 expect(report.source).toBe("LOCAL_SELF_REPORTED_NOT_VERIFIED");
 expect(report.authorization).toBe("DENY");
});
test("Acceptatiekamer werkt zonder netwerk na offline installatie",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-acceptatie.html");
 await expect(page.locator("#steps .step")).toHaveCount(8);
 await expect(page.locator("#summary")).toContainText("Autorisatie: DENY");
});

test("Acceptatiekamer importeert eerder lokaal rapport en vergelijkt statuswijziging",async({page})=>{
 await page.goto(root+"atlas-acceptatie.html");
 const baseline=await page.locator("#preview").innerText();
 await page.locator("#baseline-file").setInputFiles({name:"vorig-draft.json",mimeType:"application/json",buffer:Buffer.from(baseline,"utf8")});
 await expect(page.locator("#import-status")).toContainText("ingelezen en gevalideerd");
 await page.locator("#steps select").first().selectOption("PASS");
 await expect(page.locator("#comparison")).toContainText("Verschillende controles/notities: 1");
 await expect(page.locator("#comparison")).toContainText("ATLAS-MOB-001: NOT_TESTED → PASS");
 await expect(page.locator("#comparison")).toContainText("HOLD");
 await expect(page.locator("#dossier-export")).toBeEnabled();
});
test("Acceptatiekamer weigert ongeldige import en productievrijgave",async({page})=>{
 await page.goto(root+"atlas-acceptatie.html");
 const tampered=JSON.parse(await page.locator("#preview").innerText());
 tampered.authorization="ALLOW";
 await page.locator("#baseline-file").setInputFiles({name:"ongeldig.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(tampered),"utf8")});
 await expect(page.locator("#import-status")).toContainText("Import afgewezen");
 await expect(page.locator("#dossier-export")).toBeDisabled();
 await expect(page.locator("#summary")).toContainText("Autorisatie: DENY");
});
test("Offline Acceptatiekamer vergelijkt DRAFT-rapport zonder netwerk",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-acceptatie.html");
 const baseline=await page.locator("#preview").innerText();
 await page.locator("#baseline-file").setInputFiles({name:"vorige-waarneming.json",mimeType:"application/json",buffer:Buffer.from(baseline,"utf8")});
 await expect(page.locator("#import-status")).toContainText("ingelezen en gevalideerd");
 await page.locator("#steps select").first().selectOption("PASS");
 await expect(page.locator("#comparison")).toContainText("Verschillende controles/notities: 1");
});

test("Release Evidence Review importeert geldig DRAFT dossier en bewaart HOLD",async({page})=>{
 await page.goto(root+"atlas-release-review.html");
 const base={schema:"palaco.atlas.acceptance.self-report.v1",release:"1.0-RC",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",decision:"HOLD",authorization:"DENY",verified:false,
 observations:["ATLAS-MOB-001","ATLAS-MOB-002","ATLAS-MOB-003","ATLAS-MOB-004","ATLAS-MOB-005","ATLAS-MOB-006","ATLAS-MOB-007","ATLAS-SEC-008"].map(id=>({id,status:"NOT_TESTED",note:""}))};
 const diff=base.observations.map(({id,status})=>({id,previous:status,current:status,changed:false,notesChanged:false}));
 const dossier={schema:"palaco.atlas.acceptance.comparison.draft.v1",state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,decision:"HOLD",authorization:"DENY",evidenceReference:"",baseline:base,current:base,comparison:{changedCount:0,differences:diff},notice:"Een bronlabel en lokale zelfrapportage zijn geen onafhankelijke verificatie of productieautorisatie."};
 await page.locator("#dossier-file").setInputFiles({name:"draft.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(dossier))});
 await expect(page.locator("#import-status")).toContainText("DRAFT-dossier geladen");
 await expect(page.locator("#entries .entry")).toHaveCount(8);
 await expect(page.locator("#count")).toContainText("8 van 8");
 await expect(page.locator("#download")).toBeEnabled();
 await expect(page.locator("body")).toContainText("HOLD");
});
test("Release Evidence Review weigert gemanipuleerde vrijgave",async({page})=>{
 await page.goto(root+"atlas-release-review.html");
 await page.locator("#dossier-file").setInputFiles({name:"fout.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({authorization:"ALLOW"}))});
 await expect(page.locator("#import-status")).toContainText("Import afgewezen");
 await expect(page.locator("#download")).toBeDisabled();
});
test("Review en contractmodule openen na offline installatie",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-release-review.html");
 await expect(page.locator("h1")).toContainText("Release Evidence Review");
 await expect(page.locator("#import-status")).toContainText("Nog geen dossier");
});

test("Release Readiness toont negen modules en zes open releasepoorten",async({page})=>{
 await page.goto(root+"atlas-readiness.html");
 await expect(page.locator("#modules .entry")).toHaveCount(9);
 await expect(page.locator("#external p")).toHaveCount(4);
 await expect(page.locator("#gates .entry")).toHaveCount(6);
 await expect(page.locator("#module-status")).toContainText("intern consistent");
 await expect(page.locator("#download")).toBeDisabled();
 await expect(page.locator("body")).toContainText("AUTHORIZATION DENY");
});
test("Release Readiness weigert review zonder dossier en ongeoorloofde vrijgave",async({page})=>{
 await page.goto(root+"atlas-readiness.html");
 const review={schema:"palaco.atlas.release-evidence-review.draft.v1",decision:"GO",authorization:"ALLOW",verified:true};
 await page.locator("#review-file").setInputFiles({name:"tampered.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(review))});
 await expect(page.locator("#import-status")).toContainText("AFGEWEZEN");
 await expect(page.locator("#download")).toBeDisabled();
});
test("Release Readiness werkt na opt-in installatie zonder netwerk",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-readiness.html");
 await expect(page.locator("#modules .entry")).toHaveCount(9);
 await expect(page.locator("#gates .entry")).toHaveCount(6);
});
