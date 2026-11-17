import test from "node:test";
import assert from "node:assert/strict";
import {inspectHandoff,parseHandoff,makeLocalAssessment} from "./handoff.mjs";
const time="2026-11-17T10:00:00.000Z";
const example=()=>({
 schema:"PALACO-CITADEL-HANDOFF-DRAFT-1",
 documentType:"UNVERIFIED_MEMORY_REVIEW_REQUEST",
 origin:{module:"CITADEL_GEHEUGENKAMER",selectedRecordId:"rec-1"},
 destination:{module:"BEWIJSKAMER",nextGate:"ERA_EVIDENCE_REVIEW",mode:"MANUAL_FILE_TRANSFER_ONLY"},
 consent:{scope:"ONE_LOCAL_EXPORT",given:true,recordedAt:time},
 trust:{state:"SELF_REPORTED_NOT_VERIFIED",sourceVerified:false,clockAttested:false,review:"PENDING",edtrIssued:false,authority:"NONE"},
 lineage:[{recordId:"rec-1",previousId:"",version:1,createdAt:time,source:"Eigen notitie",category:"Citadel",title:"Een herinnering"}],
 reviewChecklist:{sourceAuthenticity:"UNASSESSED",completeness:"UNASSESSED",identityBinding:"UNASSESSED",chronology:"UNASSESSED"},
 exportedAt:time
});
const clone=x=>structuredClone(x);
test("accept valid local handoff without granting verified status",()=>{
 const result=inspectHandoff(example());
 assert.equal(result.ok,true);assert.equal(result.partial,false);assert.equal(result.count,1);
});
test("accept partial lineage but explicitly flag missing predecessors",()=>{
 const x=example();x.lineage[0].previousId="missing";x.lineage[0].version=3;
 const result=inspectHandoff(x);assert.equal(result.ok,true);assert.equal(result.partial,true);
});
test("reject escalation and forged verification fields",()=>{
 for(const [k,value] of [["authority","OWNER"],["edtrIssued",true],["review","APPROVED"],["sourceVerified",true],["clockAttested",true],["state","VERIFIED"]]){
  const x=example();x.trust[k]=value;assert.equal(inspectHandoff(x).ok,false,k);
 }
});
test("reject missing or forged consent and wrong destination",()=>{
 for(const variant of [x=>{x.consent.given=false},x=>{x.consent.scope="PERMANENT"},x=>{x.destination.mode="AUTO_SYNC"},x=>{x.destination.nextGate="AUTORIZE"}]){
  const x=example();variant(x);assert.equal(inspectHandoff(x).ok,false);
 }
});
test("reject unrecognized fields and prefilled review",()=>{
 const x=example();x.verifiedBy="owner";assert.equal(inspectHandoff(x).ok,false);
 const y=example();y.reviewChecklist.sourceAuthenticity="PASSED";assert.equal(inspectHandoff(y).ok,false);
});
test("reject duplicate IDs, mismatch, cycle and broken lineage",()=>{
 const x=example();x.lineage.push({...x.lineage[0]});assert.equal(inspectHandoff(x).ok,false);
 const y=example();y.origin.selectedRecordId="unknown";assert.equal(inspectHandoff(y).ok,false);
 const z=example();z.lineage[0].previousId="rec-1";assert.equal(inspectHandoff(z).ok,false);
 const w=example();w.lineage.push({...w.lineage[0],recordId:"rec-2",previousId:"rec-1",version:5});w.origin.selectedRecordId="rec-2";assert.equal(inspectHandoff(w).ok,false);
});
test("reject script markup as code but safely carry source as plain text",()=>{
 const x=example();x.lineage[0].title="<img src=x onerror=alert(1)>";
 const result=parseHandoff(JSON.stringify(x));
 assert.equal(result.ok,true);assert.equal(result.document.lineage[0].title,x.lineage[0].title);
});
test("reject oversized and malformed payloads",()=>{
 assert.equal(parseHandoff("x".repeat(256*1024+1)).ok,false);
 assert.equal(parseHandoff("{nope").ok,false);
 assert.equal(parseHandoff(JSON.stringify({})).ok,false);
});
test("local assessment never attests or grants authority",()=>{
 const obj=makeLocalAssessment(example(),"Nog te onderzoeken");
 assert.equal(obj.review,"NOT_VERIFIED");assert.equal(obj.authority,"NONE");
 assert.equal(obj.edtrIssued,false);assert.equal(obj.observation,"Nog te onderzoeken");
 assert.equal(obj.partialLineage,false);
});
test("local assessment rejects excessive note length",()=>{
 assert.throws(()=>makeLocalAssessment(example(),"x".repeat(1001)));
});
