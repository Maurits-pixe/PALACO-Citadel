# Citadel Monetary Layer v0.1.0

Every qualifying Citadel ID may be prepared to host a wallet and, subject to PALACO governance and applicable law, define a WORLD currency.

## Wallet

The Citadel wallet supports four owner-selected spending profiles:
1. Filantroop
2. Mescenicas
3. Misantroop
4. Blanco / owner-defined destination

Phone/e-mail association is optional and must be separated from the financial destination record.

## WORLD currency

A WORLD currency is scoped to its WORLD/Citadel identity and receives a canonical currency record before any deployment.

Creation does not itself authorize public issuance, exchange, custody or payment services.

## Identity/provenance

Currency identity must bind:
Citadel ID → WORLD ID → Currency ID → creator/issuer → canonical policy → provenance/watermerk → authorization → registry.

HOLOGRAM and WATERMERK establish identity/authenticity/lineage; neither independently grants monetary authority.

## Hotspot

A Citadel may participate in approved HOTSPOT flows. Bluetooth/proximity discovery is informational until an explicit authorization credential is validated.

## Fail-closed

Monetary execution MUST fail closed for:
- missing authorization;
- revoked authorization;
- expired authorization;
- invalid provenance;
- unsupported jurisdiction;
- compliance status not permitting operation;
- invalid ledger state.
