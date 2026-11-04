# EARTH-100 — Privileged append function implementation gate

**Status: BLOCKED — design review required.** The current `earth_audit.append_checkpoint_batch` (EARTH-090) validates record links but explicitly **does not independently recompute record hashes or receipt digests**. Turning it into SECURITY DEFINER and granting EXECUTE to an application role would permit a compromised application identity to forge arbitrary hash-linked audit records.

## Required implementation split
- A trusted server verifier must validate canonical receipt bytes, record hashes, signature, authority scope, revocation epoch, external monotone trust floor, and idempotency before database commit.
- A database append function must not trust client-provided `recordHash` as proof. The function's interface should accept a verifiable envelope or a narrowly scoped, one-time attestation whose authenticity it can verify without relying on mutable client claims.
- Function ownership: dedicated NOLOGIN non-superuser without BYPASSRLS; explicit RLS policy if required; pinned `search_path`; no public EXECUTE; no direct table mutation rights to executor.
- Supabase API exposure: private schema only, not in exposed schemas; no generic `service_role` grants; no client-side use of a privileged key.
- Rollback, concurrent writers, duplicate request, conflicting idempotency key and crash-after-commit must be tested against disposable PostgreSQL before any activation.

## Acceptance
1. Recompute or cryptographically authenticate every submitted record and the checkpoint transition.
2. Deny altered hash, altered receipt, missing signature, revoked reviewer and stale external floor.
3. Verify actual runtime role cannot issue direct INSERT/UPDATE/DELETE.
4. Confirm independent reviewer approves the privilege boundary and deploy migration.
5. Require explicit separate authorization for production activation.

No database mutation, function grant, deployment, merge or release is authorized by this document.
