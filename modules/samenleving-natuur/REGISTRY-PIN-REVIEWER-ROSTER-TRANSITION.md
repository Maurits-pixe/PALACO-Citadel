# PALACO Citadel — Signed Reviewer Roster Transition (DRAFT/HOLD)

Pure read-only comparison of two independently signed reviewer-roster
snapshots. Each signature is verified with the same P-256 issuer key;
the previous exact digest and issuer fingerprint are caller-provided pins.

Fail-closed checks require a strict increase in revision and prohibit
revoked reviewer reactivation, silent reviewer key substitution,
deletion of established reviewer identities, duplicate IDs/fingerprints,
and invalidly signed or substituted snapshots. Adding a different
reviewer is permitted only under a new identity with an ACTIVE status.

**Trust boundary:** caller-supplied pins do not establish independent
authenticity or revocation freshness. No network, persistence, signer
custody or actual issuance is connected. Even a locally consistent
transition always returns authorization DENY, trust NOT_ESTABLISHED and
stateChanged=false. The module does not enable key rotation.

Run: `node --test modules/samenleving-natuur/registry-pin-reviewer-roster-transition.test.mjs`.
PR #63 remains Draft/HOLD. No production or PALACO MONO changes.
