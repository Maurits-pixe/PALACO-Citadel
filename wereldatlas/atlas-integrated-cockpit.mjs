// PALACO Wereldatlas v3.0 — integrated offline acceptance and review cockpit.
// Navigation, local validation and handover only; NEVER confers authorization.
import {validateReadiness,buildReadiness} from "./atlas-review-readiness.mjs";
import {REQUIRED} from "./atlas-package-audit.mjs";
export const COCKPIT_SCHEMA="palaco.atlas.integrated-review-cockpit.draft.v3";
export const STAGES=Object.freeze([
 {id:"acceptance",title:"1 · Mobiele acceptatie",description:"Zeven praktijktests op een fysiek toestel, uitsluitend zelfrapportage.",route:"atlas-device-acceptance.html",required:["physicalDevice"]},
 {id:"handover",title:"2 · Acceptatieoverdracht",description:"Bereid het telefoonrapport lokaal voor overdracht voor.",route:"atlas-device-handover.html",required:["acceptance"]},
 {id:"retest",title:"3 · Mobiele hertoetsing",description:"Vergelijk oude en nieuwe telefoontestresultaten en herken regressies.",route:"atlas-device-retest.html",required:["acceptance"]},
 {id:"triage",title:"4 · Herstelregie",description:"Prioriteer regressies zonder herstelacties zelfstandig uit te voeren.",route:"atlas-device-triage.html",required:["retest"]},
 {id:"recovery",title:"5 · Herstelverificatie",description:"Leg nieuwe zelfgerapporteerde herstelwaarnemingen naast triage.",route:"atlas-recovery-verification.html",required:["triage"]},
 {id:"dossier",title:"6 · Mobiel acceptatiedossier",description:"Bundel gekoppelde bronrapporten voor onafhankelijke controle.",route:"atlas-mobile-dossier.html",required:["recovery"]},
 {id:"review",title:"7 · Onafhankelijke reviewvoorbereiding",description:"Maak vijf open reviewcontroles zichtbaar; voer geen attestatie uit.",route:"atlas-independent-review.html",required:["dossier"]},
 {id:"findings",title:"8 · Bevindingenregister",description:"Leg ongeverifieerde bevindingen en besluitvoorstellen vast.",route:"atlas-review-findings.html",required:["review"]},
 {id:"closure",title:"9 · Evidence Closure & Handover",description:"Maak een niet-geautoriseerde bewijsafsluiting en overdracht.",route:"atlas-evidence-closure.html",required:["findings"]},
 {id:"readiness",title:"10 · Review Readiness",description:"Controleer open bewijs, externe reviewpoorten en blokkades.",route:"atlas-review-readiness.html",required:["closure"]}
]);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const safe=(x,n)=>typeof x==="string"&&x.length<=n&&!/[\u0000-\u001f\u007f]/.test(x);
export function auditCockpitNavigation(){
 const ids=new Set(),links=new Set(),errors=[];
 for(const s of STAGES){
  if(ids.has(s.id))errors.push("Dubbele stap-ID: "+s.id);
  if(links.has(s.route))errors.push("Dubbele route: "+s.route);
  if(!REQUIRED.includes(s.route))errors.push("Ontbrekende route: "+s.route);
  ids.add(s.id);links.add(s.route);
 }
 return {ok:errors.length===0,errors,total:STAGES.length};
}
export function createCockpitReport(dossier,review,register,closure,{sessionReference=""}={}){
 if(!safe(sessionReference,240))throw Error("Sessie-referentie ongeldig.");
 const nav=auditCockpitNavigation();if(!nav.ok)throw Error(nav.errors.join("; "));
 const readiness=buildReadiness(dossier,review,register,closure);
 return {schema:COCKPIT_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,
  decision:"HOLD",authorization:"DENY",sessionReference,
  sourceReferences:{...readiness.sourceReferences},
  navigation:{total:STAGES.length,stages:STAGES.map(s=>({id:s.id,title:s.title,route:s.route,status:"AVAILABLE_FOR_MANUAL_WORK"}))},
  overview:{...readiness.summary},
  blockers:readiness.blockers.map(b=>({...b})),
  independentGates:readiness.checks.map(g=>({...g})),
  currentStage:"INDEPENDENT_REVIEW_REQUIRED",actionsExecuted:false,independentReviewCompleted:false,releaseReady:false,
  notice:"Centrale navigatie en lokale statuscontrole; geen onafhankelijke hardwareacceptatie, securityattestatie of releasebesluit."};
}
export function validateCockpitReport(report,dossier,review,register,closure){
 const keys=["schema","state","source","verified","decision","authorization","sessionReference","sourceReferences","navigation","overview","blockers","independentGates","currentStage","actionsExecuted","independentReviewCompleted","releaseReady","notice"];
 if(!exact(report,keys)||!safe(report.sessionReference,240))return {ok:false,errors:["Ongeldig cockpitcontract."]};
 try{const expected=createCockpitReport(dossier,review,register,closure,{sessionReference:report.sessionReference});
 if(JSON.stringify(report)!==JSON.stringify(expected))throw Error("Cockpitstatus of autorisatieclaim gewijzigd.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
