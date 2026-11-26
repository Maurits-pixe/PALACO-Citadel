# Anchor Observation One-Time Nonce Register — DRAFT / HOLD

This isolated PostgreSQL integration fixture exercises a one-time-use
nonce consumption rule for signed anchor observation workflows.

The disposable table is keyed by `(registry_key, nonce_sha256)`. It records
the reader identity, observation digest, anchor hash and fencing epoch.
An atomic `INSERT ... ON CONFLICT DO NOTHING` prevents duplicate
consumption of the same nonce for the same registry, even if two
independent database sessions attempt to consume it concurrently.

## Regression scenarios

- Session A stages consumption while holding an uncommitted unique
  index entry. Session B races using the **same nonce** with a different
  reader ID, observation digest, anchor hash and epoch. B must wait
  and receive `DENY_NONCE_REPLAY` once A commits.
- Identical replay and altered-payload replay must also fail.
- A speculative consumption rolled back before commit must leave
  no durable entry; a subsequent retry can consume that nonce once.
- The final state must contain exactly the two legitimate committed
  nonce entries, with no duplicates or changed first observation.

**Security limits:** this fixture does not verify signatures, supply a
cryptographically unpredictable nonce, issue challenges, authenticate
the reader, authenticate the anchor, or enforce a trusted timestamp.
Those are prerequisite concerns addressed by separate evidence
preflight and still-unimplemented independent trust controls. It
does not authorize external checkpoint writes. Deleting rows or
rotating the database without independent protected state would
allow old nonces to be reused. The fixture is a **single temporary
PostgreSQL service** and does not establish independent durable
replay protection or cross-replica consistency.

Use only in disposable CI with
`CITADEL_EPHEMERAL_CI_ONLY=1`, `PGHOST=127.0.0.1`,
`PGPORT=5432`, `PGDATABASE=postgres`:
`bash modules/samenleving-natuur/reviewer-roster-anchor-nonce-register-ci.sh`

PR #63 remains **Draft/HOLD**. No merge, deployment,
PALACO MONO changes, or production authorization.
