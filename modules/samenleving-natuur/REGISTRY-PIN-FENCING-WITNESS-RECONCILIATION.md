# Signed Fencing Witness Reconciliation — DRAFT / HOLD

This read-only offline verifier compares 2–5 domain-separated,
ECDSA P-256 / SHA-256 signed fencing witness claims for a reviewer
roster checkpoint. Each claim binds the registry, fencing epoch,
leader identity, token digest, store version and checkpoint head.
Distinct witness IDs and distinct pinned public-key fingerprints
are required.

The verifier rejects cryptographic forgery, key substitution, stale
epochs, mismatched externally supplied pins and signed split views.
A higher epoch **never** automatically wins. Malformed objects and
accessor/symbol-bearing input fail closed. Tests cover 11 cases.

This is **evidence inspection only**, not leader election,
independent quorum formation, remote reading, quorum freshness, or
a durable fencing authority. All witness records, key pins,
required witness roster, expected leader claim and minimum epoch
are supplied by the caller. Agreement does not prove independent
witness custody or live replica status.

Every outcome returns `authorization: DENY`,
`trust: NOT_ESTABLISHED`, `stateChanged: false`,
`executionAllowed: false` and `releaseAllowed: false`.
A consistent result cannot authorize any checkpoint write.

Run:
`node --test modules/samenleving-natuur/registry-pin-fencing-witness-reconciliation.test.mjs`.

The regression suite is wired into GitHub Actions. PR #63 remains
Draft/HOLD. No merge, deployment, PALACO MONO change or live writer.
