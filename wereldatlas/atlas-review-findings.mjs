// PALACO Atlas v2.7 RC — local review findings and decision register.
// Human-readable proposals, not independent attestation, signing or release authority.
import {validateDossierEnvelope,validatePreparedReview,CRITERIA} from "./atlas-independent-review.mjs";
export const FINDINGS_SCHEMA="palaco.atlas.review-findings.draft.v2.7";
export const MAX_FINDINGS=50;
export const MAX_JSON_BYTES=131072;
export const SEVERITIES=Object.freeze(["LOW","MEDIUM","HIGH","CRITICAL"]);
export const FINDING_STATUSES=Object.freeze(["OPEN","EVIDENCE_REQUESTED","RESOLUTION_SELF_REPORTED"]);
export const PROPOSALS=Object.freeze(["HOLD","REQUEST_INDEPENDENT_REVIEW","REJECT_CANDIDATE"]);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const safe=(x,max)=>typeof x==="string"&&x.length<=max&&!/[\u0000-\u001f\u007f]/.test(x);
export function parseLocalRecord(raw,max=MAX_JSON_BYTES){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>max)throw Error("Lokaal bestand ontbreekt of overschrijdt de invoerlimiet.");
 try{return JSON.parse(raw)}catch{throw Error("Bestand bevat ongeldige JSON.")}
}
export function validateFinding(finding){
 return exact(finding,["id","criterionId","severity","status","note","evidenceReference"])&&
 safe(finding.id,60)&&finding.id.length>0&&
 CRITERIA.some(c=>c.id===finding.criterionId)&&
 SEVERITIES.includes(finding.severity)&&FINDING_STATUSES.includes(finding.status)&&
 safe(finding.note,1000)&&finding.note.length>0&&safe(finding.evidenceReference,240);
}
export function makeRegister(dossier,preparedReview,{caseReference="",reviewerLabel="",proposal="HOLD",findings=[]}={}){
 if(!validateDossierEnvelope(dossier).ok)throw Error("Geconsolideerd dossier is ongeldig.");
 if(!validatePreparedReview(preparedReview,dossier).ok)throw Error("Reviewvoorbereiding hoort niet bij dit dossier.");
 if(!safe(caseReference,240)||!safe(reviewerLabel,160)||!PROPOSALS.includes(proposal))throw Error("Registermetadata of voorgesteld besluit ongeldig.");
 if(!Array.isArray(findings)||findings.length>MAX_FINDINGS)throw Error("Te veel bevindingen.");
 const ids=new Set();
 for(const f of findings){
  if(!validateFinding(f)||ids.has(f.id))throw Error("Bevinding ongeldig of dubbele ID.");
  ids.add(f.id);
 }
 const copied=findings.map(f=>({...f}));
 const unresolved=copied.filter(f=>f.status!=="RESOLUTION_SELF_REPORTED").length;
 const needsEvidence=copied.filter(f=>f.status==="EVIDENCE_REQUESTED").length;
 const critical=copied.filter(f=>f.severity==="CRITICAL").length;
 return {schema:FINDINGS_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,decision:"HOLD",authorization:"DENY",
  caseReference,reviewerLabel,reviewerIdentityVerified:false,
  dossierReference:dossier.caseReference,reviewReference:preparedReview.reviewReference,
  proposal,proposalIsAuthorization:false,
  criteria:CRITERIA.map(c=>({id:c.id,status:"PENDING_INDEPENDENT_REVIEW",independentlyVerified:false})),
  findings:copied,summary:{total:copied.length,unresolved,needsEvidence,critical,
   dossierOpenBlockers:dossier.summary.openBlockers,dossierEvidenceMissing:dossier.summary.evidenceMissing,
   independentlyVerified:0},
  independentReviewCompleted:false,releaseReady:false,releaseExecuted:false,
  notice:"Alle bevindingen en voorgestelde besluiten zijn lokale zelfrapportage. Zelfs RESOLUTION_SELF_REPORTED geeft geen vrijgave."};
}
export function addFinding(register,dossier,preparedReview,finding){
 if(!validateRegister(register,dossier,preparedReview).ok)throw Error("Bestaand register ongeldig.");
 return makeRegister(dossier,preparedReview,{caseReference:register.caseReference,reviewerLabel:register.reviewerLabel,
  proposal:register.proposal,findings:[...register.findings,finding]});
}
export function validateRegister(record,dossier,preparedReview){
 const keys=["schema","state","source","verified","decision","authorization","caseReference","reviewerLabel","reviewerIdentityVerified",
 "dossierReference","reviewReference","proposal","proposalIsAuthorization","criteria","findings","summary",
 "independentReviewCompleted","releaseReady","releaseExecuted","notice"];
 if(!exact(record,keys)||!safe(record.caseReference,240)||!safe(record.reviewerLabel,160))return {ok:false,errors:["Onjuist registercontract."]};
 try{
  const expected=makeRegister(dossier,preparedReview,{caseReference:record.caseReference,reviewerLabel:record.reviewerLabel,
   proposal:record.proposal,findings:record.findings});
  if(JSON.stringify(record)!==JSON.stringify(expected))throw Error("Register of autorisatieclaim vervalst.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
