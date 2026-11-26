# Two-Session Idempotent Recovery Race — DRAFT/HOLD

This disposable PostgreSQL integration test exercises two actual connections.
Connection A obtains a row lock, then commits checkpoint version 13 and exactly
one receipt and audit row. Connection B begins an **identical recovery request**
while A holds the lock; after A commits, B must return `ALREADY_COMMITTED`
rather than create another effect.

Negative cases verify that reusing the same recovery identifier with a
different digest returns `DENY_KEY_REUSE`, while a different request that
still expects version 12 returns `DENY_STALE`. The final fixture must
contain exactly one receipt, one history row and checkpoint version 13.

## Corrective action
The preceding Idempotent Recovery CI failed in its PostgreSQL job because
the test script contained a duplicated, truncated receipt-table definition.
That fixture has been repaired and its recovery request identity checks
now include the expected version, target revision, target version, digest,
and target head. New CI results must be inspected before claiming PASS.

## Strict boundaries
This is a disposable test fixture, not an active checkpoint writer.
The script enforces `CITADEL_EPHEMERAL_CI_ONLY=1`, localhost PGHOST,
port 5432 and database `postgres`, and drops its own schema on exit.
It does not activate frozen production schemas or change PALACO MONO.
The external trust anchors, independent storage, revocation freshness,
key custody and real-world authorization remain unresolved.

PR #63: DRAFT/HOLD, no merge or deployment.
