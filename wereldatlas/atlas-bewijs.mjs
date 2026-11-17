// PALACO Atlas Bewijskamer v0.7: local integrity only; no authenticity or authorization.
import {archiveIndex,validateArchiveIndex} from "./atlas-archief.mjs";
export const EVIDENCE_SCHEMA="palaco.atlas.evidence.draft.v0.7";
export const MAX_BYTES=2*1024*1024;
const HEX=/^[0-9a-f]{64}$/;
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const safe=(s,max)=>typeof s==="string"&&s.length>0&&s.length<=max&&s.trim()===s&&!/[\u0000-\u001f\u007f]/.test(s);
const keys=(obj,permitted)=>Object.keys(obj).every(k=>permitted.includes(k));
export function validateEvidenceManifest(input){
 const errors=[];
 if(!isObject(input))return {ok:false,errors:["Manifest moet een object zijn."]};
 if(!keys(input,["schema","state","verified","dossierId","fileName","byteLength","sha256","sourceNote","assessment","authorization"]))errors.push("Onbekend manifestveld.");
 if(input.schema!==EVIDENCE_SCHEMA||input.state!=="DRAFT"||input.verified!==false)errors.push("Alleen een niet-geverifieerde DRAFT is toegestaan.");
 const idx=archiveIndex();
 if(!validateArchiveIndex(idx).ok||!idx.items.some(x=>x.id===input.dossierId))errors.push("Dossier ontbreekt of bronregister ongeldig.");
 if(!safe(input.fileName,180)||input.fileName.includes("/")||input.fileName.includes("\\")||input.fileName==="."||input.fileName==="..")errors.push("Ongeldige bestandsnaam.");
 if(!Number.isSafeInteger(input.byteLength)||input.byteLength<0||input.byteLength>MAX_BYTES)errors.push("Ongeldige bestandsgrootte.");
 if(typeof input.sha256!=="string"||!HEX.test(input.sha256))errors.push("Ongeldige SHA-256-hexwaarde.");
 if(typeof input.sourceNote!=="string"||input.sourceNote.length>800||/[\u0000-\u001f\u007f]/.test(input.sourceNote))errors.push("Bronnotitie ongeldig.");
 if(input.assessment!=="INTEGRITY_ONLY"||input.authorization!=="DENY")errors.push("Beoordeling en autorisatie moeten INTEGRITY_ONLY / DENY blijven.");
 return {ok:errors.length===0,errors};
}
export function buildEvidenceManifest({dossierId,fileName,byteLength,sha256,sourceNote=""}){
 const manifest={schema:EVIDENCE_SCHEMA,state:"DRAFT",verified:false,dossierId,fileName,byteLength,sha256,sourceNote,assessment:"INTEGRITY_ONLY",authorization:"DENY"};
 const check=validateEvidenceManifest(manifest);
 if(!check.ok)throw new Error(check.errors.join(" "));
 return manifest;
}
export function compareIntegrity(manifest,{byteLength,sha256}){
 if(!validateEvidenceManifest(manifest).ok)return {match:false,status:"INVALID_MANIFEST",authorization:"DENY"};
 if(!Number.isSafeInteger(byteLength)||typeof sha256!=="string"||!HEX.test(sha256))return {match:false,status:"INVALID_INPUT",authorization:"DENY"};
 const match=manifest.byteLength===byteLength&&manifest.sha256===sha256;
 return {match,status:match?"BYTES_MATCH":"BYTES_DIFFER",authorization:"DENY",verified:false};
}
export async function sha256Hex(blob){
 if(!(blob instanceof Blob)||blob.size>MAX_BYTES)throw new Error("Bestand te groot of ongeldig (maximum 2 MiB).");
 if(!globalThis.crypto?.subtle)throw new Error("SHA-256 vereist een beveiligde browsercontext (HTTPS of localhost).");
 const buffer=await blob.arrayBuffer();
 const result=await globalThis.crypto.subtle.digest("SHA-256",buffer);
 return [...new Uint8Array(result)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
