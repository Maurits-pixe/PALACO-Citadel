# Signed Fencing Transition Chain — DRAFT / HOLD

This read-only offline verifier composes the existing fencing epoch hash-chain
with domain-separated ECDSA P-256 / SHA-256 signatures from two to five
distinct, caller-pinned witnesses **for each individual epoch transition**.

Every signed transition binds the previous anchor SHA-256, registry identity,
previous and next epoch, proposed leader, token SHA-256, checkpoint head and
candidate anchor SHA-256. The next transition must start from the previous
signed candidate anchor. The final reconstructed anchor must exactly match
the externally supplied expected final anchor.

The verifier rejects skipped or repeated epochs, missing/duplicate witnesses,
signature replay between steps, changed leader/token/head, changed candidate
anchor, signature forgery, witness key substitution, conflicting key pins,
injected accessors, malformed input and anchor rollback below a supplied floor.

The required witness roster and each witness's public key fingerprint are
caller-supplied. Distinct signatures **do not establish independent custody**,
an authenticated node read, live quorum or unforgeable publication. The
initial and final anchors as well as the epoch floor are caller-supplied.
This is an evidence inspection, **not leader authorization or an active
fencing writer**. Missing gates include an independently protected anchor,
trusted witness key governance, fresh revocation and durable atomic CAS.

Every result returns `authorization: DENY`, `trust: NOT_ESTABLISHED`,
`stateChanged: false`, `releaseAllowed: false`, `executionAllowed: false`,
including when `verified: true`.

Run:
`node --test modules/samenleving-natuur/registry-pin-signed-fencing-transition-chain.test.mjs`

CI includes thirteen regression cases. PR #63 remains Draft/HOLD.
No merge, production deployment, or PALACO MONO changes.
