'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const {canonical,sha}=require('./github-custodian-key-registry.cjs');
const {DOMAIN}=require('./github-manual-recovery-review.cjs');
const {scan,write}=require('./github-spent-recovery-register.cjs');
const pairs=[crypto.generateKeyPairSync('ed25519'),crypto.generateKeyPairSync('ed25519')];
const trust=pairs.map((k,i)=>({reviewerId:'reviewer-'+i,
 publicKeyPem:k.publicKey.export({format:'pem',type:'spki'}),
 spkiSha256:sha(k.publicKey.export({format:'der',type:'spki'}))}));
const assessment=canonical({schema:'palaco.citadel.atelier.recovery-assessment/1',
 result:'QUARANTINED_ARCHIVE_INTEGRITY_CHECK_PASSED',
 recovery_authorized:false,promotion_performed:false,
 sequence:1,head_sha256:'a'.repeat(64),commit_name:'commit-000001-bbbbbbbbbbbbbbbb',
 stage_name:'.prepare-commit-000001-bbbbbbbbbbbbbbbb',
 archive_manifest_sha256:'c'.repeat(64),decision:'HOLD',publication:'DENY',
 release_approved:false,evidence_usable:false,limitation:'Test only'});
const now=Date.parse('2026-11-26T12:00:00Z');
function signed(i,decisionId){
 const payload={schema:'palaco.citadel.atelier.manual-recovery-review/1',
 reviewer_id:trust[i].reviewerId,assessment_sha256:sha(assessment),
 stage_name:'.prepare-commit-000001-bbbbbbbbbbbbbbbb',sequence:1,
 ledger_head_sha256:'a'.repeat(64),decision_id:decisionId,
 action:'ASSESSMENT_ACCEPTED_FOR_MANUAL_REVIEW',
 created_at:'2026-11-26T10:00:00Z',expires_at:'2026-11-27T10:00:00Z'};
 const signature=crypto.sign(null,Buffer.concat([Buffer.from(DOMAIN),canonical(payload)]),
 pairs[i].privateKey).toString('base64url');
 return canonical({payload,signature});
}
const approvals=id=>[signed(0,id),signed(1,id)];
const idA='d'.repeat(64),idB='e'.repeat(64);
function scenario(f){const root=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-spent-'));
 try{f(root)}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('signed review is consumed exactly once, with HOLD retained',()=>scenario(root=>{
 const r=write(root,assessment,approvals(idA),trust,now);
 assert.equal(r.decision,'HOLD');assert.equal(r.release_approved,false);
 assert.equal(scan(root).sequence,1);
 assert.deepEqual(scan(root).consumedIds,[idA]);
 assert.throws(()=>write(root,assessment,approvals(idA),trust,now),/Replay/);
}));
test('sequential consumption records chain to prior hash and pin floor',()=>scenario(root=>{
 const first=write(root,assessment,approvals(idA),trust,now);
 const second=write(root,assessment,approvals(idB),trust,now);
 const registry=scan(root,{sequence:1,head:first.record.entry_sha256});
 assert.equal(registry.sequence,2);
 assert.equal(second.record.previous_sha256,first.record.entry_sha256);
 assert.equal(registry.head,second.record.entry_sha256);
}));
test('externally pinned floor blocks truncation and mismatched head',()=>scenario(root=>{
 const first=write(root,assessment,approvals(idA),trust,now);
 assert.throws(()=>scan(root,{sequence:2,head:'f'.repeat(64)}),/rollback/);
 assert.throws(()=>scan(root,{sequence:1,head:'f'.repeat(64)}),/divergent/);
 assert.equal(scan(root,{sequence:1,head:first.record.entry_sha256}).sequence,1);
}));
test('interrupted transaction is quarantined and prevents reuse',()=>scenario(root=>{
 assert.throws(()=>write(root,assessment,approvals(idA),trust,now,undefined,
  {failBeforeRename:true}),/Injected/);
 assert.equal(fs.readdirSync(root).filter(n=>n.startsWith('spent-')).length,0);
 assert.throws(()=>write(root,assessment,approvals(idA),trust,now),/Unresolved/);
}));
test('concurrent writer lock is never taken over or removed',()=>scenario(root=>{
 fs.mkdirSync(path.join(root,'.spent-writer-lock'));
 assert.throws(()=>write(root,assessment,approvals(idA),trust,now),/EEXIST/);
 assert.equal(fs.existsSync(path.join(root,'.spent-writer-lock')),true);
}));
test('tampering, unknown file and forged approval invalidate history',()=>scenario(root=>{
 const first=write(root,assessment,approvals(idA),trust,now);
 const entry=JSON.parse(fs.readFileSync(first.path,'utf8'));
 entry.release_approved=true;fs.writeFileSync(first.path,canonical(entry));
 assert.throws(()=>scan(root),/Invalid consumption record/);
 fs.writeFileSync(first.path,canonical(first.record));
 fs.writeFileSync(path.join(root,'untrusted.json'),'{}');
 assert.throws(()=>scan(root),/Unexpected entries/);
}));
