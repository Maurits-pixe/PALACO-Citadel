import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectReviewerRosterCheckpointAdvance,REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';
import {SIGNED_REVIEWER_ROSTER_SCHEMA} from './registry-pin-signed-reviewer-roster.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const issuer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fp=sha(issuer.publicKey.export({format:'der',type:'spki'}));
const j=issuer.publicKey.export({format:'jwk'});
const issuerPublicJwk={kty:'EC',crv:'P-256',x:j.x,y:j.y};
const member=(reviewerId,char,status='ACTIVE')=>({reviewerId,fingerprint:char.repeat(64),status});
const priorMembers=[member('one','a'),member('two','b')];
function signed(revision,members){
 const bytes=Buffer.from(JSON.stringify({schema:SIGNED_REVIEWER_ROSTER_SCHEMA,revision,members}));
 return {bytes,signature:sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-SIGNED-REVIEWER-ROSTER-V1\n'),bytes
 ]),issuer.privateKey).toString('base64url')};
}
const before=signed(8,priorMembers);
const after=signed(9,[member('one','a','REVOKED'),member('two','b')]);
const pin={schema:REVIEWER_ROSTER_CHECKPOINT_SCHEMA,sequence:4,revision:8,
 issuerFingerprint:fp,rosterSha256:sha(before.bytes),headSha256:'c'.repeat(64)};
const transition={
 previousBytes:before.bytes,previousSignatureBase64Url:before.signature,
 candidateBytes:after.bytes,candidateSignatureBase64Url:after.signature,
 issuerPublicJwk,expectedIssuerFingerprint:fp,expectedPreviousSha256:sha(before.bytes),
 minimumRevision:8
};
const base=()=>({currentPin:{...pin},expectedPin:{...pin},transition:{...transition}});
const run=changes=>inspectReviewerRosterCheckpointAdvance({...base(),...changes});
test('signed transition produces hypothetical hash-linked checkpoint but DENY',()=>{
 const r=run({});
 assert.equal(r.checkpointMatched,true,JSON.stringify(r));
 assert.equal(r.proposedCheckpoint.sequence,5);
 assert.equal(r.proposedCheckpoint.revision,9);
 assert.equal(r.proposedCheckpoint.rosterSha256,sha(after.bytes));
 assert.equal(r.authorization,'DENY');assert.equal(r.stateChanged,false);
 assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.deepEqual(base().currentPin,pin);
});
test('concurrent checkpoint replacement triggers CAS conflict',()=>{
 assert.equal(run({expectedPin:{...pin,headSha256:'d'.repeat(64)}}).reason,
  'CHECKPOINT_CAS_CONFLICT');
});
test('old issuer and roster pins cannot be overwritten by transition',()=>{
 assert.equal(run({transition:{...transition,expectedIssuerFingerprint:'f'.repeat(64)}}).reason,
  'CHECKPOINT_PIN_MISMATCH');
 assert.equal(run({transition:{...transition,expectedPreviousSha256:'f'.repeat(64)}}).reason,
  'CHECKPOINT_PIN_MISMATCH');
});
test('stale revision cannot replay prior transition against another checkpoint',()=>{
 const stale={...pin,revision:7};
 assert.equal(run({currentPin:stale,expectedPin:stale}).reason,'CHECKPOINT_PIN_MISMATCH');
});
test('revoked reviewer resurrection is refused under pinned history',()=>{
 const old=signed(8,[member('one','a','REVOKED'),member('two','b')]);
 const newer=signed(9,priorMembers);
 const prior={...pin,rosterSha256:sha(old.bytes)};
 const malicious={...transition,previousBytes:old.bytes,
  previousSignatureBase64Url:old.signature,expectedPreviousSha256:sha(old.bytes),
  candidateBytes:newer.bytes,candidateSignatureBase64Url:newer.signature};
 assert.equal(run({currentPin:prior,expectedPin:prior,transition:malicious}).reason,
  'TRANSITION_REVOCATION_ROLLBACK');
});
test('head hash commits to previous head',()=>{
 const changed={...pin,headSha256:'d'.repeat(64)};
 const r=run({currentPin:changed,expectedPin:changed});
 assert.equal(r.checkpointMatched,true);
 assert.notEqual(r.proposedCheckpoint.headSha256,run({}).proposedCheckpoint.headSha256);
});
test('missing input, accessor and symbol injection are denied',()=>{
 const malicious={...base()};let called=0;
 Object.defineProperty(malicious,'currentPin',{enumerable:true,get(){called++;throw Error('getter');}});
 for(const x of [null,undefined,{},[],malicious,{...base(),[Symbol('extra')]:true}]){
  const r=inspectReviewerRosterCheckpointAdvance(x);
  assert.equal(r.checkpointMatched,false);assert.equal(r.authorization,'DENY');
  assert.equal(r.stateChanged,false);
 }
 assert.equal(called,0);
});
