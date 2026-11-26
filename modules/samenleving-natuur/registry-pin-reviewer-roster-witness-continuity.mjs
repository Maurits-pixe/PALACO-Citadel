import {inspectReviewerRosterCheckpointAttestation} from './registry-pin-reviewer-roster-attestation.mjs';
import {inspectReviewerRosterCheckpointAdvance} from './registry-pin-reviewer-roster-checkpoint.mjs';

export const ROSTER_WITNESS_CONTINUITY_SCHEMA='palaco-citadel-reviewer-roster-witness-continuity-v1';
const deny=reason=>({schema:ROSTER_WITNESS_CONTINUITY_SCHEMA,continuityValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
 releaseAllowed:false,executionAllowed:false});
function record(x,keys){
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.getPrototypeOf(x)!==Object.prototype)return null;
 const own=Reflect.ownKeys(x);
 if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
 const y={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(x,k);if(!d||!Object.hasOwn(d,'value'))return null;y[k]=d.value;}return y;
}
/** Pure, fail-closed preflight. Never reads independently trusted storage, never mutates. */
export function inspectReviewerRosterWitnessContinuity(input={}){
 try{
  const x=record(input,['previousAttestation','candidateAttestation','witnessPublicJwk',
   'expectedWitnessFingerprint','expectedPreviousHeadSha256','nowUtc','transition']);
  if(!x)return deny('INVALID_INPUT');
  const previous=record(x.previousAttestation,['schema','checkpoint','issuedAt','expiresAt','signatureBase64Url']);
  const candidate=record(x.candidateAttestation,['schema','checkpoint','issuedAt','expiresAt','signatureBase64Url']);
  if(!previous||!candidate)return deny('INVALID_ATTESTATION_INPUT');
  const verifyAttestation=(attestation,expectedCheckpointHeadSha256)=>inspectReviewerRosterCheckpointAttestation({
    attestation,witnessPublicJwk:x.witnessPublicJwk,
    expectedWitnessFingerprint:x.expectedWitnessFingerprint,
    expectedCheckpointHeadSha256,nowUtc:x.nowUtc
  });
  const verifiedBefore=verifyAttestation(previous,x.expectedPreviousHeadSha256);
  if(!verifiedBefore.attestationValid)return deny('PREVIOUS_'+verifiedBefore.reason);
  // Check transition against previously signed checkpoint, not a candidate-controlled pin.
  const proposed=inspectReviewerRosterCheckpointAdvance({
    currentPin:previous.checkpoint,expectedPin:previous.checkpoint,transition:x.transition
  });
  if(!proposed.checkpointMatched)return deny('TRANSITION_'+proposed.reason);
  const expected=proposed.proposedCheckpoint;
  const received=record(candidate.checkpoint,
    ['schema','sequence','revision','issuerFingerprint','rosterSha256','headSha256']);
  if(!received)return deny('INVALID_CANDIDATE_CHECKPOINT');
  if(Object.keys(expected).some(k=>received[k]!==expected[k]))
    return deny('CANDIDATE_CHECKPOINT_MISMATCH');
  // Candidate signature is verified only after binding candidate to the transition-derived head.
  const verifiedAfter=verifyAttestation(candidate,expected.headSha256);
  if(!verifiedAfter.attestationValid)return deny('CANDIDATE_'+verifiedAfter.reason);
  if(Date.parse(candidate.issuedAt)<Date.parse(previous.issuedAt))
    return deny('WITNESS_TIME_ROLLBACK');
  return {schema:ROSTER_WITNESS_CONTINUITY_SCHEMA,continuityValid:true,
    previousSequence:previous.checkpoint.sequence,candidateSequence:expected.sequence,
    previousHeadSha256:previous.checkpoint.headSha256,candidateHeadSha256:expected.headSha256,
    unresolvedGates:['INDEPENDENT_AUTHENTICATED_CHECKPOINT_READ',
      'INDEPENDENT_WITNESS_KEY_CUSTODY','DURABLE_ATOMIC_PERSISTENCE',
      'TRUSTED_CLOCK','FRESH_REVOCATION','INDEPENDENT_PUBLICATION'],
    trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
    releaseAllowed:false,executionAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_CONTINUITY');}
}
