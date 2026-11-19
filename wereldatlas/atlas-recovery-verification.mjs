// PALACO Wereldatlas v2.4 RC — local recovery verification, no trusted attestation.
import {STEPS,validateDeviceReport} from "./atlas-device-acceptance.mjs";
import {validatePhoneComparison} from "./atlas-device-retest.mjs";
import {makeTriage,validateTriage} from "./atlas-device-triage.mjs";
export const RECOVERY_VERIFY_SCHEMA="palaco.atlas.recovery-verification.draft.v2.4";
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,fields)=>object(x)&&Object.keys(x).length===fields.length&&Object.keys(x).every(k=>fields.includes(k));
const safe=(s,n)=>typeof s==="string"&&s.length<=n&&!/[\u0000-\u001f\u007f]/.test(s);
export function makeRecoveryVerification(comparison,triage,latest,{reviewReference=""}={}){
 if(!validatePhoneComparison(comparison).ok)throw Error("Oorspronkelijk hertoetsingsrapport ongeldig.");
 if(!validateTriage(triage,comparison).ok)throw Error("Herstelregie komt niet overeen met brondossier.");
 if(!validateDeviceReport(latest).ok)throw Error("Nieuw telefoonrapport ongeldig.");
 if(!safe(reviewReference,240))throw Error("Reviewreferentie ongeldig.");
 const rows=STEPS.map((step,i)=>{
  const earlier=triage.items[i],current=latest.steps[i],prior=comparison.current.steps[i];
  const needsRecovery=earlier.blocking||earlier.regression;
  const changed=current.status!==prior.status||current.note!==prior.note||current.evidenceReference!==prior.evidenceReference;
  const withEvidence=current.note.trim().length>0&&current.evidenceReference.trim().length>0;
  const retested=changed&&current.status!=="NOT_TESTED";
  const newRegression=prior.status==="PASS"&&current.status!=="PASS";
  const recovered=needsRecovery&&current.status==="PASS"&&retested&&withEvidence;
  const status=newRegression?"NEW_REGRESSION":current.status==="FAIL"||current.status==="BLOCKED"?"STILL_BLOCKED":
    current.status==="NOT_TESTED"?"NOT_RETESTED":needsRecovery&&!retested?"RETEST_REQUIRED":
    needsRecovery&&!withEvidence?"EVIDENCE_MISSING":recovered?"RECOVERY_SELF_REPORTED":"MONITOR";
  return {id:step.id,priorPriority:earlier.priority,previous:prior.status,latest:current.status,retested,
    evidencePresent:withEvidence,status,blocking:!["RECOVERY_SELF_REPORTED","MONITOR"].includes(status),action:earlier.recommendedAction};
 });
 const summary={total:rows.length,remaining:rows.filter(x=>x.blocking).length,
  recoveries:rows.filter(x=>x.status==="RECOVERY_SELF_REPORTED").length,
  newRegressions:rows.filter(x=>x.status==="NEW_REGRESSION").length,
  evidenceMissing:rows.filter(x=>x.status==="EVIDENCE_MISSING").length};
 return {schema:RECOVERY_VERIFY_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,
  decision:"HOLD",authorization:"DENY",reviewReference,sourceCaseReference:comparison.caseReference,
  triageReference:triage.caseReference,deviceChanged:JSON.stringify(comparison.current.device)!==JSON.stringify(latest.device),
  rows,summary,independentDeviceAcceptance:false,actionsExecuted:false,releaseReady:false,
  notice:"Herstelverificatie vergelijkt lokale zelfrapporten. Zelfs RECOVERY_SELF_REPORTED bewijst geen onafhankelijk geverifieerd herstel."};
}
export function validateRecoveryVerification(value,comparison,triage,latest){
 const keys=["schema","state","source","verified","decision","authorization","reviewReference","sourceCaseReference","triageReference","deviceChanged","rows","summary","independentDeviceAcceptance","actionsExecuted","releaseReady","notice"];
 if(!exact(value,keys)||!safe(value.reviewReference,240))return {ok:false,errors:["Ongeldig herstelverificatierapport."]};
 try{const expected=makeRecoveryVerification(comparison,triage,latest,{reviewReference:value.reviewReference});
 if(JSON.stringify(value)!==JSON.stringify(expected))throw Error("Herstelstatus of vrijgaveclaim gewijzigd.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
