# Reviewer Roster Split-Brain Promotion Race — DRAFT / HOLD

This isolated PostgreSQL 16 fixture tests two **concurrent rival promotions**
that claim the same fencing epoch for different leaders.

A first real database connection conditionally promotes leader-east from
epoch 7 to epoch 8, keeping its transaction open. A second connection
tries to promote leader-west using the same expected epoch while the row
is locked. After the first transaction commits, PostgreSQL must recheck
the update predicate and return `DENY_STALE_PROMOTION` to the loser.

A follow-up verification checks that:
- the losing contender is denied checkpoint writes at epoch 8;
- the former epoch-7 leader is denied checkpoint writes;
- the winning epoch-8 leader commits exactly one version-13 checkpoint;
- a replay of the same checkpoint update is denied;
- the final audit contains exactly one version-13 row for the winner.

This tests a **narrow database-local fencing invariant**, not consensus,
quorum, leadership authentication, remote replica failover, or resilience
to a partitioned primary that writes outside this protected transaction.
The row lock is effective only if **every** real writer and promotion path
shares the same durable fencing enforcement point.

The script requires a disposable PostgreSQL service with
`CITADEL_EPHEMERAL_CI_ONLY=1`, `PGHOST=127.0.0.1`, `PGPORT=5432`,
and `PGDATABASE=postgres`. It creates and cleans up only
`citadel_split_brain_ci`. Never execute on production, staging or
PALACO MONO.

Run in ephemeral CI only:
`bash modules/samenleving-natuur/reviewer-roster-split-brain-race-ci.sh`

**PR #63: DRAFT/HOLD — authorization DENY; no merge or deployment.**
