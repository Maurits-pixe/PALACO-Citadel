# EARTH-122 — Local source-gate verification record

Status: **LOCAL TEST PASS / GITHUB ACTIONS HOLD**  
Source revision inspected: `9232fade563b8ab7b684be454091aa8aff6acfac`  
Test environment: isolated local Python 3.13.5 runtime, 2026-11-02.

## Scope
The following three source files were fetched from the stated revision and reproduced locally:
- `DOCS/earth-040/earth-120-source-admission.py`
- `DOCS/earth-040/earth-120-source-admission.test.py`
- `DOCS/earth-040/earth-120-source-manifest.json`

Command: `python earth-120-source-admission.test.py -v`

Observed result: `Ran 9 tests in 0.010s — OK`.

Passing cases: source hash match; source hash mismatch; invalid hash; incorrect source; missing reviewer; missing review evidence; misleading URL userinfo; pending status; real pending manifest.

## Boundaries
- This is **local** test evidence, not a GitHub Actions run or GitHub-issued CI attestation.
- Synthetic bytes are used; the official Natural Earth archive was not admitted or converted during this test.
- The source-manifest review fields remain pending.
- The checker verifies hash equality and metadata shape; it does not independently authenticate reviewer identity, review authority or external source provenance.
- A prior lookup of commit `9232fade563b8ab7b684be454091aa8aff6acfac` returned no associated GitHub Actions workflow runs. Do not treat this as evidence of a CI pass.
- Separate Vercel status failures require their own investigation.

## Next gate
A human maintainer must capture a successful GitHub Actions run tied to the exact reviewed commit, then independently verify official source provenance and reviewer evidence. Production, merge and official GIS admission remain **HOLD**.
