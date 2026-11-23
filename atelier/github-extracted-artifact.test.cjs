'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {compareExtracted}=require('./github-extracted-artifact.cjs');
const {inspect}=require('./github-review-evidence-integrity.cjs');
const A='a'.repeat(40);
const ctx={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,headSha:A,runId:123,attempt:1};
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-artifact-extracted-'));
 const original=path.join(root,'original'),download=path.join(root,'download');
 fs.mkdirSync(original);fs.mkdirSync(download);
 const report={schema:'palaco.citadel.atelier.github-review-evidence/1',
  source:'github_actions_readonly_api_observation',workflow_run_id:123,workflow_run_attempt:1,
  repository:ctx.repository,pr_number:60,candidate_sha:A,review_count:0,
  matching_approved_review_count:0,collection_complete:true,review_list_issues:[],
  decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false,
  limitation:'An observation artifact cannot replace current authenticated GitHub review verification'};
 const bytes=encode(report),receipt=encode(inspect(bytes,ctx));
 for(const dir of [original,download]){
  fs.writeFileSync(path.join(dir,'atelier-review-evidence.json'),bytes);
  fs.writeFileSync(path.join(dir,'atelier-review-integrity.json'),receipt);
 }
 try{fn({original,download});}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('downloaded and extracted evidence files match originals without GO',()=>fixture(({original,download})=>{
 const result=compareExtracted(download,original,ctx);
 assert.equal(result.result,'EXTRACTED_BYTES_MATCH');
 assert.equal(result.pair_result,'PAIR_VERIFIED');
 assert.equal(result.decision,'HOLD');
 assert.equal(result.evidence_usable,false);
 assert.match(result.evidence_sha256,/^[a-f0-9]{64}$/);
}));
test('single changed byte in extracted evidence or receipt is rejected',()=>fixture(({original,download})=>{
 const target=path.join(download,'atelier-review-evidence.json');
 fs.appendFileSync(target,' ');
 assert.throws(()=>compareExtracted(download,original,ctx),/bytes differ/);
 fs.copyFileSync(path.join(original,'atelier-review-evidence.json'),target);
 fs.appendFileSync(path.join(download,'atelier-review-integrity.json'),' ');
 assert.throws(()=>compareExtracted(download,original,ctx),/bytes differ/);
}));
test('extra files, missing receipt and nested paths are rejected',()=>fixture(({original,download})=>{
 const unexpected=path.join(download,'unexpected.txt');fs.writeFileSync(unexpected,'x');
 assert.throws(()=>compareExtracted(download,original,ctx),/exactly two/);
 fs.rmSync(unexpected);
 fs.rmSync(path.join(download,'atelier-review-integrity.json'));
 assert.throws(()=>compareExtracted(download,original,ctx),/exactly two/);
}));
test('downloaded evidence cannot impersonate a different run or commit',()=>fixture(({original,download})=>{
 assert.throws(()=>compareExtracted(download,original,{...ctx,runId:124}),/does not match exact workflow context/);
 assert.throws(()=>compareExtracted(download,original,{...ctx,headSha:'b'.repeat(40)}),/does not match exact workflow context/);
}));

test('oversized downloaded source is rejected before reading into memory',()=>fixture(({original,download})=>{
 fs.writeFileSync(path.join(download,'atelier-review-evidence.json'),Buffer.alloc(20001));
 assert.throws(()=>compareExtracted(download,original,ctx),/bounded regular file/);
}));
test('downloaded symlink cannot substitute evidence, even if its target is valid',()=>fixture(({original,download})=>{
 const target=path.join(download,'atelier-review-evidence.json');
 fs.unlinkSync(target);
 fs.symlinkSync(path.join(original,'atelier-review-evidence.json'),target);
 assert.throws(()=>compareExtracted(download,original,ctx),/exactly two regular JSON files|ELOOP/);
}));
test('the original CI source is also required to be a bounded regular file',()=>fixture(({original,download})=>{
 fs.writeFileSync(path.join(original,'atelier-review-integrity.json'),Buffer.alloc(20001));
 assert.throws(()=>compareExtracted(download,original,ctx),/bounded regular file/);
}));

test('downloaded byte comparison writes a bound read-only receipt',()=>fixture(({original,download})=>{
 const {run}=require('./github-extracted-artifact.cjs');
 const out=path.join(path.dirname(original),'extracted-check.json');
 const env={GITHUB_REPOSITORY:ctx.repository,PALACO_PR_NUMBER:'60',
  PALACO_EXPECTED_HEAD_SHA:ctx.headSha,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
  PALACO_ARTIFACT_ID:'456',PALACO_EXTRACTED_REPORT_PATH:out};
 const result=run([download,original],env);
 const receipt=JSON.parse(fs.readFileSync(out,'utf8'));
 assert.equal(receipt.artifact_id,456);
 assert.equal(receipt.evidence_sha256,result.evidence_sha256);
 assert.equal(receipt.integrity_receipt_sha256,result.integrity_receipt_sha256);
 assert.equal(receipt.decision,'HOLD');
 assert.equal(receipt.evidence_usable,false);
 assert.throws(()=>run([download,original],env),/EEXIST/);
}));
test('invalid artifact context or mismatched downloaded bytes never writes receipt',()=>fixture(({original,download})=>{
 const {run}=require('./github-extracted-artifact.cjs');
 const out=path.join(path.dirname(original),'extracted-check.json');
 const env={GITHUB_REPOSITORY:ctx.repository,PALACO_PR_NUMBER:'60',
  PALACO_EXPECTED_HEAD_SHA:ctx.headSha,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
  PALACO_ARTIFACT_ID:'0',PALACO_EXTRACTED_REPORT_PATH:out};
 assert.throws(()=>run([download,original],env),/Missing exact GitHub review artifact ID/);
 assert.equal(fs.existsSync(out),false);
 env.PALACO_ARTIFACT_ID='456';
 fs.appendFileSync(path.join(download,'atelier-review-integrity.json'),'x');
 assert.throws(()=>run([download,original],env),/bytes differ/);
 assert.equal(fs.existsSync(out),false);
}));
