# Reviewer Roster Storage Continuity — DRAFT / HOLD

This offline, read-only security preflight composes two domain-separated,
P-256 signed storage receipts with the signed reviewer-roster transition
and the deterministic checkpoint hash-chain advance.

The previous storage receipt must match the supplied previous checkpoint,
its store-version must satisfy the caller's floor, and the candidate receipt
must match the exact calculated successor checkpoint. The candidate storage
version must be precisely one higher than the previous storage version.
Missing intermediate versions and a backwards reported commit time are
rejected. Both signatures are cryptographically checked against the same
pinned storage signer. Malformed and untrusted data are denied.

**Important trust limitations**: this verifies evidence, not storage.
Both receipts, the previous checkpoint, the version floor, signing key
fingerprint and claimed UTC clock are caller supplied. There is no independent
authenticated read, actual durable append-only log, independently protected
counter, atomic database compare-and-swap, key custody, trusted clock, or
revocation freshness. A compromised caller can fabricate new receipts along
with the pins and times. Even a valid result cannot authorize publication.

Every result returns `authorization: DENY`, `trust: NOT_ESTABLISHED`,
`executionAllowed: false`, and `stateChanged: false`.

Run:
`node --test modules/samenleving-natuur/registry-pin-reviewer-roster-storage-continuity.test.mjs`

CI: suite is added to the existing Draft PR workflow.
No merge, no production deployment and no PALACO MONO write.
