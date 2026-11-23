# Signed Reviewer Roster Storage Receipt — DRAFT/HOLD

This is a pure offline signature verifier for a proposed external
checkpoint-storage receipt. It validates the domain-separated P-256
signature, storage signing-key SPKI SHA-256 pin, exact checkpoint
identity, monotonically pinned store-version floor, store ID, and an
UTC timestamp that is not in the claimed future.

This is **NOT an independent protected checkpoint read**. All receipts,
key pins, version floor and clock are supplied by the caller; a
compromised caller can replace them. A signature does not prove durable
storage, a completed atomic CAS, independent key custody, actual
publication, or current revocation status. An independently secured
storage system and trusted version floor are still missing.

The helper performs no I/O and no state mutation. A valid receipt always
returns `trust: NOT_ESTABLISHED`, `authorization: DENY`,
`stateChanged: false`, and `executionAllowed: false`.

Run:
`node --test modules/samenleving-natuur/registry-pin-reviewer-roster-storage-receipt.test.mjs`

The same checks are included in the draft GitHub Actions QA workflow.
No merge, release, deployment, or changes to PALACO MONO.
