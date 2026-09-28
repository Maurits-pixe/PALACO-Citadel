# Atelier → Registration contract v1.0.0

This slice is stacked on PR #12 at `4d02c445c0ea8ff4bba6091d76254748ffb8cf61`. It does not merge or activate that PR. The existing six-test status is historical: the base had 17 domain/integration tests plus one Chromium test. This slice adds 14 contract/gateway tests.

## Versioned boundary

The maker interface only constructs an export and this envelope; it never imports registry/storage logic. `contract.mjs` and `envelope.schema.json` define `palaco.atelier-registration/1.0.0`. The gateway lives separately in `registration/contract-gateway.mjs`. The Node domain Builder is connected end to end; a browser file-import UX remains outside this slice.

| Field | Meaning / verification |
|---|---|
| schema_version | exact contract version; unknown version denies |
| template_id / template_version | LA-CITADEL-TEMPLATE / 0.1.0; manifest template digest is pinned as well |
| user_id / tenant_id / maker_id / project_id / citadel_id | explicit lineage; session principal must match the envelope |
| payload_digest | SHA-256 of the exact `citadel.json` bytes |
| asset_digests | manifest entries for every other payload file |
| audit_head | digest of the full ordered maker audit array; not an independently attested audit head |
| package | existing DRAFT manifest plus canonical-base64 bytes; never extract file paths to disk |

`packageEnvelope(pkg, scope)` builds the envelope. Runtime verification binds every field back to the package and independently validates ordered audit, template, bytes, trajectory, assets and creator IDs. Signature inputs use a domain-separated digest of the entire signed object. This remains PALACO's local serialization profile, not an RFC 8785 claim.

## Request / response

`gateway.commit(session, {envelope, grant, era, expected_sequence})` uses the configured authentication callback to obtain the principal. No caller-supplied storage paths or identity boolean are accepted. Only explicitly configured `LOCAL_OPERATOR` sessions are supported by this release. Production consumers are blocked by default with `enabled:false`.

Grant fields: `grant_id`, `key_id`, `user_id`, `tenant_id`, `project_id`, `maker_id`, `citadel_id`, exact `contract_digest`, `action:PREVIEW`, `not_before`, `expires_at`, `signature`.

ERA wrapper: `tenant_id`, `project_id`, `key_id`, `contract_digest`, the base ERA `evidence`, and `signature`. Both signatures are checked against a bound ERA witness key. This is application time evidence, not a qualified timestamp or independently proven clock.

A success returns `schema_version`, `outcome:ALLOW_FOR_PREVIEW_ONLY`, `code:OK`, tenant/project/Citadel references, `contract_digest`, `trust_generation`, open `activation_gates`, durable `record_hash` and `sequence`. The receipt is persisted in the same atomic event as the registration and verification references. A failure returns `outcome:DENY`, a stable code and open gates, without preview HTML.

## Error codes

- Contract: `CONTRACT_VERSION`, `CONTRACT_MALFORMED`, `CONTRACT_FIELDS`, `CONTRACT_DIGEST_MISMATCH`, `INVALID_ID`, `PACKAGE_SIZE`, `AUDIT_SEQUENCE`, `OBJECT_BINDING`, `EXPORT_INVALID`, `TEMPLATE_MISMATCH`.
- Identity and scope: `FEATURE_DISABLED`, `IDENTITY_UNRESOLVED`, `TENANT_PROJECT_MISMATCH`, `OBJECT_OWNER_CONFLICT`.
- Key authority: `KEY_BINDING_UNKNOWN`, `KEY_BINDING_UNTRUSTED`, `KEY_SCOPE`, `KEY_EXPIRED`, `KEY_REVOKED`, `TRUST_CHANGED`.
- Grant and time: `GRANT_MISSING`, `GRANT_SIGNATURE`, `GRANT_SCOPE`, `GRANT_REVOKED`, `GRANT_EXPIRED`, `ERA_MISSING`, `ERA_SIGNATURE`, `ERA_SCOPE`, `ERA_INVALID`, `CLOCK_UNKNOWN`, `CLOCK_ROLLBACK`.
- Persistence: `SEQUENCE_CONFLICT`, `REPLAY`, `UNKNOWN_REGISTRATION`, `STORAGE_INCONSISTENT`, `COMMIT_OUTCOME_UNKNOWN`.

