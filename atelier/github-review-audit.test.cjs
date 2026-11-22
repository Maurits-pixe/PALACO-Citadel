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
