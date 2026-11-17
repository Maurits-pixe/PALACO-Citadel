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
 ["Acceptatiekamer","atlas-acceptatie.html"]
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
  const cache=await caches.open("palaco-atlas-shell-v1-rc2");
  const keys=await cache.keys();
  return keys.map(r=>new URL(r.url).pathname);
 });
 expect(paths).toHaveLength(20);
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
