/**
 * MUNDO-ATLAS-PROPOSAL-RECEIPT-036
 *
 * Read-only verification of an externally issued checkpoint review receipt.
 * No issuance, write, replay ledger mutation, release or authorization.
 * Protected-host guarantees are mandatory. DENY / GO-13 HOLD.
 */
import {
  prepareAtlasCheckpointProposal,
  type AtlasCheckpointProposal,
} from "./mundo-atlas-checkpoint-proposal";
import { canonicalAtlasRegistry } from "./mundo-atlas-registry-checkpoint";

export interface AtlasProposalReviewReceipt {
  readonly receiptId: string;
  readonly proposalId: string;
  readonly expectedVersion: number;
  readonly expectedDigestHex: string;
  readonly proposedVersion: number;
  readonly proposedDigestHex: string;
  /** SHA-256 of domain-separated entire proposal, not a client claim. */
  readonly proposalDigestHex: string;
  /** Precisely the draft review outcome; this is not release approval. */
  readonly reviewOutcome: "reviewed-for-draft";
  readonly reviewerKeyId: string;
  /** Ed25519 signature over the canonical receipt bytes. */
  readonly signatureHex: string;
}

export interface AtlasProposalReceiptHost {
  sha256Hex(message: string): Promise<string>;
  /** Verify the reviewer role, signature, trust anchor and any revocation. */
  verifyTrustedReviewSignature(
    reviewerKeyId: string, signedText: string, signatureHex: string,
  ): Promise<boolean>;
  /** Trusted persistent, independently protected replay ledger, read-only. */
  isReceiptUnused(receiptId: string, proposalDigestHex: string): Promise<boolean>;
  /** Pinned trusted predecessor MUST still have this exact version+digest. */
  isCurrentPredecessor(version: number, digestHex: string): Promise<boolean>;
  /** Must independently confirm review 035 for these EXACT proposal bytes. */
  confirmIndependentDraftReview(proposalDigestHex: string): Promise<boolean>;
}

export interface AtlasProposalReceiptReview {
  readonly decision: "HOLD";
  readonly activationPermitted: false;
  readonly status: "verified-for-draft" | "unverified" | "rejected" | "replay";
  readonly error: string | null;
  readonly receiptId: string | null;
}

