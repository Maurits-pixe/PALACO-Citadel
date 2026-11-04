# EARTH-097 — Server-only execution identity

**Status: CANDIDATE / EXECUTION DENIED.** No changes to PALACO Supabase.

The existing EARTH-090 SECURITY INVOKER function requires direct INSERT and UPDATE table rights, which violates the intended isolation boundary. EARTH-097 introduces a role candidate `earth_audit_executor` with **no login and no table privileges**. It is intentionally not granted EXECUTE yet.

## Hard gates before activation
- Create a dedicated NOLOGIN function-owner role, without SUPERUSER/BYPASSRLS, in an isolated staging database.
- Rebuild and review the append function under that owner with pinned `search_path`, full digest and chain verification, trusted external checkpoint and revocation checks; SECURITY DEFINER must not be owned by `postgres`.
- Grant only schema USAGE and EXECUTE to the executor role after negative tests show direct INSERT/UPDATE/DELETE fail.
- Bind a separately authenticated server workload identity to this role, never a browser or Supabase publishable/secret key.
- Run role impersonation, replay, two-connection contention, crash/recovery and malicious-input tests.
- Require independent review and explicit authorization before any production migration or initial checkpoint.

**Fail-closed:** the SQL candidate grants no new access. The current production Supabase `earth_audit` schema remains private and empty.
