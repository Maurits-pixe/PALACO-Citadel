# EMERALD-IMPERIUM-ALLOCATION-V1 — 4444-GATE MODEL

## Scope

This document defines V1 allocation logic for The Emerald Imperium under the fixed **4444 world** horizon.

## V1 constraints

1. Allocate exactly 4,444 active mineral worlds.
2. Use strict alphabetical assignment order.
3. Apply one valid mineral name per world.
4. No duplicate world names.
5. No fabricated mineral species.
6. Exclude discredited species from active-world assignment.
7. Preserve WATERMERK + provenance linkage for each world identity.

## Capacity tension handling

When valid mineral species exceed 4,444, apply split model:

- **ACTIVE MINERAL WORLDS**: 4,444
- **MINERAL RESERVE**: additional valid species beyond 4,444

## Reference snapshot (as provided in GO statement)

- Valid mineral species (IMA-CNMNC September 2026): 6,239
- Active world limit: 4,444
- Reserve count: 1,795

## Sample sequence

- 0001 Abellaite
- 0002 Abelloemringerite
- 0003 Abelsonite
- 0004 Abenakiite-(Ce)
- 0005 Abernathyite
- 0006 Abhurite
- 0007 Abramovite
- 0008 Abswurmbachite
- 0009 Abuite
- 0010 Acanthite

## Example world record

PLANET-EMERALD-0001
- name: Abellaite
- class: Mineral World
- imperium: The Emerald Imperium
- district: De Edelsteenbuurt
- source: IMA-CNMNC
- status: ACTIVE
- order: 0001
- watermark: REQUIRED
- hologram: REQUIRED
- provenance: REQUIRED
- authority: NONE
