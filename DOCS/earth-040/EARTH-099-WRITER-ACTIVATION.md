# EARTH-099 — Database writer activation contract

Status: **DESIGN / HOLD**. No production migration, endpoint or grant is authorized.

## Verified prerequisite
EARTH-098 Executor Isolation QA #3 PASS on commit `9290d55aedf737817e7024213afa5e93b9c97286` (GitHub run `41302365592`). This tests a **denied** executor role on disposable PostgreSQL 16. It does not prove any positive writer capability or production Supabase authorization.

## Server-only admission protocol
1. Receive request from authenticated workload identity over TLS; deny browser-origin credentials and generic Supabase client keys.
2. Verify request schema, bounded batch, canonical byte encoding and content digests in a separately reviewed verifier.
3. Verify Ed25519 reviewer signature against externally pinned trust anchor, reviewer scope, expiry, key rotation and revocation epoch.
4. Compare expected version/length/head to database checkpoint AND externally trusted monotone floor. Deny rollback or temporal uncertainty.
5. Execute exactly one atomic append using a dedicated, non-login function owner and a narrowly scoped executor. No direct table INSERT/UPDATE/DELETE grants to executor.
6. Persist an immutable receipt including idempotency key, request hash, previous head, new head and verification provenance. Duplicate key with different payload must deny.
7. Return success only after durable transaction commit and independent readback. On ambiguous completion return UNKNOWN, not SUCCESS; recover by receipt lookup.
8. Record denied attempts without granting the caller audit-table write access.

## Required independent tests
- Unauthorized identities and public roles denied; direct SQL table mutation denied as actual runtime role.
- Invalid signatures, revoked keys, expired mandates, replay and altered payload denied.
- Two independent writers racing one checkpoint: exactly one commit.
- Crash before commit, after commit before acknowledgement, retries and external floor rollback.
- SQL function owner is not superuser, does not BYPASSRLS, uses pinned search_path and no unsafe dynamic SQL.
- Supabase security advisor and schema exposure reviewed; no production writes until signed release decision.

## Boundary
EARTH-089/090 are historical candidates, not production-ready append authority. EARTH-095 private tables remain empty and read/write-denied to public app identities. Official GIS admission remains a separate human decision.
