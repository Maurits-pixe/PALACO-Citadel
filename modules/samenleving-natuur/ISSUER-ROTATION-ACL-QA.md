# Issuer Rotation ACL Negative Tests — PALACO Citadel DRAFT/HOLD

A PostgreSQL 16 scratch-only integration test checks that a non-login,
non-superuser reader role can inspect the audit pin and history but cannot
update a pin, insert/delete/truncate history, create tables, or take ownership of the protected table. The test also
inspects effective privileges directly, because PostgreSQL may return a
warning rather than a nonzero exit code for a non-grantable GRANT. Every prohibited action is attempted under SET ROLE,
and unexpected success fails the entire CI job. Initial fixture values are
checked again to ensure no unauthorized mutations occurred.

The disposable script is `issuer-rotation-acl-ci.sh` and is run only against
the CI PostgreSQL container with the existing explicit environment guard.

## Explicit security limitation
A PostgreSQL superuser or schema owner is **not** constrained by these ACL
checks. They do not prove immutable storage, durable external anchoring,
authenticated production identities, role separation among independent
operators, or secure issuance of real writer credentials. The scratch
schema/role are deleted after the test. No production writer is created.

All PALACO Citadel operations retain DENY/HOLD. PR #63 stays Draft.
