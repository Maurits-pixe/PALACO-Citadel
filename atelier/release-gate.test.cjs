'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluate,GATES,REQUIRED}=require('./release-gate.cjs');
const A='a'.repeat(40),B='b'.repeat(40);
const base=()=>({schema:'palaco.citadel.atelier.release-evidence/1',state:'DRAFT',authority:'NONE',observed_commit_sha:A,release_approved:false,evidence_items:[]});
test('historical snapshot cannot approve a newer candidate',()=>{
 const result=evaluate(base(),B);
 assert.equal(result.decision,'HOLD');
 assert.equal(result.publication,'DENY');
 assert.equal(result.matching_commit,false);
 assert.ok(result.blockers.includes('stale_or_mismatched_commit'));
 assert.equal(result.gates.length,8);
 assert.ok(result.gates.every(g=>g.pass===false));
});
test('missing independent checks remain visible even when automated workflow passed',()=>{
 const x=base();
 x.evidence_items=[
  {gate:'G05',kind:'browser_accessibility',result:'pass',reviewed:true,source:'GitHub Actions run 1',commit_sha:A},
  {gate:'G07',kind:'actions_all_required',result:'pass',reviewed:true,source:'GitHub Actions run 1',commit_sha:A}
 ];
 const r=evaluate(x,A);
 assert.deepEqual(r.gates.find(g=>g.id==='G05').missing,['manual_screenreader','physical_mobile']);
 assert.deepEqual(r.gates.find(g=>g.id==='G07').missing,['deploy_all_required','independent_review']);
 assert.equal(r.release_approved,false);
});
test('unreviewed, ungrounded, stale and failed evidence are not counted',()=>{
 const x=base();
 x.evidence_items=[
  {gate:'G01',kind:'automated_contracts',result:'pass',reviewed:false,source:'CI',commit_sha:A},
  {gate:'G02',kind:'automated_recovery',result:'pass',reviewed:true,source:'CI',commit_sha:B},
  {gate:'G02',kind:'browser_preservation',result:'pass',reviewed:true,source:'',commit_sha:A},
  {gate:'G03',kind:'browser_two_tabs',result:'fail',reviewed:true,source:'CI',commit_sha:A}
 ];
 const r=evaluate(x,A);
 for(const id of ['G01','G02','G03'])assert.ok(r.gates.find(g=>g.id===id).missing.length);
});
test('even a claimed GO on a local draft cannot override fail-closed authority boundary',()=>{
 const x=base();
 x.release_approved=true;
 x.authority='OWNER';
 x.evidence_items=GATES.flatMap(gate=>REQUIRED[gate].map(kind=>({gate,kind,result:'pass',reviewed:true,source:'self-reported',commit_sha:A})));
 const r=evaluate(x,A);
 assert.equal(r.decision,'HOLD');
 assert.equal(r.publication,'DENY');
 assert.equal(r.release_approved,false);
 assert.ok(r.blockers.includes('invalid_draft_boundary'));
 assert.ok(r.gates.every(g=>g.pass===false));
});
test('untrusted registry input rejects missing candidate SHA',()=>{
 assert.throws(()=>evaluate(base(),'not-a-commit'),/Ongeldige bewijsregistratie/);
 assert.throws(()=>evaluate(null,A),/Ongeldige bewijsregistratie/);
});

test('malformed registry schema is refused instead of silently evaluated',()=>{
 const x=base();x.schema='palaco.citadel.atelier.release-evidence/unknown';
 assert.throws(()=>evaluate(x,A),/Ongeldige bewijsregistratie/);
});
test('unexpected evidence kind or gate is rejected rather than silently ignored',()=>{
 const x=base();x.evidence_items=[
  {gate:'G99',kind:'automated_contracts',result:'pass',reviewed:true,source:'CI',commit_sha:A}
 ];
 assert.throws(()=>evaluate(x,A),/Ongbekende|Onbekende of ongeldige bewijsregel/);
 x.evidence_items[0].gate='G01';x.evidence_items[0].kind='unapproved_release';
 assert.throws(()=>evaluate(x,A),/Onbekende of ongeldige bewijsregel/);
});
test('malformed evidence items and oversized registries are rejected',()=>{
 const x=base();x.evidence_items={unexpected:'record'};
 assert.throws(()=>evaluate(x,A),/Ongeldige bewijsregels/);
 x.evidence_items=Array(1001).fill(null);
 assert.throws(()=>evaluate(x,A),/Ongeldige bewijsregels/);
 x.evidence_items=[null];
 assert.throws(()=>evaluate(x,A),/Onbekende of ongeldige bewijsregel/);
});
test('valid evidence remains only diagnostic, never GO',()=>{
 const x=base();x.evidence_items=[
  {gate:'G01',kind:'automated_contracts',result:'pass',reviewed:true,source:'GitHub Actions logged test',commit_sha:A}
 ];
 const r=evaluate(x,A);
 assert.deepEqual(r.gates.find(g=>g.id==='G01').accepted,['automated_contracts']);
 assert.equal(r.release_approved,false);
 assert.equal(r.decision,'HOLD');
});

