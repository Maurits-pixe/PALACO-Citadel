import {createHash,createPublicKey,verify} from 'node:crypto';
import {inspectWitnessRegistryPolicy,WITNESS_REGISTRY_SCHEMA} from './registry-pin-witness-registry.mjs';

export const SIGNED_WITNESS_REGISTRY_SCHEMA='palaco-citadel-signed-witness-registry-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-SIGNED-WITNESS-REGISTRY-V1\n','utf8');
const HEX=/^[0-9a-f]{64}$/;
const fail=reason=>({schema:SIGNED_WITNESS_REGISTRY_SCHEMA,
  signedRegistryMatched:false,reason,trust:'NOT_ESTABLISHED',
  authorization:'DENY',executionAllowed:false,
  releaseAllowed:false,stateChanged:false});
// Copy own data descriptors exactly once. Never evaluate accessor properties
// or re-read attacker-controlled Proxy fields after initial validation.
const snapshot=(v,keys)=>{
  if(v===null||typeof v!=='object'||Array.isArray(v)||
    Object.getPrototypeOf(v)!==Object.prototype)return null;
  const names=Reflect.ownKeys(v);
  if(names.length!==keys.length||
    names.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
  const copy=Object.create(null);
  for(const name of keys){
    const descriptor=Object.getOwnPropertyDescriptor(v,name);
    if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
    copy[name]=descriptor.value;
  }
  return copy;
};
const hash=b=>createHash('sha256').update(b).digest('hex');

/** Read-only signature verification plus enrollment cross-check.
 * The pinned issuer fingerprint, exact registry hash and epoch floor must be
 * independently protected; providing them as inputs does not establish trust.
 */
export function inspectSignedWitnessRegistry(input={}) {
 try {
  const outer=snapshot(input,['registryBytes','registrySignatureBase64Url',
    'issuerPublicJwk','expectedIssuerFingerprint','expectedRegistrySha256',
    'minimumEpoch','anchorBytes','claimedAnchorSha256','witnesses']);
  if(!outer)return fail('INVALID_SIGNED_REGISTRY_INPUT');
  const {registryBytes,registrySignatureBase64Url,issuerPublicJwk,
    expectedIssuerFingerprint,expectedRegistrySha256,minimumEpoch,
    anchorBytes,claimedAnchorSha256,witnesses}=outer;
  const keySnapshot=snapshot(issuerPublicJwk,['kty','crv','x','y']);
  if(!(registryBytes instanceof Uint8Array)||registryBytes.length<1||
    registryBytes.length>65536||
    typeof registrySignatureBase64Url!=='string'||
    !/^[A-Za-z0-9_-]+$/.test(registrySignatureBase64Url)||
    !keySnapshot||keySnapshot.kty!=='EC'||keySnapshot.crv!=='P-256'||
    typeof keySnapshot.x!=='string'||typeof keySnapshot.y!=='string'||
    !/^[A-Za-z0-9_-]{43}$/.test(keySnapshot.x)||
    !/^[A-Za-z0-9_-]{43}$/.test(keySnapshot.y)||
    typeof expectedIssuerFingerprint!=='string'||!HEX.test(expectedIssuerFingerprint)||
    typeof expectedRegistrySha256!=='string'||!HEX.test(expectedRegistrySha256)||
    !Number.isSafeInteger(minimumEpoch)||minimumEpoch<1)
    return fail('INVALID_SIGNED_REGISTRY_INPUT');
  const bytes=Buffer.from(registryBytes);
  if(hash(bytes)!==expectedRegistrySha256)
    return fail('REGISTRY_BYTES_SUBSTITUTED');
  const key=createPublicKey({format:'jwk',key:keySnapshot});
  if(key.asymmetricKeyType!=='ec'||
    key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||
    hash(key.export({type:'spki',format:'der'}))!==expectedIssuerFingerprint)
    return fail('UNPINNED_REGISTRY_ISSUER');
  const signature=Buffer.from(registrySignatureBase64Url,'base64url');
  if(signature.length<8||signature.length>80||
    signature.toString('base64url')!==registrySignatureBase64Url||
    !verify('sha256',Buffer.concat([DOMAIN,bytes]),key,signature))
    return fail('REGISTRY_SIGNATURE_INVALID');
  const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!exact(doc,['schema','epoch','members'])||
    doc.schema!==WITNESS_REGISTRY_SCHEMA||
    !Number.isSafeInteger(doc.epoch)||doc.epoch<minimumEpoch)
    return fail('REGISTRY_EPOCH_ROLLBACK_OR_SCHEMA');
  const policy=inspectWitnessRegistryPolicy({
    anchorBytes,claimedAnchorSha256,witnesses,
    registry:doc,minimumEpoch
  });
  if(!policy.witnessPolicyMatched)
    return fail('WITNESS_POLICY_'+policy.reason);
  return {schema:SIGNED_WITNESS_REGISTRY_SCHEMA,
    signedRegistryMatched:true,registrySha256:hash(bytes),
    registryEpoch:doc.epoch,witnessesChecked:policy.witnessesChecked,
    unresolvedGates:['INDEPENDENT_PINNED_ISSUER_IDENTITY',
      'PROTECTED_REGISTRY_HASH_AND_EPOCH',
      'TRUSTED_TIME_AND_FRESH_REVOCATION',
      'INDEPENDENT_REGISTRY_PUBLICATION'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',
    executionAllowed:false,releaseAllowed:false,stateChanged:false};
 }catch{return fail('MALFORMED_UNTRUSTED_SIGNED_REGISTRY');}
}
