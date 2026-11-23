'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {collect,safeReport}=require('./github-review-collector.cjs');
const A='a'.repeat(40),B='b'.repeat(40);
const pr=(sha=A)=>({number:60,head:{sha},user:{login:'creator'}});
const params=fetchJson=>({repository:'Maurits-pixe/PALACO-Citadel',number:60,token:'synthetic-test-token',fetchJson,now:'2026-11-23T04:00:00Z'});
test('read-only collection of empty review list remains HOLD',async()=>{
 let prCalls=0;
 const r=await collect(params(async url=>url.includes('/reviews?')?[]:(prCalls++,pr())));
 assert.equal(prCalls,2);
 assert.equal(r.review_count,0);
 assert.equal(r.collection_complete,true);
 assert.equal(r.decision,'HOLD');
 assert.equal(r.evidence_usable,false);
});
test('collection follows pages until incomplete final page',async()=>{
 let reviewCalls=0;
 const r=await collect(params(async url=>{
  if(!url.includes('/reviews?'))return pr();
  reviewCalls++;
  return reviewCalls===1?Array.from({length:100},(_,i)=>({id:i+1,state:'COMMENTED'})):[];
 }));
 assert.equal(reviewCalls,2);
 assert.equal(r.review_count,100);
 assert.equal(r.collection_complete,true);
 assert.equal(r.release_approved,false);
});
test('head moves during review collection and is rejected',async()=>{
 let count=0;
 await assert.rejects(()=>collect(params(async url=>url.includes('/reviews?')?[]:(++count===1?pr(A):pr(B)))),/head changed/);
});
test('malformed or failed API page never becomes complete evidence',async()=>{
 await assert.rejects(()=>collect(params(async url=>url.includes('/reviews?')?{}:pr())),/Invalid review API page/);
 await assert.rejects(()=>collect(params(async url=>{if(url.includes('/reviews?'))throw Error('rate limited');return pr();})),/rate limited/);
});
test('full pagination boundary is incomplete rather than falsely successful',async()=>{
 const r=await collect(params(async url=>url.includes('/reviews?')?Array.from({length:100},(_,i)=>({id:i+1,state:'COMMENTED'})):pr()));
 assert.equal(r.collection_complete,false);
 assert.ok(r.review_list_issues.includes('incomplete_pagination'));
 assert.equal(r.decision,'HOLD');
});

test('exportable review report contains only approved fields and no reviewer identities',()=>{
 const report=safeReport({
  pr_number:60,candidate_sha:A,review_count:1,
  matching_approved_review_count:1,collection_complete:true,
  review_list_issues:[],
  approved:[{reviewer:'SENSITIVE_REVIEWER',body:'PRIVATE_REVIEW_BODY'}],
  token:'SECRET_TOKEN',decision:'GO',publication:'PUBLIC',release_approved:true
 },12345);
 const encoded=JSON.stringify(report);
 assert.equal(report.workflow_run_id,12345);
 assert.equal(report.decision,'HOLD');
 assert.equal(report.publication,'DENY');
 assert.equal(report.release_approved,false);
 assert.equal(report.evidence_usable,false);
 assert.equal(report.candidate_sha,A);
 for(const secret of ['SENSITIVE_REVIEWER','PRIVATE_REVIEW_BODY','SECRET_TOKEN','"approved":'])assert.equal(encoded.includes(secret),false);
});
test('non-finite or missing workflow run does not become a forged GitHub run ID',()=>{
 const x={pr_number:60,candidate_sha:A,review_count:0,matching_approved_review_count:0,
  collection_complete:false,review_list_issues:['incomplete_pagination']};
 assert.equal(safeReport(x,NaN).workflow_run_id,null);
 assert.equal(safeReport(x,-1).workflow_run_id,null);
 assert.equal(safeReport(x,0).workflow_run_id,null);
 assert.equal(safeReport(x,1).workflow_run_id,1);
 assert.equal(safeReport(x,1).collection_complete,false);
});

test('workflow event SHA mismatch rejects live PR observation before review listing',async()=>{
 let reviewsCalled=false;
 await assert.rejects(()=>collect({...params(async url=>{
  if(url.includes('/reviews?')){reviewsCalled=true;return [];}
  return pr(B);
 }),expectedHead:A}),/does not match workflow event commit/);
 assert.equal(reviewsCalled,false);
});
test('matching workflow event SHA remains read-only HOLD',async()=>{
 const r=await collect({...params(async url=>url.includes('/reviews?')?[]:pr(A)),expectedHead:A});
 assert.equal(r.candidate_sha,A);
 assert.equal(r.decision,'HOLD');
 assert.equal(r.evidence_usable,false);
});
test('sanitized report binds repository, workflow attempt and run without identities',()=>{
 const summary=safeReport({pr_number:60,candidate_sha:A,review_count:0,
  matching_approved_review_count:0,collection_complete:true,review_list_issues:[]},
  45111383043,2,'Maurits-pixe/PALACO-Citadel');
 assert.equal(summary.repository,'Maurits-pixe/PALACO-Citadel');
 assert.equal(summary.workflow_run_id,45111383043);
 assert.equal(summary.workflow_run_attempt,2);
 assert.equal(summary.release_approved,false);
 const invalid=safeReport({pr_number:60,candidate_sha:A,review_count:0,
  matching_approved_review_count:0,collection_complete:false},1,0,'invalid repository!');
 assert.equal(invalid.repository,null);
 assert.equal(invalid.workflow_run_attempt,null);
});

test('untrusted review issue text is never serialized into evidence artifact',()=>{
 const report=safeReport({pr_number:60,candidate_sha:A,review_count:1,
  matching_approved_review_count:0,collection_complete:true,
  review_list_issues:['SECRET_PERSONAL_NOTE']},77,1,'Maurits-pixe/PALACO-Citadel');
 assert.deepEqual(report.review_list_issues,['invalid_review_issue_list']);
 assert.equal(report.collection_complete,false);
 assert.equal(JSON.stringify(report).includes('SECRET_PERSONAL_NOTE'),false);
 assert.equal(report.decision,'HOLD');
});
test('malformed counts and candidate SHA cannot become trustworthy evidence',()=>{
 const report=safeReport({pr_number:60,candidate_sha:'NOT_A_SHA',
  review_count:3,matching_approved_review_count:4,collection_complete:true,
  review_list_issues:[]},77,1,'Maurits-pixe/PALACO-Citadel');
 assert.equal(report.candidate_sha,null);
 assert.equal(report.collection_complete,false);
 assert.equal(report.evidence_usable,false);
 const oversized=safeReport({pr_number:-1,candidate_sha:A,review_count:1001,
  matching_approved_review_count:-1,collection_complete:true,review_list_issues:[]});
 assert.equal(oversized.pr_number,null);
 assert.equal(oversized.review_count,null);
 assert.equal(oversized.matching_approved_review_count,null);
 assert.equal(oversized.collection_complete,false);
});
test('known issue codes deduplicate and prevent complete classification',()=>{
 const r=safeReport({pr_number:60,candidate_sha:A,review_count:0,
  matching_approved_review_count:0,collection_complete:true,
  review_list_issues:['incomplete_pagination','incomplete_pagination']});
 assert.deepEqual(r.review_list_issues,['incomplete_pagination']);
 assert.equal(r.collection_complete,false);
});
