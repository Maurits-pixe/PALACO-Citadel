/**
 * MUNDO-ATLAS-CHECKPOINT-PROPOSAL-035
 *
 * Read-only, two-stage proposal protocol. It never signs or writes a
 * checkpoint and does not authorize a world or release. GO-13 HOLD.
 */
import {
  reviewAtlasCheckpointTransition,
  type AtlasCheckpointTransitionHost,
} from "./mundo-atlas-checkpoint-transition";
import type { AtlasRegistryCheckpoint } from "./mundo-atlas-registry-checkpoint";
import type { AtlasSignerRegistry } from "./mundo-atlas-signer-trust";

export interface AtlasCheckpointProposal {
  readonly proposalId: string;
  readonly expectedVersion: number;
  readonly expectedDigestHex: string;
  readonly proposedRegistry: AtlasSignerRegistry;
  readonly proposedCheckpoint: AtlasRegistryCheckpoint;
}

export interface AtlasCheckpointProposalHost extends AtlasCheckpointTransitionHost {
  /** Independent approver, NOT the proposal author or untrusted browser. */
  independentlyReviewProposal(
    proposal: AtlasCheckpointProposal,
  ): Promise<boolean>;
}

export interface AtlasCheckpointProposalReview {
  readonly decision: "HOLD";
  readonly activationPermitted: false;
  readonly status: "prepared" | "reviewed-for-draft" | "conflict" | "unverified" | "rejected";
  readonly error: string | null;
  readonly proposalId: string | null;
}

const ID = /^[A-Za-z0-9._:-]{4,128}$/;
const HASH = /^[a-f0-9]{64}$/;

function freezeProposal(value: unknown): AtlasCheckpointProposal | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<AtlasCheckpointProposal>;
  if (Object.keys(input).sort().join(",") !==
        "expectedDigestHex,expectedVersion,proposalId,proposedCheckpoint,proposedRegistry" ||
      typeof input.proposalId !== "string" || !ID.test(input.proposalId) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      (input.expectedVersion as number) < 1 ||
      typeof input.expectedDigestHex !== "string" ||
      !HASH.test(input.expectedDigestHex)) return null;
  const checkpoint = input.proposedCheckpoint;
  const registry = input.proposedRegistry;
  if (!checkpoint || typeof checkpoint !== "object" ||
      Object.keys(checkpoint).sort().join(",") !==
        "digestHex,predecessorDigestHex,previouslyRevokedKeyIds,version" ||
      !Number.isSafeInteger(checkpoint.version) ||
      checkpoint.version !== (input.expectedVersion as number) + 1 ||
      !HASH.test(checkpoint.digestHex) ||
      checkpoint.predecessorDigestHex !== input.expectedDigestHex ||
      !Array.isArray(checkpoint.previouslyRevokedKeyIds) ||
      checkpoint.previouslyRevokedKeyIds.length > 256 ||
      checkpoint.previouslyRevokedKeyIds.some((id) =>
        typeof id !== "string" || !ID.test(id)) ||
      new Set(checkpoint.previouslyRevokedKeyIds).size !==
        checkpoint.previouslyRevokedKeyIds.length ||
      !registry || typeof registry !== "object" ||
      Object.keys(registry).sort().join(",") !== "records,registryVersion" ||
      !Number.isSafeInteger(registry.registryVersion) ||
      registry.registryVersion !== checkpoint.version ||
      !Array.isArray(registry.records) ||
      registry.records.length === 0 || registry.records.length > 256) return null;
  const records: AtlasSignerRegistry["records"][number][] = [];
  const seen = new Set<string>();
  const roles = new Set(["technical-review", "owner-acceptance", "decision-revoked"]);
  for (const item of registry.records) {
    if (!item || typeof item !== "object" ||
        typeof item.keyId !== "string" || !ID.test(item.keyId) ||
        seen.has(item.keyId) || typeof item.publicKeyFingerprint !== "string" ||
        !HASH.test(item.publicKeyFingerprint) ||
        !Array.isArray(item.roles) || item.roles.length === 0 ||
        new Set(item.roles).size !== item.roles.length ||
        item.roles.some((role) => !roles.has(role)) ||
        typeof item.validFrom !== "string" ||
        typeof item.validUntil !== "string" ||
        typeof item.revoked !== "boolean" ||
        (item.replacesKeyId !== undefined &&
          (typeof item.replacesKeyId !== "string" ||
           !ID.test(item.replacesKeyId) || item.replacesKeyId === item.keyId))) {
      return null;
    }
    const allowed = ["keyId", "publicKeyFingerprint", "roles",
      "validFrom", "validUntil", "revoked",
      ...(item.replacesKeyId === undefined ? [] : ["replacesKeyId"])];
    if (Object.keys(item).length !== allowed.length ||
        Object.keys(item).some((key) => !allowed.includes(key))) return null;
    seen.add(item.keyId);
    records.push(Object.freeze({
      keyId: item.keyId,
      publicKeyFingerprint: item.publicKeyFingerprint,
      roles: Object.freeze([...item.roles]),
      validFrom: item.validFrom,
      validUntil: item.validUntil,
      revoked: item.revoked,
      ...(item.replacesKeyId === undefined ? {} :
        { replacesKeyId: item.replacesKeyId }),
    }));
  }
  const frozenRegistry: AtlasSignerRegistry = Object.freeze({
    registryVersion: registry.registryVersion,
    records: Object.freeze(records),
  });
  const frozenCheckpoint: AtlasRegistryCheckpoint = Object.freeze({
    version: checkpoint.version,
    digestHex: checkpoint.digestHex,
    predecessorDigestHex: checkpoint.predecessorDigestHex,
    previouslyRevokedKeyIds: Object.freeze([
      ...checkpoint.previouslyRevokedKeyIds,
    ]),
  });
  return Object.freeze({
    proposalId: input.proposalId,
    expectedVersion: input.expectedVersion,
    expectedDigestHex: input.expectedDigestHex,
    proposedRegistry: frozenRegistry,
    proposedCheckpoint: frozenCheckpoint,
  });
}

