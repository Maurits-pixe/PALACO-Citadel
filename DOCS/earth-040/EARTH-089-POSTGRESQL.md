# EARTH-089 — PostgreSQL persistence candidate

Status: **DRAFT / NOT DEPLOYED**.

The migration defines an append-only review record table and a single-row checkpoint table. Database owners and privileged administrators can bypass or remove triggers, so append-only is a role-based operational property, not tamper-proof storage.

## Required atomic transaction

1. Begin transaction and lock the checkpoint row with `SELECT ... FOR UPDATE`.
2. Compare its version, chain length and head hash with the trusted expected state.
3. Validate new records, links and hashes in a trusted application/service before insertion.
4. Insert records with sequential indexes.
5. Update checkpoint with `WHERE id=1 AND version=$expected_version`; require exactly one row affected.
6. Commit. On any mismatch, roll back and return HOLD.

No bootstrap checkpoint is created automatically. Do not allow browser-supplied hashes to become trust anchors. Use separate migration and runtime roles, restrict grants, maintain backups, and independently pin checkpoints outside this database.

**Open:** actual SQL integration tests against PostgreSQL, runtime role grants, secure external anchor, crash recovery, and deployment approval.
