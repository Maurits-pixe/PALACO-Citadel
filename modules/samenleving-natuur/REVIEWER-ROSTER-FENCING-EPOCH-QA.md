# Reviewer Roster Failover Fencing Epoch QA — DRAFT / HOLD

This disposable PostgreSQL integration fixture implements a narrowly scoped,
transactional **fencing epoch** contract for reviewer roster checkpoints.

A checkpoint writer must match the stored leader ID, monotonically increasing
epoch, and token digest **while holding the same lease-row lock** used by
leader promotion. Every conditional checkpoint update also checks the expected
store version and appends its audit record in the same transaction. Promotion
must compare the previous epoch and leader and increments the epoch by exactly
one. As a result, a formerly valid writer cannot modify state after promotion.

The test uses two actual PostgreSQL sessions:

- Writer A obtains the lease lock, stages checkpoint version 13 and holds
  the transaction open.
- A separate promoter attempts to acquire the lease lock with a short timeout.
  It must be blocked until writer A commits.
- The promoter then advances epoch 7 to epoch 8 and changes leaders.
- Repeated promotion, old-leader writes, wrong-token writes, version skipping,
  and stale checkpoint replays must all be rejected.
- The new leader may commit checkpoint version 14 once; final state contains
  exactly two audit records for the corresponding fencing generations.

**Limitations:** token digests, leader identities and epochs are artificial
test inputs. They do not authenticate an external leader, prevent a database
superuser from bypassing controls, establish independent quorum decisions,
enforce cryptographic key custody or authorize live failover. Database-backed
fencing is only effective when *every actual writer* uses the shared atomic
fencing check; the protected `citadel_pin_draft` writer remains disabled.

Execute only on a disposable CI PostgreSQL service with
`CITADEL_EPHEMERAL_CI_ONLY=1`, `PGHOST=127.0.0.1`,
`PGPORT=5432`, `PGDATABASE=postgres`:

`bash modules/samenleving-natuur/reviewer-roster-fencing-epoch-ci.sh`

PR #63 is **Draft/HOLD**. No merge, production deployment, or PALACO MONO
modification. All release and execution authorization remains DENY.
