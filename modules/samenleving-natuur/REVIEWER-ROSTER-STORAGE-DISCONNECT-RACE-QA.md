# Reviewer Roster Disconnect Recovery Race — DRAFT / HOLD

This test uses two actual PostgreSQL connections to the disposable
PostgreSQL 16 GitHub Actions service.

- Session A acquires the checkpoint row lock and writes a candidate
  checkpoint, a receipt and an audit entry inside an open transaction.
- Session A exits without COMMIT, simulating an uncommitted client
  disconnect. PostgreSQL rolls the entire transaction back.
- Session B starts while Session A is still holding the row lock. It
  submits the exact same recovery request, then commits after Session A
  disconnects. The expected result is exactly one committed checkpoint
  and exactly one receipt and audit entry.
- A subsequent exact retry returns ALREADY_COMMITTED. The same recovery
  identifier with different request content returns DENY_KEY_REUSE.

The fixture schema `citadel_roster_disconnect_ci` is created and dropped
only in the disposable test database. Execution requires
`CITADEL_EPHEMERAL_CI_ONLY=1`, `PGHOST=127.0.0.1`,
`PGPORT=5432` and `PGDATABASE=postgres`.

This proves the narrow rollback/retry behavior of an isolated fixture.
It does NOT prove authenticated storage, durability across a server crash,
independent key custody, externally trusted time, revocation freshness,
or authorization. No production writer is activated and PALACO MONO is
untouched.

CI: `bash modules/samenleving-natuur/reviewer-roster-storage-disconnect-race-ci.sh`

PR #63 remains Draft/HOLD; no merge, no production deployment.
