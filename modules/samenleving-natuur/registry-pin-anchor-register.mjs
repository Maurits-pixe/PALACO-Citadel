import { createHash } from 'node:crypto';
import { inspectAuditAnchorContinuity } from './registry-pin-anchor-continuity.mjs';

export const ANCHOR_REGISTER_SCHEMA='palaco-citadel-protected-anchor-register-preflight-v1';
const HEX=/^[0-9a-f]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=reason=>({schema:ANCHOR_REGISTER_SCHEMA,
  candidateAccepted:false,reason,proposedRecord:null,
  trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
  executionAllowed:false,releaseAllowed:false});
const data=(o,keys)=>o!==null && typeof o==='object' && !Array.isArray(o) &&
  Object.getPrototypeOf(o)===Object.prototype &&
  Reflect.ownKeys(o).length===keys.length &&
  keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(o,k)??{},'value'));

/**
 * No I/O, no persistence, no trusted-anchor distribution, no time authority.
 * The proposedRecord is a mathematical model, NEVER a write instruction.
 * An independent store must authenticate the expected head and atomically
 * enforce the CAS condition, not trust caller-provided values.
 */
export function inspectAnchorRegisterAdvance(input={}) {
  try {
    const { storedRecord,expectedRecord,candidateAnchor,
      previousAnchor,genesisPin,entries,anchorPublicJwk,
      expectedAnchorKeyFingerprint }=input;
    const recordKeys=['schema','sequence','anchorSha256','ledgerHeadSha256',
      'anchorKeyFingerprint'];
    if(!data(storedRecord,recordKeys) || !data(expectedRecord,recordKeys) ||
      storedRecord.schema!==ANCHOR_REGISTER_SCHEMA ||
      expectedRecord.schema!==ANCHOR_REGISTER_SCHEMA ||
      !Number.isSafeInteger(storedRecord.sequence) ||
      storedRecord.sequence<0 ||
      !HEX.test(storedRecord.anchorSha256) ||
      !HEX.test(storedRecord.ledgerHeadSha256) ||
      !HEX.test(storedRecord.anchorKeyFingerprint) ||
      !Number.isSafeInteger(expectedRecord.sequence) ||
      !HEX.test(expectedRecord.anchorSha256) ||
      !HEX.test(expectedRecord.ledgerHeadSha256) ||
      !HEX.test(expectedRecord.anchorKeyFingerprint))
      return fail('INVALID_REGISTER_RECORD');
    if(storedRecord.sequence!==expectedRecord.sequence ||
      storedRecord.anchorSha256!==expectedRecord.anchorSha256 ||
      storedRecord.ledgerHeadSha256!==expectedRecord.ledgerHeadSha256 ||
      storedRecord.anchorKeyFingerprint!==expectedRecord.anchorKeyFingerprint)
      return fail('CAS_CONFLICT');
    if(!candidateAnchor || !(candidateAnchor.bytes instanceof Uint8Array) ||
      !previousAnchor || !(previousAnchor.bytes instanceof Uint8Array) ||
      expectedAnchorKeyFingerprint!==storedRecord.anchorKeyFingerprint)
      return fail('UNTRUSTED_ANCHOR_KEY_OR_BYTES');
    // Check the stored exact anchor separately; it cannot be silently swapped
    // by supplying a new anchor with a different hash.
    const oldCopy=Buffer.from(previousAnchor.bytes);
    if(sha(oldCopy)!==storedRecord.anchorSha256)
      return fail('STORED_ANCHOR_MISMATCH');
    const proof=inspectAuditAnchorContinuity({
      previousAnchor,candidateAnchor,genesisPin,entries,anchorPublicJwk,
      expectedAnchorKeyFingerprint,
      trustedPreviousAnchorSha256:storedRecord.anchorSha256,
      trustedPreviousSequence:storedRecord.sequence
    });
    if(!proof.continuityVerified) return fail('CONTINUITY_'+proof.reason);
    if(proof.previousSequence!==storedRecord.sequence ||
      proof.candidateSequence<=storedRecord.sequence ||
      proof.previousAnchorSha256!==storedRecord.anchorSha256)
      return fail('NON_MONOTONE_ANCHOR');
    const previousDoc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(oldCopy));
    if(previousDoc.headHash!==storedRecord.ledgerHeadSha256)
      return fail('STORED_LEDGER_HEAD_MISMATCH');
    return {
      schema:ANCHOR_REGISTER_SCHEMA,candidateAccepted:true,
      proposedRecord:{
        schema:ANCHOR_REGISTER_SCHEMA,
        sequence:proof.candidateSequence,
        anchorSha256:proof.candidateAnchorSha256,
        ledgerHeadSha256:proof.candidateHeadHash,
        anchorKeyFingerprint:storedRecord.anchorKeyFingerprint
      },
      unresolvedGates:['INDEPENDENT_IMMUTABLE_ANCHOR_STORAGE',
        'AUTHENTICATED_ATOMIC_CAS','TRUSTED_KEY_LIFECYCLE_AND_TIME'],
      trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
      executionAllowed:false,releaseAllowed:false
    };
  }catch{return fail('MALFORMED_OR_UNTRUSTED_INPUT');}
}
