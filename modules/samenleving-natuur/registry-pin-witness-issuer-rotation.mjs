import {createHash,createPublicKey,verify} from 'node:crypto';
import {WITNESS_REGISTRY_SCHEMA} from './registry-pin-witness-registry.mjs';

export const ISSUER_ROTATION_SCHEMA='palaco-citadel-witness-issuer-rotation-v1';
const REG_DOMAIN=Buffer.from('PALACO-CITADEL-SIGNED-WITNESS-REGISTRY-V1\n');
const ROT_DOMAIN=Buffer.from('PALACO-CITADEL-ISSUER-ROTATION-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const fail=reason=>({schema:ISSUER_ROTATION_SCHEMA,rotationConsistent:false,
  reason,trust:'NOT_ESTABLISHED',authorization:'DENY',
  stateChanged:false,executionAllowed:false,releaseAllowed:false});
const hash=b=>createHash('sha256').update(b).digest('hex');
function capture(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||
   Object.getPrototypeOf(o)!==Object.prototype)return null;
 const own=Reflect.ownKeys(o);
 if(own.length!==fields.length||
   own.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
 const copy={};
 for(const k of fields){
  const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;
  copy[k]=d.value;
 }
 return copy;
}
function publicKey(record,fingerprint){
 const p=capture(record,['kty','crv','x','y']);
 if(!p||p.kty!=='EC'||p.crv!=='P-256'||
   typeof p.x!=='string'||typeof p.y!=='string'||
   !/^[A-Za-z0-9_-]{43}$/.test(p.x)||!/^[A-Za-z0-9_-]{43}$/.test(p.y)||
   typeof fingerprint!=='string'||!HEX.test(fingerprint))return null;
 const key=createPublicKey({format:'jwk',key:p});
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||
   hash(key.export({format:'der',type:'spki'}))!==fingerprint)return null;
 return key;
}
function signatureOK(signature,message,key){
 if(typeof signature!=='string'||signature.length<11||signature.length>107||
   !/^[A-Za-z0-9_-]+$/.test(signature))return false;
 const bytes=Buffer.from(signature,'base64url');
 return bytes.length>=8&&bytes.length<=80&&
   bytes.toString('base64url')===signature&&
   verify('sha256',message,key,bytes);
}
function parseSigned(bytes,signature,key){
 if(!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>65536)return null;
 const copy=Buffer.from(bytes);
 if(!signatureOK(signature,Buffer.concat([REG_DOMAIN,copy]),key))return null;
 const doc=capture(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(copy)),
   ['schema','epoch','members']);
 if(!doc||doc.schema!==WITNESS_REGISTRY_SCHEMA||
   !Number.isSafeInteger(doc.epoch)||doc.epoch<1||
   !Array.isArray(doc.members)||doc.members.length<2||doc.members.length>256)return null;
 const members=new Map(),fingerprints=new Set();
 for(const raw of doc.members){
  const m=capture(raw,['witnessId','fingerprint','status']);
  if(!m||typeof m.witnessId!=='string'||
    !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(m.witnessId)||
    typeof m.fingerprint!=='string'||!HEX.test(m.fingerprint)||
    !['ACTIVE','REVOKED'].includes(m.status)||
    members.has(m.witnessId)||fingerprints.has(m.fingerprint))return null;
  members.set(m.witnessId,m);fingerprints.add(m.fingerprint);
 }
 return {epoch:doc.epoch,members,sha256:hash(copy)};
}

