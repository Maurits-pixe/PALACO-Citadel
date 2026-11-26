'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {base,append,canonical}=require('./github-incident-ledger.cjs');
const {commit}=require('./github-atomic-incident-archive.cjs');
const {readOnlyAssessment}=require('./github-incident-recovery.cjs');
function witnessReport(){return canonical({
 schema:'palaco.citadel.atelier.checkpoint-witness-incident/1',
 result:'CHECKPOINT_SPLIT_VIEW_OR_STALE_OBSERVATION',
 repository:'Maurits-pixe/PALACO-Citadel',checkpoint_sequence:1,
 checkpoint_sha256:'a'.repeat(64),observer_ids:['observer-a','observer-b'],
 observations:[{sequence:1,sha256:'a'.repeat(64)},{sequence:1,sha256:'b'.repeat(64)}],
 incident:true,decision:'HOLD',publication:'DENY',release_approved:false,
 evidence_usable:false,limitation:'Synthetic test data'})}
function bundle(prior,id){
 const ledger=append(prior,'OPEN',id,witnessReport()),r=ledger.records.at(-1);
 return {ledger,proof:{schema:'palaco.citadel.atelier.authenticated-incident-proof/1',
 kind:r.kind,incident_id:id,sequence:r.sequence,record_sha256:r.record_sha256,
 evidence_sha256:r.evidence_sha256,decision:'HOLD',publication:'DENY',
 release_approved:false,evidence_usable:false}};
}
function run(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-recovery-'));
 try{fn(root)}finally{fs.rmSync(root,{recursive:true,force:true});}}
function partial(root,prior,id,mode='before'){
 try{commit(root,bundle(prior,id),prior,mode==='before'?{failBeforeCommit:true}:{failAfterLedger:true});}
 catch(e){if(!/Injected/.test(e.message))throw e;}
 const stages=fs.readdirSync(root).filter(x=>x.startsWith('.prepare-'));
 assert.equal(stages.length,1);return stages[0];
}
test('complete quarantined archive is assessed read-only without promotion',()=>run(root=>{
 const before=canonical(base()),stage=partial(root,before,'incident-one');
 const r=readOnlyAssessment(root,stage,before);
 assert.equal(r.result,'QUARANTINED_ARCHIVE_INTEGRITY_CHECK_PASSED');
 assert.equal(r.promotion_performed,false);
 assert.equal(r.recovery_authorized,false);
 assert.equal(r.release_approved,false);
 assert.ok(fs.existsSync(path.join(root,stage)));
 assert.equal(fs.readdirSync(root).filter(x=>x.startsWith('commit-')).length,0);
}));
test('missing proof or manifest is rejected, never automatically recreated',()=>run(root=>{
 const before=canonical(base()),stage=partial(root,before,'incident-one','ledger');
 assert.throws(()=>readOnlyAssessment(root,stage,before),/Incomplete or extra/);
 assert.equal(fs.readdirSync(path.join(root,stage)).length,1);
}));
test('tampering or extra archive file is denied',()=>run(root=>{
 const before=canonical(base()),stage=partial(root,before,'incident-one');
 fs.appendFileSync(path.join(root,stage,'proof.json'),' ');
 assert.throws(()=>readOnlyAssessment(root,stage,before),/changed/);
 fs.writeFileSync(path.join(root,stage,'proof.json'),canonical(bundle(before,'incident-one').proof));
 fs.writeFileSync(path.join(root,stage,'extra.json'),'{}');
 assert.throws(()=>readOnlyAssessment(root,stage,before),/Incomplete or extra/);
}));
test('stale lock and competing preparation prevent assessment',()=>run(root=>{
 const before=canonical(base()),stage=partial(root,before,'incident-one');
 fs.mkdirSync(path.join(root,'.writer-lock'));
 assert.throws(()=>readOnlyAssessment(root,stage,before),/Writer lock/);
 fs.rmdirSync(path.join(root,'.writer-lock'));
 fs.mkdirSync(path.join(root,'.prepare-commit-999999-aaaaaaaaaaaaaaaa'));
 assert.throws(()=>readOnlyAssessment(root,stage,before),/Multiple unresolved/);
}));
test('wrong predecessor or externally pinned floor cannot be bypassed',()=>run(root=>{
 const before=canonical(base()),stage=partial(root,before,'incident-one');
 const other=canonical(append(before,'OPEN','other-incident',witnessReport()));
 assert.throws(()=>readOnlyAssessment(root,stage,other),/length diverges|predecessor/);
 assert.throws(()=>readOnlyAssessment(root,stage,before,{sequence:1,head:'f'.repeat(64)}),/truncated/);
}));
test('symlinked files and forged stage identifiers fail closed',()=>run(root=>{
 const before=canonical(base()),stage=partial(root,before,'incident-one');
 const old=path.join(root,stage,'proof.json');
 const backup=path.join(root,'backup-proof.json');fs.renameSync(old,backup);fs.symlinkSync(backup,old);
 assert.throws(()=>readOnlyAssessment(root,stage,before),/ELOOP|symbolic link|symlink/);
 assert.throws(()=>readOnlyAssessment(root,'../'+stage,before),/Invalid recovery stage/);
}));
