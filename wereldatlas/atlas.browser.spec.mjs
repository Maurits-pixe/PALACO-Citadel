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
 ["Release Readiness","atlas-readiness.html"],
 ["Release Control Center","atlas-release-control.html"],
 ["Release Integrity & Recovery","atlas-release-integrity.html"],
 ["Release Package Audit","atlas-package-audit.html"],
 ["Dependency & Security Audit","atlas-security-audit.html"],
 ["Release Evidence & Traceability","atlas-traceability.html"],
 ["Attestation Preparation","atlas-attestation.html"],
 ["Wereldatlas v2.0 Consolidatie","atlas-consolidatie.html"],
 ["Mobiele Gebruikersacceptatie","atlas-device-acceptance.html"],
 ["Mobiele Acceptatieoverdracht","atlas-device-handover.html"],
 ["Mobiele Hertoetsingsvergelijking","atlas-device-retest.html"],
 ["Mobiele Herstelregie","atlas-device-triage.html"],
 ["Herstelverificatie","atlas-recovery-verification.html"],
 ["Geconsolideerd Mobiel Acceptatiedossier","atlas-mobile-dossier.html"]
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
  const cache=await caches.open("palaco-atlas-shell-v1-rc19");
  const keys=await cache.keys();
  return keys.map(r=>new URL(r.url).pathname);
 });
 expect(paths).toHaveLength(52);
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

test("Release Control Center toont open blokkades en rollbackvoorbereiding",async({page})=>{
 await page.goto(root+"atlas-release-control.html");
 await expect(page.locator("#gates .line")).toHaveCount(6);
 await expect(page.locator("#rollback .line")).toHaveCount(4);
 await expect(page.locator("body")).toContainText("HOLD / DENY");
 await expect(page.locator("#status")).toContainText("Geen geauthenticeerd");
});
test("Release Control Center weigert ongeldige commitwaarden",async({page})=>{
 await page.goto(root+"atlas-release-control.html");
 await page.locator("#candidate").fill("BAD-SHA");
 await page.locator("#export").click();
 await expect(page.locator("#status")).toContainText("EXPORT AFGEWEZEN");
 await expect(page.locator("#status")).not.toContainText("DRAFT-overdrachtsdossier lokaal aangeboden");
});
test("Release Control Center opent na offline installatie",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-release-control.html");
 await expect(page.locator("#gates .line")).toHaveCount(6);
 await expect(page.locator("#rollback .line")).toHaveCount(4);
});

test("Integrity & Recovery maakt en vergelijkt lokale SHA-256 bestanden",async({page})=>{
 await page.goto(root+"atlas-release-integrity.html");
 await page.locator("#source-files").setInputFiles({name:"sample.txt",mimeType:"text/plain",buffer:Buffer.from("Hello PALACO")});
 await page.locator("#make").click();
 await expect(page.locator("#make-status")).toContainText("DRAFT-manifest van 1");
 await page.locator("#verify-files").setInputFiles({name:"sample.txt",mimeType:"text/plain",buffer:Buffer.from("Hello PALACO")});
 await page.locator("#verify").click();
 await expect(page.locator("#compare-status")).toContainText("ALLE HASHES MATCHEN");
 await expect(page.locator("#compare-status")).toContainText("DENY");
 await expect(page.locator("#recovery-export")).toBeEnabled();
});
test("Integrity & Recovery detecteert gewijzigd releasebestand",async({page})=>{
 await page.goto(root+"atlas-release-integrity.html");
 await page.locator("#source-files").setInputFiles({name:"sample.txt",mimeType:"text/plain",buffer:Buffer.from("Original")});
 await page.locator("#make").click();
 await expect(page.locator("#make-status")).toContainText("DRAFT-manifest");
 await page.locator("#verify-files").setInputFiles({name:"sample.txt",mimeType:"text/plain",buffer:Buffer.from("Altered")});
 await page.locator("#verify").click();
 await expect(page.locator("#results")).toContainText("MISMATCH");
 await expect(page.locator("#compare-status")).toContainText("HOLD / DENY");
});
test("Integrity & Recovery blijft offline bruikbaar",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-release-integrity.html");
 await expect(page.locator("h1")).toContainText("Integriteit & herstel");
 await page.locator("#source-files").setInputFiles({name:"offline.txt",mimeType:"text/plain",buffer:Buffer.from("local")});
 await page.locator("#make").click();
 await expect(page.locator("#make-status")).toContainText("DRAFT-manifest");
});