/** Dual-signed rotation proof. No I/O, no trust-anchor distribution, no authority. */
export function inspectWitnessIssuerRotation(input={}) {
 try{
  const p=capture(input,['previousBytes','previousSignatureBase64Url',
    'candidateBytes','candidateSignatureBase64Url',
    'oldIssuerPublicJwk','newIssuerPublicJwk','pinnedOldIssuerFingerprint',
    'expectedPreviousSha256','minimumEpoch','rotationStatementBytes',
    'oldRotationSignatureBase64Url','newRotationSignatureBase64Url']);
  if(!p)return fail('INVALID_ROTATION_INPUT');
  const oldKey=publicKey(p.oldIssuerPublicJwk,p.pinnedOldIssuerFingerprint);
  if(!oldKey)return fail('UNPINNED_OLD_ISSUER');
  const previous=parseSigned(p.previousBytes,p.previousSignatureBase64Url,oldKey);
  if(!previous)return fail('INVALID_PREVIOUS_SNAPSHOT');
  if(typeof p.expectedPreviousSha256!=='string'||
    previous.sha256!==p.expectedPreviousSha256)
    return fail('PREVIOUS_SNAPSHOT_SUBSTITUTION');
  if(!Number.isSafeInteger(p.minimumEpoch)||p.minimumEpoch<1||
    previous.epoch<p.minimumEpoch)return fail('STALE_PREVIOUS_EPOCH');
  if(!(p.rotationStatementBytes instanceof Uint8Array)||
    p.rotationStatementBytes.length<1||p.rotationStatementBytes.length>8192)
    return fail('INVALID_ROTATION_STATEMENT');
  const statementBytes=Buffer.from(p.rotationStatementBytes);
  const statement=capture(JSON.parse(new TextDecoder('utf-8',{fatal:true})
    .decode(statementBytes)),['schema','oldIssuerFingerprint',
    'newIssuerFingerprint','previousSha256','candidateSha256',
    'previousEpoch','candidateEpoch']);
  if(!statement||statement.schema===undefined||
    statement.schema!==ISSUER_ROTATION_SCHEMA||
    !HEX.test(statement.newIssuerFingerprint)||
    statement.oldIssuerFingerprint!==p.pinnedOldIssuerFingerprint||
    statement.previousSha256!==previous.sha256||
    statement.previousEpoch!==previous.epoch||
    !Number.isSafeInteger(statement.candidateEpoch)||
    statement.candidateEpoch<=previous.epoch||
    !HEX.test(statement.candidateSha256))
    return fail('INVALID_ROTATION_BINDING');
  if(statement.newIssuerFingerprint===statement.oldIssuerFingerprint)
    return fail('NO_ISSUER_KEY_CHANGE');
  const newKey=publicKey(p.newIssuerPublicJwk,statement.newIssuerFingerprint);
  if(!newKey)return fail('INVALID_NEW_ISSUER');
  const candidate=parseSigned(p.candidateBytes,p.candidateSignatureBase64Url,newKey);
  if(!candidate||candidate.epoch!==statement.candidateEpoch||
    candidate.sha256!==statement.candidateSha256)
    return fail('INVALID_CANDIDATE_SNAPSHOT');
  const message=Buffer.concat([ROT_DOMAIN,statementBytes]);
  if(!signatureOK(p.oldRotationSignatureBase64Url,message,oldKey)||
    !signatureOK(p.newRotationSignatureBase64Url,message,newKey))
    return fail('ROTATION_DUAL_SIGNATURE_REQUIRED');
  for(const [id,oldMember] of previous.members){
    const next=candidate.members.get(id);
    if(!next)return fail('ENROLLMENT_DELETION');
    if(oldMember.fingerprint!==next.fingerprint)
      return fail('WITNESS_KEY_REBOUND');
    if(oldMember.status==='REVOKED'&&next.status!=='REVOKED')
      return fail('REVOCATION_ROLLBACK');
  }
  return {schema:ISSUER_ROTATION_SCHEMA,rotationConsistent:true,
    oldIssuerFingerprint:p.pinnedOldIssuerFingerprint,
    newIssuerFingerprint:statement.newIssuerFingerprint,
    previousEpoch:previous.epoch,candidateEpoch:candidate.epoch,
    unresolvedGates:['INDEPENDENT_OLD_ISSUER_KEY_PIN',
      'INDEPENDENT_PROTECTED_OLD_SNAPSHOT','EXTERNAL_DUAL_APPROVAL',
      'TRUSTED_REVOCATION_FRESHNESS','ATOMIC_NEW_KEY_PIN_PUBLICATION'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
    executionAllowed:false,releaseAllowed:false};
 }catch{return fail('MALFORMED_UNTRUSTED_ROTATION');}
}
