# GO-EMERALD-003 — DE MINERALENWERELD-INDEX

## Canonical rule

**ONE CANONICAL MINERAL NAME → ONE UNIQUE EMERALD WORLD ID.**

The index is alphabetical while remaining anchored to official mineral registry status and provenance.

## Registry object format

EW-0001
- mineral_name
- canonical_name
- registry_status
- mineral_class
- emerald_district
- world_name
- citadel_id
- watermerk_id
- hologram_id
- provenance
- lineage

## Deterministic allocation engine

WORLD_ID = `EW-` + `ZERO_PADDED_ALPHABETICAL_SEQUENCE`

Examples:
- Abellaite → EW-0001
- Abelloemringerite → EW-0002
- Abelsonite → EW-0003

## 4444-gate implementation

Pipeline:

CANONICAL SORT → IDENTITY VALIDATION → STATUS FILTER → WORLD ALLOCATION

Allocated active set:
- EW-0001 ... EW-4444

Parallel registry lanes:
- active worlds
- historical records
- superseded records
- discredited records
- unallocated/additional valid species

## Identity permanence

- World IDs are never recycled.
- Name changes update lineage under the same EW identifier.
- Semantic name and stable identity key remain separate.

## Integrity chain

EW-0001
- WATERMERK: EM-WM-EW-0001
- HOLOGRAM: EM-HO-EW-0001
- CITADEL: CITADEL-EM-EW-0001

Authority remains none by default at world identity level.

## Constitutional line

MINERAL → PLANET → CITADEL → ELIXER

with supporting layers:
WATERMERK → HOLOGRAM → PROVENANCE → IMMORTAL

and governing layers:
CONSTITUTION → GOVERNANCE → POLICY → ACTION
