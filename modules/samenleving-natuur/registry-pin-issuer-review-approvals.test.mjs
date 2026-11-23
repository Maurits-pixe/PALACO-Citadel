import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectIssuerReviewApprovals} from './registry-pin-issuer-review-approvals.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const rotationStatementBytes=Buffer.from('PALACO issuer rotation statement v1');
const expectedStatementSha256=sha(rotationStatementBytes);
const message=Buffer.concat([Buffer.from('PALACO-CITADEL-ISSUER-REVIEW-APPROVAL-V1\n'),rotationStatementBytes]);
function reviewer(id){
 const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk=pair.publicKey.export({format:'jwk'});
 return {reviewerId:id,publicJwk:{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y},
  signatureBase64Url:sign('sha256',message,pair.privateKey).toString('base64url'),
  fingerprint:sha(pair.publicKey.export({format:'der',type:'spki'}))};
}
const a=reviewer('reviewer-a'),b=reviewer('reviewer-b');
const asReviewer=x=>({reviewerId:x.reviewerId,publicJwk:x.publicJwk,signatureBase64Url:x.signatureBase64Url});
const members=[a,b].map(x=>({reviewerId:x.reviewerId,fingerprint:x.fingerprint,status:'ACTIVE'}));
const base=()=>({rotationStatementBytes,expectedStatementSha256,
 reviewers:[asReviewer(a),asReviewer(b)],approvedRoster:{revision:8,members:members.map(m=>({...m}))},
 minimumRosterRevision:8});
const check=changes=>inspectIssuerReviewApprovals({...base(),...changes});
test('distinct signed reviewer approvals locally verify but never authorize',()=>{
 const r=check({});
 assert.equal(r.approvalsVerified,true,JSON.stringify(r));
 assert.equal(r.authorization,'DENY');assert.equal(r.trust,'NOT_ESTABLISHED');
 assert.equal(r.releaseAllowed,false);assert.equal(r.stateChanged,false);
});
test('same identity, substituted public key or same key reuse rejected',()=>{
 assert.equal(check({reviewers:[asReviewer(a),asReviewer(a)]}).approvalsVerified,false);
 assert.equal(check({reviewers:[asReviewer(a),{...asReviewer(b),publicJwk:a.publicJwk}]}).reason,'REVIEWER_KEY_SUBSTITUTION');
});
test('revocation and unregistered reviewers fail even with valid signatures',()=>{
 assert.equal(check({approvedRoster:{revision:8,members:[members[0],{...members[1],status:'REVOKED'}]}}).reason,'UNENROLLED_OR_REVOKED_REVIEWER');
 assert.equal(check({reviewers:[asReviewer(a),{...asReviewer(b),reviewerId:'unknown'}]}).reason,'UNENROLLED_OR_REVOKED_REVIEWER');
});
test('stale roster and forged roster member rejected',()=>{
 assert.equal(check({minimumRosterRevision:9}).reason,'STALE_OR_INVALID_ROSTER');
 assert.equal(check({approvedRoster:{revision:8,members:[members[0],{...members[1],fingerprint:members[0].fingerprint}]}}).reason,'INVALID_ROSTER_MEMBER');
});
test('changed statement and changed expected digest cannot reuse reviews',()=>{
 const mutated=Buffer.from(rotationStatementBytes);mutated[0]^=1;
 assert.equal(check({rotationStatementBytes:mutated}).reason,'STATEMENT_SUBSTITUTION');
 assert.equal(check({rotationStatementBytes:mutated,expectedStatementSha256:sha(mutated)}).reason,'INVALID_REVIEW_SIGNATURE');
});
test('malformed signature, getters and hostile inputs fail closed',()=>{
 const hostile={...base()};let calls=0;
 Object.defineProperty(hostile,'reviewers',{enumerable:true,get(){calls++;throw Error('getter');}});
 for(const x of [undefined,null,{},[],hostile,
  {...base(),reviewers:[asReviewer(a),{...asReviewer(b),signatureBase64Url:'AQID'}]}]){
  const r=inspectIssuerReviewApprovals(x);
  assert.equal(r.approvalsVerified,false);assert.equal(r.authorization,'DENY');
  assert.equal(r.stateChanged,false);
 }
 assert.equal(calls,0);
});
