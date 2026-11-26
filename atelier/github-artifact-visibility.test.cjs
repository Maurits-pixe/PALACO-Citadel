'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspectListing,awaitVisibility}=require('./github-artifact-visibility.cjs');
const sha='a'.repeat(40);
const context={repository:'Maurits-pixe/PALACO-Citadel',runId:123,artifactId:456,headSha:sha};
const item=()=>({id:456,name:'atelier-review-evidence',expired:false,size_in_bytes:1102,
 workflow_run:{id:123,head_sha:sha}});
const listing=(artifacts=[item()])=>({total_count:artifacts.length,artifacts});
test('exact indexed artifact is read-only evidence without authorization',async()=>{
 const r=await awaitVisibility({...context,token:'test',
  fetchJson:async url=>{
   assert.equal(url,'https://api.github.com/repos/Maurits-pixe/PALACO-Citadel/actions/runs/123/artifacts?per_page=100');
   return listing();
  }});
 assert.equal(r.result,'ARTIFACT_LISTED');assert.equal(r.attempt,1);
 assert.equal(r.decision,'HOLD');assert.equal(r.evidence_usable,false);
});
test('bounded visibility retries 404 and empty listing without claiming GO',async()=>{
 let calls=0,waits=[];
 const r=await awaitVisibility({...context,token:'test',
  wait:async ms=>{waits.push(ms);},
  fetchJson:async()=>{
   calls++;
   if(calls===1){const e=Error('404');e.statusCode=404;throw e;}
   return calls===2?listing([]):listing();
  }});
 assert.equal(calls,3);assert.deepEqual(waits,[2000,2000]);
 assert.equal(r.attempt,3);
});
test('not indexed after eight tries fails closed',async()=>{
 let calls=0;
 await assert.rejects(()=>awaitVisibility({...context,token:'test',
  wait:async()=>{},fetchJson:async()=>{calls++;return listing([]);}}),
  /not listed after bounded visibility checks/);
 assert.equal(calls,8);
});
test('wrong artifact run, digest context or duplicates are refused',()=>{
 for(const altered of [
  {...item(),name:'other'},
  {...item(),expired:true},
  {...item(),size_in_bytes:0},
  {...item(),workflow_run:{id:124,head_sha:sha}},
  {...item(),workflow_run:{id:123,head_sha:'b'.repeat(40)}}
 ])assert.throws(()=>inspectListing(listing([altered]),context),/contradicts candidate evidence context/);
 assert.throws(()=>inspectListing(listing([item(),item()]),context),/Duplicate artifact ID/);
});
test('non-404 API failures and invalid contexts are refused without retry',async()=>{
 let calls=0;
 await assert.rejects(()=>awaitVisibility({...context,token:'test',wait:async()=>{},
  fetchJson:async()=>{calls++;const e=Error('forbidden');e.statusCode=403;throw e;}}),
  /forbidden/);
 assert.equal(calls,1);
 await assert.rejects(()=>awaitVisibility({...context,runId:0,token:'test',
  fetchJson:async()=>listing()}),/Invalid expected artifact visibility context/);
});
