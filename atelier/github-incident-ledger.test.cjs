'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {base,append,verifyLedger,canonical}=require('./github-incident-ledger.cjs');
const report=incident=>canonical({
 schema:'palaco.citadel.atelier.checkpoint-witness-incident/1',
 result:incident?'CHECKPOINT_SPLIT_VIEW_OR_STALE_OBSERVATION':'TWO_PINNED_WITNESSES_AGREE',
 repository:'Maurits-pixe/PALACO-Citadel',checkpoint_sequence:5,
 checkpoint_sha256:'a'.repeat(64),observer_ids:['observer-one','observer-two'],
 observations:[{sequence:5,sha256:'a'.repeat(64)},{sequence:5,sha256:incident?'b'.repeat(64):'a'.repeat(64)}],
 incident,decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
 limitation:'Synthetic upstream observer verification; not an authority token'});
const initial=()=>canonical(base());
test('deterministic incident chain registers then records recovery without GO',()=>{
 const opened=append(initial(),'OPEN','incident-001',report(true));
 const closed=append(canonical(opened),'RECOVERY_RECORDED','incident-001',report(false));
 const verified=verifyLedger(canonical(closed));
 assert.equal(closed.records.length,2);
 assert.equal(verified.open.size,0);
 assert.equal(closed.decision,'HOLD');assert.equal(closed.publication,'DENY');
 assert.equal(closed.release_approved,false);
});
test('duplicate incident IDs and double recovery are refused',()=>{
 const opened=append(initial(),'OPEN','incident-001',report(true));
 assert.throws(()=>append(canonical(opened),'OPEN','incident-001',report(true)),/Duplicate/);
 const closed=append(canonical(opened),'RECOVERY_RECORDED','incident-001',report(false));
 assert.throws(()=>append(canonical(closed),'RECOVERY_RECORDED','incident-001',report(false)),/unauthorized recovery/);
});
test('recovery without prior incident and mismatched report type fail closed',()=>{
 assert.throws(()=>append(initial(),'RECOVERY_RECORDED','incident-001',report(false)),/unauthorized recovery/);
 assert.throws(()=>append(initial(),'OPEN','incident-001',report(false)),/witness report shape/);
});
test('changed history, reordered records and fabricated GO are rejected',()=>{
 const a=append(initial(),'OPEN','incident-001',report(true));
 const b=append(canonical(a),'OPEN','incident-002',report(true));
 const tampered=structuredClone(b);tampered.records[0].evidence_sha256='f'.repeat(64);
 assert.throws(()=>verifyLedger(canonical(tampered)),/Broken/);
 const reorder=structuredClone(b);reorder.records.reverse();
 assert.throws(()=>verifyLedger(canonical(reorder)),/Broken/);
 assert.throws(()=>verifyLedger(canonical({...b,release_approved:true})),/authority/);
});
test('externally pinned minimum head rejects truncation and divergent history',()=>{
 const a=append(initial(),'OPEN','incident-001',report(true));
 const b=append(canonical(a),'OPEN','incident-002',report(true));
 const floor={sequence:2,head:b.records[1].record_sha256};
 assert.equal(verifyLedger(canonical(b),floor).head,floor.head);
 assert.throws(()=>verifyLedger(canonical(a),floor),/truncated/);
 assert.throws(()=>verifyLedger(canonical(b),{sequence:2,head:'f'.repeat(64)}),/diverges/);
});
test('noncanonical evidence and changed canonical ledger bytes fail closed',()=>{
 assert.throws(()=>append(initial(),'OPEN','incident-001',Buffer.concat([report(true),Buffer.from(' ')])),/Noncanonical/);
 assert.throws(()=>verifyLedger(Buffer.concat([initial(),Buffer.from(' ')])),/Invalid canonical/);
 const a=append(initial(),'OPEN','incident-001',report(true));
 const bad=structuredClone(a);bad.records[0].previous_sha256='c'.repeat(64);
 assert.throws(()=>verifyLedger(canonical(bad)),/Broken/);
});
