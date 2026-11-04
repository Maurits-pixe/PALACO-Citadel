# EARTH-049 — GIS source admission contract
Status: SOURCE NOT ADMITTED / DEMO GEOMETRY ONLY
Last Updated: 2026-11-01

## Purpose
Never silently promote illustrative EARTH GeoJSON to authoritative coastlines.

## Source manifest required fields
- sourceName, sourceURL, publisher, license, licenseEvidenceURL
- sourceVersion, retrievedAt, rawSHA256, transformedSHA256
- transformationTool, transformationVersion, transformationCommand
- coordinateReferenceSystem (WGS84 EPSG:4326)
- geographicAccuracy and provenanceStatus
- reviewer, reviewDate, acceptanceDecision

## Acceptance
- Raw artifact must be pinned and checksummed.
- Conversion must be deterministic, documented and independently repeatable.
- Check multipolygons, holes, antimeridian crossings and valid latitude/longitude bounds.
- Confirm performance at mobile viewport and keyboard/screen-reader behavior.
- Any missing provenance field or mismatch means NOT_ADMITTED.
- Demonstration geometries remain labeled ILLUSTRATIVE_ONLY and cannot be represented as precise boundaries.

## Evidence
At commit `86d000f5b34e3479997dadad09d049c831d3faf3`:
- CI #156, run 41296077973: success.
- Geo Engine #9, run 41296078013: success.
- Chromium Browser QA #3, run 41296078108: success.

This evidence does not approve a geographic dataset or deployment.
