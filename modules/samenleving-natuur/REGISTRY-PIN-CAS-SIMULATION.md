# PALACO Citadel — Pin CAS Simulation (DRAFT/HOLD)

This module is a **pure in-memory simulation**, NOT a database, durable register,
atomic transaction or authorized executor. It checks a supplied hash-linked
history and compares the expected revision, exact snapshot digest and head
anchor to the current snapshot. It computes a hypothetical append-only next
entry and re-verifies that resulting history.

Conflicting writers using the same expected head are rejected *in the model*
after the first model output is supplied as the current state. The function
never writes, locks or authenticates an external state source; concurrent
production writers would still need a true transactional compare-and-swap
in a protected database.

Even when `simulationAccepted` is true, supplied `dualReview` data is
untrusted and could be fabricated. No PALACO ONE identity, protected pin
store, authorization role, revocation source or trusted clock is connected.
No production use is authorized.

Every output retains `stateChanged: false`, `trust: NOT_ESTABLISHED`,
`authorization: DENY`, `executionAllowed: false`,
`releaseAllowed: false`.

Run: `node --test modules/samenleving-natuur/registry-pin-cas-simulation.test.mjs`

**PR #63 remains Draft/HOLD; no merge, actual writes or deployment.**
