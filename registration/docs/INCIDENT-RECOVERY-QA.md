# GO-047-I1 — Incident State Inspector & evidence-preserving recovery QA

Status: **CANDIDATE · REVIEW OPEN · NOT ACTIVATED**

Design input: `RFMC-II-5CRIPTIE-ICRPAE-047` (Phase XLVII). This repository slice does not promote that document to canon and does not establish production safety.

## Purpose

The local preview registry already fails closed when an abrupt process stop leaves a writer lock or an uncommitted `.pending-*` file. GO-047-I1 adds a **read-only incident-state inspection path** before any operator recovery action.

The inspector answers only:

- what committed ledger state can still be verified;
- whether a writer lock is present;
- whether uncommitted residue exists;
- whether that residue can be read safely enough to fingerprint without promoting it;
- whether the observed storage view changed during inspection.

It does **not** decide that a lock is stale, remove recovery artifacts, retry registration, create a preview receipt, grant authority, authorize resumption or determine root cause.

## Constitutional boundaries

```text
INCIDENT DETECTED != RECOVERY AUTHORIZED
LOCK PRESENT != LOCK PROVEN STALE
PENDING BYTES != COMMITTED EVENT
DURABLE REGISTRATION != RETRY REGISTRATION
INSPECTION != MUTATION
SYSTEM READABLE != SAFE TO RESUME
```

Every result reports `mutations_performed: []`. The implementation performs no unlink, rename, write, replay or recovery transition.

## States

| State | Meaning |
|---|---|
| `CLEAN` | committed ledger verifies and no recovery artifacts were observed |
| `RECOVERY_REQUIRED` | a lock or pending residue exists without an additional conflict detected |
| `IN_DOUBT` | lock + pending residue coexist, or the directory view changes during inspection |
| `LEDGER_UNVERIFIED` | committed-chain verification or safe residue inspection failed |

These are inspection states only. They are not activation, readiness or resumption states.

## Evidence model

The inspector reads the committed chain through `LocalRegistry.inspectCommittedEvents()`. That path uses the same event/hash/signature validation as normal ledger reading, but it may ignore `.writer.lock` and `.pending-*` **for the sole purpose of verifying already committed sequential events**.

Pending residue is never appended, renamed or interpreted as a committed event. When safely readable, its current bytes are fingerprinted with SHA-256 and labelled `UNCOMMITTED_RESIDUE`.

A writer lock is always reported with:

```text
stale_status: NOT_ESTABLISHED
```

because file presence alone cannot prove that no writer still owns the operation.

## Candidate QA matrix

`registration/recovery-inspector.test.mjs` covers:

1. clean verified ledger;
2. writer lock without stale inference;
3. pending residue fingerprinting without promotion;
4. lock + pending → `IN_DOUBT`;
5. durable `DRAFT_REGISTERED` + lock without invented retry or `PREVIEW_READY`;
6. tampered committed event → `LEDGER_UNVERIFIED`;
7. pending symlink → fail closed;
8. permissive pending file → fail closed;
9. repeated inspection → stable result and unchanged evidence.

Run locally:

```sh
npm run test:incident-recovery
npm run test:preview
```

The existing `Citadel local preview conformance` workflow already watches `registration/**` and runs `npm run test:preview`; no additional workflow authority or deployment path is introduced by this candidate.

## Recovery remains separate

An operator recovery procedure must remain a separate, explicitly authorized step. GO-047-I1 intentionally does not implement stale-lock deletion, pending-file removal, automated retry, resumption authorization or production recovery.

## Evidence status

Code presence is not test evidence. A green workflow for the exact candidate head would establish only the scoped automated checks executed by that workflow.

```text
CANDIDATE CODE != CI PASS
CI PASS != INDEPENDENT REVIEW
INDEPENDENT REVIEW != PRODUCTION SAFETY
```
