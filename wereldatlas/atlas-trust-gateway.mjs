// Atlas Trust & Lineage Gateway v0.9 — local checkpoint comparison, no trusted signatures.
import {verifyChain} from "./atlas-provenance.mjs";
export const CHECKPOINT_SCHEMA="palaco.atlas.checkpoint.draft.v0.9";
export const GATEWAY_SCHEMA="palaco.atlas.gateway.report.v0.9";
const HEX=/^[a-f0-9]{64}$/;
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,fields)=>obj(x)&&Object.keys(x).length===fields.length&&Object.keys(x).every(k=>fields.includes(k));
const label=x=>typeof x==="string"&&x.length>=1&&x.length<=160&&x.trim()===x&&!/[\u0000-\u001f\u007f]/.test(x);
export function buildCheckpoint({head,sequence,sourceLabel}){
 const item={schema:CHECKPOINT_SCHEMA,state:"DRAFT",verified:false,sourceLabel,sequence,head,signature:null,authorization:"DENY"};
 const checked=validateCheckpoint(item);if(!checked.ok)throw new Error(checked.errors.join("; "));return item;
}
export function validateCheckpoint(checkpoint){
 const errors=[];
 if(!exact(checkpoint,["schema","state","verified","sourceLabel","sequence","head","signature","authorization"]))return {ok:false,errors:["Ongeldige of ontbrekende checkpointvelden."]};
 if(checkpoint.schema!==CHECKPOINT_SCHEMA||checkpoint.state!=="DRAFT"||checkpoint.verified!==false||checkpoint.authorization!=="DENY"||checkpoint.signature!==null)errors.push("Checkpoint moet ongeldig als trust anchor blijven: DRAFT/unsigned/DENY.");
 if(!label(checkpoint.sourceLabel))errors.push("Bronlabel ontbreekt of is ongeldig.");
 if(!Number.isSafeInteger(checkpoint.sequence)||checkpoint.sequence<0||checkpoint.sequence>100)errors.push("Ongeldig volgnummer.");
 if(typeof checkpoint.head!=="string"||!HEX.test(checkpoint.head))errors.push("SHA-256 head is ongeldig.");
 return {ok:errors.length===0,errors};
}
export async function compareCheckpoint(chain,checkpoint){
 const chainCheck=await verifyChain(chain);
 const cpCheck=validateCheckpoint(checkpoint);
 if(!chainCheck.ok||!cpCheck.ok)return {status:"INVALID",matches:false,verified:false,authorization:"DENY",authenticated:false,errors:[...chainCheck.errors,...cpCheck.errors]};
 const matches=chain.entries.length===checkpoint.sequence&&chainCheck.head===checkpoint.head;
 return {schema:GATEWAY_SCHEMA,status:matches?"UNAUTHENTICATED_MATCH":"MISMATCH",matches,verified:false,authorization:"DENY",authenticated:false,errors:matches?[]:["Checkpoint komt niet overeen met de lokale ketenkop."]};
}
export async function createCheckpointFromChain(chain,sourceLabel){
 const checked=await verifyChain(chain);if(!checked.ok)throw new Error("Ketenintegriteit ongeldig.");
 return buildCheckpoint({head:checked.head,sequence:chain.entries.length,sourceLabel});
}
export async function parseCheckpoint(raw){
 if(typeof raw!=="string"||raw.length>16384)throw new Error("Checkpointbestand te groot.");
 const parsed=JSON.parse(raw);const checked=validateCheckpoint(parsed);
 if(!checked.ok)throw new Error(checked.errors.join("; "));
 return parsed;
}
