'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateMetadata,observe}=require('./github-artifact-metadata.cjs');
const A='a'.repeat(40),B='b'.repeat(40);
const ctx={repository:'Maurits-pixe/PALACO-Citadel',runId:45125345188,headSha:A,artifactId:14795661114};
const metadata=()=>({id:ctx.artifactId,name:'atelier-review-evidence',
 expired:false,workflow_run:{id:ctx.runId,head_sha:A},
 digest:'sha256:'+'f'.repeat(64),size_in_bytes:1102,
 created_at:'2026-11-23T07:00:00Z',expires_at:'2026-11-30T07:00:00Z'});
test('exact GitHub metadata is diagnostic and never permits release',()=>{
 const result=validateMetadata(metadata(),ctx);
 assert.equal(result.github_zip_digest,'sha256:'+'f'.repeat(64));
 assert.equal(result.result,'GITHUB_METADATA_OBSERVED');
 assert.equal(result.decision,'HOLD');assert.equal(result.release_approved,false);
 assert.equal(result.evidence_usable,false);
});
test('incorrect run, head, id, name and expired artifacts are rejected',()=>{
 const differences=[{id:1},{name:'unrelated'},{expired:true},
  {workflow_run:{id:ctx.runId,head_sha:B}},
  {workflow_run:{id:ctx.runId+1,head_sha:A}}];
 for(const diff of differences)assert.throws(
  ()=>validateMetadata({...metadata(),...diff},ctx),/does not match expected run and head/);
});
test('missing or malformed digest and unrealistic lifetime are rejected',()=>{
 for(const diff of [{digest:null},{digest:'sha256:bad'},{size_in_bytes:0},
  {created_at:'invalid'},{expires_at:'2026-11-20T00:00:00Z'}])
  assert.throws(()=>validateMetadata({...metadata(),...diff},ctx),/does not match expected run and head/);
});
test('read-only GitHub artifact lookup requests exact artifact endpoint',async()=>{
 let url;
 const result=await observe({...ctx,token:'test-token',
  fetchJson:async requested=>{url=requested;return metadata();}});
 assert.equal(url,'https://api.github.com/repos/Maurits-pixe/PALACO-Citadel/actions/artifacts/14795661114');
 assert.equal(result.publication,'DENY');
});
test('API errors and invalid caller context fail closed',async()=>{
 await assert.rejects(()=>observe({...ctx,token:'test',fetchJson:async()=>{throw Error('API denied');}}),/API denied/);
 await assert.rejects(()=>observe({...ctx,artifactId:0,token:'test',fetchJson:async()=>metadata()}),/Invalid artifact observation arguments/);
});

test('temporarily unavailable metadata retries then verifies exact GitHub artifact',async()=>{
 let attempts=0,waits=[];
 const result=await observe({...ctx,token:'test',wait:async ms=>{waits.push(ms);},
  fetchJson:async()=>{attempts++;if(attempts<3){const e=Error('404');e.statusCode=404;throw e;}return metadata();}});
 assert.equal(attempts,3);
 assert.deepEqual(waits,[500,1500]);
 assert.equal(result.result,'GITHUB_METADATA_OBSERVED');
 assert.equal(result.decision,'HOLD');
 assert.equal(result.evidence_usable,false);
});
test('persistently missing artifact metadata is explicitly unverified and denies release',async()=>{
 let attempts=0;
 const result=await observe({...ctx,token:'test',wait:async()=>{},
  fetchJson:async()=>{attempts++;const e=Error('404');e.statusCode=404;throw e;}});
 assert.equal(attempts,3);
 assert.equal(result.result,'GITHUB_METADATA_UNAVAILABLE');
 assert.equal(result.reason,'artifact_metadata_not_found_after_retries');
 assert.equal(result.decision,'HOLD');
 assert.equal(result.publication,'DENY');
 assert.equal(result.release_approved,false);
 assert.equal(result.evidence_usable,false);
 assert.equal(result.github_zip_digest,undefined);
});
test('available but mismatched artifact metadata still fails closed',async()=>{
 await assert.rejects(()=>observe({...ctx,token:'test',wait:async()=>{},
  fetchJson:async()=>({...metadata(),digest:'invalid'})}),/does not match expected run and head/);
});
test('non-404 API access failure is never converted into verified evidence',async()=>{
 let attempts=0;
 await assert.rejects(()=>observe({...ctx,token:'test',wait:async()=>{},
  fetchJson:async()=>{attempts++;const e=Error('forbidden');e.statusCode=403;throw e;}}),/forbidden/);
 assert.equal(attempts,1);
});
