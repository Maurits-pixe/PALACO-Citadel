'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {collect}=require('./github-review-collector.cjs');
const A='a'.repeat(40),B='b'.repeat(40);
const pr=(sha=A)=>({number:60,head:{sha},user:{login:'creator'}});
const params=fetchJson=>({repository:'Maurits-pixe/PALACO-Citadel',number:60,token:'synthetic-test-token',fetchJson,now:'2026-11-23T04:00:00Z'});
test('read-only collection of empty review list remains HOLD',async()=>{
 let prCalls=0;
 const r=await collect(params(async url=>url.includes('/reviews?')?[]:(prCalls++,pr())));
 assert.equal(prCalls,2);
 assert.equal(r.review_count,0);
 assert.equal(r.collection_complete,true);
 assert.equal(r.decision,'HOLD');
 assert.equal(r.evidence_usable,false);
});
test('collection follows pages until incomplete final page',async()=>{
 let reviewCalls=0;
 const r=await collect(params(async url=>{
  if(!url.includes('/reviews?'))return pr();
  reviewCalls++;
  return reviewCalls===1?Array.from({length:100},(_,i)=>({id:i+1,state:'COMMENTED'})):[];
 }));
 assert.equal(reviewCalls,2);
 assert.equal(r.review_count,100);
 assert.equal(r.collection_complete,true);
 assert.equal(r.release_approved,false);
});
test('head moves during review collection and is rejected',async()=>{
 let count=0;
 await assert.rejects(()=>collect(params(async url=>url.includes('/reviews?')?[]:(++count===1?pr(A):pr(B)))),/head changed/);
});
test('malformed or failed API page never becomes complete evidence',async()=>{
 await assert.rejects(()=>collect(params(async url=>url.includes('/reviews?')?{}:pr())),/Invalid review API page/);
 await assert.rejects(()=>collect(params(async url=>{if(url.includes('/reviews?'))throw Error('rate limited');return pr();})),/rate limited/);
});
test('full pagination boundary is incomplete rather than falsely successful',async()=>{
 const r=await collect(params(async url=>url.includes('/reviews?')?Array.from({length:100},(_,i)=>({id:i+1,state:'COMMENTED'})):pr()));
 assert.equal(r.collection_complete,false);
 assert.ok(r.review_list_issues.includes('incomplete_pagination'));
 assert.equal(r.decision,'HOLD');
});
