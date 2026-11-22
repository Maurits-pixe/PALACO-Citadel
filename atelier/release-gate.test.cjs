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
