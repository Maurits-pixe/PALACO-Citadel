# EARTH-092 — PostgreSQL QA workflow

**Status: WORKFLOW CANDIDATE — NOT YET EXECUTED.**

The workflow starts an isolated PostgreSQL 16 service in GitHub Actions and applies the EARTH-089/090 migrations, executes the EARTH-091 SQL checks, then verifies that the rollback left no records.

No production database or credentials are used. The credentials are fixed test-only values scoped to the ephemeral job.

**Remaining gates:** confirm the workflow actually runs at the exact branch commit and reports PASS; add a two-connection contention test, role-restriction test, crash recovery test, and external trusted checkpoint anchor. A successful QA workflow does not authorize official GIS source admission, merge, or deployment.
