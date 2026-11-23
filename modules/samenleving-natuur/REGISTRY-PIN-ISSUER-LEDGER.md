# PALACO Citadel — Issuer Pin Ledger Preflight (DRAFT/HOLD)

This read-only proof model advances one hypothetically pinned central issuer
key after verifying a dual-signed rotation. It checks the previously pinned
issuer SPKI fingerprint, previous signed registry SHA-256, trusted epoch floor,
and old stored record against a proposed compare-and-swap expectation.
A domain-separated SHA-256 links each transition to the previous head,
new signer identity, new snapshot and signed rotation statement.

The function returns a **hypothetical** `proposedPin`, never a write
operation. No actual persistence, external key pin, consensus, notarization,
clock, independently authenticated read, or atomic CAS is implemented.
Inputs including `oldPin` and `expectedPin` can be forged by the caller.
Consequently `transitionAccepted: true` only means local consistency;
**every result is DENY/NOT_ESTABLISHED/stateChanged=false**.

Test: `node --test modules/samenleving-natuur/registry-pin-issuer-ledger.test.mjs`.

PR #63 stays Draft/HOLD; no production activation or PALACO MONO writes.
