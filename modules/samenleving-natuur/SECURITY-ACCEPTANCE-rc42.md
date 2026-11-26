# CITADEL Samenleving & Natuur — rc42 security acceptance gate (DRAFT / HOLD)

Status: **DRAFT / HOLD / DENY**. This is a review contract, **not** a release authorization, trusted key enrollment, EDTR issuance or deployment. The rc41 cryptographic reviewer-registry checks are a local prototype. The user-supplied registry issuer public key has no independently established PALACO trust anchor.

## Required threat-model assertions

1. **Untrusted issuer:** a well-formed and correctly signed registry, even with two distinct reviewer keys, must never be reported as authorized, official or independently trusted. The UI and exported evidence must carry an explicit untrusted/authority-none result.
2. **Registry substitution:** swapping the issuer JWK and re-signing with a new, self-supplied key cannot establish PALACO authority. Any future trust mode must pin the approved issuer independently of uploaded content.
3. **Revocation:** revoked, inactive, unknown or mismatched reviewers are rejected without falling back to signature-only or hash-only acceptance when the signed-registry policy is enabled.
4. **Temporal bounds:** reject not-before dates in the future, expired reviewer entries or registry snapshots, inconsistent intervals, malformed ISO timestamps, and local-clock rollback as evidence of continued validity. Browser time is not a trusted time source.
5. **Pairwise independence:** maker and checker must differ by cryptographic public-key fingerprint, not only by display name or reviewer identifier. Reusing one key with two identities must be rejected.
6. **Input mutation and races:** changing the signed registry, reviewer key, revocation data, evidence packet, signature, or policy invalidates previous results immediately; delayed file reads/verification cannot restore a stale approval.
7. **Parser integrity:** reject duplicate JSON keys (including escaped-name aliases), unknown fields, unsafe numeric values, malformed base64 or EC points, overlarge payloads, and prototype-polluting data before signature verification; canonicalization should be unambiguous across runtimes.
8. **Rollback and key lifecycle:** no claim of reliable anti-rollback, rotation continuity, trusted revocation distribution or provenance from mutable browser storage or user-uploaded snapshots.
9. **Evidence fidelity:** a recorded PASS states precisely which test environment and exact commit SHA were used; desktop/mobile emulation is not a physical phone test.
10. **Fail closed:** missing trust anchor, missing current revocation evidence, invalid signing chain or indeterminate validation produces **DENY / HOLD** in any future authority-bearing flow.

## Non-negotiable release gates

- Independent security/privacy review and explicit risk acceptance.
- Separate approval of authoritative key governance: roots, roles, expiry, rotation, revocation, distribution and secure time/anti-rollback strategy.
- Verified automated test evidence on the final exact head SHA, including negative tests for every assertion above.
- Accessibility review and manual physical Android/iOS acceptance.
- Explicit owner authorization for any merge, production deployment or public Sites release, separately from engineering GO.

## rc41 evidence baseline (not rc42 evidence)

- PR: https://github.com/Maurits-pixe/PALACO-Citadel/pull/63
- Baseline commit: `7a01f02573088cfe1005315b349c7f664544e739`
- Browser QA run: https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44977609784 — completed/success, desktop/mobile Chromium regression step successful.
- General CI run: https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44977609788 — completed/success.

These runs apply to the **baseline**, not to subsequent commits. This document does not assert that every new negative scenario has been implemented, executed, or passed.

**Current decision:** DRAFT / HOLD / DENY. No merge, release, connection, issuance or assignment of reviewer authority.
