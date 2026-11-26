'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspect}=require('./github-review-evidence-integrity.cjs');
const A='a'.repeat(40);
const ctx={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,headSha:A,runId:123,attempt:1};
const record=()=>({
 schema:'palaco.citadel.atelier.github-review-evidence/1',
 source:'github_actions_readonly_api_observation',
 workflow_run_id:123,workflow_run_attempt:1,
 repository:ctx.repository,pr_number:60,candidate_sha:A,
 review_count:0,matching_approved_review_count:0,collection_complete:true,
 review_list_issues:[],decision:'HOLD',publication:'DENY',
 release_approved:false,evidence_usable:false,
 limitation:'An observation artifact cannot replace current authenticated GitHub review verification'
});
const bytes=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
test('matching complete review report yields local SHA256 and never GO',()=>{
 const raw=bytes(record());const r=inspect(raw,ctx);
 assert.match(r.report_sha256,/^[a-f0-9]{64}$/);
 assert.equal(r.decision,'HOLD');
 assert.equal(r.release_approved,false);
 assert.equal(r.evidence_usable,false);
 assert.equal(r.result,'INTEGRITY_CHECKED');
});
test('tampered workflow context always fails',()=>{
 const raw=bytes(record());
 for(const field of ['repository','prNumber','headSha','runId','attempt']){
  const different={...ctx,[field]:field==='headSha'?'b'.repeat(40):
   field==='repository'?'other/repository':999};
  assert.throws(()=>inspect(raw,different),/does not match exact workflow context/);
 }
});
test('promoted authorization and injected private fields are rejected',()=>{
 for(const [key,value] of [['decision','GO'],['publication','PUBLIC'],
  ['release_approved',true],['evidence_usable',true],['reviewer_email','private@example.test']]){
  const x=record();x[key]=value;
  assert.throws(()=>inspect(bytes(x),ctx),/Report boundary invalid|Unexpected report structure/);
 }
});
test('invalid counts and unexpected diagnostics are rejected',()=>{
 const x=record();x.review_count=1;x.matching_approved_review_count=2;
 assert.throws(()=>inspect(bytes(x),ctx),/observations inconsistent/);
 x.matching_approved_review_count=0;
 x.review_list_issues=['untrusted secret'];
 assert.throws(()=>inspect(bytes(x),ctx),/observations inconsistent/);
});
test('complete reports cannot contain blockers and truncated files are rejected',()=>{
 const x=record();x.review_list_issues=['incomplete_pagination'];
 assert.throws(()=>inspect(bytes(x),ctx),/observations inconsistent/);
 assert.throws(()=>inspect(Buffer.alloc(0),ctx),/byte length/);
 assert.throws(()=>inspect(Buffer.alloc(20001),ctx),/byte length/);
});

test('duplicate JSON keys are rejected even if parsed value looks correct',()=>{
 const raw=bytes(record()).toString('utf8');
 const duplicate=raw.replace('  "decision": "HOLD",','  "decision": "GO",\n  "decision": "HOLD",');
 assert.notEqual(duplicate,raw);
 assert.throws(()=>inspect(Buffer.from(duplicate),ctx),/Noncanonical review evidence JSON bytes/);
});
test('unexpected whitespace, UTF-8 BOM or appended bytes cannot be verified',()=>{
 const raw=bytes(record());
 assert.throws(()=>inspect(Buffer.from(JSON.stringify(record())+'\n'),ctx),/Noncanonical review evidence JSON bytes/);
 assert.throws(()=>inspect(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),raw]),ctx));
 assert.throws(()=>inspect(Buffer.concat([raw,Buffer.from(' ')]),ctx),/Noncanonical review evidence JSON bytes/);
});
test('canonical writer output is accepted and returns the exact raw-byte SHA256',()=>{
 const raw=bytes(record());
 const result=inspect(raw,ctx);
 const crypto=require('node:crypto');
 assert.equal(result.report_sha256,crypto.createHash('sha256').update(raw).digest('hex'));
 assert.equal(result.decision,'HOLD');
 assert.equal(result.evidence_usable,false);
});

test('integrity receipt records exact report bytes and CI context without granting GO',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-review-'));
 try{
  const source=path.join(dir,'review.json'),receipt=path.join(dir,'integrity.json');
  const raw=bytes(record());fs.writeFileSync(source,raw);
  const {run}=require('./github-review-evidence-integrity.cjs');
  const env={GITHUB_REPOSITORY:ctx.repository,PALACO_PR_NUMBER:String(ctx.prNumber),
   PALACO_EXPECTED_HEAD_SHA:ctx.headSha,GITHUB_RUN_ID:String(ctx.runId),
   GITHUB_RUN_ATTEMPT:String(ctx.attempt),PALACO_REVIEW_INTEGRITY_PATH:receipt};
  const result=run([source],env);
  const saved=JSON.parse(fs.readFileSync(receipt,'utf8'));
  assert.deepEqual(saved,result);
  assert.equal(saved.candidate_sha,A);
  assert.equal(saved.decision,'HOLD');
  assert.equal(saved.evidence_usable,false);
  assert.throws(()=>run([source],env),/EEXIST/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('an invalid source cannot produce an integrity receipt',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-review-bad-'));
 try{
  const source=path.join(dir,'bad.json'),receipt=path.join(dir,'integrity.json');
  const bad=record();bad.decision='GO';fs.writeFileSync(source,bytes(bad));
  const {run}=require('./github-review-evidence-integrity.cjs');
  assert.throws(()=>run([source],{GITHUB_REPOSITORY:ctx.repository,
   PALACO_PR_NUMBER:'60',PALACO_EXPECTED_HEAD_SHA:ctx.headSha,
   GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',PALACO_REVIEW_INTEGRITY_PATH:receipt}),/Report boundary invalid/);
  assert.equal(fs.existsSync(receipt),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
