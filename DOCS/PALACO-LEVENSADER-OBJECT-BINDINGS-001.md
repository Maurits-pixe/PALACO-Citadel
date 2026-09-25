# PALACO-LEVENSADER-OBJECT-BINDINGS-001 — source-bound fixture plan

Status: SPECIFICATION / NOT DEPLOYED
Date of this review: 2026-09-25
Site baseline: PALACO LEVENSADER WEB v0.1-alpha, private version 1.
Parent inventory: [PALACO-LEVENSADER-REPOS-001](PALACO-LEVENSADER-REPOS-001.md).

## Fixed source snapshots

- `PALACO-Citadel`: `3b8f736be8fa43b27b5082e6ba8183081047a3d5`.
- `PALACO-BOOK-1`: `6476e59d4b13f54055c52793581abbc786be9a29`.
- `PALACO-INDUSTRIE`: `67463e51de0479512802042ba1e637407fc94d5b`.
- `palaco-genesis`: `af2942e0de7890e41ca33f0b99090ef0514b0e4b`.
- `PALACO`: `14d25ccad5cf1999baa0a6339d116c452561766f`.

A path below is a source for a *description*, never evidence that a related application runs. Use the exact snapshot SHA in each object's source reference. `lastUpdated` describes the object and remains null until supported by the source's own metadata; this review's date is not substituted.

## Existing object bindings

| Proposed object ID | Type | Status | Source at fixed snapshot | Provenance / limit |
| --- | --- | --- | --- | --- |
| `concept:levensader` | CONCEPT | DERIVED | `PALACO-BOOK-1/docs/veldgids/37-levensader-runtime.md` | Source describes a knowledge access flow and guarantees; implementation and execution are NOT VERIFIED. |
| `citadel:la` | CITADEL | HYPOTHESIS | `PALACO-Citadel/ARCHIVE/legacy-sources/☄️🌱 GO — LOCUS AMOENUS 🔱 THE 33 COMMANDMENTS CAPSULE` | Archived narrative mentions Locus Amoenus as throne; current implemented L.A. state NOT VERIFIED from this document. |
| `concept:citadel` | CITADEL | DERIVED | `PALACO-Citadel/02-CORE-SYSTEMS/CITADEL.md`; `PALACO-INDUSTRIE/README.md` | First describes an access boundary, second a personal Citadel vision. The two senses require explicit explanation in the detail view. |
| `system:rio` | SYSTEM | CANONICAL | `PALACO-Citadel/RIO-PLATFORM-001.md` | Cross-surface communication rule; operational cross-device delivery NOT VERIFIED. |
| `system:or6it` | SYSTEM | DERIVED | `PALACO-Citadel/∆ GO-EMERALD-010 - 026` | Names OR6IT as WORLD Development. Runtime NOT VERIFIED. |
| `proof:palaco` | PROOF | DERIVED | `PALACO-Citadel/03-EVIDENCE/README.md`; `03-EVIDENCE/Provenance-Model.md`; `03-EVIDENCE/Cryptographic-Proofs.md` | Proof and provenance model descriptions. No live verifier or cryptographic result in the site. |
| `anchor:earth` | ANCHOR | UNKNOWN | null | W-0001 EARTH appears on the v0.1 site; no exact matching repository source confirmed in this review. |
| `anchor:pluto` | ANCHOR | UNKNOWN | null | W-0002 PLUTO 🦆 appears on the v0.1 site; no exact matching repository source confirmed. |
| `anchor:eva` | ANCHOR | UNKNOWN | null | W-0003 EVA appears on the v0.1 site; no exact matching repository source confirmed. |
| `anchor:rio` | ANCHOR | UNKNOWN | null | W-0004 RIO appears on the v0.1 site; RIO's system source does not establish this anchor ID. |
| `anchor:palaco` | ANCHOR | UNKNOWN | null | W-0005 PALACO appears on the v0.1 site; no exact matching repository source confirmed. |
| `anchor:6io` | ANCHOR | UNKNOWN | null | W-0006 6IO appears on the v0.1 site; no exact matching repository source confirmed. |
| `anchor:e9o` | ANCHOR | UNKNOWN | null | W-0007 E9O appears on the v0.1 site; no exact matching repository source confirmed. |

The PALACO and palaco-genesis repositories are retained in the source inventory for contract review, but this pass does not invent object bindings to them. The seven anchors remain existing presentation content, marked UNKNOWN until a precise source is established. Do not merge Emerald `EW-0001` with `W-0001`; they are distinct namespaces in the available files.

## Fixture and page rules

Every object has `id, type, title, description, status, source, provenance, version, relations, accessLevel, lastUpdated`. A source reference includes repository, path and commit. Provenance distinguishes SOURCE, MODEL, DERIVATION, UNKNOWN and carries `verified: false` until verification exists. `version` is a fixture version (initial `0.1.0`), separate from source commit. Do not turn a proposed ID or fixture status into PALACO constitutional authority.

Relations are explicit IDs and resolve to existing objects. Suggested links: Levensader → Citadel and Proof; L.A. → Citadel; Citadel → RIO and OR6IT; RIO → Citadel; OR6IT → Citadel and the seven anchors; each anchor → OR6IT; Proof → Levensader. If a relation lacks a target, omit it and show an audit error in development.

Private access is enforced by hosting access policy; verify denial as a separate gate. No sensitive production data, secrets, provider calls or interactive Mentor actions. The old site stays frozen until a separately versioned read-only slice is built and tested.
