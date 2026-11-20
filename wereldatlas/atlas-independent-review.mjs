// PALACO Atlas v2.6 RC — independent acceptance review preparation, NOT independent attestation.
// This module only validates a self-reported consolidated dossier's structural envelope.
import {STEPS} from "./atlas-device-acceptance.mjs";
import {DOSSIER_SCHEMA} from "./atlas-mobile-dossier.mjs";
export const REVIEW_SCHEMA="palaco.atlas.independent-acceptance-review.draft.v2.6";
export const MAX_DOSSIER_BYTES=131072;
export const CRITERIA=Object.freeze([
 {id:"PHYSICAL_DEVICE",label:"Fysieke telefoonacceptatie",instruction:"Controleer de zeven waarnemingen op het echte toestel."},
 {id:"EVIDENCE_CHAIN",label:"Onafhankelijke bewijsketen",instruction:"Vergelijk bronbestanden en bewijsreferenties met oorspronkelijke bronnen."},
 {id:"REGRESSION",label:"Openstaande regressies",instruction:"Laat ieder openstaand herstel- en regressiepunt beoordelen."},
 {id:"SECURITY",label:"Beveiliging en privacy",instruction:"Laat beveiligings- en privacyonderzoek onafhankelijk uitvoeren."},
 {id:"RELEASE_AUTHORITY",label:"Bevoegde releasebeslissing",instruction:"Vraag formele menselijke autorisatie buiten deze lokale applicatie."}
]);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const safe=(s,max)=>typeof s==="string"&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
export function validateDossierEnvelope(d){
 const errors=[];
 if(!exact(d,["schema","state","source","verified","decision","authorization","caseReference","chain","steps","summary","reviewRequirements","independentReviewCompleted","actionsExecuted","releaseReady","notice"]))return {ok:false,errors:["Dossierstructuur wijkt af."]};
 if(d.schema!==DOSSIER_SCHEMA||d.state!=="DRAFT"||d.source!=="LOCAL_SELF_REPORTED_NOT_VERIFIED"||d.verified!==false||d.decision!=="HOLD"||d.authorization!=="DENY"||
 d.independentReviewCompleted!==false||d.actionsExecuted!==false||d.releaseReady!==false||!safe(d.caseReference,240))errors.push("Verboden status- of attestatieclaim.");
 if(!Array.isArray(d.steps)||d.steps.length!==STEPS.length||
 STEPS.some((s,i)=>{const row=d.steps[i];return !exact(row,["id","title","initialStatus","retestStatus","latestStatus","initialNote","retestNote","latestNote","initialEvidence","retestEvidence","latestEvidence","priority","proposedAction","actionStatus","verificationStatus","retestPerformed","evidencePresent","blocker"])||
 row.id!==s.id||row.title!==s.title||!["PASS","FAIL","BLOCKED","NOT_TESTED"].includes(row.initialStatus)||
 !["PASS","FAIL","BLOCKED","NOT_TESTED"].includes(row.retestStatus)||!["PASS","FAIL","BLOCKED","NOT_TESTED"].includes(row.latestStatus)||
 !["OPEN"].includes(row.actionStatus)||typeof row.evidencePresent!=="boolean"||typeof row.blocker!=="boolean"||
 typeof row.retestPerformed!=="boolean"||!["CRITICAL","HIGH","MEDIUM","LOW","MONITOR"].includes(row.priority)||
 !["RECOVERY_SELF_REPORTED","STILL_BLOCKED","NEW_REGRESSION","EVIDENCE_MISSING","NOT_RETESTED","RETEST_REQUIRED","MONITOR"].includes(row.verificationStatus)||
 ![row.initialNote,row.retestNote,row.latestNote].every(v=>safe(v,1000))||
 ![row.initialEvidence,row.retestEvidence,row.latestEvidence].every(v=>safe(v,240))||!safe(row.proposedAction,500)}))errors.push("Teststap of bewijslabel ongeldig.");
 if(!exact(d.summary,["total","openBlockers","evidenceMissing","selfReportedRecovery","stillBlocked","independentlyVerified"])||
 d.summary.total!==STEPS.length||d.summary.openBlockers!==d.steps.filter(x=>x.blocker).length||
 d.summary.evidenceMissing!==d.steps.filter(x=>!x.evidencePresent).length||
 d.summary.selfReportedRecovery!==d.steps.filter(x=>x.verificationStatus==="RECOVERY_SELF_REPORTED").length||
 d.summary.stillBlocked!==d.steps.filter(x=>["STILL_BLOCKED","NEW_REGRESSION"].includes(x.verificationStatus)).length||
 d.summary.independentlyVerified!==0)errors.push("Bewijstelling wijkt af.");
 if(!exact(d.chain,["retestReference","triageReference","verificationReference","originalDevice","retestDevice","latestDevice"])||
 ![d.chain?.retestReference,d.chain?.triageReference,d.chain?.verificationReference].every(v=>safe(v,240))||
 ![d.chain?.originalDevice,d.chain?.retestDevice,d.chain?.latestDevice].every(v=>exact(v,["model","browser","observedDate","reference"])&&
 Object.values(v).every(x=>safe(x,240))))errors.push("Herkomstgegevens ongeldig.");
 if(!Array.isArray(d.reviewRequirements)||d.reviewRequirements.length!==5||!d.reviewRequirements.every(v=>safe(v,240))||
 !safe(d.notice,500))errors.push("Reviewverplichtingen ontbreken.");
 return {ok:errors.length===0,errors};
}
export function parseReviewDossier(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>MAX_DOSSIER_BYTES)throw Error("Dossier ontbreekt of is groter dan 128 KiB.");
 let d;try{d=JSON.parse(raw)}catch{throw Error("Dossier is geen geldige JSON.")};
 const v=validateDossierEnvelope(d);if(!v.ok)throw Error(v.errors.join("; "));
 return d;
}
export function prepareReview(dossier,{reviewReference="",reviewerLabel=""}={}){
 const validation=validateDossierEnvelope(dossier);if(!validation.ok)throw Error(validation.errors.join("; "));
 if(!safe(reviewReference,240)||!safe(reviewerLabel,160))throw Error("Reviewmetadata ongeldig.");
 const checks=CRITERIA.map(c=>({
  id:c.id,label:c.label,requirement:c.instruction,status:"PENDING_INDEPENDENT_REVIEW",
  independentlyVerified:false,decision:"OPEN"}));
 return {schema:REVIEW_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",
  verified:false,decision:"HOLD",authorization:"DENY",
  reviewReference,reviewerLabel,reviewerIdentityVerified:false,
  dossierReference:dossier.caseReference,stepsReviewed:dossier.steps.length,
  openBlockers:dossier.summary.openBlockers,evidenceMissing:dossier.summary.evidenceMissing,
  checks,independentReviewCompleted:false,releaseReady:false,releaseExecuted:false,
  notice:"Dit rapport is alleen een voorbereide reviewchecklist. Geen onafhankelijke toetsing, handtekening of productieautorisatie."};
}
export function validatePreparedReview(review,dossier){
 const keys=["schema","state","source","verified","decision","authorization","reviewReference","reviewerLabel","reviewerIdentityVerified","dossierReference","stepsReviewed","openBlockers","evidenceMissing","checks","independentReviewCompleted","releaseReady","releaseExecuted","notice"];
 if(!exact(review,keys)||!safe(review.reviewReference,240)||!safe(review.reviewerLabel,160))return {ok:false,errors:["Reviewcontract ongeldig."]};
 try{const expected=prepareReview(dossier,{reviewReference:review.reviewReference,reviewerLabel:review.reviewerLabel});
 if(JSON.stringify(expected)!==JSON.stringify(review))throw Error("Reviewclaim gewijzigd of vervalst.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
