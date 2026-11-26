import {inspectSignedFencingTransitionChain} from './registry-pin-signed-fencing-transition-chain.mjs';
import {FENCING_ANCHOR_SCHEMA} from './registry-pin-fencing-epoch-anchor-chain.mjs';

export const SIGNED_ANCHOR_PREFLIGHT_SCHEMA='palaco-citadel-signed-anchor-cas-preflight-v1';
const ANCHOR=['schema','registryKey','epoch','leaderId','tokenSha256','checkpointHeadSha256','anchorSha256'];
const SNAPSHOT=['registryKey','epoch','anchorSha256'];
const SIGNED=['previousAnchor','batches','expectedFinalAnchor','minimumEpoch','requiredWitnessIds','witnessKeyPins'];
const HEX=/^[0-9a-f]{64}$/;
function exact(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const keys=Reflect.ownKeys(o);
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
 const result={};
 for(const k of fields){const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;result[k]=d.value;}
 return result;
}
const deny=reason=>({schema:SIGNED_ANCHOR_PREFLIGHT_SCHEMA,preflightValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
 executionAllowed:false,releaseAllowed:false});
const validSnapshot=s=>s&&typeof s.registryKey==='string'&&/^[a-z0-9-]{3,80}$/.test(s.registryKey)&&
 Number.isSafeInteger(s.epoch)&&s.epoch>0&&typeof s.anchorSha256==='string'&&HEX.test(s.anchorSha256);
/**
 * Read-only preflight. The database anchor snapshot is caller-provided.
 * No CAS writer, trusted remote anchor, or release authority is created here.
 */
export function inspectSignedAnchorCasPreflight(input={}){
 try{
  const x=exact(input,['signedTransitionChain','observedAnchor','expectedCurrentAnchor','expectedCandidateAnchor']);
  if(!x)return deny('INVALID_INPUT');
  const chain=exact(x.signedTransitionChain,SIGNED);
  const current=exact(x.expectedCurrentAnchor,ANCHOR);
  const candidate=exact(x.expectedCandidateAnchor,ANCHOR);
  const observed=exact(x.observedAnchor,SNAPSHOT);
  if(!chain||!current||!candidate||!observed||
   current.schema!==FENCING_ANCHOR_SCHEMA||candidate.schema!==FENCING_ANCHOR_SCHEMA||
   !validSnapshot(observed))return deny('INVALID_ANCHOR_INPUT');
  if(ANCHOR.some(k=>current[k]!==chain.previousAnchor?.[k])||
   ANCHOR.some(k=>candidate[k]!==chain.expectedFinalAnchor?.[k]))
   return deny('SIGNED_CHAIN_PIN_MISMATCH');
  if(observed.registryKey!==current.registryKey||
   observed.epoch!==current.epoch||observed.anchorSha256!==current.anchorSha256)
   return deny('OBSERVED_ANCHOR_CONFLICT');
  if(candidate.registryKey!==current.registryKey||
   !Number.isSafeInteger(candidate.epoch)||candidate.epoch<=current.epoch)
   return deny('NON_ADVANCING_CANDIDATE');
  const verification=inspectSignedFencingTransitionChain(chain);
  if(!verification.verified)return deny('SIGNED_TRANSITION_'+verification.reason);
  if(verification.finalEpoch!==candidate.epoch||
   verification.finalAnchorSha256!==candidate.anchorSha256)
   return deny('VERIFIED_FINAL_ANCHOR_MISMATCH');
  return {schema:SIGNED_ANCHOR_PREFLIGHT_SCHEMA,preflightValid:true,
   proposedCompareAndSwap:{registryKey:current.registryKey,
    expectedEpoch:current.epoch,expectedAnchorSha256:current.anchorSha256,
    nextEpoch:candidate.epoch,nextAnchorSha256:candidate.anchorSha256},
   unresolvedGates:['INDEPENDENT_AUTHENTICATED_ANCHOR_READ',
    'TRUSTED_WITNESS_KEY_CUSTODY','FRESH_REVOCATION',
    'ATOMIC_DURABLE_CAS','EXTERNALLY_PROTECTED_MONOTONIC_FLOOR'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   executionAllowed:false,releaseAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_PREFLIGHT');}
}
