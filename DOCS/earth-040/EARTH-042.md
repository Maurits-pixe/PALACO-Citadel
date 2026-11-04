# EARTH-042 — Storage and geographic data gate
Status: DRAFT — NOT DEPLOYED
Last Updated: 2026-11-01

## Delivered
- Draft PostgreSQL schema with RLS and immutable event trigger.
- Static machine-readable registry at `registry.json`.
- EARTH-041 SVG atlas remains illustrative, not geographic GIS data.

## Blockers before deployment
1. Add an explicit SECURITY DEFINER or service-side mutation API with independent authorization and revocation checks. Never expose a service key to the browser.
2. Make each world-object mutation and audit append atomic, with compare-and-swap version checks and stable idempotency keys.
3. Define canonical event serialization, SHA-256 digest computation and previous-digest linkage; reject mismatches.
4. Test rollback, concurrency, retry, replay, scope drift, revocation, and direct API bypass.
5. Assess migration in disposable Supabase environment and review RLS grants, policy semantics and role privileges.
6. Adopt a licensed authoritative coastline/region dataset with source, version and attribution before claiming geographic accuracy.
7. Verify independent review, CI and deployment evidence before promotion.

## Security observations
- The current SQL does not itself implement authorized writes or cryptographic event verification.
- The immutable trigger is not a substitute for restricted privileged access or independently anchored evidence.
- Public object data must be curated to exclude secrets and personal data.

## TRIAS / Oracle / Mentor
TRIAS: isolate schema, authorization, and geographic data provenance.
Oracle: no runtime evidence exists yet.
Mentor: keep the interface explicitly marked preview/read-only.
