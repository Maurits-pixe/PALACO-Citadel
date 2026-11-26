# Verified Signed Observation → Atomic Nonce Boundary — DRAFT / HOLD

This **disposable CI integration harness** composes the offline signed-anchor
observation verifier with PostgreSQL's one-time nonce uniqueness constraint.
Unlike a caller-submitted intent treated as authority, the harness receives
the complete signed observation, verifies that observation itself, derives a
canonical nonce intent, and only then inserts the consumed nonce into its
isolated PostgreSQL fixture.

The test checks that forgery, modified signed fields, expiry and nonce
challenge mismatches cannot consume a nonce. A valid signed observation
may consume its nonce only once. Repeating the exact same observation and
independently re-signing the same claim both result in `DENY_NONCE_REPLAY`.
A distinct, valid nonce is accepted. The domain-separated evidence digest
excludes ECDSA's variable signature bytes but includes the verified signed
claim, reader identity and reader fingerprint. Signature verification
happens BEFORE the digest is trusted; the digest does not replace the
signature.

The test uses Node.js to call `psql` locally. Its PostgreSQL uniqueness
constraint provides atomic nonce insertion, but verification and insertion
are still separate application/database operations. **This harness is
not an authenticated production service, not a fully trusted atomic
verification-and-consumption transaction, and not a secure issuance
authority.** It does not generate nonces in a privileged server, enforce
trusted time or fresh revocation, attest independent storage or protect
the database against deletion/reset. A client-supplied result must never
authorize any write. Actual server deployment would require
independently managed keys, authenticated challenge issuance, trusted
time, secure persistence and explicit governance approval.

The integration script requires
`CITADEL_EPHEMERAL_CI_ONLY=1`,
`PGHOST=127.0.0.1`, `PGPORT=5432`, `PGDATABASE=postgres`,
and only creates/drops `citadel_verified_nonce_boundary_ci`.
All exported library results continue to return
`authorization: DENY`, `trust: NOT_ESTABLISHED`,
`executionAllowed: false`, `releaseAllowed: false` and
`stateChanged: false`.

CI commands:
- `node --test modules/samenleving-natuur/registry-pin-verified-anchor-nonce-intent.test.mjs`
- `node modules/samenleving-natuur/registry-pin-verified-nonce-boundary-ci.mjs`
  (disposable PostgreSQL environment only)

PR #63 remains **Draft/HOLD**. No merge, production rollout,
PALACO MONO modification or live writer.
