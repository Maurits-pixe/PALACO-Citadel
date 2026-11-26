import {inspectReviewerRosterStorageReceipt} from './registry-pin-reviewer-roster-storage-receipt.mjs';

export const ROSTER_FAILOVER_RECONCILIATION_SCHEMA='palaco-citadel-reviewer-roster-failover-reconciliation-v1';
const CP=['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256'];
const RECEIPT=['schema','storeId','storeVersion','checkpoint','committedAt','signatureBase64Url'];
const OBS=['nodeId','receipt','storagePublicJwk','expectedStorageFingerprint'];
const deny=(reason,extra={})=>({schema:ROSTER_FAILOVER_RECONCILIATION_SCHEMA,
 reconciled:false,reason,...extra,trust:'NOT_ESTABLISHED',authorization:'DENY',
 stateChanged:false,releaseAllowed:false,executionAllowed:false});
function own(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const keys=Reflect.ownKeys(o);
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
 const out={};
 for(const k of fields){const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
const same=(a,b,keys)=>keys.every(k=>a[k]===b[k]);
/**
 * Evidence-only failover reconciliation: independent-looking signed receipts
 * are caller supplied. Agreement DOES NOT provide independent trust.
 */
export function inspectReviewerRosterFailoverReconciliation(input={}){
 try{
  const x=own(input,['observations','expectedCheckpoint','expectedStoreId',
   'minimumStoreVersion','nowUtc','requiredNodeIds']);
  if(!x||!Array.isArray(x.observations)||!Array.isArray(x.requiredNodeIds)||
   x.observations.length<2||x.observations.length>5||
   x.observations.length!==x.requiredNodeIds.length||
   !Number.isSafeInteger(x.minimumStoreVersion)||x.minimumStoreVersion<1)
   return deny('INVALID_INPUT');
  const expected=own(x.expectedCheckpoint,CP);
  if(!expected)return deny('INVALID_EXPECTED_CHECKPOINT');
  const ids=new Set(),signers=new Set(),verified=[];
  for(let i=0;i<x.requiredNodeIds.length;i++){
   const id=x.requiredNodeIds[i];
   if(typeof id!=='string'||!/^[a-z0-9-]{3,80}$/.test(id)||ids.has(id))
    return deny('INVALID_NODE_ROSTER');
   ids.add(id);
  }
  for(const observation of x.observations){
   const o=own(observation,OBS);
   if(!o||!ids.has(o.nodeId)||verified.some(v=>v.nodeId===o.nodeId))
    return deny('INVALID_OBSERVATION');
   const receipt=own(o.receipt,RECEIPT);
   const cp=receipt&&own(receipt.checkpoint,CP);
   if(!receipt||!cp)return deny('INVALID_OBSERVATION');
   if(typeof o.expectedStorageFingerprint!=='string'||
      !/^[0-9a-f]{64}$/.test(o.expectedStorageFingerprint)||
      signers.has(o.expectedStorageFingerprint))
    return deny('DUPLICATE_OR_INVALID_STORAGE_SIGNER');
   signers.add(o.expectedStorageFingerprint);
   // Verify the signed claim of *each* node before comparing versions/heads.
   const verification=inspectReviewerRosterStorageReceipt({
    receipt:o.receipt,storagePublicJwk:o.storagePublicJwk,
    expectedStorageFingerprint:o.expectedStorageFingerprint,
    expectedCheckpoint:receipt.checkpoint,expectedStoreId:x.expectedStoreId,
    minimumStoreVersion:x.minimumStoreVersion,nowUtc:x.nowUtc
   });
   if(!verification.receiptValid)return deny('INVALID_SIGNED_OBSERVATION_'+verification.reason);
   verified.push({nodeId:o.nodeId,storeVersion:verification.storeVersion,
    checkpoint:cp,signer:o.expectedStorageFingerprint});
  }
  if(verified.length!==ids.size)return deny('MISSING_REQUIRED_NODE');
  const baseline=verified[0];
  if(verified.some(v=>v.storeVersion!==baseline.storeVersion||
   !same(v.checkpoint,baseline.checkpoint,CP)))
   return deny('SIGNED_SPLIT_VIEW', {conflictingNodeIds:verified.map(v=>v.nodeId).sort()});
  if(!same(baseline.checkpoint,expected,CP))
   return deny('PINNED_CHECKPOINT_MISMATCH');
  return {schema:ROSTER_FAILOVER_RECONCILIATION_SCHEMA,reconciled:true,
   observedStoreVersion:baseline.storeVersion,
   observedCheckpointHeadSha256:baseline.checkpoint.headSha256,
   checkedNodeIds:verified.map(v=>v.nodeId).sort(),
   unresolvedGates:['AUTHENTICATED_INDEPENDENT_NODE_READS','TRUSTED_NODE_ROSTER',
    'EXTERNAL_VERSION_ANCHOR','FRESH_REVOCATION','ATOMIC_FAILOVER_FENCING',
    'TRUSTED_TIME','INDEPENDENT_STORAGE_KEY_CUSTODY'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   releaseAllowed:false,executionAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_FAILOVER_INPUT');}
}
