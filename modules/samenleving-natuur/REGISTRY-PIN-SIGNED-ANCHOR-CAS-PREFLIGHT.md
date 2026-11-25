# Signed Fencing Anchor CAS Preflight — DRAFT / HOLD

The new offline, read-only preflight composes two existing mechanisms:

1. The `registry-pin-signed-fencing-transition-chain.mjs` verifier checks
   the consecutive hash-linked fencing epoch transitions and each required
   witness signature against caller-pinned keys.
2. A separately supplied `observedAnchor` snapshot must match the
   caller-pinned previous anchor's registry, epoch and SHA-256 exactly.

Only after both checks pass does the module return a **non-executable
compare-and-swap proposal**, containing the registry key, expected epoch,
expected previous SHA-256, next epoch and candidate SHA-256. It does not
connect to any database, send a mutation, grant a capability, or promote
a leader. An observed rollback, fork, changed epoch, mismatched signature
or missing witness causes a fail-closed result without a proposal.

Every outcome, including successful preflight, has:
`trust: NOT_ESTABLISHED`, `authorization: DENY`,
`stateChanged: false`, `executionAllowed: false`,
`releaseAllowed: false`.

**Essential limitation:** the observed anchor is **caller-supplied**,
not an authenticated independent read. The witness roster and keys are
also caller-supplied. Consequently, preflight is not a real trusted
anchor service or an independently authorized CAS request. The separate
PostgreSQL CAS fixture remains synthetic and cannot be enabled as a
production writer. Independent authenticated reads, durable monotonic
state, trusted signer custody, fresh revocation and transactionally
coupled authorization remain necessary.

Test:
`node --test modules/samenleving-natuur/registry-pin-signed-anchor-cas-preflight.test.mjs`

GitHub Actions contains eleven negative/positive regression cases.
PR #63 remains Draft/HOLD; no merge, release, production execution or
PALACO MONO modification.
