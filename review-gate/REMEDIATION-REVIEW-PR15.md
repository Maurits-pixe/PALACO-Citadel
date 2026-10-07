# Independent AI gate review — Atelier remediation PR15

Review date: 2026-10-07  
Repository: `Maurits-pixe/PALACO-Citadel`  
Review target: merged commit `4ed65bc989666c989c5251c62377412fc9257078`  
Candidate parent: `7f0bcbc3cc70d0add3e8004002dd091d2a8e4089`  
Scope: PR15 remediation only; no activation, execution or publication decision.

## Exact source and CI evidence

The merge commit tree was compared with the tested PR15 head. The comparison reports one merge commit and no changed files. The following remote files at `4ed65bc9` were byte-identical to the inspected local sources:

- `registration/contract-gateway.mjs`
- `registration/storage.mjs`
- `registration/registry.mjs`
- `registration/trust-registry.mjs`
- `registration/remediation-regression.test.mjs`
- `package.json`
- `.github/workflows/atelier-review-gate.yml`

The hosted PR14 workflow used synthetic merge ref `ce4a875739d9e9712b14ae766bd60287f060a893`; its checkout merged `4ed65bc9` into the historical PR14 base. The merge-tree comparison and byte checks above show that the tested source tree contains the PR15 merge content. This is merge-ref evidence, not a claim that the workflow's internal ref SHA equals `4ed65bc9`.

Hosted results for that synthetic merge:

- Citadel local preview conformance: run `36418736816`, success.
- Atelier frozen review evidence: run `36418736514`, success.
  - `freeze-and-boundary`: success
  - Linux platform boundary: success
  - Windows platform boundary: success

Local execution against the byte-identical tree:

- preview/domain suite: 17/17 PASS;
- contract and remediation suite: 19/19 PASS;
- freeze, identity-boundary and platform suite: 8/8 PASS.

These results verify the bounded local preview contract and the named test environments. They do not establish production authority or activation.

## Four PR14 findings

| Finding | Result at PR15 merge baseline | Boundary |
|---|---|---|
| Expired grant after clock rollback | PASS: temporal high-water denies rollback; denied expiry is persisted | local clock is still not an external time authority |
| Locally rehashed receipt with foreign scope/status | PASS: semantic receipt reconstruction rejects mismatch | protected local storage owner remains outside the trust boundary |
| Same-epoch trust mutation | PASS: pinned digest returns `TRUST_CONFLICT` | the gateway still receives authority through configured `readTrust`; production enrollment/authority is open |
| Process crash and lost response | PASS in tested POSIX recovery/idempotency paths | Windows usable storage and physical power-loss durability remain unverified |

## Remaining blockers

1. **Live freeze drift.** The historical `review-gate/freeze.json` pins PR13 at `af6162c6…`, while the current PR13 record points to `fb6d4b015…`. The old freeze remains valid historical evidence, but it is not a current release baseline. A superseding freeze must bind the actual current dependency heads and runs.
2. **Authority chain.** `TrustRegistry` validates local monotone snapshots, but `ContractGateway` is configured with a callback. No production key enrollment, custody, issuer mandate, rotation, revocation authority or external checkpoint is established.
3. **Platform boundary.** Windows is intentionally denied, not supported. NTFS ACLs, junction/reparse confinement, Windows locking, atomic publication and power-loss recovery remain OPEN.
4. **Integration boundary.** The remediation chain is merged into the PR14 review branch, not `main`. The current `main` branch does not contain the Atelier contract-gateway/trust-registry remediation. Rebase/integration against current `main` would be a new candidate and requires fresh tests.
5. **Human assurance.** This is an AI review using TRIAS/ORACLE/MENTOR lenses, not three independent reviewers and not independent human security approval.

## Triadereview

**TRIAS:** The preview-only boundary, append-only history, no-silent-time rule and separate activation gate are preserved. Do not infer merge-to-main or activation from CI, the prior merge, or the user's GO.

**ORACLE:** The exact merge-tree comparison and merge-commit CI runs support the bounded test claims. The live freeze drift, production authority, Windows support, main-branch absence and human review remain unverified/open.

**MENTOR:** Keep this candidate isolated and understandable. First create a superseding frozen review envelope for the actual dependency heads; then decide separately whether a rebase onto current `main` is warranted. RIO remains an explanatory/requesting interface and does not receive authority from this review.

## Decision

**CONDITIONAL GO — review artifact only.** The four PR14 implementation findings are remediated for the tested local preview boundary.  
**HOLD — merge to `main`, production release, activation, execution and public publication.**

No historical review file was rewritten. No key, user-computer storage mount, production identity or activation authority was introduced.

## Next valid transition

```
PR15 merge baseline
→ superseding freeze of current dependency heads
→ fresh independent human/security review
→ separately reviewed rebase/integration candidate for current main
→ activation gate (only with explicit authority)
```

