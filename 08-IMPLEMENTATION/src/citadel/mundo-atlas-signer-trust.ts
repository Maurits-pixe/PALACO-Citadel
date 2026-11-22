/**
 * MUNDO-ATLAS-SIGNER-TRUST-032
 *
 * Review-only signer registry policy, for chain verifier 031.
 * A registry is UNTRUSTED until an independent protected host verifies its
 * exact snapshot against a pinned anti-rollback checkpoint. No key material,
 * no private keys, no browser trust discovery and NO activation capability.
 */
import type { AtlasDecisionKind } from "./mundo-atlas-decision-register";

export interface AtlasSignerRecord {
  readonly keyId: string;
  /** SHA-256 fingerprint of a canonical Ed25519 public key, lowercase hex. */
  readonly publicKeyFingerprint: string;
  /** Exactly which decision roles may use this key. */
  readonly roles: readonly AtlasDecisionKind[];
  /** UTC ISO 8601 timestamps, with Z timezone, trusted clock comparisons. */
  readonly validFrom: string;
  readonly validUntil: string;
  readonly revoked: boolean;
  /** Replacement key rotates an earlier key out of current eligibility. */
  readonly replacesKeyId?: string;
}

export interface AtlasSignerRegistry {
  readonly registryVersion: number;
  readonly records: readonly AtlasSignerRecord[];
}

export interface AtlasSignerTrustHost {
  /**
   * Must independently verify the EXACT immutable registry snapshot,
   * its authorized issuer signature, version and pinned anti-rollback head.
   * Returning true for caller-supplied data without verification is unsafe.
   */
  verifyPinnedRegistry(snapshot: AtlasSignerRegistry): Promise<boolean>;
  /** Independently trusted UTC time. No Date.now() or caller timestamp. */
  readTrustedTime(): Promise<string | null>;
  /**
   * Enforce that keyId resolves to the exact registry public key fingerprint
   * in the protected signature verification service (not browser storage).
   */
  isPinnedPublicKey(keyId: string, fingerprint: string): Promise<boolean>;
}

export interface AtlasSignerTrustReview {
  readonly decision: "HOLD";
  readonly activationPermitted: false;
  readonly status: "trusted-for-review" | "unverified" | "rejected";
  readonly reason: string;
}