Malformed/unreadable storage denies. A response lost after durable commit may report unknown; use the scoped preview query to recover its existing receipt, not a second registration.

## Tenant and project isolation

`USER → TENANT → PROJECT → CITADEL → OBJECT/ASSET → REGISTRATION EVENT` is represented in the session, signed envelope, grant and storage path:

`allowedRoot/tenants/<tenant_id>/projects/<project_id>/citadels/<citadel_id>/events/`

Every gateway query uses authenticated tenant and project context and rejects a supplied mismatch before reading a foreign ledger. All assets are bound into that envelope and retained as encoded bytes inside the event; none is served by arbitrary filesystem URL. Test fixtures confirm same-ID objects in two tenants occupy separate directories and cannot be read by the other's session.

This is a tested application boundary under a trusted local operator, **not proven multi-user deployment**. Authentication middleware, independent authority enrollment, durable production trust/revocation storage and security review remain OPEN. Do not expose the base PR #12 adapter as an alternate consumer API that bypasses this gateway. Existing gateway adapters alone do not authenticate users.

## Key registry and lifecycle

`readTrust()` is a trusted operator-side provider returning a generation, signed binding records, revoked key IDs and revoked grant IDs. Every binding is signed by the configured trust-root public key and contains:

- key ID and public key;
- issuer identity ID and authority evidence digest;
- tenant/project, purpose (`PREVIEW_ISSUER` or `ERA_WITNESS`) and allowed makers;
- ACTIVE status and validity window.

Every commit and preview rechecks the binding, signature, purpose, scope, expiry and current revocation. A changed generation during validation denies; a change detected after commit denies the response while preserving evidence. Rotation uses a new key ID and a new signed binding; old IDs are not silently rebound. Compromise revokes the affected ID and all dependent grants; old records remain historical. Existing receipts do not bypass current key checks.

These checks establish technical consistency with configured trust. They do not establish who legitimately controls the trust root. `IDENTITY AND KEY AUTHORITY UNRESOLVED` remains a release gate. The provider must be durable and changes generation for every update. Multi-process transactional coordination with a production trust service is not implemented.

## Atomic preview gate and time

`VALIDATE → PREPARE IN MEMORY → ATOMIC EVENT COMMIT → ISSUE STORED RECEIPT`.

One `CONTRACT_PREVIEW_COMMITTED` event contains the envelope, grant, ERA record and receipt. Preview rendering derives from that complete event and writes no separate publication state. Before-commit failure has no final event; after-commit interruption recovers the same receipt. The inherited Linux storage uses staging + file fsync + atomic no-replace hard-link + directory fsync; ordinary rename could overwrite an existing sequence, so this implementation retains no-replace publication. Root, symlink, permissions, concurrency and real process-crash tests remain inherited from PR #12.

Clock rollback below the previous committed evaluation time blocks the scoped Citadel, including after restart. There is no global trusted clock, no detection below an unpersisted read-only observation and no protection against removal of historical records by the OS administrator. Independent ERA attestation and external checkpoints remain OPEN.

## Three independent release decisions

1. **Technical acceptance:** tests and an independent code review on an exact commit.
2. **Merge behind feature flag:** explicit approval, `enabled:false` default, dependent PR #12 accepted first; merging confers no activation.
3. **Activation/consumer release:** independently approved identity, key authority, production tenant isolation and execution authorization. This slice contains no activation API.

Open gates: `INDEPENDENT_REVIEW`, `IDENTITY_AUTHORITY`, `PRODUCTION_TENANCY`, `EXECUTION_COMMIT`, `ACTIVATION`.

Status: **CONCEPT IMPLEMENTED / PREVIEW-ONLY / IDENTITY AND KEY AUTHORITY UNRESOLVED / NOT ACTIVATED**. No local user machine was connected. Windows storage remains blocked pending its own ACL and durability profile. No standards compliance is claimed.
