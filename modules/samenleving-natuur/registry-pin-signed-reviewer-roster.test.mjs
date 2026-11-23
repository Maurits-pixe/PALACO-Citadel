import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectSignedReviewerRoster,SIGNED_REVIEWER_ROSTER_SCHEMA} from './registry-pin-signed-reviewer-roster.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const keyPair=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=pair=>{const j=pair.publicKey.export({format:'jwk'});return {kty:'EC',crv:'P-256',x:j.x,y:j.y};};
const fp=pair=>sha(pair.publicKey.export({format:'der',type:'spki'}));
const issuer=keyPair(),otherIssuer=keyPair();
const rotationStatementBytes=Buffer.from('PALACO rotation evidence fixture');
const expectedStatementSha256=sha(rotationStatementBytes);
function reviewer(reviewerId){
 const pair=keyPair();
 return {reviewerId,publicJwk:jwk(pair),fingerprint:fp(pair),
  signatureBase64Url:sign('sha256',Buffer.concat([
   Buffer.from('PALACO-CITADEL-ISSUER-REVIEW-APPROVAL-V1\n'),
   rotationStatementBytes]),pair.privateKey).toString('base64url')};
}
const a=reviewer('first'),b=reviewer('second');
const reviewers=[a,b].map(({reviewerId,publicJwk,signatureBase64Url})=>({reviewerId,publicJwk,signatureBase64Url}));
const members=[a,b].map(({reviewerId,fingerprint})=>({reviewerId,fingerprint,status:'ACTIVE'}));
function signed(revision=7,entries=members){
 const rosterBytes=Buffer.from(JSON.stringify({schema:SIGNED_REVIEWER_ROSTER_SCHEMA,revision,members:entries}));
 const signatureBase64Url=sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-SIGNED-REVIEWER-ROSTER-V1\n'),rosterBytes]),
  issuer.privateKey).toString('base64url');
 return {rosterBytes,signatureBase64Url,expectedRosterSha256:sha(rosterBytes)};
}
const base=()=>({...signed(),issuerPublicJwk:jwk(issuer),expectedIssuerFingerprint:fp(issuer),
 minimumRosterRevision:7,rotationStatementBytes,expectedStatementSha256,reviewers});
const run=x=>inspectSignedReviewerRoster({...base(),...x});
test('signed enrolled approvals validate locally and NEVER authorize',()=>{
 const r=run({});
 assert.equal(r.signedRosterVerified,true,JSON.stringify(r));
 assert.equal(r.reviewersVerified,2);assert.equal(r.rosterRevision,7);
 assert.equal(r.authorization,'DENY');assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.releaseAllowed,false);assert.equal(r.stateChanged,false);
});
test('modified roster bytes and invalid signature fail closed',()=>{
 const changed=Buffer.from(base().rosterBytes);changed[0]^=1;
 assert.equal(run({rosterBytes:changed}).reason,'ROSTER_DIGEST_MISMATCH');
 assert.equal(run({signatureBase64Url:'AQID'}).reason,'INVALID_ROSTER_SIGNATURE');
});
test('issuer key substitution and wrong independent fingerprint denied',()=>{
 assert.equal(run({issuerPublicJwk:jwk(otherIssuer)}).reason,'ROSTER_ISSUER_SUBSTITUTION');
 assert.equal(run({expectedIssuerFingerprint:'f'.repeat(64)}).reason,'ROSTER_ISSUER_SUBSTITUTION');
});
test('validly signed outdated roster denied by monotone floor',()=>{
 assert.equal(run({...signed(6)}).reason,'ROSTER_SCHEMA_OR_ROLLBACK');
});
test('signed revocation denies previously valid reviewer signature',()=>{
 assert.equal(run({...signed(7,[members[0],{...members[1],status:'REVOKED'}])}).reason,
  'REVIEW_UNENROLLED_OR_REVOKED_REVIEWER');
});
test('duplicate enrollment and reviewer identity substitution refused',()=>{
 assert.equal(run({...signed(7,[members[0],{...members[1],reviewerId:members[0].reviewerId}])}).reason,
  'REVIEW_INVALID_ROSTER_MEMBER');
 assert.equal(run({reviewers:[reviewers[0],reviewers[0]]}).reason,
  'REVIEW_DUPLICATE_OR_INVALID_REVIEWER');
});
test('rotation evidence changes cannot reuse reviewer approval signatures',()=>{
 const altered=Buffer.from(rotationStatementBytes);altered[0]^=1;
 assert.equal(run({rotationStatementBytes:altered}).reason,'REVIEW_STATEMENT_SUBSTITUTION');
 assert.equal(run({rotationStatementBytes:altered,expectedStatementSha256:sha(altered)}).reason,
  'REVIEW_INVALID_REVIEW_SIGNATURE');
});
test('hostile getter and unexpected fields never gain authorization',()=>{
 const hostile={...base()};let calls=0;
 Object.defineProperty(hostile,'rosterBytes',{enumerable:true,
  get(){calls++;throw Error('untrusted getter');}});
 for(const value of [null,undefined,{},[],hostile,{...base(),[Symbol('surprise')]:1}]){
  const r=inspectSignedReviewerRoster(value);
  assert.equal(r.signedRosterVerified,false);assert.equal(r.authorization,'DENY');
  assert.equal(r.stateChanged,false);
 }
 assert.equal(calls,0);
});
