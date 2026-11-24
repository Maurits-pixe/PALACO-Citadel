# Reviewer Roster Unknown COMMIT Outcome Recovery — DRAFT / HOLD

A disposable PostgreSQL 16 integration fixture distinguishes two outcomes
that can look identical to a client after it loses the response to COMMIT.

1. **Committed / acknowledgement lost:** an initial transaction commits
   checkpoint v13, recovery receipt and audit row. Its client discards
   the successful response. A separate connection reads the committed
   recovery identity and matching request digest, checkpoint head, revision
   and version before retrying. An identical retry yields
   `ALREADY_COMMITTED`, with no duplicate history. Reusing the recovery
   identity for altered content yields `DENY_KEY_REUSE`.
2. **Rolled back / not committed:** a v14 attempt is rolled back. An
   independent session observes no receipt or history for its identity;
   the same operation then commits exactly once and an identical retry
   returns `ALREADY_COMMITTED`.

This is an **isolated simulation of an unknown client-side outcome**. It
does not inject a real packet loss, fail over PostgreSQL servers or
demonstrate crash-durable storage. The durable evidence is verified
inside the disposable database only. A real system must authenticate the
reconnect/read path, independently anchor versions, authenticate signing
keys and enforce fresh revocation and authorization before any live write.

Execute only in disposable CI:
`CITADEL_EPHEMERAL_CI_ONLY=1 PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=postgres`
`bash modules/samenleving-natuur/reviewer-roster-commit-outcome-ci.sh`.

PR #63 stays **Draft/HOLD**. No merge, production writer, PALACO MONO
change or release permission.
