// PALACO Release Evidence Review v1.2 RC: self-report triage only, NOT independent verification.
import {CHECKS} from "./atlas-acceptatie.mjs";
import {validateAcceptanceDossier,MAX_IMPORT_BYTES} from "./atlas-acceptatie-dossier.mjs";
export const REVIEW_SCHEMA="palaco.atlas.release-evidence-review.draft.v1";
export const MAX_DOSSIER_BYTES=65536;
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const safe=(s,max)=>typeof s==="string"&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
const exact=(obj,fields)=>plain(obj)&&Object.keys(obj).length===fields.length&&Object.keys(obj).every(k=>fields.includes(k));
export function readDossier(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>MAX_DOSSIER_BYTES)throw Error("Dossier ontbreekt of overschrijdt 64 KiB.");
 let value;try{value=JSON.parse(raw)}catch{throw Error("Ongeldige dossier-JSON.")};
 if(!validateAcceptanceDossier(value).ok)throw Error("Dossier niet conform DRAFT/HOLD/DENY-contract.");
 return value;
}
export function inspectDossier(dossier){
 if(!validateAcceptanceDossier(dossier).ok)throw Error("Ongeldig acceptatiedossier.");
 const rows=CHECKS.map(check=>{
  const current=dossier.current.observations.find(x=>x.id===check.id);
  const previous=dossier.baseline.observations.find(x=>x.id===check.id);
  const missing=current.status!=="PASS"||!current.note.trim();
  return {id:check.id,title:check.title,status:current.status,previous:previous.status,
   hasObservation:!!current.note.trim(),flag:current.status==="FAIL"?"FAIL":missing?"EVIDENCE_REQUIRED":"SELF_REPORTED"};
 });
 const pending=rows.filter(r=>r.flag!=="SELF_REPORTED").length;
 return {rows,pending,complete:pending===0,source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",decision:"HOLD",authorization:"DENY",verified:false};
}
export function makeReview(dossier,{reviewNote=""}={}){
 if(!safe(reviewNote,1000))throw Error("Reviewnotitie ongeldig.");
 const inspected=inspectDossier(dossier);
 return {schema:REVIEW_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",
 verified:false,decision:"HOLD",authorization:"DENY",evidenceReference:dossier.evidenceReference,
 entries:inspected.rows,openItems:inspected.pending,reviewNote,
 requirements:["INDEPENDENT_EVIDENCE","HUMAN_APPROVAL","SECURITY_REVIEW","REAL_DEVICE_ACCEPTANCE","RELEASE_GATE"],
 verdict:"REVIEW_REQUIRED",notice:"Lokale structuurcontrole is geen inhoudelijke verificatie, bevoegd besluit of productie-uitgifte."};
}
export function validateReview(review,dossier){
 if(!exact(review,["schema","state","source","verified","decision","authorization","evidenceReference","entries","openItems","reviewNote","requirements","verdict","notice"]))return {ok:false,errors:["Reviewstructuur ongeldig."]};
 if(review.schema!==REVIEW_SCHEMA||review.state!=="DRAFT"||review.source!=="LOCAL_SELF_REPORTED_NOT_VERIFIED"||
 review.verified!==false||review.decision!=="HOLD"||review.authorization!=="DENY"||review.verdict!=="REVIEW_REQUIRED"||!safe(review.reviewNote,1000))
 return {ok:false,errors:["Verboden verificatie- of autorisatieclaim."]};
 try{const canonical=makeReview(dossier,{reviewNote:review.reviewNote});
 if(JSON.stringify(review)!==JSON.stringify(canonical))return {ok:false,errors:["Review wijkt af van brongegevens."]};
 }catch{return {ok:false,errors:["Bronacceptatiedossier ongeldig."]}}
 return {ok:true,errors:[]};
}
