# Reviewer Roster Idempotent Recovery QA — DRAFT / HOLD

Disposable PostgreSQL 16 integration fixture for **exactly-once effects
under retries**, not an operational checkpoint writer.

The fixture transactionally binds each `(registry_key,recovery_id)` to
the request digest, expected version, target version, target revision and
target checkpoint head. A byte-equivalent retry of an already-committed
request returns `ALREADY_COMMITTED` with no additional audit rows. Reuse
of the recovery ID with another digest, version, revision or checkpoint
head returns `DENY_IDEMPOTENCY_KEY_REUSE`. A fresh request using a stale
expected version returns `DENY_STALE_CHECKPOINT`.

A second scenario stages a state change and receipt, rolls back the
transaction, then retries the same request. The retry may commit exactly
once and must produce exactly one history row and one receipt.

The fixture serializes access using a PostgreSQL row lock and uses
constraints to prevent duplicate versions and checkpoint heads. It
does not validate caller-supplied request digests cryptographically.

The shell script requires:
`CITADEL_EPHEMERAL_CI_ONLY=1`,
`PGHOST=127.0.0.1`, `PGPORT=5432`, `PGDATABASE=postgres`.
It creates/drops only `citadel_roster_idempotency_ci` on the disposable
CI PostgreSQL service. Do not run against staging, shared, production or
PALACO MONO databases.

This is a test-only SQL function with no production privileges. No
independent checkpoint read, secure idempotency ledger, trusted identity,
key custody, revocation freshness or release authorization is established.

**PR #63 remains Draft/HOLD; authorization DENY. No merge or deployment.**
