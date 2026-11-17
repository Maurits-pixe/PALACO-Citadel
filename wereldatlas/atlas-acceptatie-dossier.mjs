// PALACO Atlas acceptatiedossier v1.1 RC — explicit, temporary self-reported comparison.
// No historical trust, external evidence authentication, upload or issuance.
import {CHECKS,REPORT_SCHEMA,newReport,validateReport,summarize} from "./atlas-acceptatie.mjs";
export const DOSSIER_SCHEMA="palaco.atlas.acceptance.comparison.draft.v1";
export const MAX_IMPORT_BYTES=32768;
const validText=(text,max)=>typeof text==="string"&&text.length<=max&&!/[\u0000-\u001f\u007f]/.test(text);
export function parseImportedReport(text){
 if(typeof text!=="string"||new TextEncoder().encode(text).length>MAX_IMPORT_BYTES)throw new Error("Import is geen JSON-tekst of overschrijdt 32 KiB.");
 let input;try{input=JSON.parse(text)}catch{throw new Error("Ongeldige JSON-inhoud.");}
 if(!validateReport(input).ok)throw new Error("Rapportschema of HOLD/DENY-grens ongeldig.");
 // Canonicalize to a new, independent value; never trust fields or retain object references.
 return {schema:REPORT_SCHEMA,release:"1.0-RC",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",decision:"HOLD",authorization:"DENY",verified:false,
  observations:CHECKS.map(c=>{const x=input.observations.find(v=>v.id===c.id);return {id:c.id,status:x.status,note:x.note};})};
}
export function compareReports(baseline,current){
 if(!validateReport(baseline).ok||!validateReport(current).ok)throw new Error("Beide rapporten moeten geldige zelfrapportages zijn.");
 const differences=CHECKS.map(c=>{
  const before=baseline.observations.find(v=>v.id===c.id);
  const after=current.observations.find(v=>v.id===c.id);
  return {id:c.id,previous:before.status,current:after.status,changed:before.status!==after.status||before.note!==after.note,notesChanged:before.note!==after.note};
 });
 return {differences,changedCount:differences.filter(x=>x.changed).length,baselineSummary:summarize(baseline),currentSummary:summarize(current),decision:"HOLD",authorization:"DENY",verified:false};
}
export function makeAcceptanceDossier(baseline,current,{evidenceReference=""}={}){
 if(!validText(evidenceReference,300))throw new Error("Bewijsreferentie ongeldig.");
 const comparison=compareReports(baseline,current);
 return {schema:DOSSIER_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,decision:"HOLD",authorization:"DENY",
 evidenceReference,baseline:parseImportedReport(JSON.stringify(baseline)),current:parseImportedReport(JSON.stringify(current)),
 comparison:{changedCount:comparison.changedCount,differences:comparison.differences},
 notice:"Een bronlabel en lokale zelfrapportage zijn geen onafhankelijke verificatie of productieautorisatie."};
}
export function validateAcceptanceDossier(dossier){
 if(!dossier||typeof dossier!=="object"||Array.isArray(dossier))return {ok:false,errors:["Dossier moet object zijn."]};
 const keys=["schema","state","source","verified","decision","authorization","evidenceReference","baseline","current","comparison","notice"];
 if(Object.keys(dossier).length!==keys.length||Object.keys(dossier).some(k=>!keys.includes(k)))return {ok:false,errors:["Onbekende dossiergegevens."]};
 if(dossier.schema!==DOSSIER_SCHEMA||dossier.state!=="DRAFT"||dossier.source!=="LOCAL_SELF_REPORTED_NOT_VERIFIED"||dossier.verified!==false||dossier.decision!=="HOLD"||dossier.authorization!=="DENY")return {ok:false,errors:["Dossier mag nooit autorisatie of verificatie claimen."]};
 if(!validText(dossier.evidenceReference,300)||dossier.notice!=="Een bronlabel en lokale zelfrapportage zijn geen onafhankelijke verificatie of productieautorisatie.")return {ok:false,errors:["Bewijslabel of disclaimer ongeldig."]};
 try{
  const expected=makeAcceptanceDossier(dossier.baseline,dossier.current,{evidenceReference:dossier.evidenceReference});
  if(JSON.stringify(dossier.comparison)!==JSON.stringify(expected.comparison))return {ok:false,errors:["Vergelijkingsresultaat gewijzigd."]};
 }catch{return {ok:false,errors:["Ongeldig bronrapport."]};}
 return {ok:true,errors:[]};
}
export function emptyBaseline(){return newReport();}
