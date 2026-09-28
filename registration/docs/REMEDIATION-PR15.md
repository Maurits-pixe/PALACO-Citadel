# Remediation baseline — PR15

Status: **REMEDIATION IMPLEMENTED / LOCAL TESTS PASS / PREVIEW-ONLY / NOT ACTIVATED**.

PR14 remains the historical review baseline. Its four adversarial findings are not rewritten:

| Finding | Remediation in this branch | Closed by |
|---|---|---|
| Expired grant could return after clock rollback | Persisted temporal observations plus a monotone local high-water; rollback is `CLOCK_ROLLBACK` and denies | `registration/remediation-regression.test.mjs` |
| A locally rehashed receipt could change scope/status | Receipt fields are semantically bound to tenant, project, Citadel, action, scope, template, payload/assets, audit head, grant, ERA and trust snapshot | receipt mutation regression |
| Same-epoch trust mutation could be missed | Every snapshot is digest-pinned; a same-epoch digest change is `TRUST_CONFLICT`; lower/newer epochs fail closed | trust conflict/rollback regression |
| Process death left normal recovery to an operator | Writer lock carries PID metadata; dead-owner locks and orphan staging bytes are recovered before the next transaction; idempotency completes a committed receipt | crash and response-loss regressions |

## Trust snapshot contract

The local trust registry stores one immutable JSON snapshot per epoch:

```json
{
  "generation": 41,
  "previous_digest": "…",
  "bindings": [],
  "revoked_keys": [],
  "revoked_grants": [],
  "registry_digest": "…"
}
```

`registry_digest` is the SHA-256 digest of the snapshot without its own digest field. Epochs cannot decrease. A newer snapshot must name the previous digest; a same-epoch different digest and a broken predecessor link are rejected. The gateway pins both `generation` and `registry_digest` in the receipt and compares them again before preview.

This is a local monotonicity mechanism, not proof of a real-world authority. Key enrollment, custody, rotation approval, recovery and independent issuer identity remain open.

## Receipt contract

`ALLOW_FOR_PREVIEW_ONLY` is now a semantic result, not merely a signed JSON shape. The persisted receipt binds:

- `tenant_id`, `project_id`, `maker_id`, `user_id`, `citadel_id`, `action` and `scope`;
- contract, template, payload, asset-root and audit-head digests;
- export/registration sequence, grant ID/state and ERA evidence reference;
- trust epoch, trust digest and predecessor digest;
- idempotency key, preview state, feature-flag state and all open activation gates.

The receipt is still not `ACTIVE`, `EXECUTION_COMMITTED`, publication authority or proof of production identity.

## Recovery state machine

```text
RECEIVED
  → VALIDATED
  → PREPARED
  → REGISTRATION_COMMITTED
  → RECEIPT_COMMITTED
  → PREVIEW_AVAILABLE
```

The event ledger is append-only. A no-replace hard-link publishes only complete bytes. On a new transaction:

- no final event + dead lock → staged bytes and lock are removed, then the request may retry;
- final event + lost response → the same idempotency key returns the existing receipt;
- live writer or malformed ownership metadata → fail closed;
- damaged hash chain or semantic mismatch → deny/quarantine at the caller boundary.

Windows remains explicitly blocked; this remediation does not claim NTFS ACL, junction/reparse-point or Windows crash-durability support.

## Test and review boundary

The active remediation gate runs the base preview/contract suites, tenant identity-boundary tests, platform boundary tests and the five remediation regressions. The old `review-gate/independent/adversarial.test.mjs` stays historical and is not treated as a passing production gate after the fixes; a new independent review must inspect the new exact head.

Still open:

- production identity and tenant service;
- trusted external key authority and key recovery;
- Windows storage profile;
- independent human security review;
- external ledger/checkpoint and real ERA time authority;
- activation, execution, public publication and marketplace features.

