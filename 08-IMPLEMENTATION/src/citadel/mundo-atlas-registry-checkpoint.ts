/**
 * MUNDO-ATLAS-REGISTRY-CHECKPOINT-033
 *
 * Read-only signer registry continuity checkpoint. Its signatures, pinned
 * digest, secure version counter and revocation history MUST be authenticated
 * by an independent protected host. No private keys or browser storage.
 * Even successful review never grants authority: DENY / GO-13 HOLD.
 */
import type { AtlasSignerRegistry, AtlasSignerRecord } from "./mundo-atlas-signer-trust";

export interface AtlasRegistryCheckpoint {
  readonly version: number;
  readonly digestHex: string;
  readonly predecessorDigestHex: string | null;
  /** Revocations in the independently pinned predecessor registry. */
  readonly previouslyRevokedKeyIds: readonly string[];
}

export interface AtlasRegistryCheckpointHost {
  /** SHA-256 over the exact domain-separated canonical registry bytes. */
  sha256Hex(value: string): Promise<string>;
  /**
   * Must return the independently authenticated monotonic checkpoint.
   * No trust if derived from the provided untrusted registry.
   */
  readTrustedCheckpoint(): Promise<AtlasRegistryCheckpoint | null>;
  /**
   * Validates issuer signature, checkpoint version, hash, predecessor and
   * revoked key history against a separately secured anti-rollback store.
   */
  verifyTrustedCheckpoint(checkpoint: AtlasRegistryCheckpoint): Promise<boolean>;
}

export interface AtlasRegistryCheckpointReview {
  readonly decision: "HOLD";
  readonly activationPermitted: false;
  readonly status: "verified-for-review" | "unverified" | "rejected";
  readonly error: string | null;
  readonly version: number | null;
}

const HEX = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9._:-]{4,128}$/;
const KINDS = ["technical-review", "owner-acceptance", "decision-revoked"];

/** Canonical representation binds all signer fields, including revocation. */
export function canonicalAtlasRegistry(registry: AtlasSignerRegistry): string {
  const records = [...registry.records]
    .sort((left, right) => left.keyId < right.keyId ? -1 : left.keyId > right.keyId ? 1 : 0)
    .map((item) => [
      item.keyId, item.publicKeyFingerprint, [...item.roles].sort(),
      item.validFrom, item.validUntil, item.revoked, item.replacesKeyId ?? null,
    ]);
  return JSON.stringify(["MUNDO-ATLAS-REGISTRY-033", registry.registryVersion, records]);
}

