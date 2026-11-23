'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validatePair}=require('./github-review-pair.cjs');
const {inspect}=require('./github-review-evidence-integrity.cjs');
const A='a'.repeat(40);
const ctx={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,headSha:A,runId:123,attempt:1};
const report=()=>({schema:'palaco.citadel.atelier.github-review-evidence/1',
 source:'github_actions_readonly_api_observation',workflow_run_id:123,
 workflow_run_attempt:1,repository:ctx.repository,pr_number:60,candidate_sha:A,
 review_count:0,matching_approved_review_count:0,collection_complete:true,
 review_list_issues:[],decision:'HOLD',publication:'DENY',release_approved:false,
 evidence_usable:false,
 limitation:'An observation artifact cannot replace current authenticated GitHub review verification'});
const bytes=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const pair=()=>{const raw=bytes(report());return [raw,bytes(inspect(raw,ctx))];};
test('canonical report and receipt verify with no release authority',()=>{
 const [a,b]=pair();const r=validatePair(a,b,ctx);
 assert.equal(r.result,'PAIR_VERIFIED');
 assert.equal(r.decision,'HOLD');
 assert.equal(r.evidence_usable,false);
});
test('receipt from a different report is rejected',()=>{
 const [a,b]=pair();const changed=report();changed.review_count=1;
 assert.throws(()=>validatePair(bytes(changed),b,ctx),/does not match/);
});
test('wrong run, commit, or invented approval is rejected',()=>{
 const [a,b]=pair();
 assert.throws(()=>validatePair(a,b,{...ctx,runId:124}),/does not match exact workflow context/);
 const x=JSON.parse(b.toString());x.decision='GO';
 assert.throws(()=>validatePair(a,bytes(x),ctx),/does not match/);
});
test('receipt duplicate keys, extra fields and noncanonical bytes fail',()=>{
 const [a,b]=pair();
 const duplicate=b.toString().replace('  "decision": "HOLD",','  "decision": "GO",\n  "decision": "HOLD",');
 assert.throws(()=>validatePair(a,Buffer.from(duplicate),ctx),/Noncanonical integrity receipt/);
 const extra=JSON.parse(b.toString());extra.reviewer='private';
 assert.throws(()=>validatePair(a,bytes(extra),ctx),/Unexpected integrity receipt structure/);
 assert.throws(()=>validatePair(a,Buffer.concat([b,Buffer.from(' ')]),ctx),/Noncanonical integrity receipt/);
});
