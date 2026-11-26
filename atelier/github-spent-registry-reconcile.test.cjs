'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {canonical}=require('./github-custodian-key-registry.cjs');
const {entryHash,LIMIT}=require('./github-spent-recovery-register.cjs');
const {reconcile,requireIdentical,validateSnapshot}=require('./github-spent-registry-reconcile.cjs');
const root={sequence:0,head:null};
function entry(sequence,previous,letter,assessment='a'){
 const e={schema:'palaco.citadel.atelier.spent-recovery-review/1',
 sequence,decision_id:letter.repeat(64),assessment_sha256:assessment.repeat(64),
 reviewer_ids:['reviewer-one','reviewer-two'],previous_sha256:previous,
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
 limitation:LIMIT};e.entry_sha256=entryHash(e);return e;
}
const one=entry(1,null,'b');
const two=entry(2,one.entry_sha256,'c');
const fork=entry(2,one.entry_sha256,'c','f');
const snap=(name,records)=>canonical({schema:'palaco.citadel.atelier.spent-registry-snapshot/1',
 repository:'Maurits-pixe/PALACO-Citadel',archive_id:name,records,
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false});
const a=records=>snap('archive-a',records),b=records=>snap('archive-b',records);
test('identical independently pinned snapshots remain read-only HOLD',()=>{
 const r=requireIdentical(a([one,two]),b([one,two]),'archive-a','archive-b',
  {sequence:2,head:two.entry_sha256},{sequence:2,head:two.entry_sha256});
 assert.equal(r.status,'IDENTICAL_RECORD_HISTORY');assert.equal(r.incident,false);
 assert.equal(r.synchronization_authorized,false);assert.equal(r.release_approved,false);
});
test('lagging archive detected without synchronizing',()=>{
 const r=reconcile(a([one,two]),b([one]),'archive-a','archive-b',root,root);
 assert.equal(r.status,'ARCHIVE_B_BEHIND');assert.equal(r.incident,true);
 assert.equal(r.common_prefix,1);
 assert.throws(()=>requireIdentical(a([one,two]),b([one]),'archive-a','archive-b',root,root),/denied/);
});
test('fork with reused decision ID but changed evidence is flagged',()=>{
 const r=reconcile(a([one,two]),b([one,fork]),'archive-a','archive-b',root,root);
 assert.equal(r.status,'FORK_OR_SPLIT_VIEW');assert.equal(r.cross_fork_replay,true);
});
test('external floor rejects truncated or conflicting snapshots',()=>{
 assert.throws(()=>reconcile(a([one]),b([one,two]),'archive-a','archive-b',
  {sequence:2,head:two.entry_sha256},root),/history floor/);
 assert.throws(()=>reconcile(a([one,two]),b([one,two]),'archive-a','archive-b',
  {sequence:2,head:'f'.repeat(64)},root),/history floor/);
});
test('same source IDs, changed hashes and replayed record are rejected',()=>{
 assert.throws(()=>reconcile(a([one]),a([one]),'archive-a','archive-a',root,root),/differ/);
 const corrupted={...one,entry_sha256:'f'.repeat(64)};
 assert.throws(()=>validateSnapshot(a([corrupted]),'archive-a',root),/record|hash/);
 const duplicated=entry(2,one.entry_sha256,'b');
 assert.throws(()=>validateSnapshot(a([one,duplicated]),'archive-a',root),/Replayed/);
});
test('noncanonical, unknown metadata and fabricated release claims rejected',()=>{
 assert.throws(()=>validateSnapshot(Buffer.concat([a([one]),Buffer.from(' ')]),'archive-a',root),/canonical/);
 const obj=JSON.parse(a([one]));obj.release_approved=true;
 assert.throws(()=>validateSnapshot(canonical(obj),'archive-a',root),/canonical/);
 obj.release_approved=false;obj.authenticated=true;
 assert.throws(()=>validateSnapshot(canonical(obj),'archive-a',root),/canonical/);
});
