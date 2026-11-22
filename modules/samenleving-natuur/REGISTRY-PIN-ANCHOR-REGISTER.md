# PALACO CITADEL — Protected Audit Anchor Register Preflight

A **pure, read-only reference contract** for advancing a previously signed
audit anchor. The caller supplies a candidate, a prior exact signed anchor,
a protected-looking stored checkpoint record, and the expected record for
optimistic CAS. Verification checks exact SHA-256 binding to the old anchor,
the stored ledger head, cryptographic continuity, and monotone sequence.

It returns a `proposedRecord` **only as a hypothetical value**. The API
does not write to a DB, a GitHub file, an external notary or any other store.
Even a `candidateAccepted: true` result retains
`authorization: DENY`, `trust: NOT_ESTABLISHED`, and
`stateChanged: false`.

**Critical threat boundary:** all inputs are caller controlled. An attacker
who can forge both `storedRecord` and `expectedRecord` can defeat the CAS
preflight. Real external anchoring requires independently managed immutable
storage, authenticated atomic comparison, a protected cryptographic identity,
retention controls, independent key lifecycle and a trusted clock. None are
claimed here.

Run:
`node --test modules/samenleving-natuur/registry-pin-anchor-register.test.mjs`

PALACO Citadel PR #63 stays Draft/HOLD; no production activation.
