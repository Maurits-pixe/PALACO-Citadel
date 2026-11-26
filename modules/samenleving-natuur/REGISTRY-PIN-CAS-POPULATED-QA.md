# Populated PostgreSQL HOLD regression — ephemeral-only

This is a **disposable GitHub Actions PostgreSQL 16 test**, not a production
migration. The prior test verifies that an empty draft database rejects direct
INSERT and TRUNCATE; this test adds actual rows, exercises denial of UPDATE
and DELETE on both tables, and confirms explicit transaction rollback removes
all fixture rows.

For fixture construction only, the ephemeral database's test superuser
temporarily disables user triggers **inside a transaction**. This intentionally
demonstrates the dangerous power of privileged DB owners and why protected
production roles must not have those privileges. Triggers are re-enabled
before denied modifications are tested. The full transaction is rolled back,
then assertions confirm no rows survived and HOLD triggers remain enabled.

Run only against isolated GitHub Actions PostgreSQL:
`psql -X -v ON_ERROR_STOP=1 -f modules/samenleving-natuur/registry-pin-cas-populated.test.sql`.

**Not tested:** actual authorized CAS writes, concurrent transactions,
identity verification, revocation infrastructure, or externally anchored audit.
Draft/HOLD; no merge or changes to PALACO MONO.
