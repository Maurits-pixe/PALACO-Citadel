/**
 * MUNDO-ATLAS-CRYPTO-CHAIN-031
 *
 * Review-only verifier contract for decision register 030.
 * NO bundled keys, no browser trust discovery, no source admission and no
 * authorization. Crypto + trusted checkpoint are injected by an independently
 * protected host. Gate 029 remains immutable HOLD/DENY.
 */
import {
  inspectAtlasDecisionJournal,
  type AtlasDecisionEntry,
} from "./mundo-atlas-decision-register";

export interface AtlasSignedDecision {
  readonly entry: AtlasDecisionEntry;
  /** Lowercase SHA-256 over the canonical bytes of this entry and parent hash. */
  readonly digestHex: string;
  readonly previousDigestHex: string | null;
  /** Opaque externally trusted reviewer key identifier, never a key material. */
  readonly signerKeyId: string;
  /** Ed25519 signature of the exact domain-separated digest bytes; hex. */
  readonly signatureHex: string;
}

export interface AtlasTrustedCryptography {
  /** Must compute SHA-256 of UTF-8 input with genuine cryptography. */
  sha256Hex(canonicalText: string): Promise<string>;
  /** True ONLY for a pinned, current, not-revoked signer and the entry role. */
  isTrustedSigner(keyId: string, kind: AtlasDecisionEntry["kind"]): Promise<boolean>;
  /** Must verify Ed25519 over UTF-8 text using the trusted key by keyId. */
  verifyEd25519(
    keyId: string, signedText: string, signatureHex: string,
  ): Promise<boolean>;
  /**
   * Independent, trusted and rollback-resistant expected chain head.
   * Must NOT be derived from the supplied untrusted records.
   * Null signals no verified external anchor.
   */
  readPinnedHead(): Promise<string | null>;
}

export interface AtlasChainReview {
  readonly decision: "HOLD";
  readonly activationPermitted: false;
  /** 'verified' means ONLY the supplied host verified this chain's syntax,
   * signatures and pinned head. NOT a release authorization or real audit. */
  readonly integrity: "verified" | "unverified" | "invalid";
  readonly inspected: number;
  readonly error: string | null;
}

const DIGEST = /^[0-9a-f]{64}$/;
const SIGNATURE = /^[0-9a-f]{128}$/;
const KEY = /^[A-Za-z0-9._:-]{4,128}$/;
const GENESIS = "MUNDO-ATLAS-DECISIONS-031:GENESIS";
const DOMAIN = "MUNDO-ATLAS-DECISIONS-031:ENTRY:";

/** Fixed-field canonical format avoids ambiguity in JSON object key order. */
export function canonicalAtlasDecision(
  entry: AtlasDecisionEntry,
  previousDigestHex: string | null,
): string {
  return JSON.stringify([
    "MUNDO-ATLAS-DECISIONS-031",
    entry.sequence, entry.id, entry.previousId, entry.kind, entry.actorRef,
    entry.evidenceRef, entry.outcome, entry.targetId ?? null,
    previousDigestHex ?? GENESIS,
  ]);
}

/**
 * Sequential, bounded, fail-closed verification. The injected host MUST
 * protect trusted public keys, role authorization and the expected head.
 * No claimed signature, hash or result is ever treated as release approval.
 */
export async function verifyAtlasDecisionChain(
  rows: readonly AtlasSignedDecision[] | unknown,
  cryptography: AtlasTrustedCryptography | null,
): Promise<AtlasChainReview> {
  const report = (
    integrity: AtlasChainReview["integrity"],
    inspected: number,
    error: string | null,
  ): AtlasChainReview => Object.freeze({
    decision: "HOLD" as const,
    activationPermitted: false as const,
    integrity, inspected, error,
  });

  if (!cryptography ||
      typeof cryptography.sha256Hex !== "function" ||
      typeof cryptography.isTrustedSigner !== "function" ||
      typeof cryptography.verifyEd25519 !== "function" ||
      typeof cryptography.readPinnedHead !== "function") {
    return report("unverified", 0, "TRUSTED_PROVIDER_UNAVAILABLE");
  }
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
    return report("invalid", 0, "INVALID_CHAIN_LENGTH");
  }
  const typed = rows as AtlasSignedDecision[];
  const structural = inspectAtlasDecisionJournal(typed.map((row) => row?.entry));
  if (structural.errors.length || structural.entries.length !== typed.length) {
    return report("invalid", 0, "INVALID_DECISION_JOURNAL");
  }

  let previous: string | null = null;
  for (let index = 0; index < typed.length; index++) {
    const row = typed[index];
    const entry = structural.entries[index];
    if (!row || typeof row !== "object" ||
        row.previousDigestHex !== previous ||
        typeof row.digestHex !== "string" || !DIGEST.test(row.digestHex) ||
        typeof row.signatureHex !== "string" || !SIGNATURE.test(row.signatureHex) ||
        typeof row.signerKeyId !== "string" || !KEY.test(row.signerKeyId)) {
      return report("invalid", index, "INVALID_SIGNED_ENTRY");
    }
    // Reject non-canonical extra fields so a signature cannot appear to
    // authenticate unbound metadata supplied alongside the signed record.
    const keys = Object.keys(row);
    if (keys.length !== 5 ||
        keys.some((key) => ![
          "entry", "digestHex", "previousDigestHex", "signerKeyId", "signatureHex",
        ].includes(key))) return report("invalid", index, "UNBOUND_SIGNED_FIELDS");

    const signed = DOMAIN + canonicalAtlasDecision(entry, previous);
    try {
      const actual = await cryptography.sha256Hex(signed);
      if (actual !== row.digestHex) {
        return report("invalid", index, "CHAIN_DIGEST_MISMATCH");
      }
      // Signatures bind exact domain, digest, and signer key identifier.
      const message = DOMAIN + row.digestHex + ":" + row.signerKeyId;
      if (!await cryptography.isTrustedSigner(row.signerKeyId, entry.kind) ||
          !await cryptography.verifyEd25519(
            row.signerKeyId, message, row.signatureHex,
          )) return report("invalid", index, "SIGNER_OR_SIGNATURE_REJECTED");
    } catch {
      return report("unverified", index, "CRYPTO_PROVIDER_ERROR");
    }
    previous = row.digestHex;
  }
  try {
    const anchor = await cryptography.readPinnedHead();
    if (typeof anchor !== "string" || !DIGEST.test(anchor)) {
      return report("unverified", typed.length, "TRUSTED_ANCHOR_UNAVAILABLE");
    }
    if (anchor !== previous) {
      return report("invalid", typed.length, "TRUSTED_HEAD_MISMATCH");
    }
  } catch {
    return report("unverified", typed.length, "TRUSTED_ANCHOR_ERROR");
  }
  return report("verified", typed.length, null);
}
