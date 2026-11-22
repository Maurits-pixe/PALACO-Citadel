import { createHash } from 'node:crypto';
import { inspectSignedAuditHeadAnchor } from './registry-pin-audit-anchor.mjs';

export const ANCHOR_CONTINUITY_SCHEMA = 'palaco-citadel-anchor-continuity-v1';
const HEX = /^[a-f0-9]{64}$/;
const refuse = reason => ({
  schema:ANCHOR_CONTINUITY_SCHEMA,continuityVerified:false,reason,
  trust:'NOT_ESTABLISHED',authorization:'DENY',
  releaseAllowed:false,executionAllowed:false,stateChanged:false
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Pure local cross-check of two separately signed audit checkpoints.
 * A genuinely independent protected copy of the old checkpoint's exact byte
 * digest and minimum sequence is essential. Caller-provided values alone do
 * not establish trust; this function NEVER writes or authorizes.
 */
export function inspectAuditAnchorContinuity(input = {}) {
  try {
    const { previousAnchor, candidateAnchor, genesisPin, entries,
      anchorPublicJwk, expectedAnchorKeyFingerprint,
      trustedPreviousAnchorSha256, trustedPreviousSequence } = input;
    if (!previousAnchor || !candidateAnchor ||
      !(previousAnchor.bytes instanceof Uint8Array) ||
      !(candidateAnchor.bytes instanceof Uint8Array) ||
      typeof previousAnchor.signatureBase64Url !== 'string' ||
      typeof candidateAnchor.signatureBase64Url !== 'string' ||
      !Array.isArray(entries) || entries.length === 0 || entries.length > 4096 ||
      typeof trustedPreviousAnchorSha256 !== 'string' ||
      !HEX.test(trustedPreviousAnchorSha256) ||
      !Number.isSafeInteger(trustedPreviousSequence) ||
      trustedPreviousSequence < 0 ||
      trustedPreviousSequence >= entries.length)
      return refuse('INVALID_CONTINUITY_INPUT');

    const oldBytes = Buffer.from(previousAnchor.bytes);
    const newBytes = Buffer.from(candidateAnchor.bytes);
    if (!oldBytes.length || !newBytes.length || oldBytes.length > 8192 ||
      newBytes.length > 8192) return refuse('INVALID_ANCHOR_BYTES');
    if (sha(oldBytes) !== trustedPreviousAnchorSha256)
      return refuse('PREVIOUS_ANCHOR_SUBSTITUTED');

    // A valid signature alone cannot assert that an anchor was independently
    // published. Previous byte digest must be independently held.
    const previousDoc = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(oldBytes));
    const currentDoc = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(newBytes));
    if (!previousDoc || !currentDoc ||
      previousDoc.sequence !== trustedPreviousSequence ||
      currentDoc.sequence !== entries.length ||
      currentDoc.sequence <= previousDoc.sequence ||
      !previousDoc.currentPin || !currentDoc.currentPin)
      return refuse('ANCHOR_SEQUENCE_CONFLICT');

    const oldProof = inspectSignedAuditHeadAnchor({
      anchorBytes:oldBytes,
      signatureBase64Url:previousAnchor.signatureBase64Url,
      anchorPublicJwk,expectedAnchorKeyFingerprint,genesisPin,
      entries:entries.slice(0,trustedPreviousSequence),
      currentPin:previousDoc.currentPin,
      minimumAnchorSequence:trustedPreviousSequence
    });
    if (!oldProof.anchoredLedgerMatched)
      return refuse('PREVIOUS_'+oldProof.reason);

    const newProof = inspectSignedAuditHeadAnchor({
      anchorBytes:newBytes,
      signatureBase64Url:candidateAnchor.signatureBase64Url,
      anchorPublicJwk,expectedAnchorKeyFingerprint,genesisPin,
      entries,currentPin:currentDoc.currentPin,
      minimumAnchorSequence:trustedPreviousSequence+1
    });
    if (!newProof.anchoredLedgerMatched)
      return refuse('CANDIDATE_'+newProof.reason);
    if (oldProof.anchoredHeadHash === newProof.anchoredHeadHash)
      return refuse('HEAD_NOT_ADVANCED');

    return {
      schema:ANCHOR_CONTINUITY_SCHEMA,continuityVerified:true,
      previousSequence:trustedPreviousSequence,
      candidateSequence:currentDoc.sequence,
      previousAnchorSha256:sha(oldBytes),
      candidateAnchorSha256:sha(newBytes),
      candidateHeadHash:newProof.anchoredHeadHash,
      unresolvedGates:['PROTECTED_PRIOR_ANCHOR_AND_SEQUENCE',
        'INDEPENDENT_PUBLICATION','TRUSTED_CLOCK_AND_KEY_LIFECYCLE'],
      trust:'NOT_ESTABLISHED',authorization:'DENY',
      executionAllowed:false,releaseAllowed:false,stateChanged:false
    };
  }catch{return refuse('MALFORMED_OR_UNTRUSTED_INPUT');}
}
