'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {inspect}=require('./github-review-evidence-integrity.cjs');
const {validateMetadata}=require('./github-artifact-metadata.cjs');
const {compareExtracted}=require('./github-extracted-artifact.cjs');
const {verifyZip}=require('./github-zip-integrity.cjs');
const {verifyAll}=require('./github-final-artifact-witness.cjs');
const sha='a'.repeat(40);
const ctx={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,
 headSha:sha,runId:123,attempt:1,artifactId:456};
const enc=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-final-witness-'));
 const originalDir=path.join(root,'original'),downloadDir=path.join(root,'download');
 fs.mkdirSync(originalDir);fs.mkdirSync(downloadDir);
 const report={schema:'palaco.citadel.atelier.github-review-evidence/1',
  source:'github_actions_readonly_api_observation',workflow_run_id:123,
  workflow_run_attempt:1,repository:ctx.repository,pr_number:60,candidate_sha:sha,
  review_count:0,matching_approved_review_count:0,collection_complete:true,
  review_list_issues:[],decision:'HOLD',publication:'DENY',
  release_approved:false,evidence_usable:false,
  limitation:'An observation artifact cannot replace current authenticated GitHub review verification'};
 const review=enc(report),integrity=enc(inspect(review,ctx));
 for(const dir of [originalDir,downloadDir]){
  fs.writeFileSync(path.join(dir,'atelier-review-evidence.json'),review);
  fs.writeFileSync(path.join(dir,'atelier-review-integrity.json'),integrity);
 }
 const downloadedZip=path.join(root,'download.zip');
 const zipBytes=Buffer.from('PK\u0003\u0004-consistent-final-witness');
 fs.writeFileSync(downloadedZip,zipBytes);
 const metadata=enc(validateMetadata({id:456,name:'atelier-review-evidence',expired:false,
  workflow_run:{id:123,head_sha:sha},
  digest:'sha256:'+crypto.createHash('sha256').update(zipBytes).digest('hex'),
  size_in_bytes:zipBytes.length,created_at:'2026-11-24T04:00:00Z',
  expires_at:'2026-11-30T04:00:00Z'},ctx));
 const extractedReceipt=enc({...compareExtracted(downloadDir,originalDir,ctx),artifact_id:456});
 const zipReceipt=enc(verifyZip(downloadedZip,metadata,ctx));
 const input={review,integrity,metadata,extractedReceipt,zipReceipt,downloadedZip,downloadDir,originalDir};
 try{fn(input);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('complete original/extracted/ZIP witness stays read-only HOLD',()=>fixture(input=>{
 const result=verifyAll(input,ctx);
 assert.equal(result.result,'ALL_LOCAL_ARTIFACT_CHECKS_CONSISTENT');
 assert.equal(result.artifact_id,456);
 assert.equal(result.decision,'HOLD');assert.equal(result.publication,'DENY');
 assert.equal(result.evidence_usable,false);assert.equal(result.release_approved,false);
}));
test('different candidate and run are rejected across all subwitnesses',()=>fixture(input=>{
 for(const changed of [{...ctx,headSha:'b'.repeat(40)},
  {...ctx,runId:124},{...ctx,artifactId:457}])
  assert.throws(()=>verifyAll(input,changed),/does not match|different candidate/);
}));
test('changed downloaded evidence or ZIP bytes cannot match final witness',()=>fixture(input=>{
 fs.appendFileSync(path.join(input.downloadDir,'atelier-review-evidence.json'),'x');
 assert.throws(()=>verifyAll(input,ctx),/bytes differ/);
 fs.copyFileSync(path.join(input.originalDir,'atelier-review-evidence.json'),
  path.join(input.downloadDir,'atelier-review-evidence.json'));
 fs.appendFileSync(input.downloadedZip,'x');
 assert.throws(()=>verifyAll(input,ctx),/size differs/);
}));
test('tampered retained ZIP or extracted receipt is refused',()=>fixture(input=>{
 const altered=JSON.parse(input.zipReceipt.toString());
 altered.release_approved=true;
 assert.throws(()=>verifyAll({...input,zipReceipt:enc(altered)},ctx),/Stored ZIP receipt differs/);
 const modified=JSON.parse(input.extractedReceipt.toString());
 modified.artifact_id=789;
 assert.throws(()=>verifyAll({...input,extractedReceipt:enc(modified)},ctx),/does not match/);
}));
test('missing GitHub metadata digest cannot produce a final witness',()=>fixture(input=>{
 const metadata=JSON.parse(input.metadata.toString());
 delete metadata.github_zip_digest;
 assert.throws(()=>verifyAll({...input,metadata:enc(metadata)},ctx),
  /Invalid verified artifact metadata fields/);
}));
