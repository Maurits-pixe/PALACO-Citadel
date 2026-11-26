# Anchor witness quorum — independent-signature preflight (Draft/HOLD)

This offline module checks two distinct ECDSA P-256 signatures over the
**exact SHA-256 of one audit anchor**. The signing message is domain-separated,
and the witness keys must match two explicitly supplied SPKI fingerprints.
Signatures cannot be reused for altered anchor bytes.

This **does not** establish independent storage, independent witnesses,
enrollment legitimacy, valid roles, externally protected fingerprints,
trusted time, revocation, or publication. A party supplying both signatures,
keys and fingerprint policy may counterfeit the entire input. Consequently
a valid local quorum remains **NOT_ESTABLISHED / DENY** and never changes state.

A future actual protected anchor register needs separate administration,
unforgeable authenticated writes, retention controls, independent copies,
verified actor authority, and an atomic monotone append policy. None of
those live capabilities is enabled here.

Test:
`node --test modules/samenleving-natuur/registry-pin-anchor-witness.test.mjs`

PR #63 remains Draft/HOLD.