const KEY = /^[A-Za-z0-9._:-]{4,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ROLES: readonly string[] = [
  "technical-review", "owner-acceptance", "decision-revoked",
];

function parseUtc(value: unknown): number | null {
  if (typeof value !== "string" || !ISO.test(value)) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : null;
}

/**
 * Validate structure and current eligibility before asking protected host
 * to validate trust. Rotation invalidates OLD keys for current review;
 * historical signing time is NOT inferred or trusted from the journal.
 */
export async function reviewAtlasSigner(
  registry: AtlasSignerRegistry | unknown,
  keyId: string,
  role: AtlasDecisionKind,
  host: AtlasSignerTrustHost | null,
): Promise<AtlasSignerTrustReview> {
  const answer = (
    status: AtlasSignerTrustReview["status"], reason: string,
  ): AtlasSignerTrustReview => Object.freeze({
    decision: "HOLD" as const,
    activationPermitted: false as const,
    status, reason,
  });
  if (!host || typeof host.verifyPinnedRegistry !== "function" ||
      typeof host.readTrustedTime !== "function" ||
      typeof host.isPinnedPublicKey !== "function") {
    return answer("unverified", "TRUST_HOST_UNAVAILABLE");
  }
  if (!registry || typeof registry !== "object") {
    return answer("rejected", "INVALID_REGISTRY");
  }
  const snapshot = registry as Partial<AtlasSignerRegistry>;
  if (!Number.isSafeInteger(snapshot.registryVersion) ||
      (snapshot.registryVersion as number) < 1 ||
      !Array.isArray(snapshot.records) ||
      snapshot.records.length === 0 || snapshot.records.length > 256) {
    return answer("rejected", "INVALID_REGISTRY_STRUCTURE");
  }
  if (!KEY.test(keyId) || !ROLES.includes(role)) {
    return answer("rejected", "INVALID_SIGNER_REQUEST");
  }
  const entries = new Map<string, AtlasSignerRecord>();
  const replacements = new Set<string>();
  const registryKeys = Object.keys(snapshot);
  if (registryKeys.length !== 2 ||
      registryKeys.some((key) => key !== "registryVersion" && key !== "records")) {
    return answer("rejected", "UNBOUND_REGISTRY_FIELDS");
  }
  for (const item of snapshot.records) {
    if (!item || typeof item !== "object" ||
        typeof item.keyId !== "string" || !KEY.test(item.keyId) ||
        entries.has(item.keyId) ||
        typeof item.publicKeyFingerprint !== "string" ||
        !HASH.test(item.publicKeyFingerprint) ||
        !Array.isArray(item.roles) || item.roles.length === 0 ||
        new Set(item.roles).size !== item.roles.length ||
        item.roles.some((value) => !ROLES.includes(value)) ||
        typeof item.revoked !== "boolean" ||
        (item.replacesKeyId !== undefined &&
          (typeof item.replacesKeyId !== "string" ||
           !KEY.test(item.replacesKeyId) ||
           item.replacesKeyId === item.keyId ||
           replacements.has(item.replacesKeyId))) ||
        parseUtc(item.validFrom) === null ||
        parseUtc(item.validUntil) === null ||
        (parseUtc(item.validFrom) as number) >=
          (parseUtc(item.validUntil) as number)) {
      return answer("rejected", "INVALID_SIGNER_RECORD");
    }
    const permitted = [
      "keyId", "publicKeyFingerprint", "roles", "validFrom",
      "validUntil", "revoked",
      ...(item.replacesKeyId === undefined ? [] : ["replacesKeyId"]),
    ];
    if (Object.keys(item).length !== permitted.length ||
        Object.keys(item).some((key) => !permitted.includes(key))) {
      return answer("rejected", "UNBOUND_SIGNER_FIELDS");
    }
    entries.set(item.keyId, item);
    if (item.replacesKeyId !== undefined) replacements.add(item.replacesKeyId);
  }
  // Every rotation points to a known earlier key with identical allowed
  // roles; reject cycles and orphaned references rather than guessing.
  for (const item of entries.values()) {
    if (item.replacesKeyId === undefined) continue;
    const older = entries.get(item.replacesKeyId);
    if (!older ||
        item.roles.length !== older.roles.length ||
        item.roles.some((value) => !older.roles.includes(value)) ||
        (parseUtc(item.validFrom) as number) <
          (parseUtc(older.validFrom) as number)) {
      return answer("rejected", "INVALID_ROTATION");
    }
    let cursor: AtlasSignerRecord | undefined = item;
    const visited = new Set<string>();
    while (cursor?.replacesKeyId) {
      if (visited.has(cursor.keyId)) return answer("rejected", "ROTATION_CYCLE");
      visited.add(cursor.keyId);
      cursor = entries.get(cursor.replacesKeyId);
    }
  }
  // Copy the validated fields into a deeply frozen snapshot so asynchronous
  // host verification cannot inspect mutable data different from our checks.
  const pinnedSnapshot: AtlasSignerRegistry = Object.freeze({
    registryVersion: snapshot.registryVersion as number,
    records: Object.freeze([...entries.values()].map((item) => Object.freeze({
      keyId: item.keyId,
      publicKeyFingerprint: item.publicKeyFingerprint,
      roles: Object.freeze([...item.roles]),
      validFrom: item.validFrom,
      validUntil: item.validUntil,
      revoked: item.revoked,
      ...(item.replacesKeyId === undefined ? {} :
        { replacesKeyId: item.replacesKeyId }),
    }))),
  });
  const candidate = entries.get(keyId);
  if (!candidate || !candidate.roles.includes(role) ||
      candidate.revoked || replacements.has(keyId)) {
    return answer("rejected", "SIGNER_INELIGIBLE");
  }
  try {
    const now = parseUtc(await host.readTrustedTime());
    if (now === null) return answer("unverified", "TRUSTED_CLOCK_UNAVAILABLE");
    if (now < (parseUtc(candidate.validFrom) as number) ||
        now >= (parseUtc(candidate.validUntil) as number)) {
      return answer("rejected", "SIGNER_OUTSIDE_VALIDITY");
    }
    if (!await host.verifyPinnedRegistry(pinnedSnapshot)) {
      return answer("unverified", "REGISTRY_NOT_TRUSTED");
    }
    if (!await host.isPinnedPublicKey(
      candidate.keyId, candidate.publicKeyFingerprint,
    )) return answer("unverified", "PUBLIC_KEY_NOT_PINNED");
  } catch {
    return answer("unverified", "TRUST_VERIFICATION_ERROR");
  }
  return answer("trusted-for-review", "CURRENT_SIGNER_ELIGIBLE");
}

/**
 * Integrates as the 031 isTrustedSigner callback ONLY; SHA-256,
 * Ed25519 verification and the independently pinned chain head are still
 * separately required by 031. Caller-supplied hosts are NOT proof of trust.
 */
export function createAtlasSignerTrustResolver(
  registry: AtlasSignerRegistry,
  host: AtlasSignerTrustHost,
): (keyId: string, role: AtlasDecisionKind) => Promise<boolean> {
  return async (keyId, role): Promise<boolean> =>
    (await reviewAtlasSigner(registry, keyId, role, host)).status ===
      "trusted-for-review";
}
