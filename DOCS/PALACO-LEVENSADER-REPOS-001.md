# PALACO-LEVENSADER-REPOS-001 — read-only source registry

Status: SPECIFICATION
Scope: PALACO LEVENSADER WEB v0.1-alpha → next inspectable slice
Recorded: 2026-09-25
Website baseline: version 1, commit `9bbb356c2c8a8485279867e1588199d16f625d4d`
Boundary: the published v0.1-alpha website remains frozen.

This registry identifies sources for the next read-only object view. A repository's existence or README claims do not establish operational conformance, live availability, verified evidence, or constitutional authority. Private repository locations must never be emitted to a public visitor without an explicit access decision.

| Repository | Visibility | Role in the inspectable slice | Initial evidence status |
| --- | --- | --- | --- |
| [PALACO](https://github.com/Maurits-pixe/PALACO) | Public | General foundation and architecture references | SOURCE OBSERVED; individual claims unverified |
| [palaco-genesis](https://github.com/Maurits-pixe/palaco-genesis) | Private | Workspace contracts: identity, authority, provenance, RIO and audit | SOURCE OBSERVED; individual claims unverified |
| [PALACO-BOOK-1](https://github.com/Maurits-pixe/PALACO-BOOK-1) | Public | Foundation descriptions and implementation contracts | SOURCE OBSERVED; runtime claims unverified |
| [PALACO-INDUSTRIE](https://github.com/Maurits-pixe/PALACO-INDUSTRIE) | Private | Product concepts, Citadels, RIO, repository catalog and account prototype | SOURCE OBSERVED; do not infer website account access |
| [PALACO-Citadel](https://github.com/Maurits-pixe/PALACO-Citadel) | Private | Canonical reading order, Proof, provenance and Citadel references | SOURCE OBSERVED; Proof deployment unverified |

`desktop-tutorial` is present in the owner's repository list but empty and not identified as a PALACO source. Keep it in inventory as EXCLUDED / NO PALACO EVIDENCE, rather than claiming a domain role.

## Object source binding

Each existing website object (Levensader, L.A., Citadel, seven WORLD anchors, RIO, OR6IT, Proof) must bind to an exact repository, path and immutable commit SHA where a source exists. A generic repository URL is insufficient as a provenance record. If no specific source is confirmed, set `source.reference = null`, `provenance.basis = UNKNOWN`, `provenance.verified = false`, and show UNKNOWN in the interface.

The object contract is: `id, type, title, description, status, source, provenance, version, relations, accessLevel, lastUpdated`. Status values are `CANONICAL, DERIVED, HYPOTHESIS, UNKNOWN`; CANONICAL means present in the PALACO canon, not externally verified. Record repository commit separately from object version. Use a factual source date only when supported; never substitute the site deployment date for an object's modification date.

## Publication and access gates

- Read-only path: private preview → overview → detail → source → provenance → version → Proof/audit.
- Link related objects only when their IDs resolve.
- Public or shared presentation may disclose only approved excerpts from private repositories; never expose private source URLs or contents by default.
- All data is conceptual or synthetic; no patient, health, personal production data, provider credentials or secrets.
- No live AI, account, proof verification or mentor action claims.
- Test denied access from a non-authorized account, mobile layout, light/dark modes, keyboard navigation and contrast before declaring the next version complete.
