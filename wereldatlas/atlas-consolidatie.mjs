// PALACO Citadel Wereldatlas v2.0 Consolidatie & RC Review (read-only).
// Historical CI claims are never promoted to independently verified evidence.
import {MODULES,EXTERNAL,validateIntegration} from "./atlas-integratie.mjs";
import {GATES} from "./atlas-readiness.mjs";
import {REQUIRED} from "./atlas-package-audit.mjs";
export const CONSOLIDATION_SCHEMA="palaco.atlas.consolidation.draft.v2";
export const WORKFLOWS=Object.freeze([
 {id:"explore",title:"Werelden verkennen",description:"Van wereldcatalogus naar kaart en wereldregister.",links:["./","./kaartkamer.html","./wereldregister.html","./dossierinspectie.html","./atlas-archief.html"]},
 {id:"evidence",title:"Bewijs en verificatie",description:"Zelfgerapporteerde bronnen, afkomst en controle zonder vertrouwen te claimen.",links:["./atlas-verificatie.html","./atlas-bewijs.html","./atlas-provenance.html","./atlas-trust-gateway.html","./atlas-acceptatie.html","./atlas-release-review.html"]},
 {id:"release",title:"Releasevoorbereiding",description:"Pakket-, risico- en acceptatieoverzichten; geen uitgifte.",links:["./atlas-integratie.html","./atlas-readiness.html","./atlas-release-control.html","./atlas-release-integrity.html","./atlas-package-audit.html","./atlas-security-audit.html","./atlas-traceability.html","./atlas-attestation.html"]}
]);
const safeText=x=>typeof x==="string"&&x.length<=300&&!/[\u0000-\u001f\u007f]/.test(x);
export function reviewSnapshot({candidateSha="",reviewReference=""}={}){
 if(candidateSha!==""&&!/^[a-f0-9]{40}$/.test(candidateSha))throw Error("Kandidaatcommit moet een lowercase 40-tekens SHA zijn.");
 if(!safeText(reviewReference))throw Error("Ongeldige reviewreferentie.");
 const integrity=validateIntegration();
 const distinct=new Set(WORKFLOWS.flatMap(x=>x.links));
 const expected=[...MODULES.map(x=>x.href),"./atlas-acceptatie.html","./atlas-release-review.html",
 "./atlas-readiness.html","./atlas-release-control.html","./atlas-release-integrity.html","./atlas-package-audit.html",
 "./atlas-security-audit.html","./atlas-traceability.html","./atlas-attestation.html"];
 const errors=[...integrity.errors];
 for(const path of expected)if(!distinct.has(path))errors.push("Ontbrekende route: "+path);
 for(const path of distinct)if(path!=="./"&&!REQUIRED.includes(path.slice(2)))errors.push("Onbekende route: "+path);
 if(expected.length!==distinct.size)errors.push("Duplicaat of onvolledige routeverzameling.");
 return {schema:CONSOLIDATION_SCHEMA,state:"DRAFT",verified:false,decision:"HOLD",authorization:"DENY",
  candidateSha,reviewReference,ciEvidence:"NOT_INDEPENDENTLY_ATTESTED",navigation:{totalRoutes:distinct.size,workflows:WORKFLOWS.map(w=>({id:w.id,title:w.title,description:w.description,links:[...w.links]}))},
  modules:MODULES.map(m=>({id:m.id,title:m.title,href:m.href,status:"DRAFT"})),
  external:EXTERNAL.map(x=>({id:x.id,status:x.status,write:false})),
  gates:GATES.map(x=>({id:x.id,status:x.status,attested:false})),
  manualChecks:["Echte mobiele navigatie en toegankelijkheid","Onafhankelijke security- en privacyreview","Verifieer commit/CI provenance buiten deze UI","Bevoegde menselijke releaseautorisatie","Hosting en rollbackacceptatie"],
  errors,releaseReady:false,notice:"Technische browser-/Node-tests zijn geen onafhankelijke releaseattestatie."};
}
export function validateReviewSnapshot(record){
 if(!record||typeof record!=="object"||Array.isArray(record))return {ok:false,errors:["Ongeldig reviewobject."]};
 const expectedKeys=["schema","state","verified","decision","authorization","candidateSha","reviewReference","ciEvidence","navigation","modules","external","gates","manualChecks","errors","releaseReady","notice"];
 if(Object.keys(record).length!==expectedKeys.length||Object.keys(record).some(k=>!expectedKeys.includes(k)))return {ok:false,errors:["Reviewvelden onbekend of ontbreken."]};
 try{const expected=reviewSnapshot({candidateSha:record.candidateSha,reviewReference:record.reviewReference});
 if(JSON.stringify(record)!==JSON.stringify(expected))throw Error("Review gewijzigd of autorisatieclaim vervalst.");
 return {ok:true,errors:[]};
 }catch(e){return {ok:false,errors:[e.message]}}
}
