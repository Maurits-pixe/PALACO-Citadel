# EARTH-051 — Source acquisition procedure
Status: PROCEDURE READY / SOURCE NOT ACQUIRED
Last Updated: 2026-11-01

## Candidate
Natural Earth physical coastline and land datasets are candidates for evaluation, not yet admitted.
The official distribution website is https://www.naturalearthdata.com/ .
Do not assume that a third-party mirror is equivalent to the original release.

## Acquisition protocol
1. Human reviewer chooses exact dataset and scale (e.g. 1:110m land) from official publisher.
2. Capture exact source URL, publisher, release identifier, license evidence, retrieval timestamp, raw file bytes and SHA-256.
3. Archive the source artifact in a controlled evidence location, not a transient URL.
4. Convert with a pinned toolchain to EPSG:4326 GeoJSON; record command, tool versions and transformed SHA-256.
5. Validate topology, rings, multipolygons, holes, antimeridian and representative coordinate fixtures.
6. Complete independent license and provenance review, then generate the GIS manifest and run gis-admission.mjs.
7. Only after approval, build a separately reviewed integration candidate that preserves the current demo fallback.

## Explicit exclusions
No source has been downloaded or admitted by this document. No production GIS, authentication, Supabase migration, or public deployment is approved.