test("Package Audit opent en blijft zonder manifest op HOLD",async({page})=>{
 await page.goto(root+"atlas-package-audit.html");
 await expect(page.locator("h1")).toContainText("Pakketaudit");
 await expect(page.locator("body")).toContainText("DRAFT · HOLD · DENY");
 await expect(page.locator("#audit")).toBeDisabled();
 await expect(page.locator("#download")).toBeDisabled();
});
test("Package Audit toont ontbrekende modules zonder ongeoorloofde claim",async({page})=>{
 await page.goto(root+"atlas-release-integrity.html");
 await page.locator("#source-files").setInputFiles({name:"index.html",mimeType:"text/html",buffer:Buffer.from("atlas")});
 await page.locator("#make").click();
 await expect(page.locator("#make-status")).toContainText("DRAFT-manifest van 1");
 const downloadPromise=page.waitForEvent("download");
 await page.locator("#manifest-export").click();
 const artifact=await downloadPromise;
 const fs=await import("node:fs/promises");
 const data=await fs.readFile(await artifact.path());
 await page.goto(root+"atlas-package-audit.html");
 await page.locator("#manifest-file").setInputFiles({name:"draft.json",mimeType:"application/json",buffer:data});
 await expect(page.locator("#audit")).toBeEnabled();
 await page.locator("#audit").click();
 await expect(page.locator("#audit-status")).toContainText("ONVOLLEDIG");
 await expect(page.locator("#audit-status")).toContainText("Ontbrekend 50");
 await expect(page.locator("#download")).toBeEnabled();
});
test("Package Audit werkt offline na installatie",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-package-audit.html");
 await expect(page.locator("h1")).toContainText("Pakketaudit");
 await expect(page.locator("#audit")).toBeDisabled();
});

test("Dependency & Security Audit inspecteert Atlasbronnen lokaal zonder vrijgave",async({page})=>{
 await page.goto(root+"atlas-security-audit.html");
 await expect(page.locator("#export")).toBeDisabled();
 await page.locator("#run").click();
 await expect(page.locator("#audit-status")).toContainText("HOLD / DENY");
 await expect(page.locator("#summary")).toContainText("Bronnen: 51 / 51");
 await expect(page.locator("#summary")).toContainText("Offlinebronnencontract: 52");
 await expect(page.locator("#export")).toBeEnabled();
});
test("Dependency & Security Audit opent en werkt zonder netwerk",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-security-audit.html");
 await page.locator("#run").click();
 await expect(page.locator("#summary")).toContainText("Bronnen: 51 / 51");
 await expect(page.locator("#audit-status")).toContainText("HOLD / DENY");
});

test("Traceerbaarheidskamer verbindt module, poort en bestandsbewijs zonder GO",async({page})=>{
 await page.goto(root+"atlas-traceability.html");
 await page.locator("#evidence-id").fill("ATLAS-TRACE-001");
 await page.locator("#reference").fill("CI-voorbeeld niet geattesteerd");
 await page.locator("#result").selectOption("SELF_REPORTED_PASS");
 await page.locator("#add").click();
 await expect(page.locator("#entries .entry")).toHaveCount(1);
 await expect(page.locator("#summary")).toContainText("Bewijsreferenties: 1");
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
 await expect(page.locator("#entries")).toContainText("UNVERIFIED");
});
test("Traceerbaarheidskamer weigert ongeldige versie en dubbele referenties",async({page})=>{
 await page.goto(root+"atlas-traceability.html");
 await page.locator("#commit").fill("BAD");
 await page.locator("#version").click();
 await expect(page.locator("#status")).toContainText("AFGEWEZEN");
 await page.locator("#evidence-id").fill("DUP-001");
 await page.locator("#reference").fill("lokaal label");
 await page.locator("#add").click();
 await page.locator("#add").click();
 await expect(page.locator("#entries .entry")).toHaveCount(1);
 await expect(page.locator("#status")).toContainText("AFGEWEZEN");
});
test("Traceerbaarheidskamer blijft zonder netwerk beschikbaar",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-traceability.html");
 await page.locator("#evidence-id").fill("OFFLINE-001");
 await page.locator("#reference").fill("offline notitie");
 await page.locator("#add").click();
 await expect(page.locator("#entries .entry")).toHaveCount(1);
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
});

