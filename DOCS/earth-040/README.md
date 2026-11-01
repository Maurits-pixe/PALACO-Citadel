# EARTH-040 — World Registry & Living Globe
Status: IMPLEMENTATION CANDIDATE
Last Updated: 2026-11-01

## Scope
W-0001 EARTH is a proposed anchor within PALACO MUNDO. The read-only prototype is at `DOCS/earth-040/index.html`.

## Evidence and boundaries
- Existing object binding documentation marks `anchor:earth` as UNKNOWN; this change does not promote it to CANONICAL.
- OR6IT runtime is NOT VERIFIED.
- The prototype is client-only: no accounts, authorization, storage, live AI, actual geospatial tiles or cryptographic verification.
- Resolution controls 4×4, 12×8 and 4444×4444 are demonstrative selection state only.
- No deploy, merge or production approval is implied.

## Review gates
1. Verify accessible mobile/desktop rendering, keyboard focus, and reduced motion.
2. Establish authoritative W-0001 source and append-only provenance before status promotion.
3. Define spatial tile model and tests before calling any map operational.
4. Require independent authorization, replay/idempotency and revocation tests before mutation or persistence.
5. Verify preview deployment separately before publishing an EARTH URL.

## TRIAS / Oracle / Mentor
- TRIAS: isolate presentation from world-state authority.
- Oracle: document what is and is not supported by evidence.
- Mentor: make every unavailable feature visibly non-operational.
