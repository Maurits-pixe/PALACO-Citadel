import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectReviewerRosterTransition} from './registry-pin-reviewer-roster-transition.mjs';
import {SIGNED_REVIEWER_ROSTER_SCHEMA} from './registry-pin-signed-reviewer-roster.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=p=>{const x=p.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:x.x,y:x.y};};
const fp=p=>sha(p.publicKey.export({format:'der',type:'spki'}));
const member=(id,char,status='ACTIVE')=>({reviewerId:id,fingerprint:char.repeat(64),status});
const oldMembers=[member('alpha','a'),member('beta','b')];
function signed(revision,members){
 const bytes=Buffer.from(JSON.stringify({schema:SIGNED_REVIEWER_ROSTER_SCHEMA,revision,members}));
 return {bytes,signature:sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-SIGNED-REVIEWER-ROSTER-V1\n'),bytes
 ]),pair.privateKey).toString('base64url')};
}
const before=signed(6,oldMembers);
const after=signed(7,[member('alpha','a','REVOKED'),member('beta','b'),member('gamma','c')]);
const base=()=>({previousBytes:before.bytes,previousSignatureBase64Url:before.signature,
 candidateBytes:after.bytes,candidateSignatureBase64Url:after.signature,
 issuerPublicJwk:jwk(pair),expectedIssuerFingerprint:fp(pair),
 expectedPreviousSha256:sha(before.bytes),minimumRevision:6});
const run=changes=>inspectReviewerRosterTransition({...base(),...changes});
const next=(revision,members)=>{const v=signed(revision,members);
 return {candidateBytes:v.bytes,candidateSignatureBase64Url:v.signature};};
test('monotone signed transition matches but always denies authorization',()=>{
 const r=run({});
 assert.equal(r.transitionConsistent,true,JSON.stringify(r));
 assert.equal(r.candidateRevision,7);
 assert.deepEqual(r.changes,[{type:'REVOCATION',reviewerId:'alpha'},
  {type:'NEW_REVIEWER',reviewerId:'gamma'}]);
 assert.equal(r.authorization,'DENY');assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.stateChanged,false);
});
test('signed resurrection of revoked identity rejected',()=>{
 const old=signed(6,[member('alpha','a','REVOKED'),member('beta','b')]);
 const candidate=signed(7,oldMembers);
 assert.equal(run({previousBytes:old.bytes,previousSignatureBase64Url:old.signature,
  expectedPreviousSha256:sha(old.bytes),candidateBytes:candidate.bytes,
  candidateSignatureBase64Url:candidate.signature}).reason,'REVOCATION_ROLLBACK');
});
test('old key cannot be rebound or identity removed',()=>{
 assert.equal(run(next(7,[member('alpha','c'),member('beta','b')])).reason,'REVIEWER_KEY_REBOUND');
 assert.equal(run(next(7,[member('beta','b'),member('gamma','c')])).reason,'REVIEWER_DELETION');
});
test('stale revision and older pinned floor rejected',()=>{
 assert.equal(run(next(6,oldMembers)).reason,'NON_MONOTONE_ROSTER_REVISION');
 assert.equal(run({minimumRevision:7}).reason,'NON_MONOTONE_ROSTER_REVISION');
});
test('old snapshot substitution denied even when correctly signed',()=>{
 const replacement=signed(6,[member('alpha','a','REVOKED'),member('beta','b')]);
 assert.equal(run({previousBytes:replacement.bytes,previousSignatureBase64Url:replacement.signature})
  .reason,'PREVIOUS_ROSTER_SUBSTITUTION');
});
test('issuer key replacement and invalid signature rejected',()=>{
 assert.equal(run({issuerPublicJwk:jwk(other)}).reason,'ISSUER_KEY_SUBSTITUTION');
 assert.equal(run({candidateSignatureBase64Url:'AQID'}).reason,'INVALID_SIGNED_ROSTER');
});
test('duplicate identities and fingerprints invalidate entire snapshot',()=>{
 assert.equal(run(next(7,[member('alpha','a'),member('alpha','b')])).reason,'INVALID_SIGNED_ROSTER');
 assert.equal(run(next(7,[member('alpha','a'),member('beta','a')])).reason,'INVALID_SIGNED_ROSTER');
});
test('getters and unexpected metadata cannot authorize',()=>{
 const hostile={...base()};let calls=0;
 Object.defineProperty(hostile,'minimumRevision',{enumerable:true,get(){calls++;throw Error('getter');}});
 for(const x of [null,undefined,{},[],hostile,{...base(),[Symbol('extra')]:1}]){
  const r=inspectReviewerRosterTransition(x);
  assert.equal(r.transitionConsistent,false);assert.equal(r.authorization,'DENY');
  assert.equal(r.stateChanged,false);
 }
 assert.equal(calls,0);
});
