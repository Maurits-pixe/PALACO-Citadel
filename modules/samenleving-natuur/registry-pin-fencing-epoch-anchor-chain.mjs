import {createHash} from 'node:crypto';

export const FENCING_ANCHOR_SCHEMA='palaco-citadel-fencing-epoch-anchor-v1';
const DOMAIN='PALACO-CITADEL-FENCING-EPOCH-CHAIN-V1\n';
const HEX=/^[0-9a-f]{64}$/;
const ANCHOR=['schema','registryKey','epoch','leaderId','tokenSha256','checkpointHeadSha256','anchorSha256'];
const STEP=['registryKey','previousEpoch','epoch','leaderId','tokenSha256','checkpointHeadSha256'];
const deny=reason=>({schema:FENCING_ANCHOR_SCHEMA,chainValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,releaseAllowed:false,executionAllowed:false});
function record(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const ks=Reflect.ownKeys(o);
 if(ks.length!==fields.length||ks.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
 const out={};
 for(const k of fields){const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
const id=s=>typeof s==='string'&&/^[a-z0-9-]{3,80}$/.test(s);
const valid=a=>a&&a.schema===FENCING_ANCHOR_SCHEMA&&id(a.registryKey)&&id(a.leaderId)&&
 Number.isSafeInteger(a.epoch)&&a.epoch>0&&
 [a.tokenSha256,a.checkpointHeadSha256,a.anchorSha256].every(s=>typeof s==='string'&&HEX.test(s));
export function computeFencingAnchorHash(previousAnchorSha256,step){
 const s=record(step,STEP);
 if(typeof previousAnchorSha256!=='string'||!HEX.test(previousAnchorSha256)||!s||
  !id(s.registryKey)||!id(s.leaderId)||!Number.isSafeInteger(s.previousEpoch)||
  !Number.isSafeInteger(s.epoch)||s.previousEpoch<1||s.epoch!==s.previousEpoch+1||
  ![s.tokenSha256,s.checkpointHeadSha256].every(v=>typeof v==='string'&&HEX.test(v)))
  return null;
 return createHash('sha256').update(DOMAIN).update(JSON.stringify({
  previousAnchorSha256,registryKey:s.registryKey,previousEpoch:s.previousEpoch,
  epoch:s.epoch,leaderId:s.leaderId,tokenSha256:s.tokenSha256,
  checkpointHeadSha256:s.checkpointHeadSha256
 })).digest('hex');
}
/**
 * Caller-pinned, read-only fencing epoch hash-chain inspection.
 * No independent publication, remote state, trusted clock or authority.
 */
export function inspectFencingEpochAnchorChain(input={}){
 try{
  const x=record(input,['previousAnchor','transitions','expectedFinalAnchor','minimumEpoch']);
  if(!x||!Array.isArray(x.transitions)||x.transitions.length<1||x.transitions.length>8||
   !Number.isSafeInteger(x.minimumEpoch)||x.minimumEpoch<1)return deny('INVALID_INPUT');
  const previous=record(x.previousAnchor,ANCHOR),final=record(x.expectedFinalAnchor,ANCHOR);
  if(!valid(previous)||!valid(final))return deny('INVALID_ANCHOR');
  if(previous.registryKey!==final.registryKey)return deny('REGISTRY_MISMATCH');
  if(previous.epoch<x.minimumEpoch)return deny('EXTERNAL_EPOCH_FLOOR');
  let current=previous;
  for(const raw of x.transitions){
   const step=record(raw,STEP);
   if(!step||!id(step.registryKey)||!id(step.leaderId)||
    !Number.isSafeInteger(step.previousEpoch)||!Number.isSafeInteger(step.epoch)||
    step.previousEpoch!==current.epoch||step.epoch!==current.epoch+1)
    return deny('NON_CONSECUTIVE_EPOCH');
   if(step.registryKey!==current.registryKey)return deny('REGISTRY_MISMATCH');
   const hash=computeFencingAnchorHash(current.anchorSha256,step);
   if(!hash)return deny('INVALID_TRANSITION');
   current={schema:FENCING_ANCHOR_SCHEMA,registryKey:step.registryKey,
    epoch:step.epoch,leaderId:step.leaderId,tokenSha256:step.tokenSha256,
    checkpointHeadSha256:step.checkpointHeadSha256,anchorSha256:hash};
  }
  if(ANCHOR.some(k=>current[k]!==final[k]))return deny('PINNED_FINAL_ANCHOR_MISMATCH');
  return {schema:FENCING_ANCHOR_SCHEMA,chainValid:true,previousEpoch:previous.epoch,
   finalEpoch:current.epoch,finalAnchorSha256:current.anchorSha256,
   unresolvedGates:['INDEPENDENT_PUBLICATION','EXTERNALLY_PROTECTED_EPOCH_FLOOR',
    'AUTHENTICATED_SIGNED_TRANSITIONS','TRUSTED_KEY_CUSTODY','FRESH_REVOCATION',
    'ATOMIC_FENCING_ENFORCEMENT'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   releaseAllowed:false,executionAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_ANCHOR_CHAIN');}
}