export async function verifyAtlasRegistryCheckpoint(
  candidate: AtlasSignerRegistry | unknown,
  host: AtlasRegistryCheckpointHost | null,
): Promise<AtlasRegistryCheckpointReview> {
  const answer = (
    status: AtlasRegistryCheckpointReview["status"],
    error: string | null, version: number | null = null,
  ): AtlasRegistryCheckpointReview => Object.freeze({
    decision: "HOLD" as const, activationPermitted: false as const,
    status, error, version,
  });
  if (!host || typeof host.sha256Hex !== "function" ||
      typeof host.readTrustedCheckpoint !== "function" ||
      typeof host.verifyTrustedCheckpoint !== "function") {
    return answer("unverified", "TRUSTED_CHECKPOINT_HOST_UNAVAILABLE");
  }
  if (!candidate || typeof candidate !== "object") {
    return answer("rejected", "INVALID_REGISTRY");
  }
  const source = candidate as Partial<AtlasSignerRegistry>;
  if (!Number.isSafeInteger(source.registryVersion) ||
      (source.registryVersion as number) < 1 ||
      !Array.isArray(source.records) || source.records.length === 0 ||
      source.records.length > 256 || Object.keys(source).sort().join(",") !==
      "records,registryVersion") {
    return answer("rejected", "INVALID_REGISTRY_STRUCTURE");
  }
  const seen = new Set<string>();
  const records: AtlasSignerRecord[] = [];
  for (const item of source.records) {
    if (!item || typeof item !== "object" || !ID.test(item.keyId) ||
        seen.has(item.keyId) || !HEX.test(item.publicKeyFingerprint) ||
        !Array.isArray(item.roles) || item.roles.length === 0 ||
        new Set(item.roles).size !== item.roles.length ||
        item.roles.some((role) => !KINDS.includes(role)) ||
        typeof item.revoked !== "boolean" ||
        typeof item.validFrom !== "string" ||
        typeof item.validUntil !== "string" ||
        (item.replacesKeyId !== undefined && !ID.test(item.replacesKeyId))) {
      return answer("rejected", "INVALID_SIGNER_RECORD");
    }
    const allowed = ["keyId", "publicKeyFingerprint", "roles",
      "validFrom", "validUntil", "revoked",
      ...(item.replacesKeyId === undefined ? [] : ["replacesKeyId"])];
    if (Object.keys(item).length !== allowed.length ||
        Object.keys(item).some((key) => !allowed.includes(key))) {
      return answer("rejected", "UNBOUND_SIGNER_FIELD");
    }
    seen.add(item.keyId);
    records.push(Object.freeze({
      keyId: item.keyId, publicKeyFingerprint: item.publicKeyFingerprint,
      roles: Object.freeze([...item.roles]), validFrom: item.validFrom,
      validUntil: item.validUntil, revoked: item.revoked,
      ...(item.replacesKeyId === undefined ? {} :
        { replacesKeyId: item.replacesKeyId }),
    }));
  }
  const snapshot: AtlasSignerRegistry = Object.freeze({
    registryVersion: source.registryVersion as number,
    records: Object.freeze(records),
  });
  try {
    const digest = await host.sha256Hex(
      "MUNDO-ATLAS-REGISTRY-033:DIGEST:" + canonicalAtlasRegistry(snapshot),
    );
    if (!HEX.test(digest)) return answer("unverified", "CRYPTO_DIGEST_UNAVAILABLE");
    const checkpoint = await host.readTrustedCheckpoint();
    if (!checkpoint) return answer("unverified", "INDEPENDENT_CHECKPOINT_MISSING");
    if (!Number.isSafeInteger(checkpoint.version) ||
        checkpoint.version < 1 || !HEX.test(checkpoint.digestHex) ||
        (checkpoint.predecessorDigestHex !== null &&
          !HEX.test(checkpoint.predecessorDigestHex)) ||
        !Array.isArray(checkpoint.previouslyRevokedKeyIds) ||
        checkpoint.previouslyRevokedKeyIds.length > 256 ||
        new Set(checkpoint.previouslyRevokedKeyIds).size !==
          checkpoint.previouslyRevokedKeyIds.length ||
        checkpoint.previouslyRevokedKeyIds.some((id) => !ID.test(id))) {
      return answer("rejected", "INVALID_CHECKPOINT");
    }
    // No stale version, conflicting same-version digest or revoked-key
    // resurrection is allowed relative to the pinned checkpoint.
    if (snapshot.registryVersion !== checkpoint.version ||
        digest !== checkpoint.digestHex) {
      return answer("rejected", "CHECKPOINT_VERSION_OR_DIGEST_MISMATCH");
    }
    for (const id of checkpoint.previouslyRevokedKeyIds) {
      const signer = snapshot.records.find((item) => item.keyId === id);
      if (!signer || !signer.revoked) {
        return answer("rejected", "REVOKED_SIGNER_RESURRECTION");
      }
    }
    if (!await host.verifyTrustedCheckpoint(checkpoint)) {
      return answer("unverified", "CHECKPOINT_NOT_AUTHENTICATED");
    }
    return answer("verified-for-review", null, checkpoint.version);
  } catch {
    return answer("unverified", "CHECKPOINT_VERIFICATION_ERROR");
  }
}
