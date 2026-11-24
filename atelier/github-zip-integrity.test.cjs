'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {verifyZip}=require('./github-zip-integrity.cjs');
const {validateMetadata}=require('./github-artifact-metadata.cjs');
const sha='a'.repeat(40);
const ctx={repository:'Maurits-pixe/PALACO-Citadel',runId:123,headSha:sha,artifactId:456};
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-zip-hash-'));
 const zip=path.join(dir,'evidence.zip'),bytes=Buffer.from('PK\u0003\u0004-original-downloaded-archive-bytes');
 fs.writeFileSync(zip,bytes);
 const digest='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 const metadata=()=>validateMetadata({
  id:456,name:'atelier-review-evidence',expired:false,
  workflow_run:{id:123,head_sha:sha},digest,size_in_bytes:bytes.length,
  created_at:'2026-11-24T04:00:00Z',expires_at:'2026-11-30T04:00:00Z'
 },ctx);
 try{fn({zip,bytes,digest,metadata});}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('exact ZIP bytes and reported digest match, but cannot authorize',()=>fixture(({zip,digest,metadata})=>{
 const r=verifyZip(zip,encode(metadata()),ctx);
 assert.equal(r.result,'DOWNLOADED_ZIP_DIGEST_MATCH');
 assert.equal(r.github_zip_digest,digest);
 assert.equal(r.release_approved,false);
 assert.equal(r.evidence_usable,false);
 assert.equal(r.decision,'HOLD');assert.equal(r.publication,'DENY');
}));
test('changed ZIP bytes with same size fail closed',()=>fixture(({zip,bytes,metadata})=>{
 const modified=Buffer.from(bytes);modified[10]^=1;fs.writeFileSync(zip,modified);
 assert.throws(()=>verifyZip(zip,encode(metadata()),ctx),/SHA-256 differs/);
}));
test('wrong ZIP length, run identity or artifact ID are rejected',()=>fixture(({zip,metadata})=>{
 const report=metadata();
 assert.throws(()=>verifyZip(zip,encode({...report,artifact_bytes:report.artifact_bytes+1}),ctx),/size differs/);
 assert.throws(()=>verifyZip(zip,encode(report),{...ctx,runId:124}),/different candidate or artifact/);
 assert.throws(()=>verifyZip(zip,encode(report),{...ctx,artifactId:457}),/different candidate or artifact/);
}));
test('unavailable or manipulated observation never claims ZIP verification',()=>fixture(({zip,metadata})=>{
 const good=metadata();
 const unavailable={schema:good.schema,artifact_id:456,repository:ctx.repository,
  run_id:123,head_sha:sha,result:'GITHUB_METADATA_UNAVAILABLE',
  reason:'artifact_metadata_not_found_after_retries',decision:'HOLD',publication:'DENY',
  release_approved:false,evidence_usable:false,
  limitation:'Artifact metadata unavailable; no GitHub ZIP digest or authenticated artifact verification'};
 assert.throws(()=>verifyZip(zip,encode(unavailable),ctx),/digest unavailable/);
 assert.throws(()=>verifyZip(zip,encode({...good,release_approved:true}),ctx),/Invalid artifact metadata diagnostic/);
 assert.throws(()=>verifyZip(zip,encode({...good,unexpected:'secret'}),ctx),/Noncanonical/);
}));
test('symlink and excessive ZIP size are rejected before hashing',()=>fixture(({zip,metadata})=>{
 const linked=zip+'.link';fs.symlinkSync(zip,linked);
 assert.throws(()=>verifyZip(linked,encode(metadata()),ctx),/ELOOP/);
 fs.writeFileSync(zip,Buffer.alloc(100001));
 assert.throws(()=>verifyZip(zip,encode(metadata()),ctx),/bounded regular file/);
}));

test('validated ZIP writes exclusive canonical HOLD receipt with exact metadata binding',()=>fixture(({zip,metadata})=>{
 const {run}=require('./github-zip-integrity.cjs');
 const receipt=zip+'.receipt.json';
 const meta=zip+'.metadata.json';
 fs.writeFileSync(meta,encode(metadata()));
 const env={GITHUB_REPOSITORY:ctx.repository,GITHUB_RUN_ID:'123',
  PALACO_EXPECTED_HEAD_SHA:sha,PALACO_ARTIFACT_ID:'456',
  PALACO_ZIP_INTEGRITY_REPORT_PATH:receipt};
 const result=run([zip,meta],env);
 const saved=fs.readFileSync(receipt);
 assert.deepEqual(JSON.parse(saved.toString()),result);
 assert.equal(saved.toString(),JSON.stringify(result,null,2)+'\n');
 assert.equal(result.release_approved,false);
 assert.throws(()=>run([zip,meta],env),/EEXIST/);
 assert.deepEqual(JSON.parse(fs.readFileSync(receipt)),result);
}));
test('changed ZIP or unavailable metadata cannot produce a receipt',()=>fixture(({zip,metadata})=>{
 const {run}=require('./github-zip-integrity.cjs');
 const receipt=zip+'.receipt.json';
 const meta=zip+'.metadata.json';
 fs.writeFileSync(meta,encode(metadata()));
 const env={GITHUB_REPOSITORY:ctx.repository,GITHUB_RUN_ID:'123',
  PALACO_EXPECTED_HEAD_SHA:sha,PALACO_ARTIFACT_ID:'456',
  PALACO_ZIP_INTEGRITY_REPORT_PATH:receipt};
 fs.appendFileSync(zip,'x');
 assert.throws(()=>run([zip,meta],env),/size differs/);
 assert.equal(fs.existsSync(receipt),false);
 fs.writeFileSync(zip,Buffer.from('PK\u0003\u0004-original-downloaded-archive-bytes'));
 const observed=metadata();
 delete observed.github_zip_digest;
 fs.writeFileSync(meta,encode(observed));
 assert.throws(()=>run([zip,meta],env),/Invalid verified artifact metadata fields/);
 assert.equal(fs.existsSync(receipt),false);
}));
