// PALACO Atlas v2.3 — local regression triage only; no deployment or automatic action.
import {STEPS} from "./atlas-device-acceptance.mjs";
import {validatePhoneComparison} from "./atlas-device-retest.mjs";
export const TRIAGE_SCHEMA="palaco.atlas.mobile-regression-triage.draft.v2.3";
export const MAX_BYTES=65536;
export const ACTIONS=Object.freeze({
 "DEVICE-01":"Controleer URL, verbinding en browserfouten op een fysiek toestel.",
 "DEVICE-02":"Loop alle Atlasroutes en drie navigatiehoofdstukken handmatig na.",
 "DEVICE-03":"Controleer touchbediening, CSS, schermbreedte en oriëntatiewissel.",
 "DEVICE-04":"Controleer serviceworker-installatie en de offlinecache.",
 "DEVICE-05":"Controleer offline herladen van Consolidatie, Archief en Integratiekern.",
 "DEVICE-06":"Controleer handmatige cacheverwijdering en herinstallatie.",
 "DEVICE-07":"Controleer lokale privacy, bewijsreferenties en HOLD/DENY."
});
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,k)=>obj(x)&&Object.keys(x).length===k.length&&Object.keys(x).every(y=>k.includes(y));
const safe=(s,n)=>typeof s==="string"&&s.length<=n&&!/[\u0000-\u001f\u007f]/.test(s);
export function parseRetest(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>MAX_BYTES)throw Error("Hertoetsingsbestand ongeldig of groter dan 64 KiB.");
 let value;try{value=JSON.parse(raw)}catch{throw Error("Ongeldige JSON.")};
 const v=validatePhoneComparison(value);if(!v.ok)throw Error(v.errors.join("; "));
 return value;
}
export function makeTriage(comparison,{caseReference=""}={}){
 if(!validatePhoneComparison(comparison).ok)throw Error("Hertoetsingsdossier ongeldig.");
 if(!safe(caseReference,240))throw Error("Ongeldige dossierreferentie.");
 const items=comparison.comparison.observations.map((o,i)=>{
  const priority=o.regression?"CRITICAL":o.failure?"HIGH":o.current==="NOT_TESTED"?"MEDIUM":o.changed?"LOW":"MONITOR";
  return {id:STEPS[i].id,title:STEPS[i].title,previous:o.previous,current:o.current,
   regression:o.regression,changed:o.changed,priority,blocking:["CRITICAL","HIGH","MEDIUM"].includes(priority),
   status:"OPEN",owner:"UNASSIGNED",recommendedAction:ACTIONS[STEPS[i].id],
   evidenceReference:comparison.current.steps[i].evidenceReference,note:comparison.current.steps[i].note};
 });
 const counts=Object.fromEntries(["CRITICAL","HIGH","MEDIUM","LOW","MONITOR"].map(p=>[p,items.filter(x=>x.priority===p).length]));
 return {schema:TRIAGE_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,
  decision:"HOLD",authorization:"DENY",caseReference,sourceCaseReference:comparison.caseReference,
  deviceChanged:comparison.comparison.deviceChanged,items,counts,openBlockers:items.filter(x=>x.blocking).length,
  actionsExecuted:false,independentReviewCompleted:false,releaseReady:false,
  notice:"Dit is alleen herstelvoorbereiding op basis van lokale zelfrapportage. Geen actie uitgevoerd of vrijgave verleend."};
}
export function validateTriage(report,comparison){
 const fields=["schema","state","source","verified","decision","authorization","caseReference","sourceCaseReference","deviceChanged","items","counts","openBlockers","actionsExecuted","independentReviewCompleted","releaseReady","notice"];
 if(!exact(report,fields)||!safe(report.caseReference,240))return {ok:false,errors:["Onjuist triagecontract."]};
 try{
  const expected=makeTriage(comparison,{caseReference:report.caseReference});
  if(JSON.stringify(report)!==JSON.stringify(expected))throw Error("Triage gemanipuleerd of autorisatie vervalst.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