test("Attestation Preparation maakt DRAFT-overdracht uit lokaal traceerrapport",async({page})=>{
 await page.goto(root+"atlas-traceability.html");
 await page.locator("#evidence-id").fill("ATT-001");
 await page.locator("#reference").fill("handmatige bewijsreferentie");
 await page.locator("#add").click();
 const dl=page.waitForEvent("download");
 await page.locator("#export").click();
 const file=await dl,fs=await import("node:fs/promises"),bytes=await fs.readFile(await file.path());
 await page.goto(root+"atlas-attestation.html");
 await page.locator("#trace-file").setInputFiles({name:"trace.json",mimeType:"application/json",buffer:bytes});
 await expect(page.locator("#prepare")).toBeEnabled();
 await page.locator("#prepare").click();
 await expect(page.locator("#summary")).toContainText("1 zelfgerapporteerde labels");
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
 await expect(page.locator("#gates .line")).toHaveCount(6);
 await expect(page.locator("#evidence")).toContainText("UNVERIFIED");
});
test("Attestation Preparation weigert vervalste traceerbaarheidsclaims",async({page})=>{
 await page.goto(root+"atlas-attestation.html");
 await page.locator("#trace-file").setInputFiles({name:"false.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({state:"APPROVED",authorization:"ALLOW"}))});
 await expect(page.locator("#import-status")).toContainText("AFGEWEZEN");
 await expect(page.locator("#prepare")).toBeDisabled();
});
test("Attestation Preparation blijft offline bruikbaar",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-attestation.html");
 await expect(page.locator("h1")).toContainText("Attestatievoorbereiding");
 await expect(page.locator("#import-status")).toContainText("Nog geen traceerbaarheidsrapport");
 await expect(page.locator("body")).toContainText("HOLD");
});

test("Wereldatlas v2.0 biedt negentien Atlasroutes in drie hoofdstukken",async({page})=>{
 await page.goto(root+"atlas-consolidatie.html");
 await expect(page.locator("#workflows section")).toHaveCount(3);
 await expect(page.locator("#workflows a")).toHaveCount(19);
 await expect(page.locator("#navigation-status")).toContainText("19 behouden Atlasroutes");
 await expect(page.locator("#gates .line")).toHaveCount(6);
 await expect(page.locator("#externals .line")).toHaveCount(4);
 await expect(page.locator("body")).toContainText("HOLD");
});
test("Wereldatlas v2.0 weigert ongeldige commit en behoudt HOLD bij correcte versie",async({page})=>{
 await page.goto(root+"atlas-consolidatie.html");
 await page.locator("#sha").fill("BAD");
 await page.locator("#apply").click();
 await expect(page.locator("#status")).toContainText("AFGEWEZEN");
 await page.locator("#sha").fill("a".repeat(40));
 await page.locator("#reference").fill("RC-review 001");
 await page.locator("#apply").click();
 await expect(page.locator("#status")).toContainText("HOLD / DENY");
});
test("Wereldatlas v2.0 offline behoudt alle navigatiehoofdstukken",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-consolidatie.html");
 await expect(page.locator("#workflows section")).toHaveCount(3);
 await expect(page.locator("#workflows a")).toHaveCount(19);
 await expect(page.locator("#navigation-status")).toContainText("HOLD / DENY");
});

