# Reviewer Roster Storage Atomicity — DRAFT / HOLD

This disposable PostgreSQL integration test checks transactional atomicity
for a checkpoint update and its matching audit-history append.

A deliberately failing audit-history constraint is exercised after a valid
conditional checkpoint UPDATE. The test asserts that the exception causes the
checkpoint update to be rolled back in the same PostgreSQL subtransaction,
leaving the prior checkpoint and zero history rows. A separate positive
transaction then commits the next checkpoint and exactly one audit record.

The shell guard requires `CITADEL_EPHEMERAL_CI_ONLY=1`,
`PGHOST=127.0.0.1`, `PGPORT=5432`, and `PGDATABASE=postgres`.
It creates and drops only `citadel_roster_atomicity_ci` on GitHub Actions'
disposable PostgreSQL service. Do not use staging, production, or PALACO MONO.

**Scope**: a database regression fixture, not a deployed application writer.
The inert `citadel_pin_draft` HOLD triggers, grants and deny-only functions
are untouched. This test does not establish independent storage,
authenticated checkpoint reads, durable external version anchoring, trusted
witness custody, key revocation freshness, or release authorization.

Run only in the isolated CI service:
`bash modules/samenleving-natuur/reviewer-roster-storage-atomicity-ci.sh`

PR #63 remains Draft/HOLD. No merge and no production deployment.
