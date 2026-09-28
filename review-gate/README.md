# Frozen Atelier review gate — production closure NOT APPROVED

## Immutable review subjects

| Subject | Exact head | CI | Proven tests at that head |
|---|---|---|---|
| PR #12 registration/preview | `4d02c445c0ea8ff4bba6091d76254748ffb8cf61` | [36384495031](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/36384495031) | 17 targeted + 1 Chromium |
| PR #13 scoped contract | `af6162c6aa892a48e089e7060a8c19441e530d65` | [36385420146](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/36385420146) | 31 targeted + 1 Chromium |

Contract: `palaco.atelier-registration/1.0.0`. PR #13 depends on PR #12; its merge-base must be exactly the frozen #12 head. This dossier is a separate branch stacked on #13; **no frozen product code was modified**. The reviewer inspected six principal source/contract files whose SHA-256 values were compared with the exact immutable GitHub contents; see `independent/snapshot-binding.json`.

`freeze.json` binds heads, bases, version, successful runs and dependency. `check-freeze.mjs` reads live GitHub evidence and denies on head/base/merge-base/version/CI drift or inaccessible evidence. A green check is valid only for the observation it made; it does not continuously monitor GitHub. The workflow runs on this review PR and manual dispatch. It is not yet installed on main or enforced by branch protection. A #12 update requires: invalidate this dossier, rebase/retest #13 against the new #12, rerun independent review where impacted, and create a superseding freeze. Old evidence must not be re-labelled as evidence for new code. A final live gate before merge is required.

## Additional identity-boundary tests

`identity-boundary.test.mjs` uses two independently generated Ed25519 possession identities, challenge-response validation, distinct session tokens and scope-bound test grants. Both register the same project/Citadel IDs in separate tenant directories. Mutual reads, guessing project/Citadel/digest IDs, receipt swapping, forged session context and cross-tenant payloads deny without returning foreign HTML/content.

These are **cryptographic test identities**, not two enrolled production humans/accounts. The authentication provider is an isolated test fixture returning LOCAL_OPERATOR context. No real production identity provider or genuine authority enrollment was configured. Tests prove the adapter's scope checks within that setup only.

| Requested isolation surface | Observed status |
|---|---|
| Gateway registration/read/preview scopes | Additional mutual-denial tests PASS |
| Same object IDs in distinct tenants | Distinct scoped stores PASS |
| Missing/forged session context and swapped receipt/digest | Denied in adapter tests |
| HTTP header/URL tenant override on contract service | OPEN: no production contract HTTP service exists; injected session fields are tested only at adapter boundary |
| Listings/search/exports | OPEN: no consumer endpoints to review |
| Error payloads | Adapter denial contains no foreign content; production middleware remains OPEN |
| Admin/recovery routes | OPEN: manual recovery only; no authorized admin service |
| Browserstorage and tenant cache | OPEN: no tenant consumer browser integration; base preview sends no-store, which is not a tenant-store proof |
| Audit tamper by OS/storage owner | Outside local operator trust boundary; external checkpoint OPEN |

## Independent review results

A separate review agent executed four new adversarial repros. This is an independent agent review, **not independent human/security certification**. See [full report](independent/REVIEW.md) and executable `independent/adversarial.test.mjs`.

1. **R1 — expiry/clock:** a grant denied as expired can become valid again after clock rollback above the recorded commit time. The code documents this residual risk, but trusted production expiry is not proven.
2. **R2 — receipt semantics:** a protected-store writer can rewrite receipt status/scope and recompute local hashes; preview returns those receipt fields despite unchanged valid source signatures. No execution occurs. Harden semantic validation before external receipt consumers.
3. **R3 — trust generation:** same-generation revocation mutation can be missed during commit. This violates the documented provider invariant; an actual immutable transactional authority provider is still missing.
4. **R4 — crash:** abrupt exit before commit leaves a pending file/lock and no final event; restart correctly denies until manual operator recovery. Automatic safe recovery and actual power-loss behavior remain OPEN.

Reproduction tests passing means the problematic behavior was reproduced, **not that the production security gate passed**. No unprivileged cross-tenant read was demonstrated. Do not silently fix the frozen subjects: remediation must identify a new commit, invalidate/supersede this snapshot and receive fresh tests/review.

## Windows matrix

The CI matrix includes Linux and Windows. `platform.test.mjs` checks an identical fixed UTF-8 digest vector on both systems, the explicit Windows storage denial, and rejection of UNC/device paths via that denial. Linux retains the existing POSIX storage tests from the frozen chain.

| Windows storage requirement | Support evidence |
|---|---|
| NTFS restrictive ACL enforcement | NOT IMPLEMENTED / NOT VERIFIED |
| Symlinks, junctions and reparse-point confinement | NOT VERIFIED for a usable Windows adapter |
| UNC/device namespace | Windows adapter always denied; no supported namespace |
| Case-insensitive name collisions | NOT VERIFIED |
| File locking and concurrent writers | NOT VERIFIED on Windows storage |
| Atomic no-replace publication / rename | NOT VERIFIED on Windows storage |
| Commit crash/recovery and directory durability | NOT VERIFIED on Windows storage |
| Linux/Windows digest equality | Explicit cross-platform CI test |

A green Windows boundary job confirms denial/parity only. Windows storage stays BLOCKED; no user-computer access or installation occurred.

## Release decision

- Existing tests: evidence retained for exact frozen commits.
- Additional local scoped tests: evidence for those test identities and boundary only.
- Independent agent review: COMPLETED WITH OPEN FINDINGS.
- Production identity, authority, true multi-user service, Windows support: OPEN/BLOCKED.
- Independent human/security acceptance: OPEN.
- Feature enabled: NO. Merge approved: NO. Activation authorized: NO.

This review branch adds tests and evidence only. No customization, image features or product enablement was added. Standards references remain assessment frameworks and no compliance claim is made.
