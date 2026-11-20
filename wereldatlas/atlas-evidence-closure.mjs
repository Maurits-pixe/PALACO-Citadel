// PALACO Atlas v2.8 — local evidence closure and handover; never an attestation.
import {validateRegister} from "./atlas-review-findings.mjs";
export const CLOSURE_SCHEMA="palaco.atlas.review-evidence-closure.draft.v2.8";
export const MAX_BYTES=131072;
const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const safe=(x,n)=>typeof x==="string"&&x.length<=n&&!/[\u0000-\u001f\u007f]/.test(x);
export function parseClosureSource(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>MAX_BYTES)throw Error("Bronbestand ontbreekt of is te groot.");
 try{return JSON.parse(raw)}catch{throw Error("Ongeldige JSON.")};
}
export function makeClosure(dossier,review,register,{handoverReference="",recipientLabel=""}={}){
 if(!validateRegister(register,dossier,review).ok)throw Error("Bevindingenregister hoort niet bij de aangeleverde bronketen.");
 if(!safe(handoverReference,240)||!safe(recipientLabel,160))throw Error("Overdrachtgegevens ongeldig.");
 const findings=register.findings.map(f=>{
  const evidenceSupplied=f.evidenceReference.trim().length>0;
  const selfReported=f.status==="RESOLUTION_SELF_REPORTED";
  return {id:f.id,criterionId:f.criterionId,severity:f.severity,sourceStatus:f.status,
   evidenceReference:f.evidenceReference,evidenceSupplied,
   closureStatus:!evidenceSupplied?"EVIDENCE_MISSING":selfReported?"CLAIMED_RESOLVED_UNVERIFIED":"OPEN_FOR_REVIEW",
   independentlyVerified:false,reviewAction:!evidenceSupplied?"Vraag oorspronkelijk bewijs op":selfReported?"Verifieer herstel onafhankelijk":"Onderzoek bevinding en bewijsreferentie"};
 });
 const missing=findings.filter(f=>!f.evidenceSupplied).length;
 const claimed=findings.filter(f=>f.closureStatus==="CLAIMED_RESOLVED_UNVERIFIED").length;
 return {schema:CLOSURE_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,
  decision:"HOLD",authorization:"DENY",handoverReference,recipientLabel,recipientIdentityVerified:false,
  dossierReference:dossier.caseReference,reviewReference:review.reviewReference,registerReference:register.caseReference,
  proposedDecision:register.proposal,proposedDecisionIsAuthorization:false,
  findings,summary:{total:findings.length,missingEvidence:missing,claimedResolved:claimed,
   openForIndependentReview:findings.length,sourceDossierBlockers:dossier.summary.openBlockers,
   sourceDossierEvidenceMissing:dossier.summary.evidenceMissing,independentlyVerified:0},
  gates:register.criteria.map(c=>({id:c.id,status:"PENDING_INDEPENDENT_REVIEW",attested:false})),
  reviewerActions:["Controleer fysieke telefoonacceptatie","Verifieer aangeleverde bewijsreferenties","Beslis over niet-opgeloste bevindingen","Voer onafhankelijke security- en privacyreview uit","Laat releasebesluit nemen door bevoegde functionaris"],
  independentReviewCompleted:false,handoverAccepted:false,releaseReady:false,releaseExecuted:false,
  notice:"DRAFT-overdracht van ongeverifieerde bewijsreferenties. Zelfs een leeg of opgelost bevindingenregister geeft geen GO."};
}
export function validateClosure(value,dossier,review,register){
 const keys=["schema","state","source","verified","decision","authorization","handoverReference","recipientLabel","recipientIdentityVerified",
 "dossierReference","reviewReference","registerReference","proposedDecision","proposedDecisionIsAuthorization","findings","summary","gates",
 "reviewerActions","independentReviewCompleted","handoverAccepted","releaseReady","releaseExecuted","notice"];
 if(!exact(value,keys)||!safe(value.handoverReference,240)||!safe(value.recipientLabel,160))return {ok:false,errors:["Overdrachtscontract ongeldig."]};
 try{const expected=makeClosure(dossier,review,register,{handoverReference:value.handoverReference,recipientLabel:value.recipientLabel});
 if(JSON.stringify(value)!==JSON.stringify(expected))throw Error("Bewijsafsluiting of autorisatieclaim gewijzigd.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
