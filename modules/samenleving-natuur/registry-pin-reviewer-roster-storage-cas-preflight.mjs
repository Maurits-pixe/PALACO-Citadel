import {inspectReviewerRosterStorageContinuity} from './registry-pin-reviewer-roster-storage-continuity.mjs';

export const ROSTER_STORAGE_CAS_PREFLIGHT_SCHEMA='palaco-citadel-reviewer-roster-storage-cas-preflight-v1';
const CHECKPOINT=['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256'];
const HEX=/^[0-9a-f]{64}$/;
const deny=reason=>({schema:ROSTER_STORAGE_CAS_PREFLIGHT_SCHEMA,preflightValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
 releaseAllowed:false,executionAllowed:false});
function capture(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const names=Reflect.ownKeys(o);
 if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const out={};
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
const integer=x=>Number.isSafeInteger(x)&&x>0;
/**
 * Pure optimistic CAS preflight for untrusted inputs. An observed snapshot
 * supplied by the caller is NOT an independently authenticated database read.
 * No writes, locks, SQL statements, grants, or authority are exercised.
 */
export function inspectReviewerRosterStorageCasPreflight(input={}){
 try{
  const x=capture(input,['expectedState','observedState','previousReceipt','candidateReceipt',
   'storagePublicJwk','expectedStorageFingerprint','expectedStoreId',
   'previousCheckpoint','transition','nowUtc']);
  if(!x)return deny('INVALID_INPUT');
  const F=['storeId','storeVersion','checkpoint'];
  const expected=capture(x.expectedState,F),observed=capture(x.observedState,F);
  if(!expected||!observed)return deny('INVALID_STATE');
  const expectedCp=capture(expected.checkpoint,CHECKPOINT);
  const observedCp=capture(observed.checkpoint,CHECKPOINT);
  const previousCp=capture(x.previousCheckpoint,CHECKPOINT);
  if(!expectedCp||!observedCp||!previousCp||
   typeof expected.storeId!=='string'||!/^[-a-z0-9]{3,80}$/.test(expected.storeId)||
   typeof observed.storeId!=='string'||!/^[-a-z0-9]{3,80}$/.test(observed.storeId)||
   !integer(expected.storeVersion)||!integer(observed.storeVersion)||
   ![expectedCp,observedCp,previousCp].every(cp=>
    cp.schema==='palaco-citadel-reviewer-roster-checkpoint-v1'&&
    integer(cp.sequence)&&cp.sequence<4096&&integer(cp.revision)&&
    [cp.issuerFingerprint,cp.rosterSha256,cp.headSha256].every(h=>typeof h==='string'&&HEX.test(h))))
    return deny('INVALID_STATE');
  if(expected.storeId!==x.expectedStoreId)return deny('EXPECTED_STORE_ID_MISMATCH');
  if(observed.storeId!==expected.storeId||observed.storeVersion!==expected.storeVersion||
   CHECKPOINT.some(k=>observedCp[k]!==expectedCp[k]))
   return deny('CAS_CONFLICT');
  if(CHECKPOINT.some(k=>expectedCp[k]!==previousCp[k]))
   return deny('EXPECTED_CHECKPOINT_MISMATCH');
  const continuity=inspectReviewerRosterStorageContinuity({
   previousReceipt:x.previousReceipt,candidateReceipt:x.candidateReceipt,
   storagePublicJwk:x.storagePublicJwk,
   expectedStorageFingerprint:x.expectedStorageFingerprint,
   expectedStoreId:x.expectedStoreId,
   minimumPreviousStoreVersion:expected.storeVersion,
   previousCheckpoint:previousCp,transition:x.transition,nowUtc:x.nowUtc
  });
  if(!continuity.continuityValid)return deny('STORAGE_'+continuity.reason);
  if(continuity.previousStoreVersion!==expected.storeVersion)
   return deny('PREVIOUS_RECEIPT_VERSION_MISMATCH');
  return {schema:ROSTER_STORAGE_CAS_PREFLIGHT_SCHEMA,preflightValid:true,
   expectedStoreVersion:expected.storeVersion,
   candidateStoreVersion:continuity.candidateStoreVersion,
   previousHeadSha256:previousCp.headSha256,
   candidateHeadSha256:continuity.candidateHeadSha256,
   unresolvedGates:['INDEPENDENT_AUTHENTICATED_STATE_READ',
    'DURABLE_ATOMIC_CAS_TRANSACTION','EXTERNAL_VERSION_PIN',
    'TRUSTED_STORAGE_SIGNER','FRESH_REVOCATION','TRUSTED_CLOCK'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   releaseAllowed:false,executionAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_CAS_INPUT');}
}
