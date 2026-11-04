# EARTH-052 — Natural Earth 110m land source selection
Status: SOURCE IDENTIFIED / DOWNLOAD AND HASH PENDING / NOT ADMITTED
Last Updated: 2026-11-01

## Publisher evidence
- Publisher: Natural Earth (supported by NACIS)
- Official 1:110m physical downloads: https://www.naturalearthdata.com/downloads/110m-physical-vectors/
- Selected layer: Land polygons including major islands
- Publisher-listed layer version: 4.0.0
- Publisher-listed download size: 68.07 KB (display estimate, NOT checksum)
- License evidence: https://www.naturalearthdata.com/about/terms-of-use/
- Public domain statement: https://www.naturalearthdata.com/about/
- Scope: generalized 1:110,000,000 land geometry; not cadastral boundaries, not precise navigation, not political sovereignty.

## Admission state
- Exact downloaded archive URL: NOT_CAPTURED
- Download timestamp: NOT_CAPTURED
- Raw archive SHA-256: NOT_CAPTURED
- Converted GeoJSON SHA-256: NOT_CAPTURED
- Converter and version: NOT_SELECTED
- Independent reviewer: NOT_ASSIGNED
- Admission: DENIED_PENDING_EVIDENCE

## Integration constraints
Existing geo-engine.mjs is intentionally restricted to six schematic polygons; a separate geometry adapter must support Polygon/MultiPolygon and interior rings. Do not replace geo-demo.json with this dataset directly.
Keep interactive region labels distinct from physical land polygons and preserve the demonstration fallback.
