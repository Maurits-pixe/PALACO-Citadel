'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verifyCurrentHead,check}=require('./github-pr-head-freshness.cjs');
const sha='a'.repeat(40);
const expected={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,candidateSha:sha};
const pr=()=>({number:60,state:'open',head:{sha,repo:{full_name:expected.repository}},
 base:{repo:{full_name:expected.repository}}});
test('current exact open PR head returns only HOLD/DENY observation',()=>{
 const r=verifyCurrentHead(pr(),expected);
 assert.equal(r.result,'CURRENT_HEAD_OBSERVED');
 assert.equal(r.decision,'HOLD');assert.equal(r.publication,'DENY');
 assert.equal(r.release_approved,false);assert.equal(r.evidence_usable,false);
});
test('newer head, closed PR and fork or changed target repository fail',()=>{
 for(const changed of [
  {...pr(),head:{...pr().head,sha:'b'.repeat(40)}},
  {...pr(),state:'closed'},
  {...pr(),head:{...pr().head,repo:{full_name:'other/fork'}}},
  {...pr(),base:{repo:{full_name:'other/repo'}}}
 ])assert.throws(()=>verifyCurrentHead(changed,expected),/PR changed or is not/);
});
test('read-only lookup checks expected endpoint and treats API errors as failures',async()=>{
 let requested;
 const observed=await check({...expected,token:'test',request:async url=>{
  requested=url;return pr();
 }});
 assert.equal(requested,'https://api.github.com/repos/Maurits-pixe/PALACO-Citadel/pulls/60');
 assert.equal(observed.result,'CURRENT_HEAD_OBSERVED');
 await assert.rejects(()=>check({...expected,token:'test',
  request:async()=>{throw Error('GitHub unavailable');}}),/GitHub unavailable/);
 await assert.rejects(()=>check({...expected,prNumber:0,token:'test',
  request:async()=>pr()}),/Invalid PR freshness observer arguments/);
});
