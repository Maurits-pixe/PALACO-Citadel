# EARTH-063 — Verified-source acquisition blocker
Status: BLOCKED — NO SOURCE BYTES
Last Updated: 2026-11-01

## Attempt
Tried retrieving https://naturalearth.s3.amazonaws.com/110m_physical/ne_110m_land.zip from the build environment on 2026-11-01. DNS resolution failed. No bytes were received.

## Required evidence
- Exact source archive bytes and SHA-256
- Archive contents and dataset release metadata
- Transformation tool/version and reproducible command
- Converted GeoJSON and SHA-256
- Independent source/license review

## Consequence
The selected Natural Earth dataset is NOT_ADMITTED. No SHA-256 value is asserted and no physical dataset is shipped. Existing demo and fail-closed GIS import remain unchanged.

## Recovery path
Download the official ZIP in a network-enabled trusted environment, retain the original artifact and record its SHA-256; only then run a pinned conversion and supply the evidence to the EARTH admission manifest. Do not use a checksum from an unrelated version or mirror.
