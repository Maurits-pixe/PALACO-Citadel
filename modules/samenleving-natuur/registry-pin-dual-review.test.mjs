import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectDualReviewPinUpdate,REVIEW_CONTRACT_SCHEMA} from './registry-pin-dual-review.mjs';
import {computeRegistryPinEntryHash} from './registry-pin-ledger.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin=(rev,x)=>({schema:'palaco-citadel-registry-snapshot-pin-v1',
  issuerFingerprint:'a'.repeat(64),revision:rev,registrySha256:x.repeat(64)});
const genesisPin=pin(1,'b'),currentPin=pin(2,'c'),nextPin=pin(3,'d');
const first={sequence:1,previousHash:'0'.repeat(64),fromPin:genesisPin,toPin:currentPin};
const expectedHeadHash=computeRegistryPinEntryHash(first);
const entry={sequence:2,previousHash:expectedHeadHash,fromPin:currentPin,toPin:nextPin};
const candidateHash=computeRegistryPinEntryHash(entry);
const DOMAIN=Buffer.from('PALACO-CITADEL-PIN-UPDATE-REVIEW-V1\n');
const msg=Buffer.concat([DOMAIN,Buffer.from(candidateHash)]);
const reviewer=id=>{
 const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk=pair.publicKey.export({format:'jwk'});
 return {reviewerId:id,reviewerFingerprint:sha(pair.publicKey.export({type:'spki',format:'der'})),
  publicJwk:{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y},
  signatureBase64Url:sign('sha256',msg,pair.privateKey).toString('base64url')};
};
const approvals=[reviewer('reviewer-1'),reviewer('reviewer-2')];
const transition={
 schema:'palaco-citadel-registry-pin-transition-v1',candidateVerified:true,
 proposedPin:nextPin,previousRevision:2,previousSnapshotSha256:currentPin.registrySha256,
 stateChanged:false,requiredBeforeCommit:['AUTHORIZED_DUAL_REVIEW'],
 trust:'NOT_ESTABLISHED',authorization:'DENY',executionAllowed:false,releaseAllowed:false
};
const run=overrides=>inspectDualReviewPinUpdate({
 genesisPin,entries:[first],expectedHeadHash,currentPin,transition,approvals,...overrides
});
test('two distinct signatures validate candidate only; state and authorization stay denied',()=>{
 const result=run();
 assert.equal(result.schema,REVIEW_CONTRACT_SCHEMA);
 assert.equal(result.reviewSignaturesValid,true,JSON.stringify(result));
 assert.equal(result.proposalConsistent,true);
 assert.equal(result.candidateLedgerHash,candidateHash);
 assert.equal(result.reviewCount,2);
 assert.equal(result.authorization,'DENY');
 assert.equal(result.stateChanged,false);
 assert.equal(result.executionAllowed,false);
 assert.equal(result.releaseAllowed,false);
});
test('one reviewer or duplicated identity or key cannot pass',()=>{
 for(const candidate of [[approvals[0]],[approvals[0],approvals[0]],
   [{...approvals[0]}, {...approvals[1],reviewerId:approvals[0].reviewerId}],
   [{...approvals[0]}, {...approvals[0],reviewerId:'reviewer-other'}]]){
  assert.equal(run({approvals:candidate}).reviewSignaturesValid,false);
 }
});
test('old signed approval cannot authorize a changed proposal',()=>{
 const amended={...nextPin,registrySha256:'e'.repeat(64)};
 const result=run({transition:{...transition,proposedPin:amended}});
 assert.equal(result.reviewSignaturesValid,false);
 assert.equal(result.reason,'REVIEW_SIGNATURE_INVALID');
});
test('incorrect head anchor or stale expected pin fail before approvals',()=>{
 assert.equal(run({expectedHeadHash:'f'.repeat(64)}).reason,'LEDGER_HEAD_ANCHOR_MISMATCH');
 assert.equal(run({currentPin:pin(2,'e')}).reason,'INVALID_PROPOSAL');
});
test('forged key fingerprint fails closed',()=>{
 const fake={...approvals[0],reviewerFingerprint:'f'.repeat(64)};
 assert.equal(run({approvals:[fake,approvals[1]]}).reason,'REVIEWER_KEY_MISMATCH');
});
test('invalid signature encoding fails closed',()=>{
 const fake={...approvals[0],signatureBase64Url:'%%%'}; 
 assert.equal(run({approvals:[fake,approvals[1]]}).reviewSignaturesValid,false);
});
test('unauthorized purported ALLOW transition rejected',()=>{
 assert.equal(run({transition:{...transition,authorization:'ALLOW'}}).reason,'INVALID_PROPOSAL');
});
test('untrusted malformed inputs always deny',()=>{
 for(const x of [null,[],{},undefined]){
  const result=run({approvals:x});
  assert.equal(result.reviewSignaturesValid,false);
  assert.equal(result.authorization,'DENY');
 }
});