test('contradictory reviewed PASS and FAIL for same gate and commit blocks category',()=>{
 const x=base();x.evidence_items=[
  {gate:'G01',kind:'automated_contracts',result:'pass',reviewed:true,source:'CI one',commit_sha:A},
  {gate:'G01',kind:'automated_contracts',result:'fail',reviewed:true,source:'CI two',commit_sha:A}
 ];
 const r=evaluate(x,A),gate=r.gates.find(g=>g.id==='G01');
 assert.deepEqual(gate.accepted,[]);
 assert.deepEqual(gate.missing,['automated_contracts']);
 assert.deepEqual(gate.conflicts,['automated_contracts']);
 assert.ok(r.blockers.includes('G01:conflicting_evidence:automated_contracts'));
 assert.equal(r.decision,'HOLD');
});
test('verified FAIL alone cannot be masked as passing evidence',()=>{
 const x=base();x.evidence_items=[
  {gate:'G04',kind:'automated_rollback',result:'fail',reviewed:true,source:'Regression run',commit_sha:A}
 ];
 const gate=evaluate(x,A).gates.find(g=>g.id==='G04');
 assert.deepEqual(gate.accepted,[]);
 assert.deepEqual(gate.missing,['automated_rollback']);
 assert.deepEqual(gate.conflicts,[]);
});
test('failure from a different commit does not contaminate current candidate',()=>{
 const x=base();x.evidence_items=[
  {gate:'G01',kind:'automated_contracts',result:'pass',reviewed:true,source:'current CI',commit_sha:A},
  {gate:'G01',kind:'automated_contracts',result:'fail',reviewed:true,source:'historical CI',commit_sha:B}
 ];
 const gate=evaluate(x,A).gates.find(g=>g.id==='G01');
 assert.deepEqual(gate.accepted,['automated_contracts']);
 assert.deepEqual(gate.conflicts,[]);
 assert.equal(gate.pass,false);
});

test('identical reviewed source twice cannot count as additional proof',()=>{
 const x=base();const item={gate:'G01',kind:'automated_contracts',result:'pass',reviewed:true,source:'GitHub run 123',commit_sha:A};
 x.evidence_items=[item,{...item}];
 const r=evaluate(x,A),gate=r.gates.find(g=>g.id==='G01');
 assert.deepEqual(gate.duplicates,['automated_contracts']);
 assert.deepEqual(gate.accepted,[]);
 assert.deepEqual(gate.missing,['automated_contracts']);
 assert.ok(r.blockers.includes('G01:duplicate_evidence:automated_contracts'));
});
test('different actual sources are not falsely classified as duplicated',()=>{
 const x=base();
 x.evidence_items=[
  {gate:'G01',kind:'automated_contracts',result:'pass',reviewed:true,source:'GitHub run 123',commit_sha:A},
  {gate:'G01',kind:'automated_contracts',result:'pass',reviewed:true,source:'GitHub run 124',commit_sha:A}
 ];
 const gate=evaluate(x,A).gates.find(g=>g.id==='G01');
 assert.deepEqual(gate.duplicates,[]);
 assert.deepEqual(gate.accepted,['automated_contracts']);
});
test('independent-review evidence without distinct reviewer and author is not accepted',()=>{
 const x=base();const item={gate:'G07',kind:'independent_review',result:'pass',reviewed:true,source:'review claim',commit_sha:A};
 x.evidence_items=[{...item,reviewer_id:'same',author_id:'same'}];
 const r=evaluate(x,A),gate=r.gates.find(g=>g.id==='G07');
 assert.deepEqual(gate.reviewGaps,['independent_review']);
 assert.ok(gate.missing.includes('independent_review'));
 assert.ok(r.blockers.includes('G07:reviewer_independence_unverified:independent_review'));
 x.evidence_items=[{...item}];
 assert.ok(evaluate(x,A).gates.find(g=>g.id==='G07').reviewGaps.includes('independent_review'));
});
test('distinct reviewer and author without GitHub review provenance are still blocked',()=>{
 const x=base();x.evidence_items=[
  {gate:'G07',kind:'independent_review',result:'pass',reviewed:true,source:'GitHub PR review 1',commit_sha:A,reviewer_id:'reviewer',author_id:'author'}
 ];
 const r=evaluate(x,A),gate=r.gates.find(g=>g.id==='G07');
 assert.ok(gate.reviewGaps.includes('independent_review'));
 assert.ok(gate.missing.includes('independent_review'));
 assert.equal(r.decision,'HOLD');
});
test('review evidence with exact GitHub PR review link is diagnostic only',()=>{
 const x=base();x.evidence_items=[
  {gate:'G07',kind:'independent_review',result:'pass',reviewed:true,source:'GitHub PR review 123',commit_sha:A,
   reviewer_id:'reviewer',author_id:'author',pull_request_number:60,github_review_id:123,
   reviewed_commit_sha:A,review_url:'https://github.com/Maurits-pixe/PALACO-Citadel/pull/60#pullrequestreview-123'}
 ];
 const r=evaluate(x,A),gate=r.gates.find(g=>g.id==='G07');
 assert.ok(gate.accepted.includes('independent_review'));
 assert.equal(gate.pass,false);
 assert.equal(r.release_approved,false);
 assert.equal(r.decision,'HOLD');
});
test('review of older commit or mismatched review identifier never counts',()=>{
 const record={gate:'G07',kind:'independent_review',result:'pass',reviewed:true,source:'GitHub PR review 123',commit_sha:A,
   reviewer_id:'reviewer',author_id:'author',pull_request_number:60,github_review_id:123,
   reviewed_commit_sha:B,review_url:'https://github.com/Maurits-pixe/PALACO-Citadel/pull/60#pullrequestreview-123'};
 const x=base();x.evidence_items=[record];
 assert.ok(evaluate(x,A).gates.find(g=>g.id==='G07').reviewGaps.includes('independent_review'));
 record.reviewed_commit_sha=A;
 record.github_review_id=999;
 assert.ok(evaluate(x,A).gates.find(g=>g.id==='G07').reviewGaps.includes('independent_review'));
 record.github_review_id=123;
 record.reviewer_id=' AUTHOR ';
 assert.ok(evaluate(x,A).gates.find(g=>g.id==='G07').reviewGaps.includes('independent_review'));
});
