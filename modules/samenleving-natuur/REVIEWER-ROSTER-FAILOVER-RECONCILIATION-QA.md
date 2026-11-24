# Reviewer Roster Failover Reconciliation — DRAFT / HOLD

This **read-only**, offline verifier examines 2–5 caller-supplied storage
observations. Each observation carries its own independently keyed,
P-256/SHA256 signed storage receipt. It verifies each signature and
storage identity before comparing checkpoint head, sequence, revision,
issuer fingerprint, registry hash and store version.

A disagreement between valid signed observations returns
`SIGNED_SPLIT_VIEW`. **The highest store version or most recent timestamp
never wins automatically**. Matching signed observations that disagree
with the separately supplied pinned checkpoint return
`PINNED_CHECKPOINT_MISMATCH`. The verifier rejects missing or duplicate
required node IDs, storage-signing-key reuse, forged signatures, version
rollback, malformed input and accessor/symbol injection.

The output is ALWAYS `authorization: DENY`,
`trust: NOT_ESTABLISHED`, `stateChanged: false`,
`releaseAllowed: false` and `executionAllowed: false`, including
when `reconciled: true`.

**Security limitations:** node observations, node IDs, key fingerprints,
minimum version, pinned checkpoint and claimed time are supplied by the
caller. No network call, independent storage read, authenticated replica
discovery, protected external checkpoint anchor, promotion fencing,
revocation check, trusted clock, or independent key custody is performed.
Agreement of caller-controlled snapshots is NOT proof of actual quorum
or safe failover. Split-view rejection is only an evidence preflight.

Test:
`node --test modules/samenleving-natuur/registry-pin-reviewer-roster-failover-reconciliation.test.mjs`

GitHub Actions runs the suite. PR #63 stays Draft/HOLD; no production
writer, no merge, no PALACO MONO modification.
