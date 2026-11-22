# PALACO Citadel — exact signed registry snapshot pin

**DRAFT/HOLD · local read-only reference implementation**

`registry-snapshot-pin.mjs` verifies a strictly shaped 4-field pin:
schema `palaco-citadel-registry-snapshot-pin-v1`, issuer SPKI SHA-256
fingerprint, revision and the SHA-256 digest of the **exact signed registry bytes**.
It then invokes the existing P-256 registry signature and reviewer checks.

A different validly signed registry at the same revision is not interchangeable
with the pinned snapshot; a newer revision is not silently promoted. The pin
is an *input*, not a secure storage mechanism. A caller can counterfeit the pin,
evaluation time and revision if an independent authority does not protect them.

All outputs are `authorization: DENY`, `trust: NOT_ESTABLISHED`,
`executionAllowed: false` and `releaseAllowed: false`.
This cannot attest actual identity, current revocation or trust.
No browser integration, database mutation, key enrollment or publication.

Test using `node --test modules/samenleving-natuur/registry-snapshot-pin.test.mjs`.
A real deployment would require a separately protected monotonic pin store,
trusted policy and time source and explicit human-governed pin advancement.
**PR #63 remains DRAFT/HOLD.**
