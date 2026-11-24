# Reviewer Roster Recovery Integrity — DRAFT / HOLD

This new test runs against the disposable PostgreSQL 16 service in GitHub Actions.
It verifies three narrow recovery invariants:

1. After a version-13 checkpoint and its single audit row are committed, a
   duplicate audit insertion for version 13 raises a unique-constraint error.
   The associated speculative version-14 checkpoint UPDATE is rolled back.
2. An open transaction that changes the checkpoint and inserts history is
   terminated by client disconnection without COMMIT. A fresh session must
   observe the earlier committed checkpoint and unchanged history.
3. A stale replay against the superseded version-12 checkpoint affects zero
   rows and cannot append any second audit record.

The test uses an isolated fixture schema named
`citadel_roster_recovery_ci`, automatically dropped on exit.
Execution requires `CITADEL_EPHEMERAL_CI_ONLY=1`,
`PGHOST=127.0.0.1`, `PGPORT=5432`, `PGDATABASE=postgres`.
Run only in a disposable CI service:

`bash modules/samenleving-natuur/reviewer-roster-storage-recovery-ci.sh`

The fixture is not the production checkpoint writer. Its results cannot
establish independent authenticated storage, version anchoring, witness key
custody, externally trusted time, revocation freshness or release permission.
The inert `citadel_pin_draft` writer and PALACO MONO remain untouched.

**Decision: DRAFT / HOLD, authorization DENY.** No merge or deployment.
