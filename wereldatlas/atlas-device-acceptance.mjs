// PALACO Atlas v2.1 mobile device acceptance. All results are manually self-reported.
export const DEVICE_SCHEMA="palaco.atlas.mobile-acceptance.self-report.v2.1";
export const STEPS=Object.freeze([
 {id:"DEVICE-01",title:"Echte telefoon en toegang",instruction:"Open de geconsolideerde Wereldatlas op het echte toestel; noteer het gebruikte adres."},
 {id:"DEVICE-02",title:"Navigatie 19 Atlasroutes",instruction:"Controleer alle drie hoofdstukken en navigeer naar minimaal één pagina per hoofdstuk."},
 {id:"DEVICE-03",title:"Leesbaarheid en bediening",instruction:"Controleer op smal scherm tekstomloop, aanraakdoelen en oriëntatiewissel."},
 {id:"DEVICE-04",title:"Offline activeren",instruction:"Installeer via Integratiekern het offlinepakket met een actieve verbinding."},
 {id:"DEVICE-05",title:"Werkelijk offline herladen",instruction:"Schakel alle data uit en herlaad Consolidatie, Archief en Integratiekern."},
 {id:"DEVICE-06",title:"Offline uitschakelen",instruction:"Herstel verbinding en verwijder de lokale Atlas-cache via Integratiekern."},
 {id:"DEVICE-07",title:"Privacy en toestemming",instruction:"Controleer dat bewijsreferenties lokaal blijven en dat HOLD/DENY zichtbaar is."}
]);
const STATUSES=["NOT_TESTED","PASS","FAIL","BLOCKED"];
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const keys=(obj,expected)=>plain(obj)&&Object.keys(obj).length===expected.length&&Object.keys(obj).every(k=>expected.includes(k));
const text=(x,max)=>typeof x==="string"&&x.length<=max&&!/[\u0000-\u001f\u007f]/.test(x);
export function newDeviceReport(){
 return {schema:DEVICE_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,decision:"HOLD",authorization:"DENY",
 device:{model:"",browser:"",observedDate:"",reference:""},steps:STEPS.map(s=>({id:s.id,status:"NOT_TESTED",note:"",evidenceReference:""}))};
}
export function validateDeviceReport(report){
 const errors=[];
 if(!keys(report,["schema","state","source","verified","decision","authorization","device","steps"]))return {ok:false,errors:["Onbekende rapportvelden."]};
 if(report.schema!==DEVICE_SCHEMA||report.state!=="DRAFT"||report.source!=="LOCAL_SELF_REPORTED_NOT_VERIFIED"||report.verified!==false||report.decision!=="HOLD"||report.authorization!=="DENY")errors.push("Autoriserende of geverifieerde status niet toegestaan.");
 if(!keys(report.device,["model","browser","observedDate","reference"])||!text(report.device?.model,80)||!text(report.device?.browser,80)||!text(report.device?.reference,240)||
 !((report.device?.observedDate==="")||(typeof report.device?.observedDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(report.device.observedDate)&&!Number.isNaN(Date.parse(report.device.observedDate+"T00:00:00Z")))))errors.push("Toestelmetadata ongeldig.");
 if(!Array.isArray(report.steps)||report.steps.length!==STEPS.length)return {ok:false,errors:["Ongeldig aantal teststappen."]};
 STEPS.forEach((step,i)=>{const value=report.steps[i];if(!keys(value,["id","status","note","evidenceReference"])||value.id!==step.id||!STATUSES.includes(value.status)||!text(value.note,1000)||!text(value.evidenceReference,240))errors.push("Teststap ongeldig: "+step.id)});
 return {ok:errors.length===0,errors};
}
export function updateDeviceReport(report,id,patch){
 if(!validateDeviceReport(report).ok)throw Error("Brondossier is ongeldig.");
 if(!STEPS.some(x=>x.id===id)||!keys(patch,["status","note","evidenceReference"]))throw Error("Onbekende stap of velden.");
 const next={...report,device:{...report.device},steps:report.steps.map(s=>s.id===id?{...s,...patch}:{...s})};
 const valid=validateDeviceReport(next);if(!valid.ok)throw Error(valid.errors.join("; "));return next;
}
export function withDeviceInfo(report,device){
 if(!validateDeviceReport(report).ok)throw Error("Brondossier is ongeldig.");
 const next={...report,device:{...device}};const valid=validateDeviceReport(next);if(!valid.ok)throw Error(valid.errors.join("; "));return next;
}
export function deviceSummary(report){
 const valid=validateDeviceReport(report);if(!valid.ok)return {valid:false,errors:valid.errors,decision:"HOLD",authorization:"DENY"};
 const count=status=>report.steps.filter(s=>s.status===status).length;
 return {valid:true,total:STEPS.length,pass:count("PASS"),fail:count("FAIL"),blocked:count("BLOCKED"),notTested:count("NOT_TESTED"),
 allSelfReported:count("PASS")===STEPS.length,independentlyVerified:false,readyForRelease:false,decision:"HOLD",authorization:"DENY"};
}
export function parseDeviceReport(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>32768)throw Error("Rapport ontbreekt of is groter dan 32 KiB.");
 let obj;try{obj=JSON.parse(raw)}catch{throw Error("Ongeldige JSON.")};
 const result=validateDeviceReport(obj);if(!result.ok)throw Error(result.errors.join("; "));return obj;
}
