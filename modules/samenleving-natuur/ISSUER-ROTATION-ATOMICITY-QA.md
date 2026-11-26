# PALACO Citadel — ephemeral issuer rotation atomicity QA

The script `issuer-rotation-atomicity-ci.sh` runs **only** on the disposable
PostgreSQL 16 CI service, with a dedicated scratch schema.

It proves:
- a second database session cannot concurrently claim the locked current row;
- a stale optimistic compare-and-swap updates zero rows after the first commit;
- an atomic state/history transaction can be rolled back without an orphan entry;
- history UPDATE is rejected by a scratch-only immutable-history trigger.

This is **not** a live issuer ledger, a migration, an authorized writer, a
production-safe identity service, or independent notarization. The scratch
fixture explicitly contains a writer for CI only. Existing protected production
tables are not modified. The environment guard is a testing precaution, not an
authorization boundary.

Execution:
`CITADEL_EPHEMERAL_CI_ONLY=1 bash modules/samenleving-natuur/issuer-rotation-atomicity-ci.sh`
on the already configured ephemeral PostgreSQL GitHub Actions job.

PR #63 remains Draft/HOLD; authorization DENY.