test("Mobiele acceptatiekamer toont zeven ongeteste stappen en HOLD",async({page})=>{
 await page.goto(root+"atlas-device-acceptance.html");
 await expect(page.locator("#steps .step")).toHaveCount(7);
 await expect(page.locator("#summary")).toContainText("NOT_TESTED 7");
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
 await page.locator("#status-DEVICE-01").selectOption("PASS");
 await page.locator("#steps .step").first().getByRole("button",{name:"Bewaar stap lokaal"}).click();
 await expect(page.locator("#summary")).toContainText("PASS 1");
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
});
test("Mobiele acceptatiekamer weigert gefingeerde geverifieerde import",async({page})=>{
 await page.goto(root+"atlas-device-acceptance.html");
 await page.locator("#import-file").setInputFiles({name:"forged.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({schema:"palaco.atlas.mobile-acceptance.self-report.v2.1",authorization:"ALLOW",verified:true}))});
 await expect(page.locator("#status")).toContainText("AFGEWEZEN");
 await expect(page.locator("#summary")).toContainText("NOT_TESTED 7");
});
test("Mobiele acceptatiekamer is offline beschikbaar",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-device-acceptance.html");
 await expect(page.locator("#steps .step")).toHaveCount(7);
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
});

test("Mobiele handoff importeert DRAFT telefoonrapport en markeert ontbrekend bewijs",async({page})=>{
 await page.goto(root+"atlas-device-acceptance.html");
 const reportDownload=page.waitForEvent("download");
 await page.locator("#export").click();
 const file=await reportDownload,fs=await import("node:fs/promises"),buffer=await fs.readFile(await file.path());
 await page.goto(root+"atlas-device-handover.html");
 await page.locator("#source-file").setInputFiles({name:"phone.json",mimeType:"application/json",buffer});
 await expect(page.locator("#prepare")).toBeEnabled();
 await page.locator("#prepare").click();
 await expect(page.locator("#summary")).toContainText("7 van 7 controles");
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
 await expect(page.locator("#checks .line")).toHaveCount(7);
 await expect(page.locator("#approvals .line")).toHaveCount(4);
 await expect(page.locator("#export")).toBeEnabled();
});
test("Mobiele handoff weigert vervalste autorisatieclaim",async({page})=>{
 await page.goto(root+"atlas-device-handover.html");
 await page.locator("#source-file").setInputFiles({name:"bad.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({authorization:"ALLOW",verified:true}))});
 await expect(page.locator("#status")).toContainText("AFGEWEZEN");
 await expect(page.locator("#export")).toBeDisabled();
});
test("Mobiele handoff blijft offline met behoud van HOLD",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-device-handover.html");
 await expect(page.locator("h1")).toContainText("Acceptatieoverdracht");
 await expect(page.locator("body")).toContainText("HOLD / DENY");
});

test("Mobiele hertoetsing signaleert regressie tussen twee zelfrapporten",async({page})=>{
 await page.goto(root+"atlas-device-acceptance.html");
 const oldDownload=page.waitForEvent("download");
 await page.locator("#status-DEVICE-01").selectOption("PASS");
 await page.locator("#steps .step").first().getByRole("button",{name:"Bewaar stap lokaal"}).click();
 await page.locator("#export").click();
 const oldFile=await oldDownload,fs=await import("node:fs/promises"),oldRaw=await fs.readFile(await oldFile.path());
 await page.locator("#status-DEVICE-01").selectOption("FAIL");
 await page.locator("#steps .step").first().getByRole("button",{name:"Bewaar stap lokaal"}).click();
 const newDownload=page.waitForEvent("download");await page.locator("#export").click();
 const newFile=await newDownload,newRaw=await fs.readFile(await newFile.path());
 await page.goto(root+"atlas-device-retest.html");
 await page.locator("#previous-file").setInputFiles({name:"previous.json",mimeType:"application/json",buffer:oldRaw});
 await page.locator("#current-file").setInputFiles({name:"current.json",mimeType:"application/json",buffer:newRaw});
 await page.locator("#compare").click();
 await expect(page.locator("#summary")).toContainText("1 regressies");
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
 await expect(page.locator("#results")).toContainText("REGRESSIE");
});
test("Mobiele hertoetsing weigert vervalst ALLOW-rapport",async({page})=>{
 await page.goto(root+"atlas-device-retest.html");
 await page.locator("#previous-file").setInputFiles({name:"forged.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({authorization:"ALLOW",verified:true}))});
 await expect(page.locator("#import-status")).toContainText("AFGEWEZEN");
 await expect(page.locator("#compare")).toBeDisabled();
});
test("Mobiele hertoetsing opent offline",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);await page.goto(root+"atlas-device-retest.html");
 await expect(page.locator("h1")).toContainText("Vergelijk twee telefoonrapporten");
 await expect(page.locator("#compare")).toBeDisabled();
});

test("Mobiele Herstelregie toont regressieprioriteit uit twee lokale telefoonrapporten",async({page})=>{
 await page.goto(root+"atlas-device-acceptance.html");
 await page.locator("#status-DEVICE-01").selectOption("PASS");
 await page.locator("#steps .step").first().getByRole("button",{name:"Bewaar stap lokaal"}).click();
 const oldPromise=page.waitForEvent("download");await page.locator("#export").click();
 const fs=await import("node:fs/promises"),oldBytes=await fs.readFile(await (await oldPromise).path());
 await page.locator("#status-DEVICE-01").selectOption("FAIL");
 await page.locator("#steps .step").first().getByRole("button",{name:"Bewaar stap lokaal"}).click();
 const newPromise=page.waitForEvent("download");await page.locator("#export").click();
 const newBytes=await fs.readFile(await (await newPromise).path());
 await page.goto(root+"atlas-device-retest.html");
 await page.locator("#previous-file").setInputFiles({name:"previous.json",mimeType:"application/json",buffer:oldBytes});
 await page.locator("#current-file").setInputFiles({name:"current.json",mimeType:"application/json",buffer:newBytes});
 await page.locator("#compare").click();
 const retestPromise=page.waitForEvent("download");await page.locator("#export").click();
 const retestBytes=await fs.readFile(await (await retestPromise).path());
 await page.goto(root+"atlas-device-triage.html");
 await page.locator("#retest-file").setInputFiles({name:"retest.json",mimeType:"application/json",buffer:retestBytes});
 await page.locator("#analyse").click();
 await expect(page.locator("#summary")).toContainText("1 kritiek");
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
 await expect(page.locator("#items")).toContainText("CRITICAL");
 await expect(page.locator("#export")).toBeEnabled();
});
test("Mobiele Herstelregie weigert vervalste hertoetsing",async({page})=>{
 await page.goto(root+"atlas-device-triage.html");
 await page.locator("#retest-file").setInputFiles({name:"forged.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({authorization:"ALLOW",verified:true}))});
 await expect(page.locator("#status")).toContainText("AFGEWEZEN");
 await expect(page.locator("#analyse")).toBeDisabled();
});
test("Mobiele Herstelregie opent zonder netwerk",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-device-triage.html");
 await expect(page.locator("h1")).toContainText("Van regressie naar herstelactie");
 await expect(page.locator("#analyse")).toBeDisabled();
});

test("Herstelverificatie toont gekoppeld dossier en zelfgerapporteerd herstel",async({page})=>{
 await page.goto(root+"atlas-device-acceptance.html");
 await page.locator("#status-DEVICE-01").selectOption("PASS");
 await page.locator("#steps .step").first().getByRole("button",{name:"Bewaar stap lokaal"}).click();
 const oldPromise=page.waitForEvent("download");await page.locator("#export").click();
 const fs=await import("node:fs/promises"),oldBytes=await fs.readFile(await (await oldPromise).path());
 await page.locator("#status-DEVICE-01").selectOption("FAIL");
 await page.locator("#steps .step").first().getByRole("button",{name:"Bewaar stap lokaal"}).click();
 const newPromise=page.waitForEvent("download");await page.locator("#export").click();
 const newBytes=await fs.readFile(await (await newPromise).path());
 await page.goto(root+"atlas-device-retest.html");
 await page.locator("#previous-file").setInputFiles({name:"before.json",mimeType:"application/json",buffer:oldBytes});
 await page.locator("#current-file").setInputFiles({name:"after.json",mimeType:"application/json",buffer:newBytes});
 await page.locator("#compare").click();
 const diffPromise=page.waitForEvent("download");await page.locator("#export").click();
 const diffBytes=await fs.readFile(await (await diffPromise).path());
 await page.goto(root+"atlas-device-triage.html");
 await page.locator("#retest-file").setInputFiles({name:"diff.json",mimeType:"application/json",buffer:diffBytes});
 await page.locator("#analyse").click();
 const triagePromise=page.waitForEvent("download");await page.locator("#export").click();
 const triageBytes=await fs.readFile(await (await triagePromise).path());
 await page.goto(root+"atlas-recovery-verification.html");
 await page.locator("#comparison-file").setInputFiles({name:"diff.json",mimeType:"application/json",buffer:diffBytes});
 await page.locator("#triage-file").setInputFiles({name:"triage.json",mimeType:"application/json",buffer:triageBytes});
 await page.locator("#latest-file").setInputFiles({name:"latest.json",mimeType:"application/json",buffer:newBytes});
 await page.locator("#verify").click();
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
 await expect(page.locator("#results .line")).toHaveCount(7);
 await expect(page.locator("#results")).toContainText("STILL_BLOCKED");
});
test("Herstelverificatie weigert vervalst telefoonbewijs",async({page})=>{
 await page.goto(root+"atlas-recovery-verification.html");
 await page.locator("#latest-file").setInputFiles({name:"forged.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({authorization:"ALLOW",verified:true}))});
 await expect(page.locator("#status")).toContainText("AFGEWEZEN");
 await expect(page.locator("#verify")).toBeDisabled();
});
test("Herstelverificatie is offline beschikbaar",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-recovery-verification.html");
 await expect(page.locator("h1")).toContainText("Herstel opnieuw toetsen");
 await expect(page.locator("#verify")).toBeDisabled();
});

test("v2.5 bundelt vier samenhangende mobiele rapporten tot HOLD dossier",async({page})=>{
 await page.goto(root+"atlas-mobile-dossier.html");
 const sources=await page.evaluate(async()=>{
  const {STEPS,newDeviceReport,updateDeviceReport}=await import("./atlas-device-acceptance.mjs");
  const {comparePhoneReports}=await import("./atlas-device-retest.mjs");
  const {makeTriage}=await import("./atlas-device-triage.mjs");
  const {makeRecoveryVerification}=await import("./atlas-recovery-verification.mjs");
  const patch=(r,status,note,evidenceReference)=>updateDeviceReport(r,STEPS[0].id,{status,note,evidenceReference});
  const original=patch(newDeviceReport(),"PASS","first","REF-1");
  const retry=patch(original,"FAIL","regression","REF-2");
  const latest=patch(retry,"PASS","retested","REF-3");
  const comparison=comparePhoneReports(original,retry,{caseReference:"CASE-1"});
  const triage=makeTriage(comparison);
  const verification=makeRecoveryVerification(comparison,triage,latest);
  return {comparison,triage,latest,verification};
 });
 for(const [name,data] of Object.entries(sources)){
   await page.locator("#"+name+"-file").setInputFiles({name:name+".json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))});
   await expect(page.locator("#status"),"Import van "+name).toContainText("Lokaal bestand geladen");
 }
 await expect(page.locator("#consolidate")).toBeEnabled();
 await page.locator("#consolidate").click();
 await expect(page.locator("#summary")).toContainText("HOLD / DENY");
 await expect(page.locator("#results .line")).toHaveCount(7);
 await expect(page.locator("#results")).toContainText("RECOVERY_SELF_REPORTED");
 await expect(page.locator("#export")).toBeEnabled();
 const download=page.waitForEvent("download");await page.locator("#export").click();
 const out=JSON.parse(await (await import("node:fs/promises")).readFile(await (await download).path(),"utf8"));
 expect(out.authorization).toBe("DENY");expect(out.releaseReady).toBe(false);
});
test("v2.5 weigert een ongeldige bron en blijft op HOLD",async({page})=>{
 await page.goto(root+"atlas-mobile-dossier.html");
 await page.locator("#comparison-file").setInputFiles({name:"forged.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({verified:true,authorization:"ALLOW"}))});
 await expect(page.locator("#status")).toContainText("AFGEWEZEN");
 await expect(page.locator("#consolidate")).toBeDisabled();
});
test("v2.5 acceptatiedossier opent offline",async({page,context})=>{
 await page.goto(root+"atlas-integratie.html");
 await page.locator("#offline-enable").click();
 await expect(page.locator("#offline-status")).toContainText("Offlinepakket gereed");
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);
 await page.goto(root+"atlas-mobile-dossier.html");
 await expect(page.locator("h1")).toContainText("Een compleet acceptatiedossier");
 await expect(page.locator("#consolidate")).toBeDisabled();
});
