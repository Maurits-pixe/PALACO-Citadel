import {inspectReviewerRosterCheckpointAdvance} from './registry-pin-reviewer-roster-checkpoint.mjs';
import {inspectReviewerRosterWitnessQuorum} from './registry-pin-reviewer-roster-witness-quorum.mjs';

export const ROSTER_QUORUM_CONTINUITY_SCHEMA='palaco-citadel-reviewer-roster-quorum-continuity-v1';
const deny=reason=>({schema:ROSTER_QUORUM_CONTINUITY_SCHEMA,continuityValid:false,reason,
  trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
  executionAllowed:false,releaseAllowed:false});
function capture(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const own=Reflect.ownKeys(o);
 if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const out={};
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
/**
 * Offline preflight: bind N-of-N signed prior and candidate checkpoint
 * attestations to one signed reviewer roster transition. The previous
 * checkpoint is caller-pinned; this function is not a protected read.
 */
export function inspectReviewerRosterQuorumContinuity(input={}){
 try{
  const x=capture(input,['previousCheckpoint','transition',
   'previousAttestations','candidateAttestations','expectedWitnessFingerprints','nowUtc']);
  if(!x)return deny('INVALID_INPUT');
  const previous=inspectReviewerRosterWitnessQuorum({
   attestations:x.previousAttestations,
   expectedWitnessFingerprints:x.expectedWitnessFingerprints,
   expectedCheckpointHeadSha256:capture(x.previousCheckpoint,
    ['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256'])?.headSha256,
   nowUtc:x.nowUtc
  });
  if(!previous.quorumValid)return deny('PREVIOUS_'+previous.reason);
  const cp=capture(x.previousCheckpoint,
   ['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256']);
  if(!cp)return deny('INVALID_PREVIOUS_CHECKPOINT');
  // The quorum verifies the complete prior checkpoint, not just its head hash.
  for(let i=0;i<x.previousAttestations.length;i++){
   const d=Object.getOwnPropertyDescriptor(x.previousAttestations,String(i));
   if(!d||!Object.hasOwn(d,'value'))return deny('INVALID_PREVIOUS_WITNESS_ENTRY');
   const entry=capture(d.value,['attestation','witnessPublicJwk','expectedWitnessFingerprint']);
   const att=entry&&capture(entry.attestation,['schema','checkpoint','issuedAt','expiresAt','signatureBase64Url']);
   const signed=att&&capture(att.checkpoint,
    ['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256']);
   if(!signed||Object.keys(cp).some(k=>signed[k]!==cp[k]))
    return deny('PREVIOUS_CHECKPOINT_MISMATCH');
  }
  const advance=inspectReviewerRosterCheckpointAdvance({
   currentPin:cp,expectedPin:cp,transition:x.transition
  });
  if(!advance.checkpointMatched)return deny('TRANSITION_'+advance.reason);
  const expected=advance.proposedCheckpoint;
  const candidate=inspectReviewerRosterWitnessQuorum({
   attestations:x.candidateAttestations,
   expectedWitnessFingerprints:x.expectedWitnessFingerprints,
   expectedCheckpointHeadSha256:expected.headSha256,
   nowUtc:x.nowUtc
  });
  if(!candidate.quorumValid)return deny('CANDIDATE_'+candidate.reason);
  for(let i=0;i<x.candidateAttestations.length;i++){
   const d=Object.getOwnPropertyDescriptor(x.candidateAttestations,String(i));
   if(!d||!Object.hasOwn(d,'value'))return deny('INVALID_CANDIDATE_WITNESS_ENTRY');
   const entry=capture(d.value,['attestation','witnessPublicJwk','expectedWitnessFingerprint']);
   const att=entry&&capture(entry.attestation,['schema','checkpoint','issuedAt','expiresAt','signatureBase64Url']);
   const signed=att&&capture(att.checkpoint,
    ['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256']);
   if(!signed||Object.keys(expected).some(k=>signed[k]!==expected[k]))
    return deny('CANDIDATE_CHECKPOINT_MISMATCH');
  }
  return {schema:ROSTER_QUORUM_CONTINUITY_SCHEMA,continuityValid:true,
   witnessCount:candidate.witnessCount,previousHeadSha256:cp.headSha256,
   candidateHeadSha256:expected.headSha256,
   previousRevision:cp.revision,candidateRevision:expected.revision,
   unresolvedGates:['AUTHENTICATED_EXTERNAL_TRUST_PINS',
    'INDEPENDENT_WITNESS_KEY_CUSTODY','DURABLE_ATOMIC_CHECKPOINT_STORAGE',
    'FRESH_REVOCATION','TRUSTED_CLOCK','INDEPENDENT_PUBLICATION'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   executionAllowed:false,releaseAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_INPUT');}
}
