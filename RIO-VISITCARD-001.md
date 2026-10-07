# RIO-VISITCARD-001 — PALACO VISITCARD 03

## Standard direction

A PALACO VisitCard is not a file transfer. It is a living, verifiable introduction to a PALACO identity, Citadel, World, or ELIXER.

## Canonical object

PALACO VISITCARD
- identity
- object reference (person/citadel/world/elixer)
- introduction
- rio_address
- watermerk
- hologram
- provenance
- validity
- presentation
- discovery_methods

Discovery methods may include BLE, NFC, QR, RIO Link, web, 5LEUTEL, and wearable carriers.

## Introduction flow

DISCOVER → RECOGNIZE → MEET → EXPLORE

- Discover: beacon indicates nearby PALACO introduction.
- Recognize: resolver + watermark/hologram/provenance checks identify object.
- Meet: explicit user choice opens controlled handshake to RIO.
- Explore: user can continue toward conversation and optional deeper interaction.

## Encounter lifecycle

ENCOUNTERED → INTRODUCED → RECOGNIZED → ACCEPTED → CONNECTED

And always:
- connected ≠ authorized
- visitcard ≠ key
- beacon ≠ permission
- rio ≠ authority

## Privacy and anti-flood

- beacon payload is minimal and privacy-preserving
- discovery identifiers should be rotating where possible
- deduplication and relevance reduce spam-like repeated prompts
- user consent is required before rich identity disclosure

## Revocation and time

- temporary cards may expire by validity window
- explicit revocation is supported
- revoke/expire does not delete historical provenance records

## Canonical stack

USER
→ VORM9EVIN9
→ RIO
→ VISITCARD PROTOCOL
→ DISCOVERY (BLE/NFC/QR/LINK)
→ WATERMERK / HOLOGRAM
→ IDENTITY / PROVENANCE
→ PALACO OBJECT

Constitutional governance remains above and across this stack.
