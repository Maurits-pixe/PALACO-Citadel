'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {base,append,canonical}=require('./github-incident-ledger.cjs');
const {commit,inspectCommit}=require('./github-atomic-incident-archive.cjs');
const {sha}=require('./github-custodian-key-registry.cjs');
function evidence(){return canonical({
 schema:'palaco.citadel.atelier.checkpoint-witness-incident/1',
 result:'CHECKPOINT_SPLIT_VIEW_OR_STALE_OBSERVATION',
 repository:'Maurits-pixe/PALACO-Citadel',checkpoint_sequence:1,
 checkpoint_sha256:'a'.repeat(64),observer_ids:['observer-a','observer-b'],
 observations:[{sequence:1,sha256:'a'.repeat(64)},{sequence:1,sha256:'b'.repeat(64)}],
 incident:true,decision:'HOLD',publication:'DENY',release_approved:false,
 evidence_usable:false,limitation:'Synthetic witness report'})}
function bundle(before,id){
 const after=append(before,'OPEN',id,evidence()),record=after.records.at(-1);
 return {ledger:after,proof:{schema:'palaco.citadel.atelier.authenticated-incident-proof/1',
 kind:'OPEN',incident_id:id,sequence:record.sequence,record_sha256:record.record_sha256,
 evidence_sha256:record.evidence_sha256,decision:'HOLD',publication:'DENY',
 release_approved:false,evidence_usable:false}};
}
function scenario(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-atomic-'));
 try{fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('both files and commit manifest appear together in verified immutable directory',()=>scenario(root=>{
 const prior=canonical(base()),r=commit(root,bundle(prior,'incident-one'),prior);
 assert.deepEqual(fs.readdirSync(r.path).sort(),['commit-manifest.json','ledger.json','proof.json']);
 const checked=inspectCommit(r.path);
 assert.equal(checked.manifest.sequence,1);
 assert.equal(checked.manifest.decision,'HOLD');
 assert.equal(checked.manifest.release_approved,false);
}));
test('interrupted write never exposes a committed transaction and blocks retries',()=>scenario(root=>{
 const prior=canonical(base()),result=bundle(prior,'incident-one');
 assert.throws(()=>commit(root,result,prior,{failAfterLedger:true}),/Injected/);
 assert.equal(fs.readdirSync(root).filter(n=>n.startsWith('commit-')).length,0);
 assert.throws(()=>commit(root,result,prior),/Unresolved partial transaction/);
}));
test('second transaction requires exact prior ledger bytes',()=>scenario(root=>{
 const prior=canonical(base()),one=bundle(prior,'incident-one');
 const first=commit(root,one,prior);
 const next=bundle(canonical(one.ledger),'incident-two');
 assert.throws(()=>commit(root,next,prior),/append exactly one|history|Stale/);
 const second=commit(root,next,canonical(one.ledger));
 assert.equal(inspectCommit(second.path).manifest.sequence,2);
 assert.equal(inspectCommit(first.path).manifest.sequence,1);
}));
test('concurrent writer lock fails closed without removing lock owner',()=>scenario(root=>{
 const prior=canonical(base());fs.mkdirSync(path.join(root,'.writer-lock'));
 assert.throws(()=>commit(root,bundle(prior,'incident-one'),prior),/EEXIST/);
 assert.ok(fs.existsSync(path.join(root,'.writer-lock')));
}));
test('tampered proof, ledger bytes or extra files invalidate completed archive',()=>scenario(root=>{
 const prior=canonical(base()),r=commit(root,bundle(prior,'incident-one'),prior);
 const proof=path.join(r.path,'proof.json');fs.appendFileSync(proof,' ');
 assert.throws(()=>inspectCommit(r.path),/changed|manifest/);
 fs.writeFileSync(proof,canonical(bundle(prior,'incident-one').proof));
 fs.writeFileSync(path.join(r.path,'intruder.json'),'{}');
 assert.throws(()=>inspectCommit(r.path),/Incomplete or extra/);
}));
test('forged release or mismatched incident proof rejected before any writes',()=>scenario(root=>{
 const prior=canonical(base()),r=bundle(prior,'incident-one');
 r.proof.release_approved=true;
 assert.throws(()=>commit(root,r,prior),/Authenticated proof/);
 assert.equal(fs.readdirSync(root).length,0);
}));
