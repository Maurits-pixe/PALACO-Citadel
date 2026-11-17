// PALACO Wereldatlas acceptatieprotocol v1.0 RC — local self-report; never authorizes release.
export const REPORT_SCHEMA="palaco.atlas.acceptance.self-report.v1";
export const CHECKS=Object.freeze([
 {id:"ATLAS-MOB-001",title:"Mobiele toegang",prompt:"Open de Atlas Integratiekern op een echte telefoon."},
 {id:"ATLAS-MOB-002",title:"Negen modules",prompt:"Controleer of alle negen modulekaarten zichtbaar en aanklikbaar zijn."},
 {id:"ATLAS-MOB-003",title:"Wereldselectie",prompt:"Selecteer EARTH en PLUTO en open een gekoppeld werelddossier."},
 {id:"ATLAS-MOB-004",title:"Offline-installatie",prompt:"Installeer het optionele offlinepakket terwijl internet beschikbaar is."},
 {id:"ATLAS-MOB-005",title:"Offline herladen",prompt:"Zet de netwerkverbinding uit en herlaad Atlas Archief en Integratiekern."},
 {id:"ATLAS-MOB-006",title:"Offline verwijderen",prompt:"Herstel netwerk en verwijder de offline cache via Integratiekern."},
 {id:"ATLAS-MOB-007",title:"Grenzen en leesbaarheid",prompt:"Controleer mobiele navigatie, leesbaarheid en de zichtbare HOLD/DENY-grens."},
 {id:"ATLAS-SEC-008",title:"Privacy en geen schrijftoegang",prompt:"Controleer dat lokale bewijsbestanden niet automatisch naar een server gaan."}
]);
const STATES=new Set(["PASS","FAIL","NOT_TESTED"]);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const safe=(s,max)=>typeof s==="string"&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
export function newReport(){
 return {schema:REPORT_SCHEMA,release:"1.0-RC",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",decision:"HOLD",authorization:"DENY",verified:false,observations:CHECKS.map(c=>({id:c.id,status:"NOT_TESTED",note:""}))};
}
export function validateReport(report){
 const errors=[];
 const expected=["schema","release","source","decision","authorization","verified","observations"];
 if(!plain(report)||Object.keys(report).length!==expected.length||Object.keys(report).some(k=>!expected.includes(k)))return {ok:false,errors:["Rapportstructuur ongeldig."]};
 if(report.schema!==REPORT_SCHEMA||report.release!=="1.0-RC"||report.source!=="LOCAL_SELF_REPORTED_NOT_VERIFIED"||report.decision!=="HOLD"||report.authorization!=="DENY"||report.verified!==false)errors.push("Autorisatie- of bronclaims niet toegestaan.");
 if(!Array.isArray(report.observations)||report.observations.length!==CHECKS.length)return {ok:false,errors:["Onvolledige waarnemingen."]};
 const ids=new Set();
 for(const item of report.observations){
  if(!plain(item)||Object.keys(item).length!==3||!["id","status","note"].every(k=>own(item,k)))errors.push("Ongeldige waarnemingsvelden.");
  else {
   if(ids.has(item.id)||!CHECKS.some(c=>c.id===item.id))errors.push("Dubbele of onbekende waarneming: "+item.id);
   ids.add(item.id);
   if(!STATES.has(item.status)||!safe(item.note,1000))errors.push("Ongeldige waarnemingsstatus of notitie: "+item.id);
  }
 }
 if(CHECKS.some(c=>!ids.has(c.id)))errors.push("Ontbrekende waarneming.");
 return {ok:errors.length===0,errors};
}
export function setObservation(report,id,status,note){
 if(!STATES.has(status)||!safe(note,1000)||!CHECKS.some(c=>c.id===id))throw Error("Ongeldige waarneming.");
 if(!validateReport(report).ok)throw Error("Bestaand rapport ongeldig.");
 const updated={...report,observations:report.observations.map(item=>item.id===id?{id,status,note}:item)};
 if(!validateReport(updated).ok)throw Error("Rapportcontrole geweigerd.");
 return updated;
}
export function summarize(report){
 const valid=validateReport(report);
 if(!valid.ok)return {valid:false,decision:"HOLD",authorization:"DENY",errors:valid.errors};
 const tally={PASS:0,FAIL:0,NOT_TESTED:0};
 for(const item of report.observations)tally[item.status]++;
 return {valid:true,tally,observationsComplete:tally.NOT_TESTED===0,localChecksPass:tally.PASS===CHECKS.length,decision:"HOLD",authorization:"DENY",nextStep:"Menselijke review, echte apparaatacceptatie, beveiligings- en publicatiegoedkeuring afzonderlijk vereist."};
}
