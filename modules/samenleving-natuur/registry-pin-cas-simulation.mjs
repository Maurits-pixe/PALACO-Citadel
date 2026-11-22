import { computeRegistryPinEntryHash, inspectRegistryPinLedger } from './registry-pin-ledger.mjs';

export const CAS_SCHEMA = 'palaco-citadel-pin-cas-simulation-v1';
const HEX = /^[0-9a-f]{64}$/;
const plain = (x, keys) => x !== null && typeof x === 'object' &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype &&
  Object.keys(x).length === keys.length &&
  keys.every(k => Object.hasOwn(x,k) &&
    Object.getOwnPropertyDescriptor(x,k)?.get === undefined);
const keys = ['schema','issuerFingerprint','revision','registrySha256'];
const pinOK = x => plain(x,keys) &&
  x.schema === 'palaco-citadel-registry-snapshot-pin-v1' &&
  HEX.test(x.issuerFingerprint) && HEX.test(x.registrySha256) &&
  Number.isSafeInteger(x.revision) && x.revision > 0;
const equalPin = (a,b) => a.revision === b.revision &&
  a.issuerFingerprint === b.issuerFingerprint &&
  a.registrySha256 === b.registrySha256;
const deny = reason => ({
  schema:CAS_SCHEMA, simulationAccepted:false, reason,
  hypotheticalNextState:null, stateChanged:false,
  trust:'NOT_ESTABLISHED', authorization:'DENY',
  executionAllowed:false, releaseAllowed:false
});

/**
 * Pure, side-effect-free model of a compare-and-swap decision.
 * Every value, including the review result, is provided by the caller:
 * this is neither trusted approval nor a database transaction.
 */
export function simulatePinCas({genesisPin, currentState, expectedState,
  proposedPin, dualReview} = {}) {
  try {
    if(!pinOK(genesisPin) || !pinOK(proposedPin) ||
      !plain(currentState,['pin','headHash','entries']) ||
      !pinOK(currentState.pin) || !HEX.test(currentState.headHash) ||
      !Array.isArray(currentState.entries) || currentState.entries.length >= 4096 ||
      !plain(expectedState,['revision','registrySha256','headHash']) ||
      !Number.isSafeInteger(expectedState.revision) ||
      !HEX.test(expectedState.registrySha256) ||
      !HEX.test(expectedState.headHash))
      return deny('MALFORMED_STATE');
    const ledger=inspectRegistryPinLedger({
      genesisPin,entries:currentState.entries,
      expectedHeadHash:currentState.headHash,
      expectedCurrentPin:currentState.pin
    });
    if(!ledger.chainConsistent) return deny('UNVERIFIED_CURRENT_LEDGER');
    if(expectedState.revision !== currentState.pin.revision ||
      expectedState.registrySha256 !== currentState.pin.registrySha256 ||
      expectedState.headHash !== currentState.headHash)
      return deny('CAS_CONFLICT');
    if(proposedPin.issuerFingerprint !== currentState.pin.issuerFingerprint ||
      proposedPin.revision <= currentState.pin.revision)
      return deny('NON_MONOTONIC_PIN');
    const candidate={
      sequence:currentState.entries.length+1,
      previousHash:currentState.headHash,
      fromPin:currentState.pin,
      toPin:proposedPin
    };
    const expectedCandidateHash=computeRegistryPinEntryHash(candidate);
    if(!expectedCandidateHash) return deny('INVALID_CANDIDATE');
    // This is an illustrative comparison only. A supplied dualReview object
    // is not a cryptographic authorization proof and MUST NOT be trusted.
    if(!dualReview || typeof dualReview !== 'object' ||
      dualReview.schema !== 'palaco-citadel-pin-update-review-v1' ||
      dualReview.reviewSignaturesValid !== true ||
      dualReview.proposalConsistent !== true ||
      dualReview.candidateLedgerHash !== expectedCandidateHash ||
      dualReview.authorization !== 'DENY' ||
      dualReview.stateChanged !== false)
      return deny('REVIEW_PRECHECK_MISMATCH');
    const copied = currentState.entries.map(e=>({
      sequence:e.sequence,previousHash:e.previousHash,
      fromPin:{...e.fromPin},toPin:{...e.toPin}
    }));
    const nextEntries=[...copied,{
      sequence:candidate.sequence,previousHash:candidate.previousHash,
      fromPin:{...candidate.fromPin},toPin:{...candidate.toPin}
    }];
    const nextState={
      pin:{...proposedPin},headHash:expectedCandidateHash,entries:nextEntries
    };
    const check=inspectRegistryPinLedger({
      genesisPin,entries:nextEntries,expectedHeadHash:nextState.headHash,
      expectedCurrentPin:nextState.pin
    });
    if(!check.chainConsistent) return deny('NEXT_LEDGER_REJECTED');
    return {
      schema:CAS_SCHEMA,simulationAccepted:true,
      hypotheticalNextState:nextState,
      comparison:{expectedRevision:expectedState.revision,
        expectedHeadHash:expectedState.headHash},
      stateChanged:false,
      unresolvedGates:['PROTECTED_ANCHOR_AND_STATE','ATOMIC_DATABASE_TRANSACTION',
        'AUTHENTICATED_DUAL_REVIEW','TRUSTED_CLOCK_AND_REVOCATION'],
      trust:'NOT_ESTABLISHED',authorization:'DENY',
      executionAllowed:false,releaseAllowed:false
    };
  }catch{return deny('UNTRUSTED_INPUT');}
}
