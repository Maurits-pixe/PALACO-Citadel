# Reviewer Roster Storage CAS Preflight — DRAFT/HOLD

Offline, read-only optimistic compare-and-swap **preflight**.

The verifier compares an expected storage snapshot with an observed snapshot
(store identity, version and every checkpoint field), then checks two signed
storage receipts and the cryptographically verified reviewer-roster transition.
A matching preflight produces a hypothetical next version. Any mismatch,
stale observed snapshot, invalid receipt, skipped version, forged signer or
invalid transition is rejected.

**This is not a database CAS implementation.** The observed state is entirely
caller-supplied, not independently or atomically retrieved; therefore a
concurrent update may occur after inspection. There are no locks, SQL
mutations, persistence, authorized writer roles, or verified remote storage.
An attacker controlling all provided pins, receipt material and timestamps
can manufacture the appearance of a valid preflight. Real release gates
require an authenticated storage read, a durable atomic compare-and-swap
within one transaction, externally protected version floor, independent
storage key custody, revocation freshness and a trusted clock.

The function performs no I/O or state modification, and every result has
`authorization: DENY`, `trust: NOT_ESTABLISHED`,
`stateChanged: false`, `releaseAllowed: false`.

Run:
`node --test modules/samenleving-natuur/registry-pin-reviewer-roster-storage-cas-preflight.test.mjs`

CI contains these tests. PR #63 remains Draft/HOLD, no merge, no live
deployment, and no PALACO MONO changes.
