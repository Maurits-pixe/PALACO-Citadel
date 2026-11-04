# EARTH-090 — Transactionele auditappend (DRAFT)

**Niet uitgerold; geen PostgreSQL-integratietest uitgevoerd.**

`earth_audit.append_checkpoint_batch` locks the singleton checkpoint row with `FOR UPDATE`, compares the expected version/length/head, inserts a bounded sequence of linked records, and advances the checkpoint in the same transaction. Any exception rolls back the whole function call (unless a caller deliberately catches it inside a larger transaction using savepoints).

**Security boundary:** SQL checks structure and linkage, but **does not recompute SHA-256** for records or receipts. The trusted service must call EARTH-084/085 verification and independently pin the checkpoint. The database owner/superuser can bypass triggers. The function is SECURITY INVOKER, and PUBLIC EXECUTE is revoked; grant narrowly to a dedicated service role only after review. No client/browser access.

**Open acceptance:** execute migration against an isolated PostgreSQL instance, test competing writers, failed mid-batch rollback, malformed record, role denial, crash recovery, and external checkpoint consistency. Initial checkpoint bootstrap remains a separate authorized operation.
