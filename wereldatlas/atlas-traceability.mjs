// PALACO Atlas Release Evidence & Traceability v1.8 RC.
// Local references only, no trusted attestation or release authority.
import {MODULES} from "./atlas-integratie.mjs";
import {GATES} from "./atlas-readiness.mjs";
import {REQUIRED} from "./atlas-package-audit.mjs";
export const TRACE_SCHEMA="palaco.atlas.release-traceability.draft.v1";
export const MAX_EVIDENCE=64;
export const MAX_IMPORT_BYTES=65536;
const valid=(s,n)=>typeof s==="string"&&s.length>0&&s.length<=n&&!/[\u0000-\u001f\u007f]/.test(s);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,fields)=>plain(x)&&Object.keys(x).length===fields.length&&Object.keys(x).every(k=>fields.includes(k));
const sha=x=>typeof x==="string"&&/^[a-f0-9]{40}$/.test(x);
export function newTrace({commit="",runId=""}={}){
 if(commit!==""&&!sha(commit))throw Error("Commit moet 40 lowercase hextekens bevatten.");
 if(runId!==""&&!/^[1-9][0-9]{0,15}$/.test(runId))throw Error("CI-run-ID ongeldig.");
 return {schema:TRACE_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,decision:"HOLD",authorization:"DENY",
 version:{commit,runId,independentlyVerified:false},modules:MODULES.map(m=>({id:m.id,href:m.href,status:"DRAFT"})),
 gates:GATES.map(g=>({id:g.id,status:g.status,attested:false})),evidence:[],notice:"Bewijsreferenties en handmatige CI-gegevens zijn niet onafhankelijk geattesteerd; release blijft HOLD/DENY."};
}
export function validateTrace(value){
 const errors=[];
 if(!exact(value,["schema","state","source","verified","decision","authorization","version","modules","gates","evidence","notice"]))return {ok:false,errors:["Traceerbaarheidsschema ongeldig."]};
 if(value.schema!==TRACE_SCHEMA||value.state!=="DRAFT"||value.source!=="LOCAL_SELF_REPORTED_NOT_VERIFIED"||
 value.verified!==false||value.decision!=="HOLD"||value.authorization!=="DENY"||
 value.notice!=="Bewijsreferenties en handmatige CI-gegevens zijn niet onafhankelijk geattesteerd; release blijft HOLD/DENY.")errors.push("Verboden status- of bronclaim.");
 if(!exact(value.version,["commit","runId","independentlyVerified"])||
 value.version.independentlyVerified!==false||(value.version.commit!==""&&!sha(value.version.commit))||
 (value.version.runId!==""&&!/^[1-9][0-9]{0,15}$/.test(value.version.runId)))errors.push("Versie ongeldig.");
 if(!Array.isArray(value.modules)||value.modules.length!==MODULES.length||MODULES.some((m,i)=>!exact(value.modules[i],["id","href","status"])||value.modules[i].id!==m.id||value.modules[i].href!==m.href||value.modules[i].status!=="DRAFT"))errors.push("Modulelijst gemanipuleerd.");
 if(!Array.isArray(value.gates)||value.gates.length!==GATES.length||GATES.some((g,i)=>!exact(value.gates[i],["id","status","attested"])||value.gates[i].id!==g.id||value.gates[i].status!==g.status||value.gates[i].attested!==false))errors.push("Releasepoort gewijzigd.");
 if(!Array.isArray(value.evidence)||value.evidence.length>MAX_EVIDENCE)return {ok:false,errors:["Te veel bewijsreferenties."]};
 const ids=new Set();
 for(const e of value.evidence){
  if(!exact(e,["id","moduleId","gateId","asset","reference","result","verified"])||
   !valid(e.id,60)||ids.has(e.id)||!MODULES.some(m=>m.id===e.moduleId)||!GATES.some(g=>g.id===e.gateId)||
   !REQUIRED.includes(e.asset)||!valid(e.reference,240)||!["SELF_REPORTED_PASS","SELF_REPORTED_FAIL","NOT_TESTED"].includes(e.result)||e.verified!==false)
   errors.push("Ongeldige of dubbele bewijsreferentie.");
  if(e&&typeof e.id==="string")ids.add(e.id);
 }
 return {ok:errors.length===0,errors};
}
export function appendTrace(trace,entry){
 if(!validateTrace(trace).ok)throw Error("Bestaand dossier ongeldig.");
 const candidate={...trace,evidence:[...trace.evidence,{...entry,verified:false}]};
 const check=validateTrace(candidate);if(!check.ok)throw Error(check.errors.join("; "));
 return candidate;
}
export function summarizeTrace(trace){
 const validation=validateTrace(trace);if(!validation.ok)return {valid:false,decision:"HOLD",authorization:"DENY",errors:validation.errors};
 const moduleIds=new Set(trace.evidence.map(x=>x.moduleId)),gateIds=new Set(trace.evidence.map(x=>x.gateId));
 return {valid:true,referencedModules:moduleIds.size,totalModules:MODULES.length,referencedGates:gateIds.size,totalGates:GATES.length,
 referencedAssets:new Set(trace.evidence.map(x=>x.asset)).size,evidenceCount:trace.evidence.length,allSelfReported:trace.evidence.every(x=>!x.verified),
 decision:"HOLD",authorization:"DENY",releaseReady:false};
}
export function parseTrace(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>MAX_IMPORT_BYTES)throw Error("Dossier groter dan 64 KiB of onjuist.");
 let value;try{value=JSON.parse(raw)}catch{throw Error("Dossier is geen geldige JSON.")};
 const checked=validateTrace(value);if(!checked.ok)throw Error(checked.errors.join("; "));
 return value;
}
