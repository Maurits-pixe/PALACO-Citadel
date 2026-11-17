// PALACO Atlas Verificatiekamer v0.6 — review readiness, not truth verification.
import {archiveIndex,validateArchiveIndex} from "./atlas-archief.mjs";
import {SOURCES} from "./wereldregister.mjs";
export const REVIEW_SCHEMA="palaco.atlas.review.draft.v0.6";
const SOURCE_STATES=Object.freeze(["UNSUPPORTED","CONCEPT_ONLY","REVIEW_REQUIRED"]);
const safe=(v,max=800)=>typeof v==="string"&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const isRecord=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
export function reviewCandidates(){
 const idx=archiveIndex();
 if(!validateArchiveIndex(idx).ok)return [];
 return idx.items.map(row=>({
   dossierId:row.id,worldId:row.worldId,title:row.title,kind:row.kind,
   sourceIds:[...row.sourceIds],status:row.sourceIds.length?"CONCEPT_ONLY":"UNSUPPORTED",
   explanation:row.sourceIds.length?"Alleen interne conceptbronlabels; onafhankelijk bewijs ontbreekt.":"Geen onderbouwende bron gekoppeld.",
   independentVerification:false
 }));
}
export function checkEvidenceDraft(input){
 const errors=[];
 if(!isRecord(input))return {ok:false,errors:["Dossierbeoordeling moet een object zijn."]};
 const allowed=["schema","state","verified","dossierId","sourceId","reference","notes","decision"];
 if(Object.keys(input).some(key=>!allowed.includes(key)))errors.push("Onbekend beoordelingsveld.");
 if(input.schema!==REVIEW_SCHEMA||input.state!=="DRAFT"||input.verified!==false)errors.push("Alleen een niet-geverifieerde DRAFT-beoordeling is toegestaan.");
 const candidate=reviewCandidates().find(row=>row.dossierId===input.dossierId);
 if(!candidate)errors.push("Onbekend archiefdossier.");
 if(!safe(input.reference,500)||!safe(input.notes,800))errors.push("Bronreferentie of notitie ongeldig.");
 if(typeof input.reference==="string"&&input.reference.trim()!==input.reference)errors.push("Bronreferentie bevat omringende spaties.");
 if(input.decision!=="REVIEW_REQUIRED")errors.push("Beslissing moet REVIEW_REQUIRED blijven.");
 if(input.sourceId!==null&&(!SOURCES.some(s=>s.id===input.sourceId)||!candidate?.sourceIds.includes(input.sourceId)))errors.push("Bron hoort niet bij dit dossier.");
 if(input.sourceId===undefined)errors.push("Bron-ID moet expliciet zijn (null is toegestaan).");
 return {ok:errors.length===0,errors,assessment:errors.length===0?{status:input.sourceId?"CONCEPT_ONLY":"UNSUPPORTED",independentVerification:false,authorization:"DENY",nextStep:"Vereist onafhankelijke broncontrole en bevoegd besluit buiten deze preview."}:null};
}
export function makeReviewDraft({dossierId,sourceId=null,reference="",notes=""}={}){
 const draft={schema:REVIEW_SCHEMA,state:"DRAFT",verified:false,dossierId,sourceId,reference,notes,decision:"REVIEW_REQUIRED"};
 const status=checkEvidenceDraft(draft);
 if(!status.ok)throw new Error(status.errors.join(" "));
 return {...draft,assessment:status.assessment};
}
export {SOURCE_STATES};
