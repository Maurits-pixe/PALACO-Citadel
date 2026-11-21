const SCHEMA = "PALACO-CITADEL-HANDOFF-DRAFT-1";
const CATEGORIES = new Set(["Persoonlijk","Wereld","Atelier","Observatorium","Citadel"]);
const UNASSESSED = ["sourceAuthenticity","completeness","identityBinding","chronology"];
const string = (v,max,nonempty=false)=>typeof v==="string"&&v.length<=max&&(!nonempty||v.trim().length>0);
const plain = v=>v!==null&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const sameKeys=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const validTime=v=>string(v,40,true)&&!Number.isNaN(Date.parse(v))&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v);
function assertHandoff(doc) {
 const fail = reason=>({ok:false,reason});
 if(!sameKeys(doc,["schema","documentType","origin","destination","consent","trust","lineage","reviewChecklist","exportedAt"]))return fail("Onjuist documentschema of onbekende velden.");
 if(doc.schema!==SCHEMA||doc.documentType!=="UNVERIFIED_MEMORY_REVIEW_REQUEST")return fail("Documenttype is geen geldig conceptverzoek.");
 const o=doc.origin,d=doc.destination,c=doc.consent,t=doc.trust,r=doc.reviewChecklist;
 if(!sameKeys(o,["module","selectedRecordId"])||o.module!=="CITADEL_GEHEUGENKAMER"||!string(o.selectedRecordId,100,true))return fail("Ongeldige herkomst.");
 if(!sameKeys(d,["module","nextGate","mode"])||d.module!=="BEWIJSKAMER"||d.nextGate!=="ERA_EVIDENCE_REVIEW"||d.mode!=="MANUAL_FILE_TRANSFER_ONLY")return fail("Geen handmatige Bewijskamerroute.");
 if(!sameKeys(c,["scope","given","recordedAt"])||c.scope!=="ONE_LOCAL_EXPORT"||c.given!==true||!validTime(c.recordedAt))return fail("Toestemmingsmetadata ontbreken of zijn ongeldig.");
 if(!sameKeys(t,["state","sourceVerified","clockAttested","review","edtrIssued","authority"])||t.state!=="SELF_REPORTED_NOT_VERIFIED"||t.sourceVerified!==false||t.clockAttested!==false||t.review!=="PENDING"||t.edtrIssued!==false||t.authority!=="NONE")return fail("Vertrouwensgrens overschreden.");
 if(!sameKeys(r,UNASSESSED)||!UNASSESSED.every(k=>r[k]==="UNASSESSED"))return fail("Beoordelingsvelden mogen niet vooraf ingevuld zijn.");
 if(!validTime(doc.exportedAt))return fail("Ongeldige exporttijd.");
 const chain=doc.lineage;
 if(!Array.isArray(chain)||chain.length<1||chain.length>100)return fail("Lineage moet 1 tot 100 records bevatten.");
 const ids=new Set();
 const keys=["recordId","previousId","version","createdAt","source","category","title"];
 for(let i=0;i<chain.length;i++){
   const x=chain[i];
   if(!sameKeys(x,keys)||!string(x.recordId,100,true)||!string(x.previousId,100)||!Number.isSafeInteger(x.version)||x.version<1||x.version>100||!validTime(x.createdAt)||!string(x.source,250)||!CATEGORIES.has(x.category)||!string(x.title,100,true))return fail("Onjuist lineage-record.");
   if(ids.has(x.recordId)||x.previousId===x.recordId)return fail("Dubbele of circulaire lineage.");
   ids.add(x.recordId);
   if(i>0){
     const before=chain[i-1];
     if(x.previousId!==before.recordId||x.version!==before.version+1||Date.parse(x.createdAt)<Date.parse(before.createdAt))return fail("Onderbroken of niet-monotone versievolgorde.");
   }else if(x.previousId===""&&x.version!==1 || x.previousId!==""&&x.version===1)return fail("Ongeldig begin van de lineage.");
 }
 if(chain.at(-1).recordId!==o.selectedRecordId)return fail("Geselecteerd dossier wijkt af van de lineage.");
 return {ok:true,partial:chain[0].previousId!=="" ,count:chain.length};
}
export function inspectHandoff(input){
 try {return assertHandoff(input)}catch{return {ok:false,reason:"Onleesbaar of onveilig document."}}
}
export function parseHandoff(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>256*1024)return {ok:false,reason:"Bestand te groot of ongeldig."};
 try{
  const obj=JSON.parse(raw);
  const result=inspectHandoff(obj);
  return result.ok?{...result,document:obj}:result;
 }catch{return {ok:false,reason:"Ongeldige JSON-inhoud."}}
}
export function makeLocalAssessment(doc,notes){
 const check=inspectHandoff(doc);if(!check.ok)throw Error(check.reason);
 if(!string(notes,1000))throw Error("Notitie is te lang.");
 return {schema:"PALACO-CITADEL-BEWIJSKAMER-LOCAL-ASSESSMENT-1",scope:"LOCAL_NOT_VERIFIED",inputSchema:SCHEMA,selectedRecordId:doc.origin.selectedRecordId,receivedLineageCount:check.count,partialLineage:check.partial,observation:notes,review:"NOT_VERIFIED",authority:"NONE",edtrIssued:false};
}
