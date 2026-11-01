# EARTH-047 — Browser QA evidence and release boundary
Status: CHROMIUM SMOKE PASS / MOBILE QA PENDING / PUBLIC DEPLOYMENT HOLD
Last Updated: 2026-11-01

## Verified commit
`662b9308b129ce4d1b9f3385fe4918bcd132a0a3`

- General CI: run 41295924257 (#154), completed success.
- Geo Engine: run 41295924261 (#7), completed success.
- Chromium Browser QA: run 41295924294 (#1), completed success.

GitHub Actions evidence establishes successful execution of the configured tests on the exact commit. It does not establish exhaustive accessibility, production behavior, mobile devices, source accuracy or database authorization.

## Remaining gates
1. Android device browser and small-viewport acceptance, screen-reader and reduced-motion review.
2. Fail-closed data-source error and provenance tests with independent reviewer.
3. Licensed authoritative GIS dataset with exact source version, checksum and reproducible conversion.
4. Security review of draft SQL, RLS, write authorization, append-only records and replay/idempotency.
5. Explicit owner approval for merge and preview deployment.

No automatic merge or deployment. No public domain is claimed.
