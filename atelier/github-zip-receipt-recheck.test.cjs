'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {validateMetadata}=require('./github-artifact-metadata.cjs');
const {verifyZip}=require('./github-zip-integrity.cjs');
const {verifyReceipt}=require('./github-zip-receipt-recheck.cjs');
const sha='a'.repeat(40);
const ctx={repository:'Maurits-pixe/PALACO-Citadel',runId:123,headSha:sha,artifactId:456};
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-zip-recheck-'));
 const zip=path.join(root,'artifact.zip');
 const bytes=Buffer.from('PK\u0003\u0004-tested-zip-archive-bytes');
 fs.writeFileSync(zip,bytes);
 const metadata=encode(validateMetadata({id:456,name:'atelier-review-evidence',expired:false,
  workflow_run:{id:123,head_sha:sha},
  digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),
  size_in_bytes:bytes.length,created_at:'2026-11-24T04:00:00Z',
  expires_at:'2026-11-30T04:00:00Z'},ctx));
 const receipt=encode(verifyZip(zip,metadata,ctx));
 try{fn({zip,bytes,metadata,receipt});}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('canonical receipt is recomputed against exact ZIP bytes and remains HOLD',()=>fixture(x=>{
 const r=verifyReceipt(x.receipt,x.zip,x.metadata,ctx);
 assert.equal(r.result,'ZIP_RECEIPT_RECOMPUTED');
 assert.equal(r.decision,'HOLD');assert.equal(r.publication,'DENY');
 assert.equal(r.release_approved,false);assert.equal(r.evidence_usable,false);
}));
test('stale commit, run and artifact receipt are refused',()=>fixture(x=>{
 for(const changed of [{...ctx,headSha:'b'.repeat(40)},
  {...ctx,runId:124},{...ctx,artifactId:457}])
  assert.throws(()=>verifyReceipt(x.receipt,x.zip,x.metadata,changed),
   /different candidate or artifact/);
}));
test('tampering, extra keys and noncanonical ZIP receipt are refused',()=>fixture(x=>{
 const changed=JSON.parse(x.receipt.toString('utf8'));
 changed.release_approved=true;
 assert.throws(()=>verifyReceipt(encode(changed),x.zip,x.metadata,ctx),/Stored ZIP receipt differs/);
 changed.release_approved=false;changed.extra='approve';
 assert.throws(()=>verifyReceipt(encode(changed),x.zip,x.metadata,ctx),/Invalid canonical ZIP receipt/);
 assert.throws(()=>verifyReceipt(Buffer.concat([x.receipt,Buffer.from(' ')]),
  x.zip,x.metadata,ctx),/Invalid canonical ZIP receipt/);
}));
test('changed ZIP and changed digest cannot validate a previous receipt',()=>fixture(x=>{
 const changed=Buffer.from(x.bytes);changed[8]^=3;fs.writeFileSync(x.zip,changed);
 assert.throws(()=>verifyReceipt(x.receipt,x.zip,x.metadata,ctx),/SHA-256 differs/);
 fs.writeFileSync(x.zip,x.bytes);
 const altered=JSON.parse(x.metadata.toString('utf8'));
 altered.github_zip_digest='sha256:'+'f'.repeat(64);
 assert.throws(()=>verifyReceipt(x.receipt,x.zip,encode(altered),ctx),/SHA-256 differs/);
}));
