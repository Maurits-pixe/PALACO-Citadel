import {inspectReviewerRosterCheckpointAdvance} from './registry-pin-reviewer-roster-checkpoint.mjs';
import {inspectReviewerRosterStorageReceipt} from './registry-pin-reviewer-roster-storage-receipt.mjs';

export const ROSTER_STORAGE_CONTINUITY_SCHEMA='palaco-citadel-reviewer-roster-storage-continuity-v1';
const FIELDS=['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256'];
const deny=reason=>({schema:ROSTER_STORAGE_CONTINUITY_SCHEMA,continuityValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
 releaseAllowed:false,executionAllowed:false});
function read(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const own=Reflect.ownKeys(o);
 if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const out={};
 for(const k of keys){
  const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;
  out[k]=d.value;
 }
 return out;
}
function receiptFields(o){
 const receipt=read(o,['schema','storeId','storeVersion','checkpoint','committedAt','signatureBase64Url']);
 if(!receipt)return null;
 const checkpoint=read(receipt.checkpoint,FIELDS);
 return checkpoint?{...receipt,checkpoint}:null;
}
/**
 * Read-only signed storage receipt continuity preflight. Both receipts,
 * previous checkpoint, pins, version floor and time are caller-provided.
 * No real database transaction or independent authenticated read is performed.
 */
export function inspectReviewerRosterStorageContinuity(input={}){
 try{
  const x=read(input,['previousReceipt','candidateReceipt','storagePublicJwk',
   'expectedStorageFingerprint','expectedStoreId','minimumPreviousStoreVersion',
   'previousCheckpoint','transition','nowUtc']);
  if(!x)return deny('INVALID_INPUT');
  const prior=read(x.previousCheckpoint,FIELDS);
  const oldReceipt=receiptFields(x.previousReceipt);
  const nextReceipt=receiptFields(x.candidateReceipt);
  if(!prior||!oldReceipt||!nextReceipt)return deny('INVALID_RECEIPT_INPUT');
  const verifyReceipt=(receipt,expectedCheckpoint,minimumStoreVersion)=>
   inspectReviewerRosterStorageReceipt({receipt,storagePublicJwk:x.storagePublicJwk,
    expectedStorageFingerprint:x.expectedStorageFingerprint,
    expectedCheckpoint,expectedStoreId:x.expectedStoreId,
    minimumStoreVersion,nowUtc:x.nowUtc});
  const old=verifyReceipt(x.previousReceipt,prior,x.minimumPreviousStoreVersion);
  if(!old.receiptValid)return deny('PREVIOUS_'+old.reason);
  const advance=inspectReviewerRosterCheckpointAdvance({
   currentPin:prior,expectedPin:prior,transition:x.transition
  });
  if(!advance.checkpointMatched)return deny('TRANSITION_'+advance.reason);
  const next=advance.proposedCheckpoint;
  if(!Number.isSafeInteger(oldReceipt.storeVersion)||
     oldReceipt.storeVersion>=Number.MAX_SAFE_INTEGER)
   return deny('INVALID_PREVIOUS_STORE_VERSION');
  // A new checkpoint requires exactly one subsequent store version.
  // Skipped versions need independently verified intervening receipts.
  if(nextReceipt.storeVersion!==oldReceipt.storeVersion+1)
   return deny('NON_CONSECUTIVE_STORE_VERSION');
  if(Date.parse(nextReceipt.committedAt)<Date.parse(oldReceipt.committedAt))
   return deny('STORAGE_COMMIT_TIME_ROLLBACK');
  const candidate=verifyReceipt(x.candidateReceipt,next,oldReceipt.storeVersion+1);
  if(!candidate.receiptValid)return deny('CANDIDATE_'+candidate.reason);
  return {schema:ROSTER_STORAGE_CONTINUITY_SCHEMA,continuityValid:true,
   previousStoreVersion:oldReceipt.storeVersion,candidateStoreVersion:nextReceipt.storeVersion,
   previousHeadSha256:prior.headSha256,candidateHeadSha256:next.headSha256,
   previousRevision:prior.revision,candidateRevision:next.revision,
   unresolvedGates:['INDEPENDENT_AUTHENTICATED_STORAGE_READ',
    'EXTERNALLY_PROTECTED_VERSION_FLOOR','DURABLE_ATOMIC_COMPARE_AND_SWAP',
    'TRUSTED_STORAGE_KEY_CUSTODY','TRUSTED_CLOCK','FRESH_REVOCATION'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   releaseAllowed:false,executionAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_STORAGE_CONTINUITY');}
}
