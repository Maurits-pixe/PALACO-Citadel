# PALACO CITADEL — Signed Audit Head Anchor Verifier

Read-only local verification of a signed, exact-byte audit-ledger checkpoint.
The anchor is ECDSA P-256/SHA-256 signed with domain separation. Verification
requires the **expected anchor signer SPKI SHA-256 fingerprint**, ideally
obtained from a physically / administratively separate, trusted mechanism.

It checks signature validity, exact genesis and current pin,
monotone minimum checkpoint sequence, total ledger entry count, and the
computed ledger-head hash. The tests include stale anchors, altered head,
key substitution, missing entries and signature manipulation.

**Critical:** a fingerprint, signing key, sequence floor, and anchor document
passed by the *same untrusted caller* do NOT constitute independent trust.
This module does not fetch, store, publish, timestamp or attest an external
anchor. Freshness, durable external storage, key lifecycle and independent
authorization remain unresolved.

Every output reports authorization DENY, trust NOT_ESTABLISHED,
releaseAllowed false and stateChanged false. No PALACO MONO connection,
migrations, merges or production updates.

Test: `node --test modules/samenleving-natuur/registry-pin-audit-anchor.test.mjs`.
PR #63 remains Draft/HOLD.
