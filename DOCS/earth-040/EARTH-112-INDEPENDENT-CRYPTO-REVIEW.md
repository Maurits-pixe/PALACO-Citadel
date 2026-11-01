# EARTH-112 — Independent cryptographic review packet

Status: DRAFT — HUMAN REVIEW REQUIRED  
Target: PR #54, branch `feature/earth-040-world-registry`  
Verified CI baseline: `a0506aaa4413e11834a70506beb478fa263c794b`, 15/15 workflow runs PASS.

## Scope
- EARTH-104 legacy SHA-256 receipts and chain verifier.
- EARTH-108 read-only signed audit evidence and epoch policy.
- EARTH-110 candidate domain-separated Ed25519 envelope.
- EARTH-111 explicit opt-in protocol integration.
- EARTH-086/087 pinned and monotone checkpoint verification.

## Review questions / release blockers
1. **Signing preimage:** independently validate byte-for-byte `PALACO/EARTH/AUDIT-RECEIPT/ED25519/v1\\0` + 32 raw SHA-256 bytes; approve or reject protocol before any real signatures are issued.
2. **Trust boundary:** verify keys, revocations, epoch floor and checkpoint are independently authenticated, immutable or monotonically updated, and not taken from an untrusted request.
3. **Key identity:** `keyId` currently equals `reviewerId` in the EARTH-111 integration. Establish durable key registry, reviewer-to-key binding, rotation, revocation and historical signature policy before production.
4. **Canonicalization:** confirm EARTH-084 JSON.stringify compatibility across Node/Python and prohibit ambiguous JSON or unsupported numeric encodings.
5. **Signature validity:** test replay, substitution, alternate protocols, wrong key type, malformed base64, revoked keys, stale epoch, forged checkpoint and chain truncation.
6. **Evidence semantics:** `CRYPTOGRAPHIC_EVIDENCE_MATCH` means verified evidence only, never authorization, source admission, or deploy permission.
7. **Storage and privileges:** independently confirm no privileged EARTH-090 writer grant, no service-role exposure, and append-only durable checkpoint/epoch persistence before activation.
8. **CI and review provenance:** record reviewer identity, reviewed exact SHA, test-run IDs, findings, fixes, independent sign-off and post-merge CI on the merge commit.

## Review record — intentionally unapproved
- Reviewer: UNASSIGNED
- Reviewed commit: UNASSIGNED
- Decision: PENDING
- Findings: OPEN
- Merge authorization: NONE
- Deployment authorization: NONE

No merge, deployment, schema grant, or writer activation is authorized.
