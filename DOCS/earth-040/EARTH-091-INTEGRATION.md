# EARTH-091 — PostgreSQL integration test candidate

Status: **NOT EXECUTED / NOT DEPLOYED**.

On an isolated disposable PostgreSQL database, apply EARTH-089 and EARTH-090 migrations, then run:

```sh
psql -X -v ON_ERROR_STOP=1 -f DOCS/earth-040/earth-089-audit-schema.sql
psql -X -v ON_ERROR_STOP=1 -f DOCS/earth-040/earth-090-atomic-append.sql
psql -X -v ON_ERROR_STOP=1 -f DOCS/earth-040/earth-091-postgres-test.sql
```

The test uses a single transaction and ROLLBACK. It checks a successful append, rejection of stale version, rollback of a partially invalid batch, and denial of UPDATE/DELETE. It does **not** prove concurrent two-connection behavior, crash recovery, restricted runtime roles, or durable external checkpoint anchoring.

Do not run against production. Requires explicit isolated database credentials and a verified psql installation. A successful run must be recorded with database version, exact commit SHA, run identifier, exit status, and reviewer.
