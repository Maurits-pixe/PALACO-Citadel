# GO-EMERALD-004 — MASTER REGISTRY PROTOCOL

## Protocol objective

GO-EMERALD-004 defines a reproducible pipeline to generate Emerald World allocation from the official IMA-CNMNC source while preserving status, lineage, provenance, and immutable world identity.

## Hard law

- ONE CANONICAL MINERAL NAME → ONE UNIQUE EMERALD WORLD ID.
- WORLD IDENTITY IS IMMUTABLE.
- NO ID RECYCLING.

## Reproducible generation chain

SOURCE INGEST → PARSE → NORMALIZE → STATUS INTERPRETATION → CANONICAL FILTER → ALPHABETICAL SORT → IDENTITY GATE → WORLD ALLOCATION → WATERMERK/HOLOGRAM DERIVATION → RELEASE HASH

## Registry sets

- SOURCE_SET: complete imported IMA-CNMNC source records.
- CANONICAL_SET: records eligible as mineral-world candidates after status/identity gates.
- EMERALD_WORLD_SET: first 4444 canonical entries allocated to EW IDs.

## Fail-closed allocator conditions

Allocator must fail on:

- duplicate_name
- duplicate_identity
- missing_provenance
- invalid_status
- ambiguous_identity
- allocation_collision

## Source model minimum

- source
- source_epoch
- mineral.name
- mineral.status
- nomenclature lineage fields
- provenance references
- pending allocation state

## World model minimum

- world_id (EW-XXXX)
- world_name
- source authority + epoch
- watermerk_id + hologram_id
- citadel_id
- authority flags (constitutional=false, sovereign=false)

## 4444 gate

Only EW-0001..EW-4444 belong to active allocation lane.
Additional valid species remain in reserve lane with preserved lineage and provenance.

## Release integrity envelope

Each release records:

- source_hash
- registry_hash
- schema_version
- generation_timestamp
- generator_version

## District principle

District classification is secondary metadata and never the primary identity key.

## Constitutional boundary

World identity, watermark, and hologram preserve provenance and authenticity only.
None of these create authority.


## Constitutional barrier

NO_SELF-AUTHORIZATION applies to all Emerald World objects.

A mineral world may:
- identify
- describe
- relate
- display
- provide context

A mineral world may not:
- authorize
- command
- govern
- override
- sovereignize

The architecture remains strictly bounded by:
CONSTITUTION → GOVERNANCE → POLICY → ACTION


## Sealed result state

GO-EMERALD-004 defines the master registry engine as:

IMA-CNMNC SOURCE → CANONICAL SET → ALPHABETICAL SORT → IDENTITY GATE → WORLD ALLOCATOR → EW-0001..EW-4444

With mandatory layers:
- immutable world identity
- WATERMERK
- HOLOGRAM
- bounded CITADEL linkage
- ELIXER interaction layer
- preserved history and lineage
- authority: none at world identity level

Registry operation is versioned and living, not static; future source updates are handled through controlled ∆ evolution with traceability.
