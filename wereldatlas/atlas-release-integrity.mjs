// PALACO Atlas Integrity & Recovery v1.5 RC.
// Local byte-integrity only; NO trusted signature, deployment, rollback or authorization.
export const MANIFEST_SCHEMA="palaco.atlas.release-integrity.draft.v1";
export const RECOVERY_SCHEMA="palaco.atlas.recovery-plan.draft.v1";
export const MAX_FILES=40,MAX_FILE_SIZE=2*1024*1024,MAX_MANIFEST_BYTES=32768;
const HEX=/^[0-9a-f]{64}$/;
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const keys=(x,k)=>plain(x)&&Object.keys(x).length===k.length&&Object.keys(x).every(v=>k.includes(v));
const name=s=>typeof s==="string"&&s.length>=1&&s.length<=128&&s!=="."&&s!==".."&&!/[\\/\u0000-\u001f\u007f]/.test(s)&&s.trim()===s;
export function validateManifest(manifest){
 const errors=[];
 if(!keys(manifest,["schema","state","verified","authorization","signature","files"]))return {ok:false,errors:["Ongeldige manifeststructuur."]};
 if(manifest.schema!==MANIFEST_SCHEMA||manifest.state!=="DRAFT"||manifest.verified!==false||manifest.authorization!=="DENY"||manifest.signature!==null)errors.push("Manifest mag geen bevoegdheid of handtekening claimen.");
 if(!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>MAX_FILES)return {ok:false,errors:["Manifest moet 1 tot 40 bestanden bevatten."]};
 const seen=new Set();
 for(const f of manifest.files){
  if(!keys(f,["name","size","sha256"])){errors.push("Ongeldige bestandsvelden.");continue}
  if(!name(f.name)||seen.has(f.name))errors.push("Ongeldige of dubbele bestandsnaam.");
  seen.add(f.name);
  if(!Number.isSafeInteger(f.size)||f.size<0||f.size>MAX_FILE_SIZE||typeof f.sha256!=="string"||!HEX.test(f.sha256))errors.push("Ongeldig bestandsformaat of hash.");
 }
 return {ok:errors.length===0,errors};
}
async function digest(bytes){
 if(!globalThis.crypto?.subtle)throw Error("SHA-256 vereist HTTPS of localhost.");
 const value=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(value),x=>x.toString(16).padStart(2,"0")).join("");
}
async function readFile(file){
 if(!file||!name(file.name)||!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_FILE_SIZE||typeof file.arrayBuffer!=="function")throw Error("Ongeldig bestand of bestand groter dan 2 MiB.");
 const bytes=await file.arrayBuffer();
 if(bytes.byteLength!==file.size||bytes.byteLength>MAX_FILE_SIZE)throw Error("Bestandsgrootte gewijzigd tijdens lezen.");
 return {name:file.name,size:file.size,sha256:await digest(bytes)};
}
export async function makeManifest(files){
 if(!Array.isArray(files)||files.length<1||files.length>MAX_FILES)throw Error("Selecteer 1 tot 32 bestanden.");
 const entries=[];
 for(const f of files)entries.push(await readFile(f));
 entries.sort((a,b)=>a.name.localeCompare(b.name,"en"));
 const manifest={schema:MANIFEST_SCHEMA,state:"DRAFT",verified:false,authorization:"DENY",signature:null,files:entries};
 const valid=validateManifest(manifest);if(!valid.ok)throw Error(valid.errors.join("; "));
 return manifest;
}
export function parseManifest(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>MAX_MANIFEST_BYTES)throw Error("Manifest groter dan 32 KiB of ongeldig.");
 let m;try{m=JSON.parse(raw)}catch{throw Error("Manifest bevat ongeldige JSON.")};
 const v=validateManifest(m);if(!v.ok)throw Error(v.errors.join("; "));
 return m;
}
export async function compareFiles(manifest,files){
 const valid=validateManifest(manifest);if(!valid.ok)throw Error(valid.errors.join("; "));
 if(!Array.isArray(files)||files.length>MAX_FILES)throw Error("Te veel bestanden.");
 const selected=new Map();
 for(const file of files){const entry=await readFile(file);if(selected.has(entry.name))throw Error("Dubbele bestandsnaam in selectie.");selected.set(entry.name,entry)}
 const rows=manifest.files.map(expected=>{
  const found=selected.get(expected.name);
  const status=!found?"MISSING":found.size!==expected.size||found.sha256!==expected.sha256?"MISMATCH":"MATCH";
  return {name:expected.name,status};
 });
 const expected=new Set(manifest.files.map(x=>x.name));
 for(const filename of selected.keys())if(!expected.has(filename))rows.push({name:filename,status:"UNEXPECTED"});
 const passed=rows.length===manifest.files.length&&rows.every(x=>x.status==="MATCH");
 return {rows,passed,verified:false,authenticated:false,authorization:"DENY",decision:"HOLD"};
}
export function makeRecoveryPlan(manifest,comparison){
 if(!validateManifest(manifest).ok)throw Error("Manifest ongeldig.");
 if(!keys(comparison,["rows","passed","verified","authenticated","authorization","decision"])||
 comparison.verified!==false||comparison.authenticated!==false||comparison.authorization!=="DENY"||comparison.decision!=="HOLD"||
 !Array.isArray(comparison.rows)||comparison.rows.length<manifest.files.length||
 !comparison.rows.every(r=>keys(r,["name","status"])&&name(r.name)&&["MISSING","MISMATCH","MATCH","UNEXPECTED"].includes(r.status)))throw Error("Vergelijking ongeldig.");
 if(comparison.passed!==false&&comparison.passed!==true)throw Error("Vergelijkingstatus ongeldig.");
 if(comparison.passed!== (comparison.rows.length===manifest.files.length&&comparison.rows.every(x=>x.status==="MATCH")))throw Error("Vergelijkingstatus inconsistent.");
 return {schema:RECOVERY_SCHEMA,state:"DRAFT",authorization:"DENY",decision:"HOLD",verified:false,
  matching:comparison.passed,problems:comparison.rows.filter(x=>x.status!=="MATCH").map(x=>({...x})),
  steps:["Bewaar kandidaat- en vorige commit onafhankelijk","Controleer de vertrouwde kopie van ontbrekende of afwijkende assets","Herhaal lokale SHA-256-verificatie en browser smokechecks","Leg herstelbesluit vast bij een bevoegde menselijke reviewer"],
  rollbackExecuted:false,notice:"Zelfgemaakte SHA-256-manifesten zijn geen onafhankelijke trusted release anchors."};
}
