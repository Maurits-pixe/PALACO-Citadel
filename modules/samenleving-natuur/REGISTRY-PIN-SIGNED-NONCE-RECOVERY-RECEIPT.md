# Signed Nonce Recovery Receipt — DRAFT / HOLD

This read-only verifier checks an ECDSA P-256/SHA-256 signature
over a fixed-form nonce-recovery receipt, using the domain separator
`PALACO-CITADEL-SIGNED-NONCE-RECOVERY-RECEIPT-V1`.

The receipt binds registry ID, nonce SHA-256, reader ID, fencing epoch,
anchor SHA-256, evidence SHA-256 and a deterministic receipt digest.
The receipt digest uses the same fixed field order and domain-separated
SHA-256 construction as the isolated PostgreSQL nonce receipt fixture.
The signing key must match a caller-pinned public-key fingerprint and
signer ID. Verification rejects signature forgery, key substitution,
replayed signatures from a different receipt, altered hashes, changed
reader, changed epoch, changed nonce and malformed objects.

Importantly, **the signed receipt is caller-supplied**. This verifier
does not authenticate a live read from PostgreSQL, verify that a signer
is independent, check revocation, attest that the signature was made
*after* the transaction committed, or guarantee that the receipt
database is immutable. A cryptographically valid signature is **not**
proof that any database transaction occurred. The signer may be
untrusted, compromised, or have signed a fictitious receipt.

Every outcome, including `receiptValid: true`, has
`trust: NOT_ESTABLISHED`, `authorization: DENY`,
`stateChanged: false`, `executionAllowed: false`, and
`releaseAllowed: false`. Nothing in this module creates
a privileged writer or recovery authorization.

Run:
`node --test modules/samenleving-natuur/registry-pin-signed-nonce-recovery-receipt.test.mjs`

GitHub Actions includes thirteen regression tests. PR #63 remains
**Draft/HOLD**. No merge, production rollout or PALACO MONO changes.
