# GO-EMERALD-009 — THE MINERAL WORLD FACTORY

## Scope

GO-EMERALD-009 defines Emerald Registry as a controlled generative system that reproduces PALACO world objects from validated IMA-CNMNC source records.

Source epoch remains IMA-CNMNC 2026-09 (6239 currently valid species).

## Factory model

IMA-CNMNC
→ SOURCE INGESTOR
→ IDENTITY GATE
→ WORLD FACTORY
→ WATERMERK + HOLOGRAM
→ CITADEL + IMMORTAL
→ ELIXERS

Rejected or incomplete records fail closed.

## Input contract

Factory input requires:

- source = IMA-CNMNC
- source_epoch
- mineral.canonical_name
- mineral.status
- provenance.source_reference
- validation.source_verified = true

Missing required provenance means no world output.

## Identity gate

The gate validates:

1. canonical name
2. source identity
3. duplicate identity
4. nomenclature state
5. provenance
6. status
7. lineage

Outcome is PASS or FAIL (quarantine / in_doubt lanes on failure).

## World creation

Canonical flow:

CANONICAL MINERAL → MINERAL ID → WORLD ID

Example:

Abellaite → MIN-0001 → EW-0001

EW identity remains PALACO infrastructure identity (not IMA identifier).

## World object baseline

Factory output includes:

- world (EW identity)
- mineral (MIN identity)
- source authority/epoch
- allocation state + slot
- integrity stack (watermerk + hologram)
- context stack (citadel + immortal)
- authority flags sovereign=false, constitutional=false

## Identity vs slot law

EW-XXXX is immutable world identity.
OW-XXXX is mutable allocation slot.

WORLD_PENDING with slot=null is valid when capacity is exceeded.

## Allocation and expansion

Allocator emits OW-0001..OW-4444 in current capacity.
Additional worlds remain valid as WORLD_PENDING until constitutional capacity expansion is approved and evidenced.

No automatic promotion from pending to active.

## Index model

Factory releases keep six indexes:

- canonical_name → world_id
- world_id → mineral
- mineral_id → world_id
- world_id → world_slot
- former_name → world_id
- source_reference → world_id

## Nomenclature and lineage

Rename/redefine transitions keep EW identity stable and preserve former names + immortal lineage.

## Uncertainty handling

QUESTIONABLE records remain uncertain lanes (IN_DOUBT / CONFLICTED) and are never laundered into certainty.

## Evidence and relationship law

Official relation graph accepts only VERIFIED, ATTESTED, or DERIVED-WITH-EVIDENCE relations with explicit evidence and confidence state.

Without evidence: no official relation edge.

## Constitutional boundary

Factory outputs are representational and evidentiary; they do not grant sovereignty or constitutional authority.
