import test from "node:test";
import assert from "node:assert/strict";
import {triageHandoff,buildTriageRecord} from "./triage.mjs";
const now="2026-11-17T10:00:00.000Z";
const doc=()=>({
 schema:"PALACO-CITADEL-HANDOFF-DRAFT-1",documentType:"UNVERIFIED_MEMORY_REVIEW_REQUEST",
 origin:{module:"CITADEL_GEHEUGENKAMER",selectedRecordId:"record-a"},
 destination:{module:"BEWIJSKAMER",nextGate:"ERA_EVIDENCE_REVIEW",mode:"MANUAL_FILE_TRANSFER_ONLY"},
 consent:{scope:"ONE_LOCAL_EXPORT",given:true,recordedAt:now},
 trust:{state:"SELF_REPORTED_NOT_VERIFIED",sourceVerified:false,clockAttested:false,review:"PENDING",edtrIssued:false,authority:"NONE"},
 lineage:[{recordId:"record-a",previousId:"",version:1,createdAt:now,source:"Archive A-001",category:"Citadel",title:"Herinnering"}],
 reviewChecklist:{sourceAuthenticity:"UNASSESSED",completeness:"UNASSESSED",identityBinding:"UNASSESSED",chronology:"UNASSESSED"},
 exportedAt:now
});
test("invalid packet is never eligible",()=>{
 const d=doc();d.trust.authority="OWNER";
 const t=triageHandoff(d);assert.equal(t.status,"INVALID_PACKET");assert.equal(t.eligible,false);assert.equal(t.authority,"NONE");
});
test("missing source requires material",()=>{
 const d=doc();d.lineage[0].source="";
 const t=triageHandoff(d);assert.equal(t.status,"NEEDS_SOURCE_MATERIAL");assert.equal(t.eligible,false);
 assert.equal(t.issues[0].code,"MISSING_SOURCE");
});
test("partial lineage requires supporting material",()=>{
 const d=doc();d.lineage[0].previousId="missing";d.lineage[0].version=2;
 const t=triageHandoff(d);assert.equal(t.status,"NEEDS_SOURCE_MATERIAL");
 assert.equal(t.issues[0].code,"PARTIAL_LINEAGE");
});
test("technically complete packet is ready only for human review, not proof",()=>{
 const t=triageHandoff(doc());
 assert.equal(t.status,"READY_FOR_HUMAN_REVIEW");assert.equal(t.eligible,true);
 assert.equal(t.review,"NOT_STARTED");assert.equal(t.sourceVerified,false);assert.equal(t.edtrIssued,false);
});
test("triage note is draft and cannot grant authority",()=>{
 const x=buildTriageRecord(doc(),"Vraag bron op");
 assert.equal(x.schema,"PALACO-CITADEL-TRIAGE-DRAFT-1");assert.equal(x.review,"NOT_VERIFIED");
 assert.equal(x.authority,"NONE");assert.equal(x.edtrIssued,false);assert.equal(x.identityVerified,false);
});
test("invalid intake cannot be exported as a review note",()=>{
 const d=doc();d.consent.given=false;
 assert.throws(()=>buildTriageRecord(d,""));
});
test("oversized notes are rejected",()=>assert.throws(()=>buildTriageRecord(doc(),"x".repeat(1001))));
