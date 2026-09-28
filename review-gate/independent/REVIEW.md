# Independent agent review — Atelier registration and preview boundary

Date: 2026-09-28. Reviewer: separate Codex review agent. This is an independent agent pass, not independent human review, identity certification, legal compliance review, or a security certification.

## Scope and evidence

Read the local Atelier/registration contract, registry, filesystem adapter, preview renderer/server, and existing contract tests. The parent supplied PR #12 head `4d02c445` and PR #13 head `af6162c6` as review targets; this workspace has no `.git`, so the reviewer did not independently prove local-to-GitHub identity. `reviewed-file-hashes.json` freezes the inspected files. Parent must reconcile these hashes with exact full commit SHAs before claiming a frozen review.

Executed `node --test review-gate/independent/adversarial.test.mjs`: 4/4 reproduction assertions passed. These assertions demonstrate the behaviors below; they are not four security requirements passing. Full output: `results.txt`. Test keys and temporary storage are synthetic and removed. No product files changed. No GitHub publication performed.

## Findings and demonstrated limitations

### R1 — Medium; release blocker for trusted expiry/clock claim

Location: `registration/contract-gateway.mjs:94-97`, plus commit high-water check at 72-74.

Commit at 07:00 with grant expiry 07:45. Preview at 08:00 returns GRANT_EXPIRED. Change clock to 07:30, recreate gateway, preview returns ALLOW_FOR_PREVIEW_ONLY. Read-only observations do not advance a durable high-water mark, so a previously expired grant can become usable again.

The contract README explicitly documents the limited committed-time protection. This is a demonstrated known limitation, not an unprivileged remote clock-control vulnerability. It blocks production claims of monotonic expiry without a durable observation clock or independent current-time attestation. Add durable high-water time evaluation including denied access, or require independently trusted time with defined rollback/holdover behavior.

### R2 — Medium within local integrity hardening; high impact if receipts become authority

Location: `registration/contract-gateway.mjs:98-100` and `registration/registry.mjs` ledger hash verification.

A local writer changes only the stored receipt to `outcome:ACTIVE`, `tenant_id:OTHER_TENANT`, a foreign contract digest and no activation gates, then recomputes the unkeyed receipt digest and event record hash. Original signed envelope/grant/ERA remain valid. `preview` returns the mutated receipt fields and valid isolated HTML. No activation execution happens; this is false status/scope output.

Precondition: write access to the protected registry directory. The current filesystem-owner boundary explicitly excludes a malicious OS/storage administrator, so this does not demonstrate cross-tenant access by an ordinary caller. Nonetheless semantically checking/reconstructing receipt fields from the authenticated principal, verified envelope and fixed policy is inexpensive and necessary before receipts become externally consumed artifacts. Require exact schema, code OK, outcome ALLOW_FOR_PREVIEW_ONLY, exact scope/digest, and all required open gates. Reject mismatch with STORAGE_INCONSISTENT. Hash consistency alone is not semantic validation or authenticity.

### R3 — Conditional limitation, not a violation by a conforming trust provider

Location: `registration/contract-gateway.mjs:65,75,81,96,99`.

During before-event-commit, add the grant to readTrust().revoked_grants without incrementing generation. Commit returns ALLOW; next preview returns GRANT_REVOKED. Checks compare only generation at the concurrency boundary.

README requires generation to change for every provider update. The reproduction deliberately breaks that invariant. Therefore this is not a defect under the documented trusted-provider contract, but a release dependency: an actual durable authority service must enforce immutable generation snapshots and atomic update/version semantics. A bare callback and unsigned generation number do not prove those guarantees. Content-digest comparison can detect accidental same-generation mutation; production needs transaction/lease semantics for concurrent revocation and receipt issuance.

### R4 — Medium availability/recovery gate; fail-closed behavior confirmed

Location: `registration/storage.mjs:74-95`, `registration/registry.mjs:events/transaction`.

A child process exits immediately at before-event-commit (exit 71), bypassing catch/finally. Disk retains `.writer.lock` and `.pending-*`; no final JSON event is published. Fresh-process transaction is denied with writer-lock recovery required. Existing thrown-exception recovery is therefore not equivalent to successful process-crash recovery.

This outcome is safe denial and consistent with the documented operator-recovery requirement. Automated validated recovery and locking ownership/liveness proof remain open. Do not claim restart automatically recovers receipts or completes interrupted writes. Actual power loss, directory durability and Windows recovery were not tested.

## Other scope conclusions

- This gateway authenticates only a trusted callback's LOCAL_OPERATOR principal. Existing tests use generated keys and synthetic tokens. Two real production identities, enrollment, session binding, membership revocation and trusted issuer ownership remain unproven.
- No contract HTTP adapter, listings/search/export consumer, admin recovery API or browser tenant store is present in this reviewed integration, so these surfaces cannot receive an isolation PASS from these tests. Their absence is not evidence of production isolation.
- Scope comparisons and the isolated escaped HTML renderer are present. No unprivileged cross-tenant read was demonstrated by this pass.
- Filesystem checks use path-based operations; O_NOFOLLOW protects a final component, not all ancestors against an OS-owner concurrent rename. No deterministic external TOCTOU exploit was executed. This residual risk stays outside current single-owner trust scope and needs directory-handle/openat-style primitives or equivalent for a stronger hostile-local-process boundary.
- Windows storage remains explicitly denied. No Windows, NTFS ACL, junction/reparse, device/UNC, locking or power-loss test was executed by this reviewer.
- ERA is signed application evidence checked using the configured local clock; no external or qualified time authority was established.

## Decision

Keep feature disabled by default, PRs draft, no consumer/activation release. R2 should be hardened before external receipt consumers. R1, R3, R4 and production identity/tenancy/Windows requirements are unresolved production gates; several are correctly documented pre-existing limitations. Independent human/security review remains OPEN. This review is evidence of four targeted adversarial behaviors, not full certification or completion of the requested production closure.
