# EARTH-109 — Signed evidence independent review gate

Status: HOLD / REVIEW REQUIRED.

EARTH-108 is a **read-only evidence verifier**, not an authorization mechanism or production writer. The Ed25519 signature currently covers the raw 32-byte SHA-256 receipt digest; this is an explicit candidate protocol, **not** an approved, domain-separated signing standard. A valid signature alone cannot establish source authenticity, reviewer independence, consent, revocation freshness, or authority.

## Independent review requirements
1. Specify and freeze signing protocol, including explicit domain separation, version, key identity, and exact signed bytes. Require test vectors from independent implementations.
2. Confirm trust anchors, key ownership, revocation lists, and trusted epoch floors originate from independently authenticated durable sources. Do not accept values from the audited dossier.
3. Confirm receipt epochs cannot be future-dated, stale relative to the current policy, or inconsistent with the trusted floor.
4. Prove no replay, forged reviewer substitution, duplicate-key ambiguity, key rotation rollback, or forged checkpoint promotion.
5. Confirm EARTH-090 append still has no privileged EXECUTE grant and never accepts unchecked client-supplied record hashes.
6. Require separate human sign-off on the exact reviewed commit and a complete post-review CI evidence record.

No merge, production deployment, SECURITY DEFINER promotion, or Supabase role grant is authorized by this document.
