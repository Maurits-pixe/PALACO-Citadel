'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {checkChain}=require('./github-artifact-chain.cjs');
const {inspect}=require('./github-review-evidence-integrity.cjs');
const A='a'.repeat(40);
const context={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,
 headSha:A,runId:123,attempt:1,artifactId:456};
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const report=()=>({schema:'palaco.citadel.atelier.github-review-evidence/1',
 source:'github_actions_readonly_api_observation',workflow_run_id:123,
 workflow_run_attempt:1,repository:context.repository,pr_number:60,candidate_sha:A,
 review_count:0,matching_approved_review_count:0,collection_complete:true,
 review_list_issues:[],decision:'HOLD',publication:'DENY',release_approved:false,
 evidence_usable:false,
 limitation:'An observation artifact cannot replace current authenticated GitHub review verification'});
const observed=()=>({schema:'palaco.citadel.atelier.github-artifact-metadata/1',
 artifact_id:456,repository:context.repository,run_id:123,head_sha:A,
 github_zip_digest:'sha256:'+'f'.repeat(64),artifact_bytes:1100,
 result:'GITHUB_METADATA_OBSERVED',decision:'HOLD',publication:'DENY',
 release_approved:false,evidence_usable:false,
 limitation:'REST metadata attests GitHub-reported ZIP digest, not locally verified ZIP bytes or release approval'});
const unavailable=()=>({schema:'palaco.citadel.atelier.github-artifact-metadata/1',
 artifact_id:456,repository:context.repository,run_id:123,head_sha:A,
 result:'GITHUB_METADATA_UNAVAILABLE',reason:'artifact_metadata_not_found_after_retries',
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
 limitation:'Artifact metadata unavailable; no GitHub ZIP digest or authenticated artifact verification'});
const sample=(observation=observed())=>{
 const review=encode(report());return [review,encode(inspect(review,context)),encode(observation)];
};
test('observed metadata and review pair match run and commit, still HOLD',()=>{
 const r=checkChain(...sample(),context);
 assert.equal(r.result,'CHAIN_METADATA_CONSISTENT');
 assert.equal(r.github_zip_digest,'sha256:'+'f'.repeat(64));
 assert.equal(r.decision,'HOLD');assert.equal(r.release_approved,false);
 assert.equal(r.evidence_usable,false);
});
test('unavailable API metadata is never presented as verified or signed',()=>{
 const r=checkChain(...sample(unavailable()),context);
 assert.equal(r.result,'CHAIN_METADATA_UNAVAILABLE');
 assert.equal(r.github_zip_digest,null);assert.equal(r.publication,'DENY');
});
test('wrong artifact id, PR head, run id or review content fail',()=>{
 const [review,receipt,metadata]=sample();
 assert.throws(()=>checkChain(review,receipt,metadata,{...context,artifactId:457}),/does not match evidence pair context/);
 const wrong={...observed(),run_id:999};
 assert.throws(()=>checkChain(review,receipt,encode(wrong),context),/does not match evidence pair context/);
 const altered=report();altered.review_count=1;
 assert.throws(()=>checkChain(encode(altered),receipt,metadata,context),/does not match report bytes/);
 assert.throws(()=>checkChain(review,receipt,metadata,{...context,headSha:'b'.repeat(40)}),/does not match exact workflow context/);
});
test('unknown metadata fields, duplicate keys, and false GO are rejected',()=>{
 const [review,receipt,metadata]=sample();
 const extra={...observed(),reviewer:'private'};
 assert.throws(()=>checkChain(review,receipt,encode(extra),context),/untrusted fields or ordering/);
 const duplicated=metadata.toString().replace('  "decision": "HOLD",',
  '  "decision": "GO",\n  "decision": "HOLD",');
 assert.throws(()=>checkChain(review,receipt,Buffer.from(duplicated),context),/Noncanonical metadata observation/);
 const forbidden={...observed(),release_approved:true};
 assert.throws(()=>checkChain(review,receipt,encode(forbidden),context),/Invalid artifact metadata diagnostic/);
});
