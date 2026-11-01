# EARTH-102 — Canonical audit format interoperability gate

**Status: HOLD / integration contract only.**

EARTH-101 Audit Digest QA #1 passed on commit `7d0c79e2b4e42174faaca36fd986d5efe54162ac`, run `41302587499`.

## Identified compatibility boundary
The EARTH-101 Python candidate computes SHA-256 over sorted-key compact UTF-8 JSON and constructs record hashes from `{index, previousHash, receiptSHA256}`. This is a **new proposed serialization contract**. It has not been demonstrated byte-identical to EARTH-085's audit construction, EARTH-086 checkpoint verification, EARTH-090's database input, or JavaScript runtime JSON serialization.

**Do not admit EARTH-101 hashes as authoritative without cross-language golden vectors.** JSON Unicode normalization, numeric encoding, escaping, negative zero, key ordering, duplicate keys and type coercion can produce distinct byte streams.

## Required proof
1. Retrieve exact EARTH-085/086 source and compare domain separation, record preimage and receipt preimage; no guessed equivalence.
2. Generate immutable golden vectors for empty/non-ASCII strings, nested objects, large integers and malicious keys, in Python and JavaScript.
3. Verify canonical serialization byte-for-byte and SHA-256 digest equality across languages and PostgreSQL.
4. Reject duplicate JSON keys before parsing; reject floats and non-finite values; establish integer range and Unicode normalization policy.
5. Bind verified envelope to reviewer Ed25519 signature, scope, key epoch and revocation checks, with external trust floor.
6. Test rejection of validly hash-linked but unsigned or unauthorized records.
7. Only after independent review integrate a privileged append function. EARTH-090 remains SECURITY INVOKER, with no runtime direct table write grants.

## Release decision
No public authority, database grants, Supabase migration, merge or deployment is authorized.
