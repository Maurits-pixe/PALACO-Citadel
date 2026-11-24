'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verify}=require('./github-diagnostic-zip-verify.cjs');
const bytes=Buffer.from('test archive bytes');
const ctx={repository:'Maurits-pixe/PALACO-Citadel',headSha:'a'.repeat(40),runId:456,artifactId:789};
const meta=()=>({id:789,name:'atelier-artifact-metadata-observation',expired:false,
 workflow_run:{id:456,head_sha:'a'.repeat(40)},
 digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),
 size_in_bytes:bytes.length,
 created_at:'2026-11-24T06:00:00Z',expires_at:'2026-12-01T06:00:00Z'});
test('matching GitHub report and exact ZIP remains HOLD/DENY',()=>{
 const result=verify(bytes,meta(),ctx);
 assert.equal(result.result,'GITHUB_DIAGNOSTIC_ZIP_MATCH');
 assert.equal(result.release_approved,false);
 assert.equal(result.publication,'DENY');
});
test('different downloaded ZIP bytes and size are rejected',()=>{
 assert.throws(()=>verify(Buffer.from('tampered bytes'),meta(),ctx),/ZIP bytes differ/);
 assert.throws(()=>verify(bytes,{...meta(),size_in_bytes:bytes.length+1},ctx),/ZIP bytes differ/);
});
test('replayed run, head or artifact ID is rejected',()=>{
 for(const mutation of [{runId:111},{headSha:'b'.repeat(40)},{artifactId:12}])
  assert.throws(()=>verify(bytes,meta(),{...ctx,...mutation}),/does not match/);
});
test('wrong artifact name, expired artifact and forged digest are rejected',()=>{
 for(const mutation of [{name:'atelier-review-evidence'},{expired:true},
  {digest:'sha256:'+'f'.repeat(64)},{workflow_run:{id:42,head_sha:ctx.headSha}}]){
  const metadata={...meta(),...mutation};
  assert.throws(()=>verify(bytes,metadata,ctx),/does not match|ZIP bytes differ/);
 }
});
test('unbounded archive and malformed GitHub metadata fail closed',()=>{
 assert.throws(()=>verify(Buffer.alloc(200001),meta(),ctx),/Invalid archive/);
 assert.throws(()=>verify(bytes,{...meta(),digest:'bad'},ctx),/does not match/);
 assert.throws(()=>verify(bytes,{...meta(),expires_at:'2020-01-01T00:00:00Z'},ctx),/does not match/);
});
