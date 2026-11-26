import {inspectReviewerRosterCheckpointAttestation} from './registry-pin-reviewer-roster-attestation.mjs';

export const ROSTER_WITNESS_QUORUM_SCHEMA='palaco-citadel-reviewer-roster-witness-quorum-v1';
const HEX=/^[0-9a-f]{64}$/;
const deny=reason=>({schema:ROSTER_WITNESS_QUORUM_SCHEMA,quorumValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
 executionAllowed:false,releaseAllowed:false});
function capture(o,keys){
 if(o===null||typeof o!=='object'||Array.isArray(o)||
    Object.getPrototypeOf(o)!==Object.prototype)return null;
 const own=Reflect.ownKeys(o);
 if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const out={};
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
/**
 * Read-only fail-closed N-of-N verification against a caller-supplied
 * expected witness membership set. Never asserts independent key custody.
 * All expected pins and the current time must originate from separately
 * authenticated sources before this can contribute to a trust decision.
 */
export function inspectReviewerRosterWitnessQuorum(input={}){
 try{
  const x=capture(input,['attestations','expectedWitnessFingerprints',
    'expectedCheckpointHeadSha256','nowUtc']);
  if(!x)return deny('INVALID_QUORUM_INPUT');
  if(!Array.isArray(x.attestations)||!Array.isArray(x.expectedWitnessFingerprints)||
     x.attestations.length<2||x.attestations.length>5||
     x.expectedWitnessFingerprints.length!==x.attestations.length||
     typeof x.expectedCheckpointHeadSha256!=='string'||
     !HEX.test(x.expectedCheckpointHeadSha256)||
     typeof x.nowUtc!=='string')return deny('INVALID_QUORUM_POLICY');
  const pins=[];
  for(let i=0;i<x.expectedWitnessFingerprints.length;i++){
    const d=Object.getOwnPropertyDescriptor(x.expectedWitnessFingerprints,String(i));
    if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!HEX.test(d.value))
      return deny('INVALID_WITNESS_ALLOWLIST');
    pins.push(d.value);
  }
  if(new Set(pins).size!==pins.length)return deny('DUPLICATE_EXPECTED_WITNESS');
  const seen=new Set();
  let agreedCheckpoint=null;
  for(let i=0;i<x.attestations.length;i++){
   const d=Object.getOwnPropertyDescriptor(x.attestations,String(i));
   if(!d||!Object.hasOwn(d,'value'))return deny('INVALID_WITNESS_ENTRY');
   const item=capture(d.value,['attestation','witnessPublicJwk','expectedWitnessFingerprint']);
   if(!item)return deny('INVALID_WITNESS_ENTRY');
   if(!pins.includes(item.expectedWitnessFingerprint))return deny('UNENROLLED_WITNESS');
   if(seen.has(item.expectedWitnessFingerprint))return deny('DUPLICATE_ATTESTING_WITNESS');
   seen.add(item.expectedWitnessFingerprint);
   const verified=inspectReviewerRosterCheckpointAttestation({
    attestation:item.attestation,witnessPublicJwk:item.witnessPublicJwk,
    expectedWitnessFingerprint:item.expectedWitnessFingerprint,
    expectedCheckpointHeadSha256:x.expectedCheckpointHeadSha256,nowUtc:x.nowUtc
   });
   if(!verified.attestationValid)return deny('WITNESS_'+verified.reason);
   const cp=capture(item.attestation.checkpoint,
    ['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256']);
   if(!cp)return deny('INVALID_WITNESS_CHECKPOINT');
   if(agreedCheckpoint===null)agreedCheckpoint=cp;
   else if(Object.keys(cp).some(k=>cp[k]!==agreedCheckpoint[k]))
    return deny('WITNESS_CHECKPOINT_DISAGREEMENT');
  }
  if(seen.size!==pins.length)return deny('MISSING_EXPECTED_WITNESS');
  return {schema:ROSTER_WITNESS_QUORUM_SCHEMA,quorumValid:true,
    witnessCount:seen.size,checkpointHeadSha256:agreedCheckpoint.headSha256,
    checkpointRevision:agreedCheckpoint.revision,checkpointSequence:agreedCheckpoint.sequence,
    unresolvedGates:['INDEPENDENT_WITNESS_IDENTITY_AND_KEY_CUSTODY',
     'AUTHENTICATED_EXTERNAL_ALLOWLIST','INDEPENDENT_CHECKPOINT_STORAGE',
     'TRUSTED_CLOCK','FRESH_REVOCATION','ATOMIC_PERSISTENT_CAS'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
    executionAllowed:false,releaseAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_QUORUM');}
}
