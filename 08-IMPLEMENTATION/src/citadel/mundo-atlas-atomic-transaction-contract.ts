/**
 * MUNDO-ATLAS-ATOMIC-TRANSACTION-CONTRACT-037
 *
 * Non-executable, read-only transaction specification for a future trusted
 * checkpoint writer. This module NEVER calls a database mutation or grants
 * release authority. Receipt validation 036 is a prerequisite, not an
 * atomic consumption or a checkpoint commit. GO-13 HOLD.
 */
import type { AtlasProposalReviewReceipt } from "./mundo-atlas-proposal-receipt";

export interface AtlasCheckpointAtomicIntent {
  readonly receiptId: string;
  readonly proposalDigestHex: string;
  readonly expectedVersion: number;
  readonly expectedDigestHex: string;
  readonly nextVersion: number;
  readonly nextDigestHex: string;
}

export type AtlasAtomicPreflightStatus =
  | "ready-for-design-review" | "conflict" | "replay"
  | "unverified" | "rejected";

export interface AtlasAtomicReadOnlyHost {
  /**
   * Read-only, independently trusted view of BOTH checkpoint and receipt
   * consumption state. It must be obtained from ONE consistent snapshot.
   * Not equivalent to a transaction lock or compare-and-swap.
   */
  readConsistentSnapshot(
    receiptId: string,
  ): Promise<{
    readonly version: number;
    readonly digestHex: string;
    readonly consumedReceiptIds: readonly string[];
  } | null>;
  /**
   * Independently confirm that review receipt 036 was verified for these
   * EXACT immutable input bytes. Caller must not self-assert success.
   */
  verifyDraftReceiptBinding(
    receipt: AtlasProposalReviewReceipt,
  ): Promise<boolean>;
}

export interface AtlasAtomicPreflightReport {
  readonly decision: "HOLD";
  readonly activationPermitted: false;
  readonly mutationPerformed: false;
  readonly status: AtlasAtomicPreflightStatus;
  readonly error: string | null;
  readonly intent: AtlasCheckpointAtomicIntent | null;
}

const ID = /^[A-Za-z0-9._:-]{4,128}$/;
const HASH = /^[a-f0-9]{64}$/;

/**
 * Immutable transaction intent. A real trusted writer must atomically:
 * 1) check predecessor version+digest, 2) reject existing receipt ID,
 * 3) persist the new checkpoint AND mark the receipt consumed in the
 * SAME serializable transaction with unique constraints and durability.
 * Such a writer is intentionally absent here.
 */
export function createAtlasAtomicIntent(
  receipt: AtlasProposalReviewReceipt | unknown,
): AtlasCheckpointAtomicIntent | null {
  if (!receipt || typeof receipt !== "object") return null;
  const r = receipt as Partial<AtlasProposalReviewReceipt>;
  if (Object.keys(r).sort().join(",") !==
      "expectedDigestHex,expectedVersion,proposalDigestHex,proposalId,proposedDigestHex,proposedVersion,receiptId,reviewOutcome,reviewerKeyId,signatureHex" ||
      typeof r.receiptId !== "string" || !ID.test(r.receiptId) ||
      typeof r.proposalId !== "string" || !ID.test(r.proposalId) ||
      typeof r.reviewerKeyId !== "string" || !ID.test(r.reviewerKeyId) ||
      typeof r.signatureHex !== "string" ||
      !/^[a-f0-9]{128}$/.test(r.signatureHex) ||
      typeof r.proposalDigestHex !== "string" ||
      !HASH.test(r.proposalDigestHex) ||
      typeof r.expectedDigestHex !== "string" ||
      !HASH.test(r.expectedDigestHex) ||
      typeof r.proposedDigestHex !== "string" ||
      !HASH.test(r.proposedDigestHex) ||
      !Number.isSafeInteger(r.expectedVersion) ||
      (r.expectedVersion as number) < 1 ||
      !Number.isSafeInteger(r.proposedVersion) ||
      r.proposedVersion !== (r.expectedVersion as number) + 1 ||
      r.reviewOutcome !== "reviewed-for-draft") return null;
  return Object.freeze({
    receiptId: r.receiptId,
    proposalDigestHex: r.proposalDigestHex,
    expectedVersion: r.expectedVersion,
    expectedDigestHex: r.expectedDigestHex,
    nextVersion: r.proposedVersion,
    nextDigestHex: r.proposedDigestHex,
  });
}

/**
 * Read-only preflight helps produce a reviewable spec; it does not reserve a
 * receipt or version. Concurrent writers could invalidate it immediately.
 */
export async function preflightAtlasAtomicIntent(
  receipt: AtlasProposalReviewReceipt | unknown,
  host: AtlasAtomicReadOnlyHost | null,
): Promise<AtlasAtomicPreflightReport> {
  const report = (
    status: AtlasAtomicPreflightStatus,
    error: string | null,
    intent: AtlasCheckpointAtomicIntent | null = null,
  ): AtlasAtomicPreflightReport => Object.freeze({
    status, error, intent,
    decision: "HOLD" as const,
    activationPermitted: false as const,
    mutationPerformed: false as const,
  });
  const intent = createAtlasAtomicIntent(receipt);
  if (!intent) return report("rejected", "INVALID_ATOMIC_INTENT");
  if (!host || typeof host.readConsistentSnapshot !== "function" ||
      typeof host.verifyDraftReceiptBinding !== "function") {
    return report("unverified", "TRUSTED_TRANSACTION_HOST_UNAVAILABLE", intent);
  }
  const frozenReceipt = Object.freeze({
    ...(receipt as AtlasProposalReviewReceipt),
  });
  try {
    if (!await host.verifyDraftReceiptBinding(frozenReceipt)) {
      return report("unverified", "RECEIPT_NOT_INDEPENDENTLY_VERIFIED", intent);
    }
    const snapshot = await host.readConsistentSnapshot(intent.receiptId);
    if (!snapshot || !Number.isSafeInteger(snapshot.version) ||
        typeof snapshot.digestHex !== "string" ||
        !HASH.test(snapshot.digestHex) ||
        !Array.isArray(snapshot.consumedReceiptIds) ||
        snapshot.consumedReceiptIds.length > 10000 ||
        snapshot.consumedReceiptIds.some((id) =>
          typeof id !== "string" || !ID.test(id))) {
      return report("unverified", "CONSISTENT_SNAPSHOT_UNAVAILABLE", intent);
    }
    if (snapshot.consumedReceiptIds.includes(intent.receiptId)) {
      return report("replay", "RECEIPT_ALREADY_CONSUMED", intent);
    }
    if (snapshot.version !== intent.expectedVersion ||
        snapshot.digestHex !== intent.expectedDigestHex) {
      return report("conflict", "PREDECESSOR_VERSION_OR_DIGEST_CHANGED", intent);
    }
    return report("ready-for-design-review", null, intent);
  } catch {
    return report("unverified", "ATOMIC_PREFLIGHT_HOST_ERROR", intent);
  }
}
