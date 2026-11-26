import {createHash,createPublicKey,verify} from 'node:crypto';

export const REVIEW_APPROVAL_SCHEMA='palaco-citadel-issuer-review-approval-v1';
const PREFIX=Buffer.from('PALACO-CITADEL-ISSUER-REVIEW-APPROVAL-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const digest=b=>createHash('sha256').update(b).digest('hex');
const reject=reason=>({schema:REVIEW_APPROVAL_SCHEMA,approvalsVerified:false,
  reason,trust:'NOT_ESTABLISHED',authorization:'DENY',
  releaseAllowed:false,executionAllowed:false,stateChanged:false});
function capture(o,keys){
 if(o===null||typeof o!=='object'||Array.isArray(o)||
    Object.getPrototypeOf(o)!==Object.prototype)return null;
 const own=Reflect.ownKeys(o);
 if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const copy={};
 for(const key of keys){
  const d=Object.getOwnPropertyDescriptor(o,key);
  if(!d||!Object.hasOwn(d,'value'))return null;
  copy[key]=d.value;
 }
 return copy;
}
/** Local signature preflight, NOT an authentication or authorization decision.
 * The pinned roster, its revision and the exact statement digest MUST
 * originate from independent protected infrastructure.
 */
export function inspectIssuerReviewApprovals(input={}){
 try{
  const x=capture(input,['rotationStatementBytes','expectedStatementSha256',
    'reviewers','approvedRoster','minimumRosterRevision']);
  if(!x||!(x.rotationStatementBytes instanceof Uint8Array)||
    x.rotationStatementBytes.length<1||x.rotationStatementBytes.length>8192||
    typeof x.expectedStatementSha256!=='string'||!HEX.test(x.expectedStatementSha256)||
    !Number.isSafeInteger(x.minimumRosterRevision)||x.minimumRosterRevision<1||
    !Array.isArray(x.reviewers)||x.reviewers.length!==2)
    return reject('INVALID_APPROVAL_INPUT');
  const roster=capture(x.approvedRoster,['revision','members']);
  if(!roster||!Number.isSafeInteger(roster.revision)||
    roster.revision<x.minimumRosterRevision||
    !Array.isArray(roster.members)||roster.members.length<2||roster.members.length>128)
    return reject('STALE_OR_INVALID_ROSTER');
  const statement=Buffer.from(x.rotationStatementBytes),statementSha256=digest(statement);
  if(statementSha256!==x.expectedStatementSha256)return reject('STATEMENT_SUBSTITUTION');
  const byId=new Map(),fingerprints=new Set();
  for(const raw of roster.members){
   const m=capture(raw,['reviewerId','fingerprint','status']);
   if(!m||typeof m.reviewerId!=='string'||
     !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(m.reviewerId)||
     typeof m.fingerprint!=='string'||!HEX.test(m.fingerprint)||
     !['ACTIVE','REVOKED'].includes(m.status)||
     byId.has(m.reviewerId)||fingerprints.has(m.fingerprint))
     return reject('INVALID_ROSTER_MEMBER');
   byId.set(m.reviewerId,m);fingerprints.add(m.fingerprint);
  }
  const seen=new Set(),keys=new Set();
  const message=Buffer.concat([PREFIX,statement]);
  for(const raw of x.reviewers){
   const r=capture(raw,['reviewerId','publicJwk','signatureBase64Url']);
   if(!r||typeof r.reviewerId!=='string'||seen.has(r.reviewerId))
     return reject('DUPLICATE_OR_INVALID_REVIEWER');
   const enrolled=byId.get(r.reviewerId);
   if(!enrolled||enrolled.status!=='ACTIVE')return reject('UNENROLLED_OR_REVOKED_REVIEWER');
   const k=capture(r.publicJwk,['kty','crv','x','y']);
   if(!k||k.kty!=='EC'||k.crv!=='P-256'||
     typeof k.x!=='string'||typeof k.y!=='string'||
     !/^[A-Za-z0-9_-]{43}$/.test(k.x)||!/^[A-Za-z0-9_-]{43}$/.test(k.y))
     return reject('INVALID_REVIEWER_KEY');
   const publicKey=createPublicKey({format:'jwk',key:k});
   const fingerprint=digest(publicKey.export({format:'der',type:'spki'}));
   if(fingerprint!==enrolled.fingerprint||keys.has(fingerprint))
     return reject('REVIEWER_KEY_SUBSTITUTION');
   if(typeof r.signatureBase64Url!=='string'||r.signatureBase64Url.length>107||
     !/^[A-Za-z0-9_-]+$/.test(r.signatureBase64Url))
     return reject('INVALID_REVIEW_SIGNATURE');
   const sig=Buffer.from(r.signatureBase64Url,'base64url');
   if(sig.length<8||sig.length>80||sig.toString('base64url')!==r.signatureBase64Url||
     !verify('sha256',message,publicKey,sig))
     return reject('INVALID_REVIEW_SIGNATURE');
   seen.add(r.reviewerId);keys.add(fingerprint);
  }
  return {schema:REVIEW_APPROVAL_SCHEMA,approvalsVerified:true,
    statementSha256,reviewersVerified:2,rosterRevision:roster.revision,
    unresolvedGates:['INDEPENDENT_AUTHENTICATED_ROSTER',
      'EXTERNAL_PROTECTED_ROSTER_REVISION','FRESH_REVOCATION_AND_TIME',
      'EXTERNAL_SEPARATION_OF_DUTIES','DURABLE_APPROVAL_PUBLICATION'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',
    releaseAllowed:false,executionAllowed:false,stateChanged:false};
 }catch{return reject('MALFORMED_OR_UNTRUSTED_APPROVAL');}
}
