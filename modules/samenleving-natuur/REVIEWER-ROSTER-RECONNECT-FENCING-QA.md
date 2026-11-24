# Reviewer Roster Stale-Leader Reconnect Fencing — DRAFT / HOLD

This disposable PostgreSQL integration regression models a leader that
retains its original epoch-7 token, loses its client connection, then
reconnects after a different session has promoted a successor to epoch 8.

The resumed leader is refused even if it supplies the **current**
checkpoint version. Changing the epoch number without the correct leader
identity and token also fails. A token from the original leader cannot
be reused by the successor. Failed requests must leave the checkpoint and
history untouched. Only the successor carrying the matching epoch-8
identity/token may append the next checkpoint and audit record. A
promotion replay after the change is denied.

A test-only PostgreSQL function acquires the lease row lock and checks
epoch, leader identity and token hash in the same transaction as the
conditional checkpoint update and audit insert. The fixture schema
`citadel_reconnect_fence_ci` is automatically removed.

**Limitations:** this is a simulated disconnect-and-reconnect sequence
between PostgreSQL clients, **not a real network partition** or multi-node
consensus test. All token hashes and identities are synthetic and
caller-supplied. The test does not authenticate real leader identity or
keys, establish independent quorum or trust, prevent database-superuser
bypass or secure a separately writable old primary. Correct fencing
requires every production writer to use a shared authoritative fencing
point, which is not enabled.

Run only in disposable CI with
`CITADEL_EPHEMERAL_CI_ONLY=1`, `PGHOST=127.0.0.1`,
`PGPORT=5432`, `PGDATABASE=postgres`:
`bash modules/samenleving-natuur/reviewer-roster-reconnect-fencing-ci.sh`.

**PR #63 remains Draft/HOLD, authorization DENY.**
No merge, production deployment or PALACO MONO changes.
