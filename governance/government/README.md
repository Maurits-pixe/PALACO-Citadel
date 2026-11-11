# GO-GOV-12-004 — Government governance contracts

Status: **candidate reference implementation · non-operative**.

This module implements the bounded data-contract slice designed in Issues #32, #51 and #52:

- HOOFDKANTOOR Ambassador appointment-mandate record and registry snapshot;
- Government competence ratification record;
- Constitutional appeal-panel eligibility contract;
- fail-closed pure evaluators.

Hard boundaries:

- VALID RECORD != APPOINTMENT
- APPOINTMENT ELIGIBLE FOR RECORDING != SERVING
- RATIFIED_NOT_ACTIVE != ACTIVATED
- APPEAL PANEL ELIGIBLE != APPEAL DECISION AUTHORITY
- VALIDATOR RESULT != EXECUTION AUTHORITY

Every evaluator returns authority_created=false and government_active=false.

The registry implemented here is only a validated snapshot. There is no durable authority store, identity provider, signing service, live revocation service, appointment endpoint, voting endpoint, ratification service, activation endpoint, merge authority, release authority or ExecutionTicket path.

Run the scoped harness with:

node --test governance/government/contracts.test.mjs


## Remaining boundary

Appeal eligibility requires an attributable independence-evidence reference plus person-level and institutional conflict status. This candidate validates those claims structurally; it does not itself authenticate the evidence source or establish a live institutional identity registry. Operative independence therefore remains a future integration gate.
