# Ephemeral PostgreSQL HOLD behavior test

This test runs `registry-pin-cas-draft.sql` **only** on a disposable PostgreSQL
16 service provisioned by GitHub Actions. It confirms that the SQL parses,
installs with the expected FORCE RLS and triggers, and actually denies
unauthorized CAS calls, state inserts, history inserts, and TRUNCATE on both
tables. It checks the exact SQLSTATE 42501 and configured rejection message
and confirms rejected writes leave no rows.

The test transaction rolls back; the service itself is destroyed after the
workflow. There is no network endpoint or secret for PALACO MONO.

Limitations: Does not test database-owner/superuser bypass, concurrent writers,
an activated CAS implementation, authenticated dual approvals, real immutable
audit export, or any production environment. No real CAS exists and the draft
remains unapproved.

CI command on **ephemeral service only**:
`psql -X -v ON_ERROR_STOP=1 -f modules/samenleving-natuur/registry-pin-cas-ephemeral.test.sql`

PR #63 remains DRAFT/HOLD. DO NOT run this file on any persistent database.
