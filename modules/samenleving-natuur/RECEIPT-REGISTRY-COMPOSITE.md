# Receipt × Reviewer Registry — local composite verifier

DRAFT / HOLD. `receipt-registry-composite.mjs` combines the *actual*
SHA-256/ECDSA P-256 receipt verifier, the signed reviewer-registry verifier
and the read-only receipt evidence bridge.

The module verifies the receipt signature, derives its signing-key SPKI
SHA-256 fingerprint, checks the separately signed registry and confirms that
the reviewer entry corresponds to the **same cryptographically verified key**.
It rejects revoked keys, stale or rolled-back registry snapshots relative
to supplied policy inputs, signature tampering, and maker-reviewer collisions.

## Limits and trust boundary

The registry issuer's pin, revision floor, evaluation time, maker/reviewer
identity and checkpoint assertions are **caller-provided** in this reference.
No trusted time source, authoritative revocation feed, enrolled PALACO ONE
identity, authorized issuer, or independent human reviewer is connected.

`cryptographicBindingsConsistent: true` is only a local technical check,
not proof that any PALACO user or role is authentic. It never authorizes
any action. Independently unresolved gates remain named in the result.

All return paths preserve `authorization: DENY`, `trust: NOT_ESTABLISHED`,
`executionAllowed: false`, and `releaseAllowed: false`.

Test with:

```sh
node --test modules/samenleving-natuur/receipt-registry-composite.test.mjs
```

No production integration, grant, merge or deployment. PR #63 remains Draft/HOLD.
