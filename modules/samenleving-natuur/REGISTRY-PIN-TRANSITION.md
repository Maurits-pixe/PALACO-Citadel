# Monotone registry-pin transition — DRAFT / HOLD

This reference module only **proposes** the next pin. It never writes to disk,
a database, browser storage, GitHub or a production identity/authorization service.

The input contains the current pin and an expected current pin; an exact
compare detects divergent snapshots. A signed candidate registry must have
a higher revision and pass the existing issuer-fingerprint, freshness,
reviewer-revocation and ECDSA P-256 checks. The function returns a proposed
revision and exact SHA-256 digest for a separate, formally governed process.

Crucially, BOTH current and expected pins are supplied by the caller:
this is **not atomic compare-and-swap** and cannot establish authenticity,
durability, trusted time, freshness of revocation or reviewer identity.
Production adoption would require a protected monotonic register,
authenticated authority and independently verified two-person approval,
with atomic version checking. All results have `stateChanged: false`,
`authorization: DENY` and `releaseAllowed: false`.

Run `node --test modules/samenleving-natuur/registry-pin-transition.test.mjs`.
PR #63 remains Draft/HOLD.
