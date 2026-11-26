'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {NAMES,buildManifest,verifyManifest}=require('./github-archive-manifest.cjs');
const ctx={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,
 headSha:'a'.repeat(40),runId:123,attempt:1,artifactId:456};
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function fixture(){
 const base={repository:ctx.repository,artifact_id:456,
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false};
 return {
  [NAMES[0]]:encode({...base,head_sha:ctx.headSha,run_id:123,
   github_zip_digest:'sha256:'+'1'.repeat(64)}),
  [NAMES[1]]:encode({...base,candidate_sha:ctx.headSha,workflow_run_id:123,
   workflow_run_attempt:1,pr_number:60}),
  [NAMES[2]]:encode({...base,candidate_sha:ctx.headSha,run_id:123,
   github_zip_digest:'sha256:'+'1'.repeat(64)}),
  [NAMES[3]]:encode({...base,candidate_sha:ctx.headSha,run_id:123,
   run_attempt:1,pr_number:60})
 };
}
test('four-file manifest uses deterministic SHA-256 and stays HOLD',()=>{
 const files=fixture(),manifest=buildManifest(files,ctx);
 assert.equal(manifest.result,'FOUR_DIAGNOSTICS_BOUND');
 assert.deepEqual(manifest.files.map(f=>f.name),NAMES);
 assert.equal(manifest.files.length,4);
 assert.ok(manifest.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)));
 assert.equal(manifest.release_approved,false);
 assert.equal(manifest.evidence_usable,false);
 assert.deepEqual(verifyManifest(encode(manifest),files,ctx),manifest);
});
test('changed diagnostic bytes never verify the previously stored manifest',()=>{
 const files=fixture(),saved=encode(buildManifest(files,ctx));
 const changed={...files,[NAMES[0]]:encode({...JSON.parse(files[NAMES[0]]),additional:'x'})};
 assert.throws(()=>verifyManifest(saved,changed,ctx),/differs from original/);
});
test('replayed artifact, commit, PR and attempt fail closed',()=>{
 const files=fixture(),saved=encode(buildManifest(files,ctx));
 for(const context of [{...ctx,artifactId:999},{...ctx,headSha:'b'.repeat(40)},
  {...ctx,prNumber:61},{...ctx,attempt:2}])
  assert.throws(()=>verifyManifest(saved,files,context),/mismatch|does not match/);
});
test('invented authority and missing or unexpected files are refused',()=>{
 const files=fixture();
 const forged={...files,[NAMES[2]]:encode({...JSON.parse(files[NAMES[2]]),release_approved:true})};
 assert.throws(()=>buildManifest(forged,ctx),/claims authority/);
 const missing={...files};delete missing[NAMES[3]];
 assert.throws(()=>buildManifest(missing,ctx),/Invalid final archive manifest/);
 const extra={...files,unknown:Buffer.from('x')};
 assert.throws(()=>buildManifest(extra,ctx),/Invalid final archive manifest/);
});
test('noncanonical JSON and tampered manifest fields are rejected',()=>{
 const files=fixture(),normal=buildManifest(files,ctx);
 assert.throws(()=>verifyManifest(Buffer.concat([encode(normal),Buffer.from(' ')]),files,ctx),
  /differs from original/);
 assert.throws(()=>verifyManifest(encode({...normal,release_approved:true}),files,ctx),
  /differs from original/);
 const swapped={...normal,files:[...normal.files].reverse()};
 assert.throws(()=>verifyManifest(encode(swapped),files,ctx),/differs from original/);
});
