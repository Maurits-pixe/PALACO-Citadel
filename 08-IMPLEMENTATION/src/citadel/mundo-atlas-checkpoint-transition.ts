/**
 * MUNDO-ATLAS-CHECKPOINT-TRANSITION-034
 *
 * Read-only review of a proposed signer-registry checkpoint transition.
 * NO checkpoint writes, no key access, no host discovery and NO authority.
 * Real anti-rollback and issuer verification are independent host duties.
 */
import {
  canonicalAtlasRegistry,
  type AtlasRegistryCheckpoint,
} from "./mundo-atlas-registry-checkpoint";
import type {
  AtlasSignerRecord,
  AtlasSignerRegistry,
} from "./mundo-atlas-signer-trust";

export interface AtlasCheckpointTransitionHost {
  /** Genuine SHA-256, never a mock in a trusted deployment. */
  sha256Hex(message: string): Promise<string>;
  /** Independently pinned CURRENT predecessor; never derived from input. */
  readCurrentPinnedCheckpoint(): Promise<AtlasRegistryCheckpoint | null>;
  /** Confirms authenticity and current anti-rollback pin of predecessor. */
  verifyCurrentPinnedCheckpoint(checkpoint: AtlasRegistryCheckpoint): Promise<boolean>;
  /** Independent issuer signature and explicit transition review of proposal. */
  verifyProposedTransition(
    current: AtlasRegistryCheckpoint,
    proposed: AtlasRegistryCheckpoint,
    proposedRegistry: AtlasSignerRegistry,
  ): Promise<boolean>;
  /** Must confirm independent durable checkpoint version has NOT changed. */
  isStillPinned(checkpoint: AtlasRegistryCheckpoint): Promise<boolean>;
}

export interface AtlasCheckpointTransitionReview {
  readonly decision: "HOLD";
  readonly activationPermitted: false;
  readonly status: "verified-for-review" | "unverified" | "rejected";
  readonly error: string | null;
  readonly fromVersion: number | null;
  readonly toVersion: number | null;
}

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9._:-]{4,128}$/;
const ROLES: readonly string[] = [
  "technical-review", "owner-acceptance", "decision-revoked",
];
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const idList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.length <= 256 &&
  value.every((id) => typeof id === "string" && ID.test(id)) &&
  new Set(value).size === value.length;

/** Reject unbound metadata and freeze a copy before any async host callback. */
function freezeCheckpoint(value: unknown): AtlasRegistryCheckpoint | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<AtlasRegistryCheckpoint>;
  if (Object.keys(input).sort().join(",") !==
        "digestHex,predecessorDigestHex,previouslyRevokedKeyIds,version" ||
      !Number.isSafeInteger(input.version) || (input.version as number) < 1 ||
      typeof input.digestHex !== "string" || !HASH.test(input.digestHex) ||
      (input.predecessorDigestHex !== null &&
        (typeof input.predecessorDigestHex !== "string" ||
         !HASH.test(input.predecessorDigestHex))) ||
      !idList(input.previouslyRevokedKeyIds)) return null;
  return Object.freeze({
    version: input.version as number,
    digestHex: input.digestHex,
    predecessorDigestHex: input.predecessorDigestHex,
    previouslyRevokedKeyIds: Object.freeze([
      ...(input.previouslyRevokedKeyIds as readonly string[]),
    ]),
  });
}

function freezeRegistry(value: unknown): AtlasSignerRegistry | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<AtlasSignerRegistry>;
  if (Object.keys(input).sort().join(",") !== "records,registryVersion" ||
      !Number.isSafeInteger(input.registryVersion) ||
      (input.registryVersion as number) < 1 ||
      !Array.isArray(input.records) || input.records.length === 0 ||
      input.records.length > 256) return null;
  const seen = new Set<string>();
  const entries: AtlasSignerRecord[] = [];
  for (const item of input.records) {
    if (!item || typeof item !== "object" ||
        typeof item.keyId !== "string" || !ID.test(item.keyId) ||
        seen.has(item.keyId) ||
        typeof item.publicKeyFingerprint !== "string" ||
        !HASH.test(item.publicKeyFingerprint) ||
        !Array.isArray(item.roles) || item.roles.length === 0 ||
        new Set(item.roles).size !== item.roles.length ||
        item.roles.some((role) => !ROLES.includes(role)) ||
        typeof item.revoked !== "boolean" ||
        typeof item.validFrom !== "string" || !UTC.test(item.validFrom) ||
        typeof item.validUntil !== "string" || !UTC.test(item.validUntil) ||
        !Number.isFinite(Date.parse(item.validFrom)) ||
        !Number.isFinite(Date.parse(item.validUntil)) ||
        Date.parse(item.validFrom) >= Date.parse(item.validUntil) ||
        (item.replacesKeyId !== undefined &&
          (typeof item.replacesKeyId !== "string" ||
           !ID.test(item.replacesKeyId) ||
           item.replacesKeyId === item.keyId))) return null;
    const allowed = ["keyId", "publicKeyFingerprint", "roles", "validFrom",
      "validUntil", "revoked",
      ...(item.replacesKeyId === undefined ? [] : ["replacesKeyId"])];
    if (Object.keys(item).length !== allowed.length ||
        Object.keys(item).some((key) => !allowed.includes(key))) return null;
    entries.push(Object.freeze({
      keyId: item.keyId,
      publicKeyFingerprint: item.publicKeyFingerprint,
      roles: Object.freeze([...item.roles]),
      validFrom: item.validFrom, validUntil: item.validUntil,
      revoked: item.revoked,
      ...(item.replacesKeyId === undefined ? {} :
        { replacesKeyId: item.replacesKeyId }),
    }));
    seen.add(item.keyId);
  }
  return Object.freeze({
    registryVersion: input.registryVersion as number,
    records: Object.freeze(entries),
  });
}

