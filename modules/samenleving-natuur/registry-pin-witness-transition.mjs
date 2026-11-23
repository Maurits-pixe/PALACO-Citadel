import {createHash,createPublicKey,verify} from 'node:crypto';
import {WITNESS_REGISTRY_SCHEMA} from './registry-pin-witness-registry.mjs';

export const WITNESS_TRANSITION_SCHEMA='palaco-citadel-witness-registry-transition-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-SIGNED-WITNESS-REGISTRY-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const validId=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(s);
const reject=reason=>({schema:WITNESS_TRANSITION_SCHEMA,transitionConsistent:false,
  reason,trust:'NOT_ESTABLISHED',authorization:'DENY',executionAllowed:false,
  releaseAllowed:false,stateChanged:false});
const exact=(o,keys)=>{
 if(o===null||typeof o!=='object'||Array.isArray(o)||
    Object.getPrototypeOf(o)!==Object.prototype)return null;
 const own=Reflect.ownKeys(o);
 if(own.length!==keys.length||
    own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const copy={};
 for(const k of keys){
  const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;
  copy[k]=d.value;
 }
 return copy;
};
const sha=b=>createHash('sha256').update(b).digest('hex');
const readRegistry=(bytes,signature,key)=>{
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>65536||
    typeof signature!=='string'||signature.length>107||
    !/^[A-Za-z0-9_-]+$/.test(signature))return null;
 const copy=Buffer.from(bytes),sig=Buffer.from(signature,'base64url');
 if(sig.length<8||sig.length>80||sig.toString('base64url')!==signature||
    !verify('sha256',Buffer.concat([DOMAIN,copy]),key,sig))return null;
 const doc=exact(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(copy)),
   ['schema','epoch','members']);
 if(!doc||doc.schema!==WITNESS_REGISTRY_SCHEMA||
    !Number.isSafeInteger(doc.epoch)||doc.epoch<1||
    !Array.isArray(doc.members)||doc.members.length<2||doc.members.length>256)
    return null;
 const byId=new Map(),fingerprints=new Set();
 for(const item of doc.members){
  const m=exact(item,['witnessId','fingerprint','status']);
  if(!m||!validId(m.witnessId)||!HEX.test(m.fingerprint)||
    !['ACTIVE','REVOKED'].includes(m.status)||
    byId.has(m.witnessId)||fingerprints.has(m.fingerprint))return null;
  byId.set(m.witnessId,m);fingerprints.add(m.fingerprint);
 }
 return {doc,members:byId,digest:sha(copy)};
};

/** Pure, read-only preflight of TWO signed snapshots from one pinned issuer.
 * A monotone epoch and independently pinned old digest/issuer are preconditions.
 * Never treats caller-provided protection claims as real authorization.
 */
export function inspectWitnessRegistryTransition(input={}) {
 try {
  const outer=exact(input,['previousBytes','previousSignatureBase64Url',
    'candidateBytes','candidateSignatureBase64Url','issuerPublicJwk',
    'expectedIssuerFingerprint','expectedPreviousSha256','minimumEpoch']);
  if(!outer)return reject('INVALID_TRANSITION_INPUT');
  const {previousBytes,previousSignatureBase64Url,candidateBytes,
    candidateSignatureBase64Url,issuerPublicJwk,expectedIssuerFingerprint,
    expectedPreviousSha256,minimumEpoch}=outer;
  const jwk=exact(issuerPublicJwk,['kty','crv','x','y']);
  if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||
    typeof jwk.x!=='string'||typeof jwk.y!=='string'||
    !/^[A-Za-z0-9_-]{43}$/.test(jwk.x)||
    !/^[A-Za-z0-9_-]{43}$/.test(jwk.y)||
    !HEX.test(expectedIssuerFingerprint)||!HEX.test(expectedPreviousSha256)||
    !Number.isSafeInteger(minimumEpoch)||minimumEpoch<1)
    return reject('INVALID_TRUST_PINS');
  const key=createPublicKey({format:'jwk',key:jwk});
  if(key.asymmetricKeyType!=='ec'||
    key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||
    sha(key.export({format:'der',type:'spki'}))!==expectedIssuerFingerprint)
    return reject('ISSUER_KEY_SUBSTITUTION');
  const previous=readRegistry(previousBytes,previousSignatureBase64Url,key);
  const candidate=readRegistry(candidateBytes,candidateSignatureBase64Url,key);
  if(!previous||!candidate)return reject('INVALID_SIGNED_SNAPSHOT');
  if(previous.digest!==expectedPreviousSha256)
    return reject('PREVIOUS_SNAPSHOT_SUBSTITUTION');
  if(previous.doc.epoch<minimumEpoch||
    candidate.doc.epoch<=previous.doc.epoch)
    return reject('NON_MONOTONE_EPOCH');
  const changes=[];
  for(const [id,old] of previous.members){
    const next=candidate.members.get(id);
    if(!next)return reject('ENROLLMENT_DELETION');
    if(old.status==='REVOKED'&&next.status!=='REVOKED')
      return reject('REVOCATION_ROLLBACK');
    if(old.fingerprint!==next.fingerprint)
      return reject('IDENTITY_KEY_REBOUND');
    if(old.status==='ACTIVE'&&next.status==='REVOKED')
      changes.push({type:'REVOCATION',witnessId:id});
  }
  // New key registrations must use new identities; retained and revoked
  // identities cannot be resurrected or rebound.
  for(const [id,newMember] of candidate.members)
    if(!previous.members.has(id)){
      if(newMember.status!=='ACTIVE')return reject('INVALID_NEW_ENROLLMENT');
      changes.push({type:'NEW_ENROLLMENT',witnessId:id});
    }
  return {schema:WITNESS_TRANSITION_SCHEMA,transitionConsistent:true,
    previousEpoch:previous.doc.epoch,candidateEpoch:candidate.doc.epoch,
    previousSha256:previous.digest,candidateSha256:candidate.digest,
    changes,unresolvedGates:['INDEPENDENT_ISSUER_KEY_PIN',
      'INDEPENDENT_PROTECTED_PREVIOUS_SNAPSHOT',
      'ACTUAL_REVOCATION_FRESHNESS','DUAL_APPROVAL_FOR_KEY_ROTATION'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',executionAllowed:false,
    releaseAllowed:false,stateChanged:false};
 }catch{return reject('MALFORMED_UNTRUSTED_TRANSITION');}
}
