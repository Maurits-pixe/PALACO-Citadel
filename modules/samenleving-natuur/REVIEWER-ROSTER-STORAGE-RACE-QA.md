# Reviewer Roster Storage Two-Writer CAS Race — DRAFT / HOLD

This integration regression exercises **two separate PostgreSQL sessions**
against a disposable database created by the GitHub Actions PostgreSQL 16
service. The test checks real row locking and a conditional optimistic update:
- Writer A locks checkpoint version 12, then atomically commits version 13
  and one history row in a single transaction.
- Writer B begins against the same initial version while A holds the lock.
  After A commits, B's stale conditional UPDATE must affect **zero rows**.
- The final read must preserve exactly A's committed checkpoint and **one**
  associated history row. No losing writer history row may appear.

Run only in dedicated CI with all of:
`CITADEL_EPHEMERAL_CI_ONLY=1`, `PGHOST=127.0.0.1`,
`PGPORT=5432`, `PGDATABASE=postgres`.
Command: `bash modules/samenleving-natuur/reviewer-roster-storage-race-ci.sh`.

The shell script uses a uniquely named disposable CI schema and cleans it
up on exit. **Do not run against production, shared or PALACO MONO databases.**

This proves a narrow PostgreSQL concurrency property of an **isolated fixture**.
It does not enable a writer in the frozen `citadel_pin_draft` schema, does
not authenticate remote checkpoint reads, and does not establish independent
storage custody, trusted clock, current revocation or release authority.

PR #63 remains Draft/HOLD; no merge, production deployment or PALACO MONO changes.
