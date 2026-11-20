// PALACO Atlas v2.2 mobile acceptance handoff. Review requests are NOT attestations.
import {STEPS,validateDeviceReport,deviceSummary} from "./atlas-device-acceptance.mjs";
export const HANDOFF_SCHEMA="palaco.atlas.mobile-handover.draft.v2.2";
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,fields)=>plain(x)&&Object.keys(x).length===fields.length&&Object.keys(x).every(k=>fields.includes(k));
const safe=(x,max)=>typeof x==="string"&&x.length<=max&&!/[\u0000-\u001f\u007f]/.test(x);
const requiredMetadata=["model","browser","observedDate","reference"];
export function createHandoff(report,{reviewRequest="",handoffNote=""}={}){
 const validation=validateDeviceReport(report);
 if(!validation.ok)throw Error("Mobiel acceptatierapport ongeldig.");
 if(!safe(reviewRequest,160)||!safe(handoffNote,1000))throw Error("Overdrachtsvelden ongeldig.");
 const summary=deviceSummary(report);
 const checks=STEPS.map((step,i)=>{
  const observation=report.steps[i];
  const issues=[];
  if(observation.status==="NOT_TESTED")issues.push("NOT_TESTED");
  if(observation.status==="BLOCKED")issues.push("BLOCKED");
  if(observation.status==="FAIL")issues.push("FAIL");
  if(observation.status==="PASS"&&!observation.note.trim())issues.push("MISSING_OBSERVATION");
  if(observation.status==="PASS"&&!observation.evidenceReference.trim())issues.push("MISSING_EVIDENCE_REFERENCE");
  return {id:step.id,status:observation.status,issues,observationPresent:!!observation.note.trim(),referencePresent:!!observation.evidenceReference.trim(),
   independentVerification:"REQUIRED"};
 });
 const missingMetadata=requiredMetadata.filter(k=>!report.device[k]);
 const pending=checks.filter(x=>x.issues.length>0).length;
 return {schema:HANDOFF_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,
  decision:"HOLD",authorization:"DENY",reviewRequest,handoffNote,
  device:{...report.device},summary:{pass:summary.pass,fail:summary.fail,blocked:summary.blocked,notTested:summary.notTested},
  checks,missingMetadata,pendingChecks:pending,
  remainingApprovals:["INDEPENDENT_EVIDENCE_REVIEW","SECURITY_REVIEW","PHYSICAL_DEVICE_WITNESS","AUTHORIZED_RELEASE_DECISION"],
  independentReviewCompleted:false,releaseReady:false,
  notice:"Lokale zelfrapportage kan geen onafhankelijke toestelacceptatie, identiteit, attestatie of productieautorisatie bewijzen."};
}
export function validateHandoff(handoff,report){
 const fields=["schema","state","source","verified","decision","authorization","reviewRequest","handoffNote","device","summary","checks","missingMetadata","pendingChecks","remainingApprovals","independentReviewCompleted","releaseReady","notice"];
 if(!exact(handoff,fields)||!safe(handoff.reviewRequest,160)||!safe(handoff.handoffNote,1000))return {ok:false,errors:["Ongeldige overdrachtsstructuur."]};
 try{const expected=createHandoff(report,{reviewRequest:handoff.reviewRequest,handoffNote:handoff.handoffNote});
  if(JSON.stringify(handoff)!==JSON.stringify(expected))throw Error("Overdracht is gemanipuleerd of hoort niet bij het mobiele bronrapport.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
