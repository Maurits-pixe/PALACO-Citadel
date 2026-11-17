// PALACO Release Readiness v1.3 RC: local evidence inventory, never a release authorization.
import {MODULES,EXTERNAL,validateIntegration,snapshot} from "./atlas-integratie.mjs";
import {CHECKS} from "./atlas-acceptatie.mjs";
import {REVIEW_SCHEMA,makeReview,validateReview} from "./atlas-release-review.mjs";
import {validateAcceptanceDossier} from "./atlas-acceptatie-dossier.mjs";
export const READINESS_SCHEMA="palaco.atlas.release-readiness.draft.v1";
export const REVIEW_LIMIT=65536;
export const GATES=Object.freeze([
 {id:"TECHNICAL_CI",title:"Geautomatiseerde contract- en browsertests",status:"EVIDENCE_REQUIRED",hint:"Bevestig exacte commit, workflow-run en testlogs onafhankelijk."},
 {id:"INDEPENDENT_EVIDENCE",title:"Onafhankelijke bewijsbeoordeling",status:"OPEN",hint:"Verifieer broninhoud en herkomst buiten de lokale zelfrapportage."},
 {id:"SECURITY_REVIEW",title:"Beveiligingsreview",status:"OPEN",hint:"Controleer privacy, CSP, service worker en risico's in een afzonderlijke review."},
 {id:"PHYSICAL_DEVICE",title:"Fysieke apparaatacceptatie",status:"OPEN",hint:"Test op echte toestellen; geautomatiseerd Chromium vervangt dit niet."},
 {id:"OWNER_APPROVAL",title:"Menselijk bevoegd releasebesluit",status:"OPEN",hint:"Vereist afzonderlijke bevoegdheids- en governancecontrole."},
 {id:"PRODUCTION_CHECK",title:"Publicatie- en productiecontrole",status:"OPEN",hint:"Beoordeel hosting, routebereikbaarheid en terugrolplan vóór een release."}
]);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const safe=(x,max)=>typeof x==="string"&&x.length<=max&&!/[\u0000-\u001f\u007f]/.test(x);
const exact=(o,k)=>plain(o)&&Object.keys(o).length===k.length&&Object.keys(o).every(name=>k.includes(name));
export function parseReview(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>REVIEW_LIMIT)throw Error("Review ongeldig of groter dan 64 KiB.");
 let review;try{review=JSON.parse(raw)}catch{throw Error("Ongeldige review-JSON.")};
 // An orphaned review can never be independently validated. Require paired original dossier.
 if(!plain(review)||review.schema!==REVIEW_SCHEMA||review.decision!=="HOLD"||review.authorization!=="DENY"||review.verified!==false)throw Error("Review bevat verboden of onvolledige status.");
 return review;
}
export function assessReadiness(dossier=null,review=null){
 const internal=validateIntegration();
 const status=snapshot();
 const moduleRows=MODULES.map(m=>({id:m.id,title:m.title,href:m.href,stage:"DRAFT",assurance:"NOT_PRODUCTION_VERIFIED"}));
 const gates=GATES.map(g=>({...g}));
 const errors=[...internal.errors];
 let observation={present:false,verified:false,pending:CHECKS.length,checked:false};
 if(dossier!==null){
  if(!validateAcceptanceDossier(dossier).ok)errors.push("Acceptatiedossier ongeldig.");
  else{
   const generated=makeReview(dossier);
   observation={present:true,verified:false,pending:generated.openItems,checked:true};
   if(review!==null){
    if(!validateReview(review,dossier).ok)errors.push("Review is ongeldig of past niet bij het dossier.");
   }
  }
 }else if(review!==null)errors.push("Review vereist een gekoppeld acceptatiedossier.");
 const eligible=errors.length===0;
 return {schema:READINESS_SCHEMA,state:"DRAFT",decision:"HOLD",authorization:"DENY",verified:false,
  source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",internalConsistent:internal.ok,reviewMatched:eligible&&review!==null,
  modules:moduleRows,external:EXTERNAL.map(e=>({id:e.id,status:e.status,write:false})),worldCount:status.counts?.worlds??0,
  observation,gates,errors,productionReady:false};
}
export function makeReadinessExport(dossier,review,{reference=""}={}){
 if(dossier===null||review===null)throw Error("Dossier en gekoppelde review verplicht.");
 if(!safe(reference,300))throw Error("Bewijsreferentie ongeldig.");
 const report=assessReadiness(dossier,review);
 if(report.errors.length)throw Error(report.errors.join("; "));
 return {...report,reference,notice:"Dit overzicht is uitsluitend een lokale bewijsinventaris; geen externe attestatie, akkoord of productie-autorisatie."};
}
export function validateReadinessExport(result,dossier,review){
 const fields=["schema","state","decision","authorization","verified","source","internalConsistent","reviewMatched","modules","external","worldCount","observation","gates","errors","productionReady","reference","notice"];
 if(!exact(result,fields)||!safe(result.reference,300))return {ok:false,errors:["Onbekende of ontbrekende overzichtsvelden."]};
 try{
  const expected=makeReadinessExport(dossier,review,{reference:result.reference});
  if(JSON.stringify(result)!==JSON.stringify(expected))return {ok:false,errors:["Readiness-overzicht is gewijzigd."]};
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
