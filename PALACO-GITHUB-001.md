# PALACO-GITHUB-001 — FOUNDATION REPOSITORY ASSEMBLY MANIFEST v1.0.0

Status: 🟢 READY FOR REPOSITORY ASSEMBLY

Target repository: `Maurits-pixe/PALACO`

Baseline: PALACO Foundation Edition v1.0.0

## Doctrine

GitHub is repository infrastructure for PALACO, not constitutional authority.

PALACO CONSTITUTION
→ PALACO ARCHITECTURE
→ PALACO IMPLEMENTATION
→ PALACO REPOSITORY
→ GITHUB

## Assembly phases and gates

### PHASE 0 — FREEZE 🔒

Scope:

- Foundation Edition v1.0.0 fixed as baseline.
- Canonical terminology checked.
- 6–7 September consolidation included.
- Open design decisions identified.
- No new subsystems introduced.

Gate: **CANONICAL CONTENT FREEZE**

### PHASE 1 — REPOSITORY SKELETON

Required structure:

```text
PALACO/
├── Cargo.toml
├── README.md
├── LICENSE
├── docs/
├── crates/
├── tests/
├── evidence/
├── tools/
└── .github/
```

Gate: **STRUCTURAL INTEGRITY**

### PHASE 2 — CANONICAL IMPORT

Controlled import lanes:

- PCS (Constitution)
- PAS (Architecture)
- PIS (Implementation)
- POS (Operations)
- Ecosystem

Document status labels:

- CANONICAL
- CANONICAL DRAFT
- ENGINEERING
- REFERENCE
- HISTORICAL

Rule: repository placement must not create constitutional authority.

### PHASE 3 — RUST WORKSPACE

Planned crates:

- `palaco-foundation` (first)
- `palaco-kernel`
- `palaco-runtime`
- `palaco-eventbus`
- `palaco-quay`
- `palaco-citadel`
- `palaco-evolution`

Constraints:

- `unsafe_code = forbidden`
- `unwrap_used = deny`
- `todo = deny`
- `std::sync::Mutex = forbidden`
- `std::sync::RwLock = forbidden`

### PHASE 4 — TEST & VALIDATION

Validation chain:

BUILD → UNIT TEST → INTEGRATION TEST → CONSTITUTIONAL TEST → PROVENANCE TEST → REPLAY TEST → PVS → AUDIT

Evidence minimum:

- PVS-001 Workspace Integrity
- PVS-002 Cross-Crate Contracts

### PHASE 5 — EVIDENCE SEAL

Implementation → Validation → Evidence → Audit → Manifest

Every state must map to version/source/change/validation/evidence.

### PHASE 6 — GITHUB GOVERNANCE

GitHub governance scope:

- CI workflows
- Audit workflows
- Release workflows
- PR templates and review gates

PR governance minimum questions:

- What changed?
- Which canon is affected?
- Which authority/context applies?
- Which tests were run?
- Which evidence was produced?
- Is backward compatibility affected?
- Is constitutional scope changed?

### PHASE 7 — RELEASE ASSEMBLY

PALACO Foundation Edition v1.0.0
→ Repository Validation
→ Evidence Seal
→ Release Manifest
→ Git Tag
→ `v1.0.0`

## Canonical execution order

01 FREEZE
02 REPOSITORY SKELETON
03 CANONICAL IMPORT
04 RUST WORKSPACE
05 BUILD
06 TEST
07 PVS-001
08 PVS-002
09 EVIDENCE SEAL
10 AUDIT
11 RELEASE MANIFEST
12 IMMUTABLE `v1.0.0` TAG

## Explicit non-goals for Foundation v1.0.0

- No new Wonder additions
- No new major subsystems
- No premature plugin ecosystem expansion
- No arbitrary GitHub-only canon rewrites
- No constitutional authority delegation to GitHub

## Current gate transition

- Current: **PALACO-GITHUB-PREP-001 — READY FOR REPOSITORY ASSEMBLY**
- Next gate artifact: **PALACO-GITHUB-001 — FOUNDATION REPOSITORY ASSEMBLY MANIFEST v1.0.0**
