# Reviewer Roster Quorum Continuity — DRAFT / HOLD

This pure, read-only preflight composes two existing cryptographic verification
components: the signed reviewer roster checkpoint transition, and a strict
N-of-N (2–5) set of signed checkpoint witness attestations on BOTH sides.

It rejects a valid but stale candidate witness quorum, a mismatched candidate
revision with an unchanged head, tampering with the signed roster transition,
missing quorum members, signer duplication, altered prior pins, and malformed
object input. Both quorums must attest exactly the complete checkpoint
state expected from the verified transition.

Trust boundaries remain **unresolved**. The previous checkpoint pin,
witness allowlist, witness key material and clock are caller supplied, not
independently authenticated. Both sets of signatures could be replaced
alongside all caller-supplied pins by a compromised environment. No trusted
read, protected storage, real-world independence of witnesses, atomic
durable compare-and-swap, key custody, or fresh revocation is implemented.

Every successful or unsuccessful result is
`trust: NOT_ESTABLISHED`, `authorization: DENY`,
`executionAllowed: false`, `stateChanged: false`.
No external write, no rollout, and no change to PALACO MONO.

Run:
`node --test modules/samenleving-natuur/registry-pin-reviewer-roster-quorum-continuity.test.mjs`

GitHub Actions runs the above suite in the existing PR workflow.
PR #63 stays DRAFT / HOLD without merge.
