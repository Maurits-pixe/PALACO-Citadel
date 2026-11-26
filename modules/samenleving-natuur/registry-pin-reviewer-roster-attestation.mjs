import {createHash,createPublicKey,verify} from 'node:crypto';
import {REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';

export const ROSTER_ATTESTATION_SCHEMA='palaco-citadel-reviewer-roster-attestation-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-ATTESTATION-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const deny=reason=>({schema:ROSTER_ATTESTATION_SCHEMA,attestationValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
 executionAllowed:false,releaseAllowed:false});
function shape(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const own=Reflect.ownKeys(o);
 if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const out={};
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
const digest=b=>createHash('sha256').update(b).digest('hex');
/** Verifies a separately signed checkpoint. All keys, pins and time are caller-provided:
 * this is NOT an independent authenticated storage read or a trust decision.
 */
export function inspectReviewerRosterCheckpointAttestation(input={}){
 try{
  const a=shape(input,['attestation','witnessPublicJwk','expectedWitnessFingerprint',
   'expectedCheckpointHeadSha256','nowUtc']);
  if(!a)return deny('INVALID_INPUT');
  const e=shape(a.attestation,['schema','checkpoint','issuedAt','expiresAt','signatureBase64Url']);
  const cp=e&&shape(e.checkpoint,['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256']);
  const k=shape(a.witnessPublicJwk,['kty','crv','x','y']);
  if(!e||!cp||!k||e.schema!==ROSTER_ATTESTATION_SCHEMA||
   cp.schema!==REVIEWER_ROSTER_CHECKPOINT_SCHEMA||
   !Number.isSafeInteger(cp.sequence)||cp.sequence<1||cp.sequence>=4096||
   !Number.isSafeInteger(cp.revision)||cp.revision<1||
   ![cp.issuerFingerprint,cp.rosterSha256,cp.headSha256,
     a.expectedWitnessFingerprint,a.expectedCheckpointHeadSha256].every(v=>typeof v==='string'&&HEX.test(v))||
   k.kty!=='EC'||k.crv!=='P-256'||typeof k.x!=='string'||typeof k.y!=='string'||
   !/^[A-Za-z0-9_-]{43}$/.test(k.x)||!/^[A-Za-z0-9_-]{43}$/.test(k.y)||
   typeof e.signatureBase64Url!=='string'||!/^[A-Za-z0-9_-]{11,107}$/.test(e.signatureBase64Url)||
   typeof e.issuedAt!=='string'||typeof e.expiresAt!=='string'||
   typeof a.nowUtc!=='string')return deny('INVALID_ATTESTATION');
  const date=s=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s)?Date.parse(s):NaN;
  const issued=date(e.issuedAt),expires=date(e.expiresAt),now=date(a.nowUtc);
  if(![issued,expires,now].every(Number.isFinite)||issued>=expires||expires-issued>86400000)
   return deny('INVALID_ATTESTATION_WINDOW');
  if(now<issued||now>=expires)return deny('ATTESTATION_NOT_CURRENT');
  if(cp.headSha256!==a.expectedCheckpointHeadSha256)return deny('CHECKPOINT_HEAD_MISMATCH');
  const key=createPublicKey({key:k,format:'jwk'});
  if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||
     digest(key.export({format:'der',type:'spki'}))!==a.expectedWitnessFingerprint)
     return deny('WITNESS_KEY_SUBSTITUTION');
  const sig=Buffer.from(e.signatureBase64Url,'base64url');
  if(sig.toString('base64url')!==e.signatureBase64Url||sig.length<8||sig.length>80)
    return deny('INVALID_SIGNATURE_ENCODING');
  const payload=Buffer.from(JSON.stringify({schema:e.schema,checkpoint:cp,
   issuedAt:e.issuedAt,expiresAt:e.expiresAt}));
  if(!verify('sha256',Buffer.concat([DOMAIN,payload]),key,sig))
   return deny('INVALID_ATTESTATION_SIGNATURE');
  return {schema:ROSTER_ATTESTATION_SCHEMA,attestationValid:true,
   checkpointHeadSha256:cp.headSha256,checkpointRevision:cp.revision,
   unresolvedGates:['INDEPENDENT_AUTHENTICATED_CHECKPOINT_READ',
    'INDEPENDENT_WITNESS_KEY_CUSTODY','DURABLE_ATOMIC_PERSISTENCE',
    'FRESH_REVOCATION','INDEPENDENT_PUBLICATION'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   executionAllowed:false,releaseAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_ATTESTATION');}
}