const ID = /^[A-Za-z0-9._:-]{4,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const SIGN = /^[a-f0-9]{128}$/;
const PROPOSAL_DOMAIN = "MUNDO-ATLAS-PROPOSAL-036:PROPOSAL:";
const RECEIPT_DOMAIN = "MUNDO-ATLAS-PROPOSAL-036:RECEIPT:";

/** Fixed array layout binds proposal ID, version, register and checkpoint. */
export function canonicalAtlasProposalReceiptPayload(
  proposal: AtlasCheckpointProposal,
): string {
  const checkpoint = proposal.proposedCheckpoint;
  return JSON.stringify([
    "MUNDO-ATLAS-PROPOSAL-036",
    proposal.proposalId, proposal.expectedVersion, proposal.expectedDigestHex,
    canonicalAtlasRegistry(proposal.proposedRegistry),
    checkpoint.version, checkpoint.digestHex, checkpoint.predecessorDigestHex,
    [...checkpoint.previouslyRevokedKeyIds].sort(),
  ]);
}

/** Signed canonical receipt; excludes signature, never accepts extra data. */
export function canonicalAtlasReviewReceipt(
  receipt: AtlasProposalReviewReceipt,
): string {
  return JSON.stringify([
    "MUNDO-ATLAS-PROPOSAL-RECEIPT-036",
    receipt.receiptId, receipt.proposalId,
    receipt.expectedVersion, receipt.expectedDigestHex,
    receipt.proposedVersion, receipt.proposedDigestHex,
    receipt.proposalDigestHex, receipt.reviewOutcome, receipt.reviewerKeyId,
  ]);
}

export async function verifyAtlasProposalReviewReceipt(
  proposal: AtlasCheckpointProposal | unknown,
  receipt: AtlasProposalReviewReceipt | unknown,
  host: AtlasProposalReceiptHost | null,
): Promise<AtlasProposalReceiptReview> {
  const result = (
    status: AtlasProposalReceiptReview["status"],
    error: string | null,
    receiptId: string | null = null,
  ): AtlasProposalReceiptReview => Object.freeze({
    status, error, receiptId,
    decision: "HOLD" as const,
    activationPermitted: false as const,
  });
  if (!host || typeof host.sha256Hex !== "function" ||
      typeof host.verifyTrustedReviewSignature !== "function" ||
      typeof host.isReceiptUnused !== "function" ||
      typeof host.isCurrentPredecessor !== "function" ||
      typeof host.confirmIndependentDraftReview !== "function") {
    return result("unverified", "TRUSTED_RECEIPT_HOST_UNAVAILABLE");
  }
  if (prepareAtlasCheckpointProposal(proposal).status !== "prepared" ||
      !receipt || typeof receipt !== "object") {
    return result("rejected", "INVALID_PROPOSAL_OR_RECEIPT");
  }
  const proposalInput = proposal as AtlasCheckpointProposal;
  const r = receipt as AtlasProposalReviewReceipt;
  const allowed = ["receiptId", "proposalId", "expectedVersion",
    "expectedDigestHex", "proposedVersion", "proposedDigestHex",
    "proposalDigestHex", "reviewOutcome", "reviewerKeyId", "signatureHex"];
  if (Object.keys(r).length !== allowed.length ||
      Object.keys(r).some((key) => !allowed.includes(key)) ||
      typeof r.receiptId !== "string" || !ID.test(r.receiptId) ||
      typeof r.proposalId !== "string" || !ID.test(r.proposalId) ||
      typeof r.reviewerKeyId !== "string" || !ID.test(r.reviewerKeyId) ||
      !Number.isSafeInteger(r.expectedVersion) ||
      !Number.isSafeInteger(r.proposedVersion) ||
      typeof r.expectedDigestHex !== "string" ||
      !HASH.test(r.expectedDigestHex) ||
      typeof r.proposedDigestHex !== "string" ||
      !HASH.test(r.proposedDigestHex) ||
      typeof r.proposalDigestHex !== "string" ||
      !HASH.test(r.proposalDigestHex) ||
      typeof r.signatureHex !== "string" || !SIGN.test(r.signatureHex) ||
      r.reviewOutcome !== "reviewed-for-draft") {
    return result("rejected", "INVALID_RECEIPT_FIELDS");
  }
  if (r.proposalId !== proposalInput.proposalId ||
      r.expectedVersion !== proposalInput.expectedVersion ||
      r.expectedDigestHex !== proposalInput.expectedDigestHex ||
      r.proposedVersion !== proposalInput.proposedCheckpoint.version ||
      r.proposedDigestHex !== proposalInput.proposedCheckpoint.digestHex) {
    return result("rejected", "RECEIPT_PROPOSAL_MISMATCH", r.receiptId);
  }

  // Never pass mutable caller objects to an async host. Canonicalize once.
  let canonicalProposal: string;
  let signedText: string;
  try {
    canonicalProposal = PROPOSAL_DOMAIN +
      canonicalAtlasProposalReceiptPayload(proposalInput);
    signedText = RECEIPT_DOMAIN + canonicalAtlasReviewReceipt(r);
  } catch {
    return result("rejected", "NONCANONICAL_PROPOSAL");
  }
  // No issuance, no one-time reservation, and no irreversible ledger
  // mutation. The real host must atomically consume a receipt at commit.
  try {
    const computed = await host.sha256Hex(canonicalProposal);
    if (computed !== r.proposalDigestHex) {
      return result("rejected", "PROPOSAL_DIGEST_MISMATCH", r.receiptId);
    }
    if (!await host.verifyTrustedReviewSignature(
      r.reviewerKeyId, signedText, r.signatureHex,
    )) return result("unverified", "REVIEW_SIGNATURE_UNTRUSTED", r.receiptId);
    if (!await host.confirmIndependentDraftReview(r.proposalDigestHex)) {
      return result("unverified", "DRAFT_REVIEW_UNCONFIRMED", r.receiptId);
    }
    if (!await host.isReceiptUnused(r.receiptId, r.proposalDigestHex)) {
      return result("replay", "RECEIPT_PREVIOUSLY_USED", r.receiptId);
    }
    if (!await host.isCurrentPredecessor(r.expectedVersion, r.expectedDigestHex)) {
      return result("rejected", "PREDECESSOR_CHANGED", r.receiptId);
    }
    // Recheck the external replay state after asynchronous pin verification.
    // Still not an atomic single-use consume: only the trusted commit host
    // can guarantee it, and this module NEVER commits.
    if (!await host.isReceiptUnused(r.receiptId, r.proposalDigestHex)) {
      return result("replay", "RECEIPT_USED_DURING_REVIEW", r.receiptId);
    }
    return result("verified-for-draft", null, r.receiptId);
  } catch {
    return result("unverified", "RECEIPT_TRUST_ERROR", r.receiptId);
  }
}
