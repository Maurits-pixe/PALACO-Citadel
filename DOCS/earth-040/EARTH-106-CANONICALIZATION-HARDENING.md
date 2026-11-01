# EARTH-106 — Cross-language hardening and release boundary

**Status: DESIGN / HOLD.** EARTH-105 Cross-language Audit QA #1 PASS, commit `98ee7511d3838591b0e543b5286eaaf7be79c2ef`, run `41302844818`. All ten workflows on that commit PASS.

## Compatibility that is actually demonstrated
- One Node-generated EARTH-084 receipt with Unicode, and two linked EARTH-085 records.
- Python recomputation agrees with Node for those concrete fixtures.
- Altered stage is rejected.

## Remaining serialization risks
- Python `json.dumps(...,ensure_ascii=False)` does not fully emulate JavaScript `JSON.stringify`: astral-plane surrogate handling, escaping of U+2028/U+2029, negative zero, float exponent notation and JS object key ordering require explicit cross-runtime tests.
- Python `json.loads` silently accepts duplicate object keys by default. Reject duplicates at the input boundary, before digest verification.
- Validate `receiptSHA256` and `recordHash` with exact lowercase 64-character hex regex, not only string length.
- Ensure untrusted `status`, `stage`, reviewer and epoch values cannot be treated as authorization merely because a hash matches.
- Define immutable, versioned canonicalization profiles; never silently reinterpret existing records.

## Required next QA
1. Cross-runtime golden vectors for Unicode edge cases, quotes, control characters, integers at JS safe boundaries, duplicate keys, nested maps, non-finite numbers, negative zero, and JS numeric object keys.
2. Fail closed for values outside the explicitly supported subset.
3. Add signed receipt validation, key revocation and external monotone checkpoint floor before any privileged database append.
4. Independent security review of the function owner and execution privileges.

No Supabase migration, runtime write grant, merge, or deployment is authorized.
