# Signed receipt evidence bridge — local reference (DRAFT / HOLD)

`receipt-evidence-bridge.mjs` composes the real SHA-256 + ECDSA P-256 verifier with
the existing local receipt review gate. It checks a detached signature on the
**exact receipt bytes** and independently computes the hash and public key
SPKI fingerprint.

The caller's `signatureCryptographicallyValid` flag is never trusted. The
bridge supplies a computed result to the older review gate and compares the
**verified signing key fingerprint** against the *claimed* reviewer fingerprint.
Missing, inconsistent or getter-based claim data fails closed.

A local technical pass is **not** an identity, organizational trust, independent
review, revocation, or policy authorization result: the claimed reviewer's
fingerprint is still attacker-controlled without a trusted registry. Equal
checkpoint and receipt digests are a reference-model constraint, not general
proof of ledger history.

Outputs always include `trust: NOT_ESTABLISHED`,
`authorization: DENY`, `executionAllowed: false`, and
`releaseAllowed: false`. No integration with the public website or
production login / identity service exists.

Test: `node --test modules/samenleving-natuur/receipt-evidence-bridge.test.mjs`

Next independent tasks: verifier-key enrollment, authenticated reviewer role
and distinct-person checks, signed ledger/checkpoint policy, revocation
freshness and server-enforced authorization. PR #63: **Draft/HOLD**.
