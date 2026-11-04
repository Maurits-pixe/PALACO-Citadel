# EARTH-096 — Supabase connection security gate

Status: **CONNECTED / WRITES HOLD**. Verified 2026-11-01 against PALACO Supabase project `tflbeiqbykhyyjdmrrvw` (PostgreSQL 17).

## Verified state
- Private schema `earth_audit` exists, with `checkpoint` and `review_record`.
- RLS enabled on both tables; no end-user policies.
- `anon` and `authenticated` have no schema USAGE.
- `service_role` has no direct INSERT on `review_record`.
- Both tables contain zero rows.
- The `review_record` update/delete rejection trigger was installed in EARTH-095.

## Unresolved security gate
Do not expose these tables in the Data API or grant `anon`, `authenticated`, or generic `service_role` write access. EARTH-090's current SECURITY INVOKER function cannot run without direct table grants; granting those would reopen the bypass identified in EARTH-094. Design a narrowly scoped server-only database identity and transaction boundary; independently validate record and receipt hashes, reviewer signatures, revocation epoch, and an external checkpoint before any writes. Do not create a bootstrap record or assert GIS admission from an empty schema.

## Acceptance
1. Separate migration-owner and runtime identities with least privilege.
2. Test direct UPDATE/DELETE/INSERT denial as the actual runtime identity.
3. Test transaction rollback and two-client contention against isolated staging, not PALACO production.
4. Validate external trust floor, key revocation, and replay protection.
5. Obtain independent human review and explicit authorization before enabling writes.
