// PALACO Atlas Release Package Audit v1.6 RC — local, explicit allowlist, never release approval.
import {validateManifest,compareFiles} from "./atlas-release-integrity.mjs";
export const AUDIT_SCHEMA="palaco.atlas.release-package-audit.draft.v1";
export const REQUIRED=Object.freeze([
"index.html","kaartkamer.html","dossierinspectie.html","wereldregister.html","atlas-archief.html",
"atlas-verificatie.html","atlas-bewijs.html","atlas-provenance.html","atlas-trust-gateway.html",
"atlas-integratie.html","atlas-acceptatie.html","atlas-release-review.html","atlas-readiness.html",
"atlas-release-control.html","atlas-release-integrity.html","atlas-package-audit.html",
"atlas-contract.mjs","wereldregister.mjs","atlas-archief.mjs","atlas-verificatie.mjs",
"atlas-bewijs.mjs","atlas-provenance.mjs","atlas-trust-gateway.mjs","atlas-integratie.mjs",
"atlas-acceptatie.mjs","atlas-acceptatie-dossier.mjs","atlas-release-review.mjs",
"atlas-readiness.mjs","atlas-release-control.mjs","atlas-release-integrity.mjs","atlas-package-audit.mjs","atlas-security-audit.html","atlas-security-audit.mjs","atlas-traceability.html","atlas-traceability.mjs","atlas-attestation.html","atlas-attestation.mjs","atlas-consolidatie.html","atlas-consolidatie.mjs","atlas-device-acceptance.html","atlas-device-acceptance.mjs","atlas-device-handover.html","atlas-device-handover.mjs","atlas-device-retest.html","atlas-device-retest.mjs","atlas-device-triage.html","atlas-device-triage.mjs","atlas-recovery-verification.html","atlas-recovery-verification.mjs","atlas-mobile-dossier.html","atlas-mobile-dossier.mjs","atlas-independent-review.html","atlas-independent-review.mjs","atlas-review-findings.html","atlas-review-findings.mjs","atlas-evidence-closure.html","atlas-evidence-closure.mjs","atlas-review-readiness.html","atlas-review-readiness.mjs"
]);
export const DEPENDENCIES=Object.freeze([
["atlas-integratie.html","atlas-integratie.mjs"],["atlas-integratie.mjs","wereldregister.mjs"],["atlas-integratie.mjs","atlas-archief.mjs"],
["atlas-acceptatie.html","atlas-acceptatie.mjs"],["atlas-release-review.html","atlas-release-review.mjs"],
["atlas-release-review.mjs","atlas-acceptatie-dossier.mjs"],["atlas-acceptatie-dossier.mjs","atlas-acceptatie.mjs"],
["atlas-readiness.html","atlas-readiness.mjs"],["atlas-readiness.mjs","atlas-release-review.mjs"],["atlas-readiness.mjs","atlas-integratie.mjs"],
["atlas-release-control.html","atlas-release-control.mjs"],["atlas-release-control.mjs","atlas-readiness.mjs"],
["atlas-release-integrity.html","atlas-release-integrity.mjs"],
["atlas-package-audit.html","atlas-package-audit.mjs"],["atlas-package-audit.mjs","atlas-release-integrity.mjs"],
["atlas-security-audit.html","atlas-security-audit.mjs"],["atlas-security-audit.mjs","atlas-package-audit.mjs"],
["atlas-traceability.html","atlas-traceability.mjs"],["atlas-traceability.mjs","atlas-integratie.mjs"],["atlas-traceability.mjs","atlas-readiness.mjs"],["atlas-traceability.mjs","atlas-package-audit.mjs"],
["atlas-attestation.html","atlas-attestation.mjs"],["atlas-attestation.mjs","atlas-traceability.mjs"],["atlas-attestation.mjs","atlas-readiness.mjs"],
["atlas-consolidatie.html","atlas-consolidatie.mjs"],["atlas-consolidatie.mjs","atlas-integratie.mjs"],["atlas-consolidatie.mjs","atlas-readiness.mjs"],["atlas-consolidatie.mjs","atlas-package-audit.mjs"],
["atlas-device-acceptance.html","atlas-device-acceptance.mjs"],
["atlas-device-handover.html","atlas-device-handover.mjs"],["atlas-device-handover.mjs","atlas-device-acceptance.mjs"],
["atlas-device-retest.html","atlas-device-retest.mjs"],["atlas-device-retest.mjs","atlas-device-acceptance.mjs"],
["atlas-device-triage.html","atlas-device-triage.mjs"],["atlas-device-triage.mjs","atlas-device-retest.mjs"],["atlas-device-triage.mjs","atlas-device-acceptance.mjs"],
["atlas-recovery-verification.html","atlas-recovery-verification.mjs"],["atlas-recovery-verification.mjs","atlas-device-acceptance.mjs"],["atlas-recovery-verification.mjs","atlas-device-retest.mjs"],["atlas-recovery-verification.mjs","atlas-device-triage.mjs"],
["atlas-mobile-dossier.html","atlas-mobile-dossier.mjs"],["atlas-mobile-dossier.mjs","atlas-device-acceptance.mjs"],["atlas-mobile-dossier.mjs","atlas-device-retest.mjs"],["atlas-mobile-dossier.mjs","atlas-device-triage.mjs"],["atlas-mobile-dossier.mjs","atlas-recovery-verification.mjs"],
["atlas-independent-review.html","atlas-independent-review.mjs"],["atlas-independent-review.mjs","atlas-mobile-dossier.mjs"],["atlas-independent-review.mjs","atlas-device-acceptance.mjs"],
["atlas-review-findings.html","atlas-review-findings.mjs"],["atlas-review-findings.mjs","atlas-independent-review.mjs"],
["atlas-evidence-closure.html","atlas-evidence-closure.mjs"],["atlas-evidence-closure.mjs","atlas-review-findings.mjs"],
["atlas-review-readiness.html","atlas-review-readiness.mjs"],["atlas-review-readiness.mjs","atlas-evidence-closure.mjs"]
]);
export const MAX_EVIDENCE=12;
const sane=s=>typeof s==="string"&&s.length<=240&&!/[\u0000-\u001f\u007f]/.test(s);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const equal=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
export function auditManifest(manifest,{evidence=[]}={}){
 const validation=validateManifest(manifest);
 if(!validation.ok)throw Error(validation.errors.join("; "));
 if(!Array.isArray(evidence)||evidence.length>MAX_EVIDENCE||evidence.some(x=>!sane(x))||new Set(evidence).size!==evidence.length)throw Error("Ongeldige bewijsreferenties.");
 const listed=new Set(manifest.files.map(x=>x.name)),required=new Set(REQUIRED);
 const missing=REQUIRED.filter(x=>!listed.has(x)),unexpected=manifest.files.map(x=>x.name).filter(x=>!required.has(x));
 const dependencyIssues=DEPENDENCIES.filter(([parent,child])=>listed.has(parent)&&!listed.has(child)).map(([parent,child])=>({parent,missing:child}));
 return {schema:AUDIT_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,authorization:"DENY",decision:"HOLD",
 expectedCount:REQUIRED.length,listedCount:manifest.files.length,missing,unexpected,dependencyIssues,
 evidenceReferences:[...evidence],hashesCompared:false,byteIntegrity:"NOT_CHECKED",
 packageComplete:missing.length===0&&unexpected.length===0&&dependencyIssues.length===0,
 releaseApproved:false,notice:"Lokale pakketstructuur en bronlabels zijn geen geauthenticeerde release of productieautorisatie."};
}
export async function auditFiles(manifest,files,{evidence=[]}={}){
 const result=auditManifest(manifest,{evidence}),hash=await compareFiles(manifest,files);
 return {...result,hashesCompared:true,byteIntegrity:hash.passed?"LOCAL_MATCH_UNAUTHENTICATED":"MISMATCH",
 fileStatuses:hash.rows,releaseApproved:false,authorization:"DENY",decision:"HOLD",verified:false};
}
export function validateAudit(audit,manifest){
 if(!plain(audit)||typeof audit.hashesCompared!=="boolean")return {ok:false,errors:["Ongeldig auditrapport."]};
 try{
  const base=auditManifest(manifest,{evidence:audit.evidenceReferences});
  if(audit.hashesCompared===false){if(JSON.stringify(audit)!==JSON.stringify(base))throw Error("Pakketaudit gewijzigd.")}
  else{
   const baseKeys=Object.keys(base);
   const expected=[...baseKeys,"fileStatuses"];
   if(!equal(audit,expected))throw Error("Onbekende auditvelden.");
   for(const k of baseKeys.filter(k=>!["hashesCompared","byteIntegrity"].includes(k))){
    if(JSON.stringify(audit[k])!==JSON.stringify(base[k]))throw Error("Pakketaudit gewijzigd.");
   }
   if(audit.hashesCompared!==true||!["LOCAL_MATCH_UNAUTHENTICATED","MISMATCH"].includes(audit.byteIntegrity)||
     !Array.isArray(audit.fileStatuses)||audit.fileStatuses.length<manifest.files.length||audit.fileStatuses.length>64||
     !audit.fileStatuses.every(x=>equal(x,["name","status"])&&typeof x.name==="string"&&["MATCH","MISMATCH","MISSING","UNEXPECTED"].includes(x.status))||
     (audit.byteIntegrity==="LOCAL_MATCH_UNAUTHENTICATED")!==(audit.fileStatuses.length===manifest.files.length&&audit.fileStatuses.every(x=>x.status==="MATCH")))throw Error("Integriteitsdetails ongeldig.");
  }
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
