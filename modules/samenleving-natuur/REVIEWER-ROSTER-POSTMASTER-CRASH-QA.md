# Reviewer Roster PostgreSQL Postmaster Crash Recovery — DRAFT / HOLD

A new **dedicated GitHub Actions job** runs a disposable PostgreSQL 16
service that no other QA job shares. Unlike a backend-session termination,
the test deliberately sends SIGKILL to that one disposable service
container and starts the same container again to exercise PostgreSQL
startup/WAL crash recovery.

## Assertions

- A fully COMMITTED checkpoint version 13, receipt and audit entry
  must survive the postmaster crash and restart.
- A separate transaction containing checkpoint version 14 plus a receipt
  and audit entry, but **no COMMIT**, must not survive.
- On a fresh connection after restart, a conditional update from version
  13 to 14 may commit one recovery receipt and audit entry.
- An old version-13 replay must affect zero rows; there must be exactly
  two total receipts and two audit entries (one before the crash, one
  after the verified retry).

The CI guard requires both
`CITADEL_EPHEMERAL_CI_ONLY=1` and
`CITADEL_POSTGRES_CRASH_JOB_ONLY=1`, fixed localhost/5432/postgres
connection parameters, and exactly one discovered `postgres:16`
container. **Never execute on a shared, staging or production database.**

## Limits

This is a test of one isolated PostgreSQL container with a retained
container filesystem/volume, not high-availability failover, physical
host disk-loss durability, independent remote receipt authenticity,
trusted key custody, revocation freshness or production authorization.
The fixture is not a protected production checkpoint writer. The
frozen `citadel_pin_draft` schema and PALACO MONO are unchanged.

New CI results must be checked before claiming PASS.
PR #63: **DRAFT/HOLD**. No merge or deployment.
