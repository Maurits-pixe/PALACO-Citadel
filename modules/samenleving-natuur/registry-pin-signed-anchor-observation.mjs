import {createHash,createPublicKey,verify} from 'node:crypto';

export const ANCHOR_OBSERVATION_SCHEMA='palaco-citadel-anchor-observation-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-ANCHOR-OBSERVATION-V1\n');
const HEX=/^[0-9a-f]{64}$/;
// Enforce canonical DER P-256 ECDSA representation before crypto verification.
// Reject zero, negative, oversized or non-minimally encoded (r,s) scalars.
const P256_ORDER=BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
function canonicalReaderSignature(signature){
 if(signature.length<8||signature.length>72||
    signature[0]!==0x30||signature[1]!==signature.length-2)return false;
 let offset=2;
 for(let component=0;component<2;component++){
  if(offset+2>signature.length||signature[offset]!==0x02)return false;
  const length=signature[offset+1];offset+=2;
  if(length<1||length>33||offset+length>signature.length)return false;
  const first=signature[offset],second=length>1?signature[offset+1]:0;
  if((first&0x80)||(length>1&&first===0&&!(second&0x80))||
     (length===33&&first!==0)||(length===1&&first===0))return false;
  let scalar=0n;
  for(let i=0;i<length;i++)scalar=(scalar<<8n)|BigInt(signature[offset+i]);
  if(scalar===0n||scalar>=P256_ORDER)return false;
  offset+=length;
 }
 return offset===signature.length;
}
const DATA=['schema','registryKey','epoch','anchorSha256','nonceSha256','observedAtUtc','expiresAtUtc'];
const ENVELOPE=['observation','readerId','readerPublicJwk','expectedReaderFingerprint','signatureBase64Url'];
const deny=reason=>({schema:ANCHOR_OBSERVATION_SCHEMA,observationValid:false,reason,
 authorization:'DENY',trust:'NOT_ESTABLISHED',stateChanged:false,executionAllowed:false,releaseAllowed:false});
function record(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const keys=Reflect.ownKeys(o);
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
 const out={};
 for(const k of fields){const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
const identifier=v=>typeof v==='string'&&/^[a-z0-9-]{3,80}$/.test(v);
const hex=v=>typeof v==='string'&&HEX.test(v);
const timestamp=s=>{
 if(typeof s!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s))return NaN;
 const t=Date.parse(s);
 return Number.isFinite(t)&&new Date(t).toISOString()===s?t:NaN;
};
/**
 * An offline authenticated *claim* checker. Caller supplies nonce, time and key pin.
 * No network call, persisted replay register or independent time oracle is available.
 */
export function inspectSignedAnchorObservation(input={}){
 try{
  const x=record(input,['envelope','expectedRegistryKey','expectedEpoch','expectedAnchorSha256',
   'expectedNonceSha256','expectedReaderId','expectedReaderFingerprint','nowUtc','maxAgeMs']);
  if(!x)return deny('INVALID_INPUT');
  const e=record(x.envelope,ENVELOPE);
  const o=e&&record(e.observation,DATA);
  const jwk=e&&record(e.readerPublicJwk,['kty','crv','x','y']);
  if(!e||!o||!jwk||o.schema!==ANCHOR_OBSERVATION_SCHEMA||
   !identifier(o.registryKey)||!identifier(e.readerId)||!identifier(x.expectedRegistryKey)||
   !identifier(x.expectedReaderId)||!Number.isSafeInteger(o.epoch)||o.epoch<1||
   !Number.isSafeInteger(x.expectedEpoch)||x.expectedEpoch<1||
   ![o.anchorSha256,o.nonceSha256,x.expectedAnchorSha256,x.expectedNonceSha256,
     e.expectedReaderFingerprint,x.expectedReaderFingerprint].every(hex)||
   !Number.isSafeInteger(x.maxAgeMs)||x.maxAgeMs<1||x.maxAgeMs>300000||
   jwk.kty!=='EC'||jwk.crv!=='P-256'||
   typeof jwk.x!=='string'||typeof jwk.y!=='string'||
   !/^[A-Za-z0-9_-]{43}$/.test(jwk.x)||!/^[A-Za-z0-9_-]{43}$/.test(jwk.y)||
   typeof e.signatureBase64Url!=='string'||!/^[A-Za-z0-9_-]{11,107}$/.test(e.signatureBase64Url))
   return deny('INVALID_OBSERVATION');
  if(e.readerId!==x.expectedReaderId||e.expectedReaderFingerprint!==x.expectedReaderFingerprint)
   return deny('READER_PIN_MISMATCH');
  if(o.registryKey!==x.expectedRegistryKey||o.epoch!==x.expectedEpoch||
   o.anchorSha256!==x.expectedAnchorSha256)return deny('ANCHOR_CONFLICT');
  if(o.nonceSha256!==x.expectedNonceSha256)return deny('NONCE_MISMATCH');
  const start=timestamp(o.observedAtUtc),end=timestamp(o.expiresAtUtc),now=timestamp(x.nowUtc);
  if(![start,end,now].every(Number.isFinite))return deny('INVALID_TIME');
  if(start>now)return deny('FUTURE_OBSERVATION');
  if(end<=start||end-start>x.maxAgeMs||now>=end||now-start>x.maxAgeMs)
   return deny('EXPIRED_OBSERVATION');
  const key=createPublicKey({format:'jwk',key:jwk});
  if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||
   createHash('sha256').update(key.export({format:'der',type:'spki'})).digest('hex')!==x.expectedReaderFingerprint)
   return deny('READER_KEY_SUBSTITUTION');
  const signature=Buffer.from(e.signatureBase64Url,'base64url');
  if(signature.toString('base64url')!==e.signatureBase64Url||
     !canonicalReaderSignature(signature))
   return deny('INVALID_SIGNATURE_ENCODING');
  const signed=Buffer.from(JSON.stringify({observation:o,readerId:e.readerId}));
  if(!verify('sha256',Buffer.concat([DOMAIN,signed]),key,signature))
   return deny('INVALID_OBSERVATION_SIGNATURE');
  return {schema:ANCHOR_OBSERVATION_SCHEMA,observationValid:true,
   observedEpoch:o.epoch,observedAnchorSha256:o.anchorSha256,readerId:e.readerId,
   unresolvedGates:['INDEPENDENT_AUTHENTICATED_REMOTE_READ','TRUSTED_READER_KEY_CUSTODY',
    'TRUSTED_CLOCK','PERSISTENT_NONCE_REPLAY_REGISTER','EXTERNALLY_PROTECTED_EPOCH_FLOOR',
    'FRESH_REVOCATION','DURABLE_ATOMIC_CAS'],
   authorization:'DENY',trust:'NOT_ESTABLISHED',stateChanged:false,
   executionAllowed:false,releaseAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_OBSERVATION');}
}