const outcome = (
  status: AtlasCheckpointProposalReview["status"],
  error: string | null, proposalId: string | null,
): AtlasCheckpointProposalReview => Object.freeze({
  status, error, proposalId,
  decision: "HOLD" as const,
  activationPermitted: false as const,
});

/** Preparation is local validation only, NOT an identity/issuer approval. */
export function prepareAtlasCheckpointProposal(
  proposal: AtlasCheckpointProposal | unknown,
): AtlasCheckpointProposalReview {
  const frozen = freezeProposal(proposal);
  return frozen
    ? outcome("prepared", null, frozen.proposalId)
    : outcome("rejected", "INVALID_PROPOSAL", null);
}

/**
 * Independently review a snapshot without publishing it. Recheck pinned
 * predecessor both before AND after the asynchronous approver; conflicts
 * cannot be converted to approval by an outdated callback.
 */
export async function reviewAtlasCheckpointProposal(
  proposal: AtlasCheckpointProposal | unknown,
  host: AtlasCheckpointProposalHost | null,
): Promise<AtlasCheckpointProposalReview> {
  const frozen = freezeProposal(proposal);
  if (!frozen) return outcome("rejected", "INVALID_PROPOSAL", null);
  if (!host || typeof host.readCurrentPinnedCheckpoint !== "function" ||
      typeof host.independentlyReviewProposal !== "function" ||
      typeof host.isStillPinned !== "function") {
    return outcome("unverified", "TRUSTED_REVIEW_HOST_UNAVAILABLE",
      frozen.proposalId);
  }
  try {
    const current = await host.readCurrentPinnedCheckpoint();
    if (!current || !Number.isSafeInteger(current.version) ||
        !HASH.test(current.digestHex)) {
      return outcome("unverified", "TRUSTED_PREDECESSOR_UNAVAILABLE",
        frozen.proposalId);
    }
    if (current.version !== frozen.expectedVersion ||
        current.digestHex !== frozen.expectedDigestHex) {
      return outcome("conflict", "EXPECTED_PREDECESSOR_CHANGED",
        frozen.proposalId);
    }
    const assessment = await reviewAtlasCheckpointTransition(
      frozen.proposedRegistry, frozen.proposedCheckpoint, host,
    );
    if (assessment.status !== "verified-for-review") {
      return outcome(
        assessment.error === "BROKEN_CHECKPOINT_SUCCESSION" ||
          assessment.error === "PINNED_HEAD_CHANGED" ? "conflict" :
          assessment.status === "rejected" ? "rejected" : "unverified",
        assessment.error, frozen.proposalId,
      );
    }
    if (!await host.independentlyReviewProposal(frozen)) {
      return outcome("unverified", "INDEPENDENT_REVIEW_NOT_CONFIRMED",
        frozen.proposalId);
    }
    if (!await host.isStillPinned(Object.freeze({
      version: current.version,
      digestHex: current.digestHex,
      predecessorDigestHex: current.predecessorDigestHex,
      previouslyRevokedKeyIds: Object.freeze([
        ...current.previouslyRevokedKeyIds,
      ]),
    }))) {
      return outcome("conflict", "CHECKPOINT_CHANGED_DURING_REVIEW",
        frozen.proposalId);
    }
    return outcome("reviewed-for-draft", null, frozen.proposalId);
  } catch {
    return outcome("unverified", "PROPOSAL_REVIEW_ERROR", frozen.proposalId);
  }
}
