import {createHash,createPublicKey,verify} from 'node:crypto';

export const FENCING_WITNESS_SCHEMA='palaco-citadel-fencing-witness-v1';
export const FENCING_RECONCILIATION_SCHEMA='palaco-citadel-fencing-reconciliation-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-FENCING-WITNESS-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const FIELDS=['schema','registryKey','epoch','leaderId','tokenSha256','storeVersion','checkpointHeadSha256'];
const EVIDENCE=['claim','witnessId','witnessPublicJwk','expectedWitnessFingerprint','signatureBase64Url'];
const deny=(reason)=>({schema:FENCING_RECONCILIATION_SCHEMA,consistent:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,releaseAllowed:false,executionAllowed:false});
function record(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const ks=Reflect.ownKeys(o);
 if(ks.length!==fields.length||ks.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
 const out={};
 for(const k of fields){const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
function validClaim(c){
 return c&&c.schema===FENCING_WITNESS_SCHEMA&&
 typeof c.registryKey==='string'&&/^[a-z0-9-]{3,80}$/.test(c.registryKey)&&
 typeof c.leaderId==='string'&&/^[a-z0-9-]{3,80}$/.test(c.leaderId)&&
 Number.isSafeInteger(c.epoch)&&c.epoch>0&&
 Number.isSafeInteger(c.storeVersion)&&c.storeVersion>0&&
 [c.tokenSha256,c.checkpointHeadSha256].every(x=>typeof x==='string'&&HEX.test(x));
}
/** Signed, caller-provided leadership witness comparison only. No election, consensus or I/O. */
export function inspectFencingWitnessReconciliation(input={}){
 try{
  const x=record(input,['observations','requiredWitnessIds','expectedClaim','minimumEpoch']);
  if(!x||!Array.isArray(x.observations)||!Array.isArray(x.requiredWitnessIds)||
   x.observations.length<2||x.observations.length>5||
   x.requiredWitnessIds.length!==x.observations.length||
   !Number.isSafeInteger(x.minimumEpoch)||x.minimumEpoch<1)return deny('INVALID_INPUT');
  const expected=record(x.expectedClaim,FIELDS);
  if(!validClaim(expected))return deny('INVALID_EXPECTED_CLAIM');
  if(expected.epoch<x.minimumEpoch)return deny('EXPECTED_EPOCH_ROLLBACK');
  const required=new Set();
  for(const id of x.requiredWitnessIds){
   if(typeof id!=='string'||!/^[a-z0-9-]{3,80}$/.test(id)||required.has(id))
    return deny('INVALID_WITNESS_ROSTER');
   required.add(id);
  }
  const seen=new Set(),fingerprints=new Set(),claims=[];
  for(const observation of x.observations){
   const o=record(observation,EVIDENCE);
   if(!o||!required.has(o.witnessId)||seen.has(o.witnessId))return deny('INVALID_OBSERVATION');
   seen.add(o.witnessId);
   const claim=record(o.claim,FIELDS);
   const jwk=record(o.witnessPublicJwk,['kty','crv','x','y']);
   if(!validClaim(claim)||!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||
    typeof jwk.x!=='string'||typeof jwk.y!=='string'||
    !/^[A-Za-z0-9_-]{43}$/.test(jwk.x)||!/^[A-Za-z0-9_-]{43}$/.test(jwk.y)||
    typeof o.expectedWitnessFingerprint!=='string'||!HEX.test(o.expectedWitnessFingerprint)||
    fingerprints.has(o.expectedWitnessFingerprint)||
    typeof o.signatureBase64Url!=='string'||!/^[A-Za-z0-9_-]{11,107}$/.test(o.signatureBase64Url))
    return deny('INVALID_WITNESS_EVIDENCE');
   fingerprints.add(o.expectedWitnessFingerprint);
   const key=createPublicKey({format:'jwk',key:jwk});
   if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')
    return deny('INVALID_WITNESS_KEY');
   const fingerprint=createHash('sha256').update(key.export({format:'der',type:'spki'})).digest('hex');
   if(fingerprint!==o.expectedWitnessFingerprint)return deny('WITNESS_KEY_SUBSTITUTION');
   const signature=Buffer.from(o.signatureBase64Url,'base64url');
   if(signature.length<8||signature.length>80||
    signature.toString('base64url')!==o.signatureBase64Url)
    return deny('INVALID_SIGNATURE_ENCODING');
   const payload=Buffer.from(JSON.stringify({claim,witnessId:o.witnessId}));
   if(!verify('sha256',Buffer.concat([DOMAIN,payload]),key,signature))
    return deny('INVALID_WITNESS_SIGNATURE');
   if(claim.epoch<x.minimumEpoch)return deny('WITNESS_EPOCH_ROLLBACK');
   claims.push(claim);
  }
  if(seen.size!==required.size)return deny('MISSING_WITNESS');
  const first=claims[0];
  if(claims.some(c=>FIELDS.some(k=>c[k]!==first[k])))return deny('SIGNED_LEADER_SPLIT_VIEW');
  if(FIELDS.some(k=>first[k]!==expected[k]))return deny('PINNED_FENCE_MISMATCH');
  return {schema:FENCING_RECONCILIATION_SCHEMA,consistent:true,
   observedEpoch:first.epoch,leaderId:first.leaderId,
   checkedWitnessIds:[...seen].sort(),unresolvedGates:[
    'INDEPENDENT_AUTHENTICATED_WITNESS_READS','EXTERNALLY_PINNED_EPOCH',
    'TRUSTED_WITNESS_ROSTER','REVOCATION_FRESHNESS','DURABLE_ATOMIC_FENCING'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   releaseAllowed:false,executionAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_FENCING_EVIDENCE');}
}
