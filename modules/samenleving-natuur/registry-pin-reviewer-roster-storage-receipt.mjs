import {createHash,createPublicKey,verify} from 'node:crypto';
import {REVIEWER_ROSTER_CHECKPOINT_SCHEMA} from './registry-pin-reviewer-roster-checkpoint.mjs';

export const ROSTER_STORAGE_RECEIPT_SCHEMA='palaco-citadel-reviewer-roster-storage-receipt-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-REVIEWER-ROSTER-STORAGE-RECEIPT-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const deny=reason=>({schema:ROSTER_STORAGE_RECEIPT_SCHEMA,receiptValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
 executionAllowed:false,releaseAllowed:false});
function record(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const keys=Reflect.ownKeys(o);
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
 const result={};
 for(const key of fields){const d=Object.getOwnPropertyDescriptor(o,key);
  if(!d||!Object.hasOwn(d,'value'))return null;result[key]=d.value;}
 return result;
}
const cpFields=['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256'];
const hex=x=>typeof x==='string'&&HEX.test(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
/** Offline, read-only proof-of-signature inspection; does NOT read a remote store. */
export function inspectReviewerRosterStorageReceipt(input={}){
 try{
  const x=record(input,['receipt','storagePublicJwk','expectedStorageFingerprint',
   'expectedCheckpoint','expectedStoreId','minimumStoreVersion','nowUtc']);
  if(!x)return deny('INVALID_INPUT');
  const receipt=record(x.receipt,['schema','storeId','storeVersion','checkpoint','committedAt','signatureBase64Url']);
  const cp=receipt&&record(receipt.checkpoint,cpFields);
  const expected=record(x.expectedCheckpoint,cpFields);
  const keyDoc=record(x.storagePublicJwk,['kty','crv','x','y']);
  if(!receipt||!cp||!expected||!keyDoc||
   receipt.schema!==ROSTER_STORAGE_RECEIPT_SCHEMA||
   cp.schema!==REVIEWER_ROSTER_CHECKPOINT_SCHEMA||
   !Number.isSafeInteger(cp.sequence)||cp.sequence<1||cp.sequence>=4096||
   !Number.isSafeInteger(cp.revision)||cp.revision<1||
   ![cp.issuerFingerprint,cp.rosterSha256,cp.headSha256,
     expected.issuerFingerprint,expected.rosterSha256,expected.headSha256,
     x.expectedStorageFingerprint].every(hex)||
   expected.schema!==REVIEWER_ROSTER_CHECKPOINT_SCHEMA||
   !Number.isSafeInteger(expected.sequence)||expected.sequence<1||
   !Number.isSafeInteger(expected.revision)||expected.revision<1||
   typeof receipt.storeId!=='string'||!/^[-a-z0-9]{3,80}$/.test(receipt.storeId)||
   typeof x.expectedStoreId!=='string'||!/^[-a-z0-9]{3,80}$/.test(x.expectedStoreId)||
   !Number.isSafeInteger(receipt.storeVersion)||receipt.storeVersion<1||
   !Number.isSafeInteger(x.minimumStoreVersion)||x.minimumStoreVersion<1||
   keyDoc.kty!=='EC'||keyDoc.crv!=='P-256'||
   typeof keyDoc.x!=='string'||typeof keyDoc.y!=='string'||
   !/^[A-Za-z0-9_-]{43}$/.test(keyDoc.x)||!/^[A-Za-z0-9_-]{43}$/.test(keyDoc.y)||
   typeof receipt.signatureBase64Url!=='string'||
   !/^[A-Za-z0-9_-]{11,107}$/.test(receipt.signatureBase64Url))
    return deny('INVALID_RECEIPT');
  if(receipt.storeId!==x.expectedStoreId)return deny('STORE_ID_MISMATCH');
  if(receipt.storeVersion<x.minimumStoreVersion)return deny('STORE_VERSION_ROLLBACK');
  if(cpFields.some(k=>cp[k]!==expected[k]))return deny('CHECKPOINT_MISMATCH');
  const timestamp=s=>typeof s==='string'&&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s)?Date.parse(s):NaN;
  const committed=timestamp(receipt.committedAt),now=timestamp(x.nowUtc);
  if(!Number.isFinite(committed)||!Number.isFinite(now))return deny('INVALID_TIME');
  if(committed>now)return deny('FUTURE_COMMIT');
  const key=createPublicKey({format:'jwk',key:keyDoc});
  if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||
   sha(key.export({format:'der',type:'spki'}))!==x.expectedStorageFingerprint)
   return deny('STORAGE_KEY_SUBSTITUTION');
  const sig=Buffer.from(receipt.signatureBase64Url,'base64url');
  if(sig.length<8||sig.length>80||sig.toString('base64url')!==receipt.signatureBase64Url)
   return deny('INVALID_SIGNATURE_ENCODING');
  const payload=Buffer.from(JSON.stringify({schema:receipt.schema,storeId:receipt.storeId,
   storeVersion:receipt.storeVersion,checkpoint:cp,committedAt:receipt.committedAt}));
  if(!verify('sha256',Buffer.concat([DOMAIN,payload]),key,sig))
   return deny('INVALID_RECEIPT_SIGNATURE');
  return {schema:ROSTER_STORAGE_RECEIPT_SCHEMA,receiptValid:true,
   storeId:receipt.storeId,storeVersion:receipt.storeVersion,
   checkpointHeadSha256:cp.headSha256,checkpointRevision:cp.revision,
   unresolvedGates:['INDEPENDENT_AUTHENTICATED_STORAGE_READ','TRUSTED_STORAGE_KEY_CUSTODY',
    'EXTERNALLY_PINNED_STORE_VERSION','ATOMIC_DURABLE_CAS','TRUSTED_CLOCK',
    'FRESH_REVOCATION','INDEPENDENT_PUBLICATION'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   executionAllowed:false,releaseAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_RECEIPT');}
}
