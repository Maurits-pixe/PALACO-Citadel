# Verified Anchor Observation → Nonce Intent — DRAFT / HOLD

This offline composition verifies the signed, nonce-bound and time-bounded
anchor observation **before** deriving an inert proposed nonce-consumption
record. It reuses `inspectSignedAnchorObservation` and returns
`proposedNonceConsumption` only when the observation passes all checks.
The proposal binds registry, nonce SHA-256, reader ID, observation digest,
anchor SHA-256 and fencing epoch. The digest is domain-separated SHA-256
of a fixed-order serialization of the signed evidence.

Negative regression cases include forgery, challenge mismatch, expiration,
anchor mismatch, reader key substitution, altered signed epoch, malformed
fields, accessors and symbols. A failed verification **never produces a
consumption proposal**.

**Crucially, this module does not write to PostgreSQL.** It does not
create a trusted, unforgeable capability token, nor does it grant another
actor permission to call the isolated database fixture. Keeping
verification in a client-controlled JavaScript module and accepting a
caller-provided consumption proposal as authoritative would be insecure.
A future trusted server boundary must independently verify evidence
and perform atomic nonce consumption **in one governed operation**,
with authenticated nonce issuance, trusted time and protected key custody.

Both successful and failed inspections always report
`authorization: DENY`, `trust: NOT_ESTABLISHED`,
`stateChanged: false`, `executionAllowed: false`, and
`releaseAllowed: false`.

Test:
`node --test modules/samenleving-natuur/registry-pin-verified-anchor-nonce-intent.test.mjs`

PR #63 remains Draft/HOLD. No merge, production deployment,
PALACO MONO modification or live writer.
