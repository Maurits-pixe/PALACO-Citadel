// PALACO Wereldatlas v2.2 RC — local device acceptance comparison; never independent verification.
import {STEPS,validateDeviceReport,parseDeviceReport} from "./atlas-device-acceptance.mjs";
export const RETEST_SCHEMA="palaco.atlas.device-retest.comparison.draft.v2.2";
export const MAX_REPORT_BYTES=32768;
const exact=(o,ks)=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&Object.keys(o).length===ks.length&&Object.keys(o).every(k=>ks.includes(k));
const safe=(s,n)=>typeof s==="string"&&s.length<=n&&!/[\u0000-\u001f\u007f]/.test(s);
export function parseInput(raw){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>MAX_REPORT_BYTES)throw Error("Telefoonrapport ontbreekt of is groter dan 32 KiB.");
 return parseDeviceReport(raw);
}
export function comparePhoneReports(previous,current,{caseReference=""}={}){
 if(!validateDeviceReport(previous).ok||!validateDeviceReport(current).ok)throw Error("Ongeldig of vervalst telefoonrapport.");
 if(!safe(caseReference,240))throw Error("Vergelijkingsreferentie ongeldig.");
 const observations=STEPS.map((s,i)=>{
  const old=previous.steps[i],now=current.steps[i];
  const statusChanged=old.status!==now.status;
  const noteChanged=old.note!==now.note;
  const evidenceChanged=old.evidenceReference!==now.evidenceReference;
  const regression=old.status==="PASS"&&now.status!=="PASS";
  const failure=now.status==="FAIL"||now.status==="BLOCKED";
  return {id:s.id,title:s.title,previous:old.status,current:now.status,
   statusChanged,noteChanged,evidenceChanged,regression,failure,changed:statusChanged||noteChanged||evidenceChanged};
 });
 const changed=observations.filter(x=>x.changed).length,regressions=observations.filter(x=>x.regression).length,
 failures=observations.filter(x=>x.failure).length;
 const deviceChanged=JSON.stringify(previous.device)!==JSON.stringify(current.device);
 const outstanding=observations.filter(x=>x.current!=="PASS").length;
 return {schema:RETEST_SCHEMA,state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",verified:false,decision:"HOLD",authorization:"DENY",
 caseReference,previous:{device:{...previous.device},steps:previous.steps.map(x=>({...x}))},
 current:{device:{...current.device},steps:current.steps.map(x=>({...x}))},
 comparison:{total:STEPS.length,changed,regressions,failures,outstanding,deviceChanged,observations},
 requiresHumanReview:true,releaseReady:false,
 notice:"Vergelijking van twee lokale zelfrapportages: geen onafhankelijke attestatie, daadwerkelijke toestelinspectie of productieautorisatie."};
}
export function validatePhoneComparison(report){
 const fields=["schema","state","source","verified","decision","authorization","caseReference","previous","current","comparison","requiresHumanReview","releaseReady","notice"];
 if(!exact(report,fields)||!safe(report.caseReference,240))return {ok:false,errors:["Ongeldig vergelijkingscontract."]};
 try{
  const template=STEPS.map(s=>({id:s.id,status:"NOT_TESTED",note:"",evidenceReference:""}));
  const rec=data=>({schema:"palaco.atlas.mobile-acceptance.self-report.v2.1",state:"DRAFT",source:"LOCAL_SELF_REPORTED_NOT_VERIFIED",
   verified:false,decision:"HOLD",authorization:"DENY",device:data.device,steps:data.steps});
  const original=rec(report.previous),next=rec(report.current);
  if(!validateDeviceReport(original).ok||!validateDeviceReport(next).ok)throw Error("Ingebed telefoonbewijs ongeldig.");
  const expected=comparePhoneReports(original,next,{caseReference:report.caseReference});
  if(JSON.stringify(report)!==JSON.stringify(expected))throw Error("Vergelijkingsresultaat of autorisatie gewijzigd.");
 }catch(e){return {ok:false,errors:[e.message]}}
 return {ok:true,errors:[]};
}
