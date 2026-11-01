# EARTH-103 — Verified legacy hash compatibility gap

Status: **HOLD / migration design**.

Source inspection:
- `earth-084-review-receipt.mjs` hashes `JSON.stringify(receipt)` in insertion order with fields `protocol,sourceSHA256,outputSHA256,reviewerId,trustedEpoch,minimumAcceptedEpoch,status,stage,reasons`.
- `earth-085-review-chain.mjs` hashes a `JSON.stringify` record with fields `index,previousHash,receiptSHA256,status,stage`. The first record has `index:0` and `previousHash:null`.
- `earth-101-verify.py` uses sorted keys and record fields `index,previousHash,receiptSHA256`, requires a hex previous hash, and starts at index >= 1.

These are **distinct preimage and genesis contracts**. EARTH-101 PASS validates only its new format; it cannot validate legacy EARTH-084/085 records or safely authorize an EARTH-090 append.

## Required implementation
1. Freeze legacy EARTH-084/085 as a named `legacy-js-v1` profile; never silently rewrite existing hashes.
2. Produce golden vectors from the actual JavaScript functions, including a genesis record, subsequent record, Unicode and escaped strings.
3. Add a separate Python `legacy-js-v1` verifier with explicit field order, safe-integer bounds, string escaping and null genesis; keep `earth-101` as a distinct experimental profile.
4. Resolve EARTH-090's checkpoint genesis length >= 1 versus EARTH-085's index 0/null genesis before any migration.
5. Include signature, revocation and external checkpoint floor verification as independent prerequisites. Digest compatibility alone does not authorize admission.

No database migration, permission grant, merge or deployment is authorized.
