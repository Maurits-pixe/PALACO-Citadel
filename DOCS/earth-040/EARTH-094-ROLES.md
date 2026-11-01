# EARTH-094 — Least-privilege role isolation (DRAFT)

The role migration and test are **not deployed**. Apply only to disposable CI PostgreSQL after EARTH-089/090. Roles are NOLOGIN and need explicit assignment to authenticated service identities. Runtime users must never own the schema or receive migration privileges.

The writer role has direct INSERT on review records and UPDATE on checkpoint to support SECURITY INVOKER; this is a **remaining security weakness**: a compromised writer can bypass the append function and mutate the checkpoint. Do not call this a complete authorization boundary. Next hardening: SECURITY DEFINER function with locked search_path, trusted dedicated owner, and no direct table writes for the caller; independently verify hashes and external checkpoint.

The checks cover privilege metadata, not actual connection identity, role escalation, or owner/superuser bypass.
