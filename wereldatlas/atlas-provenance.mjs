// PALACO Atlas Provenance Centrum v0.8 — local hash-chain, no trust anchor.
import {validateEvidenceManifest} from "./atlas-bewijs.mjs";
export const CHAIN_SCHEMA="palaco.atlas.provenance.draft.v0.8";
export const GENESIS="0".repeat(64);
const hex=/^[a-f0-9]{64}$/;
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const safe=(v,max)=>typeof v==="string"&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
async function digest(s){
 if(!globalThis.crypto?.subtle)throw new Error("SHA-256 vereist HTTPS of localhost.");
 const data=new TextEncoder().encode(s);
 const hash=await globalThis.crypto.subtle.digest("SHA-256",data);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}
// Fixed field order, no implicit dates or untrusted JSON canonicalization.
export function entryPayload(entry){
 return JSON.stringify(["PALACO-ATLAS-CHAIN-V0.8",entry.sequence,entry.previousHash,entry.dossierId,entry.evidenceSha256,entry.note,"DRAFT","DENY"]);
}
export function emptyChain(){return {schema:CHAIN_SCHEMA,state:"DRAFT",verified:false,authorization:"DENY",entries:[]};}
function validateFrame(chain){
 const errors=[];
 if(!exact(chain,["schema","state","verified","authorization","entries"]))errors.push("Onbekend ketenveld of ontbrekende gegevens.");
 if(chain?.schema!==CHAIN_SCHEMA||chain?.state!=="DRAFT"||chain?.verified!==false||chain?.authorization!=="DENY")errors.push("Geen geldige DRAFT/DENY keten.");
 if(!Array.isArray(chain?.entries)||chain.entries.length>100)errors.push("Maximaal 100 ketenregels.");
 if(errors.length)return errors;
 for(let i=0;i<chain.entries.length;i++){
  const e=chain.entries[i];
  if(!exact(e,["sequence","previousHash","dossierId","evidenceSha256","note","state","authorization","hash"]))errors.push("Regel heeft onjuiste velden: "+(i+1));
  else if(e.sequence!==i+1||!hex.test(e.previousHash)||!hex.test(e.evidenceSha256)||!hex.test(e.hash)||!safe(e.note,400)||e.state!=="DRAFT"||e.authorization!=="DENY"||typeof e.dossierId!=="string")errors.push("Onjuiste regel: "+(i+1));
 }
 return errors;
}
export async function verifyChain(chain){
 const errors=validateFrame(chain);
 if(errors.length)return {ok:false,errors,authorization:"DENY",authentic:false};
 let prev=GENESIS;
 for(const e of chain.entries){
  if(e.previousHash!==prev)errors.push("Verbroken vorige-hash bij regel "+e.sequence);
  const calculated=await digest(entryPayload(e));
  if(calculated!==e.hash)errors.push("Hash mismatch bij regel "+e.sequence);
  prev=e.hash;
 }
 return {ok:errors.length===0,errors,head:prev,authorization:"DENY",authentic:false};
}
export async function appendEvidence(chain,manifest,note=""){
 const status=await verifyChain(chain);
 if(!status.ok)throw new Error("Bestaande herkomstketen ongeldig: "+status.errors.join("; "));
 if(chain.entries.length>=100)throw new Error("Ketenlimiet bereikt.");
 if(!validateEvidenceManifest(manifest).ok)throw new Error("Bewijsmanifest geweigerd.");
 if(!safe(note,400))throw new Error("Ongeldige notitie.");
 const entry={sequence:chain.entries.length+1,previousHash:status.head,dossierId:manifest.dossierId,evidenceSha256:manifest.sha256,note,state:"DRAFT",authorization:"DENY",hash:""};
 entry.hash=await digest(entryPayload(entry));
 const next={...chain,entries:[...chain.entries,entry]};
 const checked=await verifyChain(next);
 if(!checked.ok)throw new Error("Nieuwe ketenregel niet controleerbaar.");
 return next;
}
export async function parseChainJSON(raw){
 if(typeof raw!=="string"||raw.length>262144)throw new Error("Ketendossier ongeldig of groter dan 256 KiB.");
 const obj=JSON.parse(raw);
 const result=await verifyChain(obj);
 if(!result.ok)throw new Error(result.errors.join("; "));
 return obj;
}
