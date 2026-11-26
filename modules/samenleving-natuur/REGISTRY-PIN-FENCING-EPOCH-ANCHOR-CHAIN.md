# Fencing Epoch Anchor Chain — DRAFT / HOLD

This pure, offline verifier checks a caller-supplied sequence of 1–8
consecutive fencing epochs against separately supplied first and final
anchors. Each step cryptographically hashes the previous anchor SHA-256,
registry, old/new epochs, leader identity, token digest, and checkpoint
head under the domain separator `PALACO-CITADEL-FENCING-EPOCH-CHAIN-V1`.

The verifier rejects skipped and repeated epochs, rollback below a
caller-supplied minimum, registry substitution, modified leader/token/head,
unmatched final anchor, malformed objects, and injected getters/symbols.
All results have `authorization: DENY`, `trust: NOT_ESTABLISHED`,
`stateChanged: false`, `executionAllowed: false`, and
`releaseAllowed: false`.

**This is not an independently anchored ledger.** The initial anchor,
final anchor, sequence and minimum epoch are all caller-supplied, and
transitions are not signed or authenticated independently. An attacker
who controls the initial and final pins can construct an entirely new
internally consistent chain. No remote checkpoint is read, no protected
monotone counter is updated, no release decision is made and no live
fencing writer is enabled. Later work requires externally immutable
publishing, independent identity verification, trusted signatures and a
durable atomic fencing mechanism.

Run:
`node --test modules/samenleving-natuur/registry-pin-fencing-epoch-anchor-chain.test.mjs`

GitHub Actions includes this regression suite.
PR #63 remains DRAFT/HOLD; no merge, production deployment or PALACO MONO changes.
