# Reviewer Roster Backend Termination Recovery — DRAFT/HOLD

This regression deliberately terminates a **specific, marked PostgreSQL
backend** while its transaction contains an uncommitted checkpoint update,
recovery receipt and audit row. The test runs exclusively against the
disposable PostgreSQL GitHub Actions service.

A fresh connection must observe the original checkpoint version 12 and
zero receipt/audit rows. The identical recovery request must then commit
version 13 exactly once. A second identical request must return
`ALREADY_COMMITTED`; reuse of the recovery ID with changed content must
return `DENY_KEY_REUSE`.

The test calls `pg_terminate_backend` only for the named, active fixture
connection `citadel_backend_kill_ci_holder`; it does not stop the server.
It is NOT a database-restart, crash-recovery, failover or WAL durability
test, and does not prove independent authenticated checkpoint storage.

The shell guard requires `CITADEL_EPHEMERAL_CI_ONLY=1`,
`PGHOST=127.0.0.1`, `PGPORT=5432` and `PGDATABASE=postgres`.
The fixture schema `citadel_backend_kill_ci` is dropped after execution.

No credentials or permissions for PALACO MONO are used. The protected
`citadel_pin_draft` HOLD schema and disabled CAS writer are unchanged.
There is no merge, deployment or execution authorization.

Run in disposable CI only:
`bash modules/samenleving-natuur/reviewer-roster-backend-termination-ci.sh`

PR #63: **DRAFT/HOLD — authorization DENY**.
