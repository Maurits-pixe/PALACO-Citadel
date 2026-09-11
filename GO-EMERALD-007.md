# GO-EMERALD-007 — THE EXPANSION LEDGER

## Scope

GO-EMERALD-007 defines Expansion Ledger law so non-allocated minerals remain first-class Emerald Worlds without truncation, renumbering, or identity recycling.

## Layer model

PALACO
→ 4453 PLANETS INCORPORATED
→ 4444 OTHER WORLDS
→ THE EMERALD IMPERIUM
→ ACTIVE WORLD LAYER + EXPANSION WORLD LAYER + IMMORTAL MINERAL REGISTRY

Registry cardinality may exceed current world-slot capacity.

## Expansion Ledger (EEL)

EEL tracks world state for:

- allocated worlds
- pending worlds without current slot
- expansion-ready worlds
- historical transitions
- revoke and re-allocation transitions

Core rules:

- truncation: FORBIDDEN
- identity_recycling: FORBIDDEN
- renumbering: FORBIDDEN
- historical_deletion: FORBIDDEN

## Identity law

- ONE MINERAL → ONE WORLD IDENTITY
- WORLD ID is permanent and monotonic.
- Slot assignment is mutable state.
- Example: EW-4445 remains EW-4445 when capacity changes; it is never remapped to another ID.

## Allocation transition law

Allocation is constitutional change under ∆:

WORLD_PENDING → ∆ → WORLD_ACTIVE

Required controls:

- authorization evidence
- provenance evidence
- timestamped transition record
- fail-closed if any gate fails

## Status neutrality

WORLD_PENDING and WORLD_ACTIVE are allocation states, not rank.

No promotional hierarchy is implied by activation state.

## Epoch and continuity

Registry releases remain epoch versioned:

- EMERALD-REGISTRY-2026-09
- EMERALD-REGISTRY-2026-10
- ...

IMMORTAL lineage reconstructs REGISTRY(t0) → ∆ → REGISTRY(t1) → ∆ → REGISTRY(t2).

## New species intake

New IMA species enter through the same canonical gates:

SOURCE INGEST → IDENTITY CHECK → DUPLICATE CHECK → WORLD ID ALLOCATION → EXPANSION LEDGER

No rebuild of existing identities is required.

## District boundary

Districts are typed context (gemstone/crystal/ore/etc.) and are always secondary:

DISTRICT ≠ IDENTITY.

## Revoke law

REVOKE may move allocation state to WORLD_PENDING, but never deletes world identity.

A new allocation requires a fresh constitutional decision pipeline.

## CEFCG integration

Allocation events may use CEFCG finality progression:

OBSERVED → ATTESTED → PROVEN → CONFIRMED → FINAL

parallel states:

- DISPUTED
- CONFLICTED
- IN_DOUBT

PROVEN ≠ FINAL, CONFIRMED ≠ IRREVERSIBLE, FINAL ≠ SUCCESS.

## Canonical Emerald Laws v2 (EEL-001..EEL-018)

1. One Mineral → One World Identity
2. World Identity is immutable
3. World Slot is mutable allocation state
4. 4444 is capacity, not mineral cardinality
5. No truncation
6. Expansion Registry is first-class
7. No identity recycling
8. No historical deletion
9. Alphabetical canonical ordering
10. IMA provenance required
11. WATERMERK required
12. HOLOGRAM authenticity layer
13. IMMORTAL lineage required
14. ∆ governs allocation transitions
15. REVOKE preserves history
16. No mineral sovereignty
17. New species enter via the same gate
18. Expansion shall not rewrite existing identities

## GO-EMERALD-007 status

GO-EMERALD-007 is SEALED.

THE EMERALD IMPERIUM is an expandable, provenance-bearing, historically reconstructable mineral-world registry where 4444 is the current PALACO planetary allocation capacity.

De Edelsteenbuurt can grow without losing its first stone.
