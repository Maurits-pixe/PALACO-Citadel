# Registry Pin Dual-Review Preflight (DRAFT/HOLD)

A Node-only, side-effect-free reviewer preflight for a proposed registry-pin ledger
transition. It validates the caller-supplied ledger against a supplied head,
checks a monotonic pin proposal and verifies **two distinct ECDSA P-256/SHA-256
signatures** over the exact domain-separated candidate-ledger-link hash.

Rejected: repeated reviewer ID or signing key, malformed signatures, changed
proposal, stale head, invalid transition, and claimed authority overrides.

**Critical security boundary:** identities, reviewer keys, current pin and
expected head are supplied by the caller. Distinct IDs and keys are NOT proof
of distinct independently authorized people. The module neither persists
a pin nor performs atomic compare-and-swap. Both signatures are mathematical
checks only; independent identity and role verification remains outstanding.

All outputs are non-authorizing: `trust: NOT_ESTABLISHED`,
`authorization: DENY`, `executionAllowed: false`,
`releaseAllowed: false`, `stateChanged: false`.

Run `node --test modules/samenleving-natuur/registry-pin-dual-review.test.mjs`.

Requires protected anchor storage, trusted clock, independently governed reviewer
enrollment and production CAS before any authorization. PR #63 stays Draft/HOLD.
