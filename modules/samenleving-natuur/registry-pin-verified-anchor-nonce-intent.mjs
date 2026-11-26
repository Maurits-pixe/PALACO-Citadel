import {createHash} from 'node:crypto';
import {inspectSignedAnchorObservation} from './registry-pin-signed-anchor-observation.mjs';

export const VERIFIED_NONCE_INTENT_SCHEMA='palaco-citadel-verified-anchor-nonce-intent-v1';
const FIELDS=['envelope','expectedRegistryKey','expectedEpoch','expectedAnchorSha256',
 'expectedNonceSha256','expectedReaderId','expectedReaderFingerprint','nowUtc','maxAgeMs'];
const ENVELOPE=['observation','readerId','readerPublicJwk','expectedReaderFingerprint','signatureBase64Url'];
const OBS=['schema','registryKey','epoch','anchorSha256','nonceSha256','observedAtUtc','expiresAtUtc'];
const HEX=/^[0-9a-f]{64}$/;
const deny=reason=>({schema:VERIFIED_NONCE_INTENT_SCHEMA,intentValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
 executionAllowed:false,releaseAllowed:false});
function exact(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const names=Reflect.ownKeys(o);
 if(names.length!==fields.length||names.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
 const data={};
 for(const name of fields){
  const d=Object.getOwnPropertyDescriptor(o,name);
  if(!d||!Object.hasOwn(d,'value'))return null;
  data[name]=d.value;
 }
 return data;
}
/** Evidence-to-nonce-consumption intent only. Never returns a privileged writer token. */
export function inspectVerifiedAnchorNonceIntent(input={}){
 try{
  const x=exact(input,FIELDS);
  if(!x)return deny('INVALID_INPUT');
  const envelope=exact(x.envelope,ENVELOPE);
  const observation=envelope&&exact(envelope.observation,OBS);
  if(!envelope||!observation)return deny('INVALID_ENVELOPE');
  // Freeze the signed fields into a fresh own-data-only copy. No accessors,
  // symbols or extra fields can affect the digest of accepted evidence.
  const safeEnvelope={observation,readerId:envelope.readerId,
   readerPublicJwk:envelope.readerPublicJwk,
   expectedReaderFingerprint:envelope.expectedReaderFingerprint,
   signatureBase64Url:envelope.signatureBase64Url};
  const verified=inspectSignedAnchorObservation({...x,envelope:safeEnvelope});
  if(!verified.observationValid)return deny('SIGNED_OBSERVATION_'+verified.reason);
  if(typeof observation.nonceSha256!=='string'||!HEX.test(observation.nonceSha256))
   return deny('INVALID_NONCE');
  const canonical={schema:observation.schema,registryKey:observation.registryKey,
   epoch:observation.epoch,anchorSha256:observation.anchorSha256,
   nonceSha256:observation.nonceSha256,observedAtUtc:observation.observedAtUtc,
   expiresAtUtc:observation.expiresAtUtc,readerId:envelope.readerId,
   expectedReaderFingerprint:envelope.expectedReaderFingerprint,
   signatureBase64Url:envelope.signatureBase64Url};
  const observationSha256=createHash('sha256')
   .update('PALACO-CITADEL-VERIFIED-ANCHOR-NONCE-INTENT-V1\n')
   .update(JSON.stringify(canonical)).digest('hex');
  return {schema:VERIFIED_NONCE_INTENT_SCHEMA,intentValid:true,
   proposedNonceConsumption:{registryKey:observation.registryKey,
    nonceSha256:observation.nonceSha256,readerId:envelope.readerId,
    observationSha256,anchorSha256:observation.anchorSha256,epoch:observation.epoch},
   unresolvedGates:['AUTHENTICATED_INDEPENDENT_NONCE_ISSUANCE',
    'TRUSTED_TIME','TRUSTED_READER_KEY_CUSTODY','PERSISTENT_ATOMIC_NONCE_CONSUMPTION',
    'EXTERNAL_MONOTONIC_CHECKPOINT','FRESH_REVOCATION'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   executionAllowed:false,releaseAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_NONCE_INTENT');}
}
