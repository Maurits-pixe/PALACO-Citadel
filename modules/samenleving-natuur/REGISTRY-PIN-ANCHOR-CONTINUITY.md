# Signed Audit Anchor Continuity — DRAFT/HOLD

Checks a pair of ECDSA P-256 signed, byte-exact audit checkpoints against
the same ledger, including every revision between a pinned old checkpoint
and a newer candidate. The prior checkpoint SHA-256 and sequence are inputs
intended to come from an **independent, protected trust store**.

This verifier detects replacement of the old checkpoint, missing/reordered
revisions, a stale or unadvanced new checkpoint, a mismatched anchor signing
key, and forged signatures. It is local, pure and read-only.

**Important:** independently protected storage, publication, trusted key
lifecycle, and source authenticity have *not* been implemented here. A caller
controlling the trusted previous digest and sequence could substitute them.
A locally valid `continuityVerified` result is never authorization or an
assertion that the audit has been anchored externally.

Every return is DENY / NOT_ESTABLISHED / stateChanged=false /
releaseAllowed=false. No database writes or deployment.

Test:
`node --test modules/samenleving-natuur/registry-pin-anchor-continuity.test.mjs`

PALACO Citadel PR #63 remains Draft/HOLD.
