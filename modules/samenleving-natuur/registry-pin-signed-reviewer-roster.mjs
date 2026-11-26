import {createHash,createPublicKey,verify} from 'node:crypto';
import {inspectIssuerReviewApprovals} from './registry-pin-issuer-review-approvals.mjs';

export const SIGNED_REVIEWER_ROSTER_SCHEMA='palaco-citadel-signed-reviewer-roster-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-SIGNED-REVIEWER-ROSTER-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
const deny=reason=>({schema:SIGNED_REVIEWER_ROSTER_SCHEMA,signedRosterVerified:false,
  reason,trust:'NOT_ESTABLISHED',authorization:'DENY',
  stateChanged:false,executionAllowed:false,releaseAllowed:false});
function record(value,keys){
 if(value===null||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)!==Object.prototype)return null;
 const names=Reflect.ownKeys(value);
 if(names.length!==keys.length||
   names.some(name=>typeof name!=='string'||!keys.includes(name)))return null;
 const result={};
 for(const name of keys){
   const descriptor=Object.getOwnPropertyDescriptor(value,name);
   if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   result[name]=descriptor.value;
 }
 return result;
}
/**
 * Local signature check only. The digest, key fingerprint, revision floor
 * and revocation freshness need independently protected distribution.
 * Never establishes real authorization or mutates any persistent state.
 */
export function inspectSignedReviewerRoster(input={}){
 try {
  const x=record(input,['rosterBytes','signatureBase64Url','issuerPublicJwk',
    'expectedIssuerFingerprint','expectedRosterSha256','minimumRosterRevision',
    'rotationStatementBytes','expectedStatementSha256','reviewers']);
  if(!x||!(x.rosterBytes instanceof Uint8Array)||
    x.rosterBytes.length<1||x.rosterBytes.length>32768||
    typeof x.expectedIssuerFingerprint!=='string'||!HEX.test(x.expectedIssuerFingerprint)||
    typeof x.expectedRosterSha256!=='string'||!HEX.test(x.expectedRosterSha256)||
    !Number.isSafeInteger(x.minimumRosterRevision)||x.minimumRosterRevision<1)
    return deny('INVALID_SIGNED_ROSTER_INPUT');
  const keyFields=record(x.issuerPublicJwk,['kty','crv','x','y']);
  if(!keyFields||keyFields.kty!=='EC'||keyFields.crv!=='P-256'||
    typeof keyFields.x!=='string'||typeof keyFields.y!=='string'||
    !/^[A-Za-z0-9_-]{43}$/.test(keyFields.x)||
    !/^[A-Za-z0-9_-]{43}$/.test(keyFields.y))
    return deny('INVALID_ROSTER_ISSUER_KEY');
  const bytes=Buffer.from(x.rosterBytes);
  if(hash(bytes)!==x.expectedRosterSha256)return deny('ROSTER_DIGEST_MISMATCH');
  const key=createPublicKey({format:'jwk',key:keyFields});
  if(key.asymmetricKeyType!=='ec'||
    key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||
    hash(key.export({format:'der',type:'spki'}))!==x.expectedIssuerFingerprint)
    return deny('ROSTER_ISSUER_SUBSTITUTION');
  if(typeof x.signatureBase64Url!=='string'||x.signatureBase64Url.length>107||
    !/^[A-Za-z0-9_-]+$/.test(x.signatureBase64Url))
    return deny('INVALID_ROSTER_SIGNATURE');
  const signature=Buffer.from(x.signatureBase64Url,'base64url');
  if(signature.length<8||signature.length>80||
    signature.toString('base64url')!==x.signatureBase64Url||
    !verify('sha256',Buffer.concat([DOMAIN,bytes]),key,signature))
    return deny('INVALID_ROSTER_SIGNATURE');
  const doc=record(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),
    ['schema','revision','members']);
  if(!doc||doc.schema!==SIGNED_REVIEWER_ROSTER_SCHEMA||
    !Number.isSafeInteger(doc.revision)||doc.revision<x.minimumRosterRevision)
    return deny('ROSTER_SCHEMA_OR_ROLLBACK');
  const approvedRoster={revision:doc.revision,members:doc.members};
  const approvals=inspectIssuerReviewApprovals({
    rotationStatementBytes:x.rotationStatementBytes,
    expectedStatementSha256:x.expectedStatementSha256,
    reviewers:x.reviewers,approvedRoster,
    minimumRosterRevision:x.minimumRosterRevision
  });
  if(!approvals.approvalsVerified)return deny('REVIEW_'+approvals.reason);
  return {schema:SIGNED_REVIEWER_ROSTER_SCHEMA,signedRosterVerified:true,
    rosterSha256:hash(bytes),rosterRevision:doc.revision,
    reviewersVerified:approvals.reviewersVerified,
    unresolvedGates:['INDEPENDENT_PINNED_ROSTER_ISSUER',
      'PROTECTED_ROSTER_HASH_AND_REVISION','FRESH_REVOCATION',
      'INDEPENDENT_REVIEWER_CUSTODY','DURABLE_PUBLICATION'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',
    stateChanged:false,executionAllowed:false,releaseAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_SIGNED_ROSTER');}
}
