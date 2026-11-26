import {createHash,createPublicKey,verify} from 'node:crypto';
import {SIGNED_REVIEWER_ROSTER_SCHEMA} from './registry-pin-signed-reviewer-roster.mjs';

export const REVIEWER_ROSTER_TRANSITION_SCHEMA='palaco-citadel-reviewer-roster-transition-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-SIGNED-REVIEWER-ROSTER-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const deny=reason=>({schema:REVIEWER_ROSTER_TRANSITION_SCHEMA,
  transitionConsistent:false,reason,trust:'NOT_ESTABLISHED',
  authorization:'DENY',executionAllowed:false,releaseAllowed:false,stateChanged:false});
function capture(o,keys) {
 if(o===null||typeof o!=='object'||Array.isArray(o)||
    Object.getPrototypeOf(o)!==Object.prototype)return null;
 const own=Reflect.ownKeys(o);
 if(own.length!==keys.length||
   own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const result={};
 for(const key of keys){
  const d=Object.getOwnPropertyDescriptor(o,key);
  if(!d||!Object.hasOwn(d,'value'))return null;
  result[key]=d.value;
 }
 return result;
}
function readSigned(bytes,signature,key){
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>32768||
   typeof signature!=='string'||signature.length<11||signature.length>107||
   !/^[A-Za-z0-9_-]+$/.test(signature))return null;
 const stable=Buffer.from(bytes),sig=Buffer.from(signature,'base64url');
 if(sig.length<8||sig.length>80||sig.toString('base64url')!==signature||
   !verify('sha256',Buffer.concat([DOMAIN,stable]),key,sig))return null;
 const doc=capture(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stable)),
   ['schema','revision','members']);
 if(!doc||doc.schema!==SIGNED_REVIEWER_ROSTER_SCHEMA||
   !Number.isSafeInteger(doc.revision)||doc.revision<1||
   !Array.isArray(doc.members)||doc.members.length<2||doc.members.length>128)return null;
 const roster=new Map(),fingerprints=new Set();
 for(const row of doc.members){
  const m=capture(row,['reviewerId','fingerprint','status']);
  if(!m||typeof m.reviewerId!=='string'||
    !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(m.reviewerId)||
    typeof m.fingerprint!=='string'||!HEX.test(m.fingerprint)||
    !['ACTIVE','REVOKED'].includes(m.status)||
    roster.has(m.reviewerId)||fingerprints.has(m.fingerprint))return null;
  roster.set(m.reviewerId,m);fingerprints.add(m.fingerprint);
 }
 return {revision:doc.revision,roster,digest:sha(stable)};
}
/** No I/O. Checks two independently signed roster snapshots against an
 * explicitly pinned previous snapshot and issuer key. Pin inputs must be
 * independently protected for real trust; this check never authorizes.
 */
export function inspectReviewerRosterTransition(input={}){
 try{
  const x=capture(input,['previousBytes','previousSignatureBase64Url',
    'candidateBytes','candidateSignatureBase64Url','issuerPublicJwk',
    'expectedIssuerFingerprint','expectedPreviousSha256','minimumRevision']);
  if(!x)return deny('INVALID_TRANSITION_INPUT');
  const k=capture(x.issuerPublicJwk,['kty','crv','x','y']);
  if(!k||k.kty!=='EC'||k.crv!=='P-256'||
    typeof k.x!=='string'||typeof k.y!=='string'||
    !/^[A-Za-z0-9_-]{43}$/.test(k.x)||!/^[A-Za-z0-9_-]{43}$/.test(k.y)||
    typeof x.expectedIssuerFingerprint!=='string'||!HEX.test(x.expectedIssuerFingerprint)||
    typeof x.expectedPreviousSha256!=='string'||!HEX.test(x.expectedPreviousSha256)||
    !Number.isSafeInteger(x.minimumRevision)||x.minimumRevision<1)
    return deny('INVALID_TRUST_PINS');
  const key=createPublicKey({format:'jwk',key:k});
  if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||
    sha(key.export({format:'der',type:'spki'}))!==x.expectedIssuerFingerprint)
    return deny('ISSUER_KEY_SUBSTITUTION');
  const before=readSigned(x.previousBytes,x.previousSignatureBase64Url,key);
  const after=readSigned(x.candidateBytes,x.candidateSignatureBase64Url,key);
  if(!before||!after)return deny('INVALID_SIGNED_ROSTER');
  if(before.digest!==x.expectedPreviousSha256)return deny('PREVIOUS_ROSTER_SUBSTITUTION');
  if(before.revision<x.minimumRevision||after.revision<=before.revision)
    return deny('NON_MONOTONE_ROSTER_REVISION');
  const changes=[];
  for(const [id,member] of before.roster){
    const current=after.roster.get(id);
    if(!current)return deny('REVIEWER_DELETION');
    if(member.status==='REVOKED'&&current.status!=='REVOKED')
      return deny('REVOCATION_ROLLBACK');
    if(member.fingerprint!==current.fingerprint)
      return deny('REVIEWER_KEY_REBOUND');
    if(member.status==='ACTIVE'&&current.status==='REVOKED')
      changes.push({type:'REVOCATION',reviewerId:id});
  }
  for(const [id,member] of after.roster){
    if(!before.roster.has(id)){
      if(member.status!=='ACTIVE')return deny('INVALID_NEW_REVIEWER');
      changes.push({type:'NEW_REVIEWER',reviewerId:id});
    }
  }
  return {schema:REVIEWER_ROSTER_TRANSITION_SCHEMA,transitionConsistent:true,
    previousRevision:before.revision,candidateRevision:after.revision,
    previousSha256:before.digest,candidateSha256:after.digest,changes,
    unresolvedGates:['INDEPENDENT_ISSUER_KEY_PIN','PROTECTED_PREVIOUS_ROSTER',
      'FRESH_REVOCATION','INDEPENDENT_REVIEWER_IDENTITY',
      'DURABLE_ATOMIC_ROSTER_PUBLICATION'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',
    executionAllowed:false,releaseAllowed:false,stateChanged:false};
 }catch{return deny('MALFORMED_UNTRUSTED_TRANSITION');}
}
