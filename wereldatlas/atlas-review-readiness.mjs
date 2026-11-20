// PALACO Atlas v2.9 RC — read-only readiness from independently unverified local reports.
import {validateClosure} from "./atlas-evidence-closure.mjs";
export const READINESS_SCHEMA="palaco.atlas.review-readiness.draft.v2.9";
export const MAX_SOURCE_BYTES=131072;
const exact=(x,ks)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.keys(x).length===ks.length&&Object.keys(x).every(k=>ks.includes(k));
const safe=(x,n)=>typeof x==="string"&&x.length<=n&&!/[\u0000-\u001f\u007f]/.test(x);
export function parseReadinessSource(raw){if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>MAX_SOURCE_BYTES)throw Error("Dossier ontbreekt of is te groot.");try{return JSON.parse(raw)}catch{throw Error("Ongeldige JSON.")}}
export function buildReadiness(dossier,review,register,closure,{dashboardReference=""}={}){
 if(!safe(dashboardReference,240))throw Error("Dashboardreferentie ongeldig.");
 if(!validateClosure(closure,dossier,review,register).ok)throw Error("Bronketen of bewijsafsluiting ongeldig.");
 const evidence=closure.findings.map(f=>({id:f.id,criterionId:f.criterionId,severity:f.severity,status:f.closureStatus,
  reference:f.evidenceReference,requiredAction:f.reviewAction,independentlyVerified:false}));
 const checks=closure.gates.map(c=>({id:c.id,status:"PENDING_INDEPENDENT_REVIEW",attested:false}));
 const problems=[
  {id:"PHYSICAL_DEVICE",open:true,reason:"Fysieke telefoonacceptatie is niet onafhankelijk bevestigd."},
  {id:"EVIDENCE",open:closure.summary.missingEvidence>0,reason:"Bewijsreferenties ontbreken."},
  {id:"SOURCE_DOSSIER",open:closure.summary.sourceDossierBlockers>0,reason:"Mobiele dossierblokkades zijn open."},
  {id:"FINDINGS",open:evidence.length>0,reason:"Bevindingen wachten op onafhankelijke verificatie."},
  {id:"SECURITY",open:true,reason:"Onafhankelijke security/privacyreview ontbreekt."},
  {id:"AUTHORITY",open:true,reason:"Bevoegd releasebesluit ontbreekt."}
 ];
 return {schema:READINESS_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,decision:"HOLD",authorization:"DENY",
 dashboardReference,sourceReferences:{dossier:dossier.caseReference,review:review.reviewReference,register:register.caseReference,handover:closure.handoverReference},
 findings:evidence,checks,blockers:problems,
 summary:{evidenceMissing:closure.summary.missingEvidence,claimedResolved:closure.summary.claimedResolved,
  sourceDossierOpen:closure.summary.sourceDossierBlockers,findingsToReview:evidence.length,
  openBlockerCategories:problems.filter(x=>x.open).length,independentChecksPassed:0},
 independentReviewCompleted:false,releaseReady:false,releaseExecuted:false,
 notice:"Dit is uitsluitend een lokale statusweergave. Afwezige claims of bewijslabels bewijzen geen onafhankelijk geverifieerde releasegereedheid."};
}
export function validateReadiness(value,dossier,review,register,closure){
 const fields=["schema","state","source","verified","decision","authorization","dashboardReference","sourceReferences","findings","checks","blockers","summary","independentReviewCompleted","releaseReady","releaseExecuted","notice"];
 if(!exact(value,fields)||!safe(value.dashboardReference,240))return {ok:false,errors:["Ongeldig dashboardrapport."]};
 try{const expected=buildReadiness(dossier,review,register,closure,{dashboardReference:value.dashboardReference});if(JSON.stringify(value)!==JSON.stringify(expected))throw Error("Dashboardresultaat of autorisatieclaim gewijzigd.")}catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