/**
 * Requires pinned predecessor, exact version +1, predecessor digest,
 * SHA-256 of the proposed register and monotonic revoked-key history.
 * The external host authenticates BOTH the current checkpoint and proposed
 * issuer-approved transition. Last pin recheck detects a concurrent change.
 * A successful REVIEW never commits a new checkpoint.
 */
export async function reviewAtlasCheckpointTransition(
  proposedRegistry: AtlasSignerRegistry | unknown,
  proposedCheckpoint: AtlasRegistryCheckpoint | unknown,
  host: AtlasCheckpointTransitionHost | null,
): Promise<AtlasCheckpointTransitionReview> {
  const result = (
    status: AtlasCheckpointTransitionReview["status"],
    error: string | null,
    fromVersion: number | null = null,
    toVersion: number | null = null,
  ): AtlasCheckpointTransitionReview => Object.freeze({
    decision: "HOLD" as const, activationPermitted: false as const,
    status, error, fromVersion, toVersion,
  });
  if (!host || typeof host.sha256Hex !== "function" ||
      typeof host.readCurrentPinnedCheckpoint !== "function" ||
      typeof host.verifyCurrentPinnedCheckpoint !== "function" ||
      typeof host.verifyProposedTransition !== "function" ||
      typeof host.isStillPinned !== "function") {
    return result("unverified", "TRUSTED_TRANSITION_HOST_UNAVAILABLE");
  }
  const registry = freezeRegistry(proposedRegistry);
  const proposed = freezeCheckpoint(proposedCheckpoint);
  if (!registry || !proposed) return result("rejected", "INVALID_PROPOSAL");
  try {
    const current = freezeCheckpoint(await host.readCurrentPinnedCheckpoint());
    if (!current) return result("unverified", "PINNED_PREDECESSOR_UNAVAILABLE");
    if (!await host.verifyCurrentPinnedCheckpoint(current)) {
      return result("unverified", "PREDECESSOR_NOT_TRUSTED");
    }
    const fromVersion = current.version, toVersion = proposed.version;
    if (toVersion !== fromVersion + 1 ||
        registry.registryVersion !== toVersion ||
        proposed.predecessorDigestHex !== current.digestHex) {
      return result("rejected", "BROKEN_CHECKPOINT_SUCCESSION",
        fromVersion, toVersion);
    }
    const hash = await host.sha256Hex(
      "MUNDO-ATLAS-REGISTRY-033:DIGEST:" + canonicalAtlasRegistry(registry),
    );
    if (!HASH.test(hash)) return result("unverified", "HASH_PROVIDER_UNAVAILABLE");
    if (hash !== proposed.digestHex) {
      return result("rejected", "PROPOSED_DIGEST_MISMATCH", fromVersion, toVersion);
    }
    const currentRevocations = new Set(current.previouslyRevokedKeyIds);
    const proposedRevocations = new Set(proposed.previouslyRevokedKeyIds);
    const signerById = new Map(registry.records.map((item) => [item.keyId, item]));
    for (const id of currentRevocations) {
      if (!proposedRevocations.has(id) ||
          !signerById.has(id) || !signerById.get(id)?.revoked) {
        return result("rejected", "REVOCATION_ROLLBACK", fromVersion, toVersion);
      }
    }
    // All newly revoked keys must be reflected in the signed checkpoint.
    for (const signer of registry.records) {
      if (signer.revoked && !proposedRevocations.has(signer.keyId)) {
        return result("rejected", "UNTRACKED_KEY_REVOCATION",
          fromVersion, toVersion);
      }
    }
    if (!await host.verifyProposedTransition(current, proposed, registry)) {
      return result("unverified", "PROPOSAL_NOT_AUTHENTICATED",
        fromVersion, toVersion);
    }
    if (!await host.isStillPinned(current)) {
      return result("unverified", "PINNED_HEAD_CHANGED",
        fromVersion, toVersion);
    }
    return result("verified-for-review", null, fromVersion, toVersion);
  } catch {
    return result("unverified", "TRANSITION_VERIFICATION_ERROR");
  }
}
