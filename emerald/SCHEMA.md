# Emerald Schema Specification

This directory defines machine-readable contracts for Emerald registry artifacts.

## Core schemas

- `schemas/mineral.schema.json`
- `schemas/world.schema.json`
- `schemas/provenance.schema.json`
- `schemas/watermerk.schema.json`
- `schemas/hologram.schema.json`
- `schemas/registry-seal.schema.json`
- `schemas/expansion-ledger.schema.json`
- `schemas/world-layer-registry.schema.json`
- `schemas/allocation-registry.schema.json`
- `schemas/world-indexes.schema.json`
- `schemas/world-factory-input.schema.json`
- `schemas/identity-gate-result.schema.json`
- `schemas/mineral-world-factory-output.schema.json`
- `schemas/mineral-relation-edge.schema.json`
- `schemas/capacity-change.schema.json`
- `schemas/elixer-factory.schema.json`
- `schemas/fail-closed-test-suite.schema.json`
- `schemas/emerald-constitution.schema.json`

## Compatibility schemas

- `schemas/source-record.schema.json`
- `schemas/world-object.schema.json`

## Rules

- World IDs use `EW-XXXX` format.
- Status and identity are separate fields.
- Provenance and lineage fields are mandatory in canonical world objects.
- Schema updates must be versioned via release manifests.
