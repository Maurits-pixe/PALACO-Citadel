# EARTH-124 — Independent source attestation contract (DRAFT)

Status: **DRAFT / FAIL-CLOSED / NO SOURCE ADMISSION**  
Related: EARTH-120 source hash gate; EARTH-123 GitHub Actions run [41404390952](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/41404390952), job 125143022747, SHA `ffd0421cdb61edab8f50b86ba2de8b67ec7517e7`.

## Verified CI baseline
The run completed successfully on the exact SHA above. Python 3.12.15 ran nine synthetic source-gate tests (9/9 PASS). The separate pending-manifest assertion passed. This establishes CI execution **only**, not source authenticity, reviewer independence, or production readiness.

## Attestation requirements before enabling official source pin
1. **Two independent evidence paths:** an independently sourced expected SHA-256 for the exact `ne_110m_land.zip` release, plus an independently reviewable origin/release reference. A hash copied from the downloaded archive is not independent verification.
2. **Reviewer authority:** record reviewer identity, role, affiliation, approval scope, timestamp, and conflict-of-interest declaration. Repository authors must not self-attest their own source acquisition as an independent review.
3. **Signed canonical manifest:** define a versioned, domain-separated canonical payload covering dataset name, exact archive name, SHA-256, source URL, release identity, reviewer identity, review-evidence reference, decision, and validity window. Sign using an approved, separately pinned reviewer key. Do not commit private keys or treat unsigned JSON as authenticated approval.
4. **Key trust:** independently review and pin public verification key(s), key identifiers, revocation procedure and rotation policy. Unknown or revoked key, invalid signature, malformed manifest, missing evidence, or expired review must all fail closed.
5. **Content safety:** validate ZIP entry names, compressed/uncompressed sizes, archive member allowlist, shapefile geometry, coordinate bounds, topology and deterministic conversion; preserve immutable input and output digests.
6. **Decision separation:** `SOURCE_PIN_VERIFIED` must not imply `RENDER_ADMITTED`, `PRODUCTION_APPROVED`, or `DEPLOY_AUTHORIZED`. These are distinct human-controlled gates.

## Current implementation limitation
`earth-120-source-admission.py` verifies metadata shape and digest equality but **does not verify cryptographic signatures or reviewer authority**. Its `REVIEWED_PIN` status field is self-asserted by whoever edits the JSON. The output deliberately says `SOURCE_PIN_MATCH_ONLY_NOT_RENDER_ADMITTED`. Treat even a syntactically valid, hash-matching manifest as **untrusted for official admission** until an independently approved signed-attestation verifier is integrated and tested.

## Required evidence packet
- Official origin and independently established source digest with citations and retrieval date
- Human reviewer report and scope
- Canonical signed manifest plus pinned public key provenance and revocation status
- CI run IDs, head SHA, immutable logs/artifacts and negative security tests
- Explicit separate GIS admission decision signed by authorized reviewer

## Non-authority
No keys have been approved or pinned by this document. No official dataset has been downloaded, reviewed, admitted or published by this document. PR #54 remains OPEN. No merge, deployment or production activation is authorized.
