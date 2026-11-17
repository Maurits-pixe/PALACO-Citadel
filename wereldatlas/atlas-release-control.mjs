// PALACO Atlas Release Control Center v1.4 RC — preparation only; never deploy or approve.
import {GATES,READINESS_SCHEMA} from "./atlas-readiness.mjs";
export const CONTROL_SCHEMA="palaco.atlas.release-control.draft.v1";
export const MAX_IMPORT_BYTES=65536;
export const ROLLBACK=Object.freeze([
 {id:"PIN_PREVIOUS_BUILD",title:"Leg een vooraf gevalideerde herstelversie vast."},
 {id:"VERIFY_ASSETS",title:"Controleer statische Atlas-assets en offline-cache op herstelversie."},
 {id:"RECORD_ROUTE_TEST",title:"Leg de herstelde routes en kritieke smokechecks vast."},
 {id:"RECORD_OWNER_REVIEW",title:"Leg een bevoegd menselijk herstelbesluit afzonderlijk vast."}
]);
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const safe=(s,n)=>typeof s==="string"&&s.length<=n&&!/[\u0000-\u001f\u007f]/.test(s);
const sha=s=>typeof s==="string"&&/^[a-f0-9]{40}$/.test(s);
export function parseReadiness(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>MAX_IMPORT_BYTES)throw Error("Readiness-bestand ongeldig of groter dan 64 KiB.");
 let x;try{x=JSON.parse(raw)}catch{throw Error("Readiness-JSON ongeldig.");}
 const fields=["schema","state","decision","authorization","verified","source","internalConsistent","reviewMatched","modules","external","worldCount","observation","gates","errors","productionReady","reference","notice"];
 if(!exact(x,fields))throw Error("Readiness-velden ontbreken of zijn onbekend.");
 if(x.schema!==READINESS_SCHEMA||x.state!=="DRAFT"||x.decision!=="HOLD"||x.authorization!=="DENY"||x.verified!==false||
 x.productionReady!==false||x.source!=="LOCAL_SELF_REPORTED_NOT_VERIFIED"||x.internalConsistent!==true||x.reviewMatched!==true||
 !Array.isArray(x.errors)||x.errors.length!==0)throw Error("Ongeautoriseerde of incomplete readinessstatus.");
 if(!Array.isArray(x.modules)||x.modules.length!==9||!Array.isArray(x.external)||x.external.length!==4||
 !Array.isArray(x.gates)||x.gates.length!==GATES.length||!exact(x.observation,["present","verified","pending","checked"])||
 x.observation.verified!==false||x.observation.present!==true||x.observation.checked!==true||
 !Number.isSafeInteger(x.observation.pending)||x.observation.pending<0||x.observation.pending>8||
 !safe(x.reference,300)||typeof x.notice!=="string")throw Error("Readiness-inventaris ongeldig.");
 for(let i=0;i<GATES.length;i++){const a=x.gates[i],b=GATES[i];if(JSON.stringify(a)!==JSON.stringify(b))throw Error("Releasepoort gewijzigd of vervalst.");}
 if(x.external.some(e=>!exact(e,["id","status","write"])||e.status!=="NOT_CONNECTED"||e.write!==false))throw Error("Externe koppelingclaim niet toegestaan.");
 // Imported snapshots are evidence labels, not cryptographically authenticated GitHub or release facts.
 return x;
}
export function makeControlRecord(readiness,{candidateSha="",ciRun="",previousSha="",operatorNote=""}={}){
 if(readiness!==null)parseReadiness(JSON.stringify(readiness));
 if(candidateSha!==""&&!sha(candidateSha))throw Error("Kandidaat-SHA moet 40 kleine hextekens hebben.");
 if(previousSha!==""&&!sha(previousSha))throw Error("Herstel-SHA moet 40 kleine hextekens hebben.");
 if(ciRun!==""&&!/^[1-9][0-9]{0,15}$/.test(ciRun))throw Error("Workflow-runreferentie ongeldig.");
 if(!safe(operatorNote,1000))throw Error("Notitie ongeldig.");
 const blockers=GATES.map(g=>({id:g.id,status:g.status,independentEvidence:false}));
 const rollback=ROLLBACK.map(step=>({id:step.id,status:"OPEN"}));
 return {schema:CONTROL_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",candidateSha,ciRun,previousSha,operatorNote,
  snapshotProvided:readiness!==null,readinessPending:readiness?.observation?.pending??null,
  blockers,rollback,decision:"HOLD",authorization:"DENY",verified:false,deployAllowed:false,
  note:"Versie- en workflowreferenties zijn handmatig ingevuld en niet onafhankelijk geauthenticeerd. Geen rollback uitgevoerd."};
}
export function validateControlRecord(record,readiness){
 const fields=["schema","state","source","candidateSha","ciRun","previousSha","operatorNote","snapshotProvided","readinessPending","blockers","rollback","decision","authorization","verified","deployAllowed","note"];
 if(!exact(record,fields))return {ok:false,errors:["Controlrecord heeft ontbrekende of onbekende velden."]};
 try{
  const expected=makeControlRecord(readiness,{candidateSha:record.candidateSha,ciRun:record.ciRun,previousSha:record.previousSha,operatorNote:record.operatorNote});
  if(JSON.stringify(record)!==JSON.stringify(expected))throw Error("Releasecontrole gewijzigd of autorisatie vervalst.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
