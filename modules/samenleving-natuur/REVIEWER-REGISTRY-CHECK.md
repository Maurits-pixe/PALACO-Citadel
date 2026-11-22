# Signed reviewer registry check — local reference

**DRAFT / HOLD** — a standalone Node.js verifier; no authentication, authorization or release integration.

The module checks a detached ECDSA P-256/SHA-256 signature on exact JSON
registry bytes with domain prefix `PALACO-CITADEL-REVIEWER-REGISTRY-V1\n`.
It computes the issuer SPKI SHA-256 fingerprint and compares it with a supplied
pin, rejects old revisions, expired snapshots, duplicate reviewer keys, revoked
entries, incorrect roles and invalid reviewer validity intervals.

**Critical limitations:** the caller-provided issuer pin, revision floor and
evaluation time are not authenticated by this module. A self-selected pin does
not establish an independent trust anchor. The registry contains keys, not
independently verified human identities. Offline time and revocation freshness
cannot be guaranteed. Never treat `localRegistryCheckPassed` as authorization.

Run `node --test modules/samenleving-natuur/reviewer-registry-check.test.mjs`.
Every result retains `trust: NOT_ESTABLISHED`, `authorization: DENY`,
`executionAllowed: false`, and `releaseAllowed: false`.

No merge, deployment, signing key issuance or policy activation. PR #63 stays Draft/HOLD.
