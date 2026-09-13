# 02-CORE-SYSTEMS

Core mechanics: CITADEL, QUAY, AUDIT, REPLAY, and sealing primitives.

Laag 2 beschrijft de mechanismen die constitutionele geldigheid omzetten in controleerbare actie: toegang, provenance, audit, replay en sealing.

Gebruik deze laag als de mechanische kern van de PALACO Proof Machine.

## RIO

RIO is PALACO's bounded communication and continuity layer.

- [RIO Universal](../RIO-UNIVERSAL-001.md) beschrijft het universele communicatiemodel.
- [RIO Fabric](../RIO-FABRIC-001.md), [RIO Platform](../RIO-PLATFORM-001.md), [RIO UIC](../RIO-UIC-001.md) en [RIO VisitCard](../RIO-VISITCARD-001.md) beschrijven transport, platformcontext en identity-aware interaction.
- [RIO implementation profile](../rio/README.md) verwijst naar lokale schema's, runtime, transition policy, localization en conformance tests.

De implementation profile is geen canon: communicatie creëert geen autoriteit, en presentatie verleent geen toestemming.
