# Fencing Anchor Register CAS Race — DRAFT / HOLD

This regression creates a separate disposable PostgreSQL schema,
`citadel_fencing_anchor_cas_ci`, to model a versioned epoch anchor and
an atomic audit entry. Each conditional update compares the expected
epoch and the exact previous anchor hash. A transition must advance by
exactly one epoch.

The regression opens two PostgreSQL sessions. Session A stages epoch 8
while holding the anchor row lock. Session B attempts a competing epoch-8
anchor with a different hash and waits; after session A commits, session B
must receive `DENY_STALE_OR_FORK`. Replays, forked predecessor hashes and
skipped epochs are refused. A speculative epoch-9 transition is rolled
back, after which exactly one recovery may commit epoch 9 and its audit
record. No denied or rolled-back request can leave an extra audit row.

**Trust boundaries:** this is a disposable **single-database** model of
atomic compare-and-swap. It is NOT an independent external anchor, a
remote authenticated read, trusted witness custody, a consensus quorum,
a reliable hardware monotone counter, a production migration, or proof
that every future writer is fenced. The synthetic function does NOT
validate real transition signatures before writing; it exists only
inside the isolated test schema. The separate read-only signed
transition verifier still returns `authorization: DENY`.

Test only with `CITADEL_EPHEMERAL_CI_ONLY=1`,
`PGHOST=127.0.0.1`, `PGPORT=5432`, `PGDATABASE=postgres`:

`bash modules/samenleving-natuur/reviewer-roster-fencing-anchor-register-ci.sh`

CI checks must complete before any PASS claim. PR #63 stays
**Draft/HOLD**. No merge, deployment or PALACO MONO modification.
