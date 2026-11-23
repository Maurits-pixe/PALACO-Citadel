'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspect}=require('./github-review-evidence-integrity.cjs');
const A='a'.repeat(40);
const ctx={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,headSha:A,runId:123,attempt:1};
const record=()=>({
 schema:'palaco.citadel.atelier.github-review-evidence/1',
 source:'github_actions_readonly_api_observation',
 workflow_run_id:123,workflow_run_attempt:1,
 repository:ctx.repository,pr_number:60,candidate_sha:A,
 review_count:0,matching_approved_review_count:0,collection_complete:true,
 review_list_issues:[],decision:'HOLD',publication:'DENY',
 release_approved:false,evidence_usable:false,
 limitation:'An observation artifact cannot replace current authenticated GitHub review verification'
});
const bytes=o=>Buffer.from(JSON.stringify(o)+'\n');
test('matching complete review report yields local SHA256 and never GO',()=>{
 const raw=bytes(record());const r=inspect(raw,ctx);
 assert.match(r.report_sha256,/^[a-f0-9]{64}$/);
 assert.equal(r.decision,'HOLD');
 assert.equal(r.release_approved,false);
 assert.equal(r.evidence_usable,false);
 assert.equal(r.result,'INTEGRITY_CHECKED');
});
test('tampered workflow context always fails',()=>{
 const raw=bytes(record());
 for(const field of ['repository','prNumber','headSha','runId','attempt']){
  const different={...ctx,[field]:field==='headSha'?'b'.repeat(40):
   field==='repository'?'other/repository':999};
  assert.throws(()=>inspect(raw,different),/does not match exact workflow context/);
 }
});
test('promoted authorization and injected private fields are rejected',()=>{
 for(const [key,value] of [['decision','GO'],['publication','PUBLIC'],
  ['release_approved',true],['evidence_usable',true],['reviewer_email','private@example.test']]){
  const x=record();x[key]=value;
  assert.throws(()=>inspect(bytes(x),ctx),/Report boundary invalid|Unexpected report structure/);
 }
});
test('invalid counts and unexpected diagnostics are rejected',()=>{
 const x=record();x.review_count=1;x.matching_approved_review_count=2;
 assert.throws(()=>inspect(bytes(x),ctx),/observations inconsistent/);
 x.matching_approved_review_count=0;
 x.review_list_issues=['untrusted secret'];
 assert.throws(()=>inspect(bytes(x),ctx),/observations inconsistent/);
});
test('complete reports cannot contain blockers and truncated files are rejected',()=>{
 const x=record();x.review_list_issues=['incomplete_pagination'];
 assert.throws(()=>inspect(bytes(x),ctx),/observations inconsistent/);
 assert.throws(()=>inspect(Buffer.alloc(0),ctx),/byte length/);
 assert.throws(()=>inspect(Buffer.alloc(20001),ctx),/byte length/);
});
