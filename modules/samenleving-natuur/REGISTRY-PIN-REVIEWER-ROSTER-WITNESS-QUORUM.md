# Reviewer Roster Witness Quorum — DRAFT / HOLD

This local, read-only N-of-N preflight verifies 2–5 separately signed
checkpoint attestations. All witnesses must be present, must belong to
the supplied exact expected witness fingerprint set, and must sign the
same complete checkpoint state. Invalid, duplicate, unlisted, expired
or divergent witness attestations are rejected (fail closed). The design
does not silently downgrade to fewer witnesses.

This is **cryptographic evidence inspection, not an authenticated quorum**.
Witness key custody, identity independence, expected fingerprint allowlist,
the expected checkpoint head and the wall clock are all caller supplied.
No independent checkpoint read, actual separate trust domains, persistent
atomic CAS, trustworthy time, revocation freshness or external publication
is performed. An attacker controlling all caller-provided trust anchors
could manufacture a matching set of attestations. Therefore all outputs
retain `authorization: DENY`, `trust: NOT_ESTABLISHED`,
`stateChanged: false`, `executionAllowed: false`.

Regression tests:
`node --test modules/samenleving-natuur/registry-pin-reviewer-roster-witness-quorum.test.mjs`

No production activation, no merge, no live database writes or PALACO MONO changes.
PR #63 remains Draft/HOLD.
