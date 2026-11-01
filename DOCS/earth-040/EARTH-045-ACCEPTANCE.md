# EARTH-045 — Verified CI evidence and browser acceptance
Status: CI VERIFIED / BROWSER QA PENDING / DEPLOYMENT HOLD
Last Updated: 2026-11-01

## Exact-head evidence
Commit: `29c231aa28048280fcbcb62885f9bfb512ab869c`
PR: https://github.com/Maurits-pixe/PALACO-Citadel/pull/54
- CI run 41295710438 (#148): completed, success.
- EARTH-044 Geo Engine Validation run 41295710559 (#1): completed, success.

These results were read from GitHub Actions for the exact commit. They do not establish independent review, browser QA, authoritative geodata, production storage or deployment.

## Manual browser acceptance
- [ ] Load index.html and atlas.html through HTTP(S), not file://
- [ ] Test keyboard navigation (Tab, Enter, Space), focus visibility and screen reader region names
- [ ] Test Android and desktop viewport, portrait/landscape
- [ ] Confirm atlas GeoJSON loads with no network errors
- [ ] Disable or block geo-demo.json: verify fallback and visible warning
- [ ] Test reduced-motion preference
- [ ] Verify no secret keys, write endpoints, personal data or auth claims
- [ ] Verify 4×4 / 12×8 / virtual 4444×4444 labels and no GIS accuracy claims
- [ ] Review real geodata provenance and antimeridian before replacement
- [ ] Re-run CI against the final head SHA after any new commit

## Decision
HOLD: no merge, deployment, or Supabase migration authorized.
