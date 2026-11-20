// PALACO Atlas v2.5 — consolidated local mobile acceptance handoff; never an attestation.
import {STEPS,validateDeviceReport} from "./atlas-device-acceptance.mjs";
import {validatePhoneComparison} from "./atlas-device-retest.mjs";
import {validateTriage} from "./atlas-device-triage.mjs";
import {validateRecoveryVerification} from "./atlas-recovery-verification.mjs";
export const DOSSIER_SCHEMA="palaco.atlas.mobile-acceptance-dossier.draft.v2.5";
export const MAX_JSON_BYTES=131072;
const exact=(o,keys)=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&Object.keys(o).every(k=>keys.includes(k));
const safe=(v,n)=>typeof v==="string"&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
export function parseLocalJSON(raw,maxBytes=MAX_JSON_BYTES){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>maxBytes)throw Error("Lokaal JSON-dossier ongeldig of te groot.");
 try{return JSON.parse(raw)}catch{throw Error("Lokaal JSON-dossier is geen geldige JSON.")}
}
export function buildMobileDossier(comparison,triage,latest,verification,{caseReference=""}={}){
 if(!safe(caseReference,240))throw Error("Ongeldige dossierreferentie.");
 if(!validatePhoneComparison(comparison).ok)throw Error("Hertoetsing ongeldig.");
 if(!validateTriage(triage,comparison).ok)throw Error("Herstelregie hoort niet bij hertoetsing.");
 if(!validateDeviceReport(latest).ok)throw Error("Nieuwe telefoonacceptatie ongeldig.");
 if(!validateRecoveryVerification(verification,comparison,triage,latest).ok)throw Error("Herstelverificatie hoort niet bij de aangeleverde bronrapporten.");
 const steps=STEPS.map((step,i)=>{
  const old=comparison.previous.steps[i],retested=comparison.current.steps[i],now=latest.steps[i],tri=triage.items[i],verified=verification.rows[i];
  return {id:step.id,title:step.title,initialStatus:old.status,retestStatus:retested.status,latestStatus:now.status,
   initialNote:old.note,retestNote:retested.note,latestNote:now.note,
   initialEvidence:old.evidenceReference,retestEvidence:retested.evidenceReference,latestEvidence:now.evidenceReference,
   priority:tri.priority,proposedAction:tri.recommendedAction,actionStatus:tri.status,
   verificationStatus:verified.status,retestPerformed:verified.retested,
   evidencePresent:verified.evidencePresent,blocker:verified.blocking};
 });
 const summary={total:steps.length,openBlockers:steps.filter(x=>x.blocker).length,
  evidenceMissing:steps.filter(x=>!x.evidencePresent).length,
  selfReportedRecovery:steps.filter(x=>x.verificationStatus==="RECOVERY_SELF_REPORTED").length,
  stillBlocked:steps.filter(x=>["STILL_BLOCKED","NEW_REGRESSION"].includes(x.verificationStatus)).length,
  independentlyVerified:0};
 return {schema:DOSSIER_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",
  verified:false,decision:"HOLD",authorization:"DENY",caseReference,
  chain:{retestReference:comparison.caseReference,triageReference:triage.caseReference,
   verificationReference:verification.reviewReference,
   originalDevice:{...comparison.previous.device},retestDevice:{...comparison.current.device},latestDevice:{...latest.device}},
  steps,summary,reviewRequirements:[
   "Laat de bronobservaties op een echt fysiek toestel controleren",
   "Controleer alle bewijsreferenties buiten de zelfrapportage",
   "Onderzoek openstaande fouten, regressies en ontbrekende gegevens",
   "Voer een onafhankelijke beveiligings- en privacyreview uit",
   "Vraag bevoegd menselijk releasebesluit na onafhankelijke attestatie"],
  independentReviewCompleted:false,actionsExecuted:false,releaseReady:false,
  notice:"Geconsolideerde zelfrapportage. Geen onafhankelijke apparaatacceptatie, cryptografische attestatie of productievrijgave."};
}
export function validateMobileDossier(value,comparison,triage,latest,verification){
 const fields=["schema","state","source","verified","decision","authorization","caseReference","chain","steps","summary","reviewRequirements","independentReviewCompleted","actionsExecuted","releaseReady","notice"];
 if(!exact(value,fields)||!safe(value.caseReference,240))return {ok:false,errors:["Ongeldige dossierstructuur."]};
 try{
  const expected=buildMobileDossier(comparison,triage,latest,verification,{caseReference:value.caseReference});
  if(JSON.stringify(value)!==JSON.stringify(expected))throw Error("Dossier gewijzigd of onbevoegde claim toegevoegd.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
