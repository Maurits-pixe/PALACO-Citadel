// PALACO Atlas Attestation Preparation v1.9 RC — no signatures, authorities, or trust grants.
import {validateTrace, summarizeTrace} from "./atlas-traceability.mjs";
import {GATES} from "./atlas-readiness.mjs";
export const ATTESTATION_SCHEMA="palaco.atlas.attestation-preparation.draft.v1";
export const MAX_IMPORT_BYTES=65536;
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,ks)=>plain(x)&&Object.keys(x).length===ks.length&&Object.keys(x).every(k=>ks.includes(k));
const safe=(s,n)=>typeof s==="string"&&s.length<=n&&!/[\u0000-\u001f\u007f]/.test(s);
export function prepareAttestation(trace,{reviewerReference="",reviewNote=""}={}){
 const validation=validateTrace(trace);
 if(!validation.ok)throw Error("Traceerbaarheidsdossier ongeldig.");
 if(!safe(reviewerReference,160)||!safe(reviewNote,1000))throw Error("Reviewvelden ongeldig.");
 const summary=summarizeTrace(trace);
 const requirements=GATES.map(g=>({id:g.id,status:"EVIDENCE_PENDING",authorityVerified:false,signatureVerified:false}));
 const evidence=trace.evidence.map(e=>({id:e.id,moduleId:e.moduleId,gateId:e.gateId,asset:e.asset,
  reference:e.reference,result:e.result,origin:"SELF_REPORTED",independentlyVerified:false}));
 return {schema:ATTESTATION_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",authorization:"DENY",decision:"HOLD",
  verified:false,attested:false,signature:null,reviewerReference,reviewNote,
  version:{commit:trace.version.commit,runId:trace.version.runId,independentlyVerified:false},
  coverage:{modulesReferenced:summary.referencedModules,totalModules:summary.totalModules,gatesReferenced:summary.referencedGates,totalGates:summary.totalGates},
  evidence,requirements,openRequirements:requirements.length,releaseReady:false,
  disclaimer:"Dit document is uitsluitend overdracht voor onafhankelijke verificatie; geen identiteit, handtekening, goedkeuring of uitgifte."};
}
export function validatePreparation(preparation,trace){
 const fields=["schema","state","source","authorization","decision","verified","attested","signature","reviewerReference","reviewNote","version","coverage","evidence","requirements","openRequirements","releaseReady","disclaimer"];
 if(!exact(preparation,fields)||!safe(preparation.reviewerReference,160)||!safe(preparation.reviewNote,1000))return {ok:false,errors:["Voorbereidingsschema ongeldig."]};
 try{
  const expected=prepareAttestation(trace,{reviewerReference:preparation.reviewerReference,reviewNote:preparation.reviewNote});
  if(JSON.stringify(preparation)!==JSON.stringify(expected))throw Error("Attestatievoorbereiding gewijzigd of autorisatieclaim vervalst.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
export function parsePreparation(raw,trace){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>MAX_IMPORT_BYTES)throw Error("Dossier groter dan 64 KiB of ongeldig.");
 let value;try{value=JSON.parse(raw)}catch{throw Error("Ongeldige JSON.")};
 const v=validatePreparation(value,trace);if(!v.ok)throw Error(v.errors.join("; "));
 return value;
}
