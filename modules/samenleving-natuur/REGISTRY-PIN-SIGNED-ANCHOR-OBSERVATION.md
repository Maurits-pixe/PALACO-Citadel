# Signed Anchor Observation Freshness — DRAFT / HOLD

This offline, read-only verifier checks a **domain-separated ECDSA
P-256/SHA-256 signed observation claim**. The signed payload binds a
registry key, fencing epoch, anchor SHA-256, request nonce SHA-256,
observation timestamp and expiry timestamp to a specific reader ID.
The reader public key is checked against a caller-supplied SHA-256
SPKI fingerprint.

It refuses mismatched nonce, anchor, epoch or registry, reader identity
substitution, reader key substitution, forged signature, future timestamps,
expired observation, overlong validity window, malformed date syntax,
accessor-bearing objects and symbol injections. A caller-supplied maximum
validity duration cannot exceed five minutes.

**Critical limitations:** the expected nonce, current time, reader
fingerprint, expected anchor and epoch are **caller-supplied**.
A valid signature and matching nonce do not establish independent
freshness: without independently authenticated nonce issuance and
persistent used-nonce registration, the same signed response can be
replayed. No remote read, trusted time oracle, secure key custody,
independent external monotonic epoch anchor or live revocation check
occurs. The module performs no CAS write.

All outputs retain `authorization: DENY`,
`trust: NOT_ESTABLISHED`, `stateChanged: false`,
`executionAllowed: false`, and `releaseAllowed: false`,
even when `observationValid: true`.

Run:
`node --test modules/samenleving-natuur/registry-pin-signed-anchor-observation.test.mjs`.

CI includes thirteen regressions. PR #63 remains **Draft/HOLD**;
no merge, production rollout, or PALACO MONO changes.
