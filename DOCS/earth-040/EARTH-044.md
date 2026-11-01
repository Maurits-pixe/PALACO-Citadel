# EARTH-044 — Geo data acceptance and preview gate
Status: DRAFT — NOT DEPLOYED
Last Updated: 2026-11-01

## Implementation
- GitHub Actions workflow runs Node 22 unit tests, syntax checks, and JSON parsing.
- Preview remains a static, read-only candidate; no deploy job or credentials are configured.
- Atlas loads local demonstration GeoJSON; this is not an authoritative world map.

## Authoritative geographic source acceptance
1. Select a specifically licensed source such as Natural Earth (public domain), and record its exact dataset URL, release/version, download timestamp and SHA-256.
2. Preserve original source artifact and provenance. Verify license and attribution.
3. Convert coastlines to GeoJSON with a reproducible, documented transformation.
4. Verify antimeridian behavior, geometry topology, polygon ring closure, simplification and bounds.
5. Add test fixtures with known coordinates and visual browser QA before swapping demo data.
6. Keep the demo fallback and disclose uncertainty.

## Release blockers
- CI PASS tied to exact head SHA and independent review.
- Mobile and keyboard browser QA.
- Supabase transaction/authorization/revocation implementation and tests before any writes.
- Separate explicit deployment approval; no merge or public URL is authorized by this document.
