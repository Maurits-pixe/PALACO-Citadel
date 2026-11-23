'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {audit}=require('./github-review-audit.cjs');
const A='a'.repeat(40),B='b'.repeat(40);
const options=reviews=>({reviews,candidateSha:A,prNumber:60,authorLogin:'Author'});
const review=(overrides={})=>({id:123,state:'APPROVED',commit_id:A,
 user:{login:'IndependentReviewer'},html_url:'https://github.com/Maurits-pixe/PALACO-Citadel/pull/60#pullrequestreview-123',...overrides});
test('empty GitHub review list is HOLD with zero approvals',()=>{
 const result=audit(options([]));
 assert.equal(result.review_count,0);
 assert.equal(result.matching_approved_review_count,0);
 assert.equal(result.decision,'HOLD');
 assert.equal(result.publication,'DENY');
 assert.equal(result.release_approved,false);
});
test('exact-commit approved review is listed diagnostically, never authorizes',()=>{
 const result=audit(options([review()]));
 assert.equal(result.matching_approved_review_count,1);
 assert.equal(result.decision,'HOLD');
 assert.equal(result.release_approved,false);
});
test('wrong SHA, self-review, and non-approval are all rejected',()=>{
 const result=audit(options([
  review({commit_id:B}),
  review({user:{login:'AUTHOR'}}),
  review({state:'COMMENTED'})
 ]));
 assert.equal(result.matching_approved_review_count,0);
 assert.ok(result.rejected.some(r=>r.reasons.includes('wrong_commit')));
 assert.ok(result.rejected.some(r=>r.reasons.includes('not_independent')));
 assert.ok(result.rejected.some(r=>r.reasons.includes('not_approved')));
});
test('mismatched review URL or PR number is rejected',()=>{
 const result=audit(options([review({html_url:'https://github.com/Maurits-pixe/PALACO-Citadel/pull/61#pullrequestreview-123'})]));
 assert.ok(result.rejected[0].reasons.includes('invalid_review_identity'));
});
test('invalid API metadata fails closed',()=>{
 assert.throws(()=>audit(options(null)),/Ongeldige GitHub-reviewinvoer/);
 assert.throws(()=>audit({...options([]),candidateSha:'bad'}),/Ongeldige GitHub-reviewinvoer/);
 assert.throws(()=>audit({...options([]),prNumber:0}),/Ongeldige GitHub-reviewinvoer/);
});

test('later changes-requested review revokes previously approved review',()=>{
 const result=audit(options([
  review({submitted_at:'2026-11-21T08:00:00Z'}),
  review({id:124,state:'CHANGES_REQUESTED',submitted_at:'2026-11-21T09:00:00Z',
    html_url:'https://github.com/Maurits-pixe/PALACO-Citadel/pull/60#pullrequestreview-124'})
 ]));
 assert.equal(result.matching_approved_review_count,0);
 assert.ok(result.rejected.some(r=>r.reasons.includes('superseded_review')));
 assert.ok(result.rejected.some(r=>r.reasons.includes('not_approved')));
 assert.equal(result.decision,'HOLD');
});
test('later approved review on old commit cannot rescue earlier exact-commit approval',()=>{
 const result=audit(options([
  review({submitted_at:'2026-11-21T08:00:00Z'}),
  review({id:124,commit_id:B,submitted_at:'2026-11-21T10:00:00Z',
    html_url:'https://github.com/Maurits-pixe/PALACO-Citadel/pull/60#pullrequestreview-124'})
 ]));
 assert.equal(result.matching_approved_review_count,0);
 assert.ok(result.rejected.some(r=>r.reasons.includes('wrong_commit')));
});
test('unknown review chronology is ambiguous and fails closed',()=>{
 const result=audit(options([review(),review({id:124,
   html_url:'https://github.com/Maurits-pixe/PALACO-Citadel/pull/60#pullrequestreview-124'})]));
 assert.equal(result.matching_approved_review_count,0);
 assert.ok(result.rejected.every(r=>r.reasons.includes('ambiguous_review_history')));
});
test('duplicate GitHub review ID invalidates both copies',()=>{
 const result=audit(options([review(),review()]));
 assert.equal(result.matching_approved_review_count,0);
 assert.ok(result.rejected.every(r=>r.reasons.includes('duplicate_review_id')));
});
test('later current-commit approval can be inspected but never grants release',()=>{
 const result=audit(options([
  review({state:'COMMENTED',submitted_at:'2026-11-21T08:00:00Z'}),
  review({id:124,submitted_at:'2026-11-21T09:00:00Z',
    html_url:'https://github.com/Maurits-pixe/PALACO-Citadel/pull/60#pullrequestreview-124'})
 ]));
 assert.equal(result.matching_approved_review_count,1);
 assert.equal(result.release_approved,false);
 assert.equal(result.decision,'HOLD');
});

test('missing provenance cannot establish complete review history',()=>{
 const r=audit(options([review()]));
 assert.ok(r.review_list_issues.includes('missing_fetch_provenance'));
 assert.equal(r.review_list_complete_claim,false);
 assert.equal(r.evidence_usable,false);
 assert.equal(r.decision,'HOLD');
});
test('partial pagination and a missing review count fail closed',()=>{
 const provenance={pr_number:60,head_sha:A,total_count:2,pagination_complete:false,
  has_next_page:true,fetched_at:'2026-11-23T03:00:00Z'};
 const r=audit({...options([review()]),provenance,now:'2026-11-23T03:05:00Z'});
 assert.ok(r.review_list_issues.includes('incomplete_pagination'));
 assert.ok(r.review_list_issues.includes('incomplete_review_count'));
 assert.equal(r.evidence_usable,false);
});
test('stale or future fetch timestamps are rejected',()=>{
 const provenance={pr_number:60,head_sha:A,total_count:0,pagination_complete:true,
  has_next_page:false,fetched_at:'2026-11-23T01:00:00Z'};
 const stale=audit({...options([]),provenance,now:'2026-11-23T03:00:00Z'});
 assert.ok(stale.review_list_issues.includes('stale_or_invalid_fetch_time'));
 const future=audit({...options([]),provenance:{...provenance,fetched_at:'2026-11-23T04:00:00Z'},now:'2026-11-23T03:00:00Z'});
 assert.ok(future.review_list_issues.includes('stale_or_invalid_fetch_time'));
});
test('review-list metadata bound to different PR or head cannot be accepted',()=>{
 const provenance={pr_number:61,head_sha:B,total_count:0,pagination_complete:true,
  has_next_page:false,fetched_at:'2026-11-23T03:00:00Z'};
 const r=audit({...options([]),provenance,now:'2026-11-23T03:05:00Z'});
 assert.ok(r.review_list_issues.includes('wrong_pr_provenance'));
 assert.ok(r.review_list_issues.includes('stale_head_provenance'));
});
test('plausibly complete metadata is diagnostic and cannot attest its own origin',()=>{
 const provenance={pr_number:60,head_sha:A,total_count:1,pagination_complete:true,
  has_next_page:false,fetched_at:'2026-11-23T03:00:00Z'};
 const r=audit({...options([review()]),provenance,now:'2026-11-23T03:05:00Z'});
 assert.equal(r.review_list_complete_claim,true);
 assert.deepEqual(r.review_list_issues,[]);
 assert.equal(r.evidence_usable,false);
 assert.equal(r.matching_approved_review_count,1);
 assert.equal(r.release_approved,false);
 assert.equal(r.decision,'HOLD');
});
