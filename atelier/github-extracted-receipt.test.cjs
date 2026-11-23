'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspect}=require('./github-review-evidence-integrity.cjs');
const {compareExtracted}=require('./github-extracted-artifact.cjs');
const {verifyReceipt}=require('./github-extracted-receipt.cjs');
const A='a'.repeat(40);
const ctx={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,
 headSha:A,runId:123,attempt:1,artifactId:456};
const enc=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-receipt-'));
 const original=path.join(root,'source'),download=path.join(root,'download');
 fs.mkdirSync(original);fs.mkdirSync(download);
 const report={schema:'palaco.citadel.atelier.github-review-evidence/1',
  source:'github_actions_readonly_api_observation',workflow_run_id:123,
  workflow_run_attempt:1,repository:ctx.repository,pr_number:60,candidate_sha:A,
  review_count:0,matching_approved_review_count:0,collection_complete:true,
  review_list_issues:[],decision:'HOLD',publication:'DENY',
  release_approved:false,evidence_usable:false,
  limitation:'An observation artifact cannot replace current authenticated GitHub review verification'};
 const raw=enc(report);
 for(const dir of [original,download]){
  fs.writeFileSync(path.join(dir,'atelier-review-evidence.json'),raw);
  fs.writeFileSync(path.join(dir,'atelier-review-integrity.json'),enc(inspect(raw,ctx)));
 }
 const receipt=enc({...compareExtracted(download,original,ctx),artifact_id:456});
 try{fn({original,download,receipt});}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('retained receipt recalculates both source hashes and remains HOLD',()=>fixture(({original,download,receipt})=>{
 const result=verifyReceipt(receipt,download,original,ctx);
 assert.equal(result.result,'RECEIPT_RECOMPUTED');
 assert.equal(result.artifact_id,456);
 assert.equal(result.decision,'HOLD');
 assert.equal(result.evidence_usable,false);
}));
test('receipt from another run, attempt, head or artifact is rejected',()=>fixture(({original,download,receipt})=>{
 for(const context of [{...ctx,artifactId:457},{...ctx,runId:124},
  {...ctx,attempt:2},{...ctx,headSha:'b'.repeat(40)}])
  assert.throws(()=>verifyReceipt(receipt,download,original,context),/does not match|workflow context/);
}));
test('tampered receipt, extra fields and ambiguous JSON bytes are rejected',()=>fixture(({original,download,receipt})=>{
 const decoded=JSON.parse(receipt.toString('utf8'));
 decoded.evidence_sha256='f'.repeat(64);
 assert.throws(()=>verifyReceipt(enc(decoded),download,original,ctx),/does not match/);
 decoded.evidence_sha256=JSON.parse(receipt.toString()).evidence_sha256;
 decoded.release_approved=true;
 assert.throws(()=>verifyReceipt(enc(decoded),download,original,ctx),/does not match/);
 decoded.release_approved=false;decoded.privateField='do not keep';
 assert.throws(()=>verifyReceipt(enc(decoded),download,original,ctx),/Noncanonical or unexpected/);
 assert.throws(()=>verifyReceipt(Buffer.concat([receipt,Buffer.from(' ')]),download,original,ctx),/Noncanonical or unexpected/);
}));
test('a modified downloaded file cannot satisfy an old matching receipt',()=>fixture(({original,download,receipt})=>{
 fs.appendFileSync(path.join(download,'atelier-review-evidence.json'),' ');
 assert.throws(()=>verifyReceipt(receipt,download,original,ctx),/bytes differ/);
}));
