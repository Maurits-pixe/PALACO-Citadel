# Autorisatiemodule — grens en uitrolkaart

## Bestaand in deze repository

| Component | Aanwezig | Grens |
|---|---|---|
| GO-7 Digital Identity | UX/protocoltekst, status, privacy, QR → proof | geen draaiende identity provider |
| GO-8 Participation & Authority | preview, aanvraag, denial, review, revocation | geen server-side policy engine |
| `emerald/schemas/*` | identity gate, WATERMERK, HOLOGRAM, registry seal | Emerald-domein, geen Citadel-brede autorisatie |
| `citadel-proof/` | DRAFT manifest, handtekeningcontrole, overgangscontract | caller assertions zijn niet zelfstandig vertrouwd |
| `atelier/` | lokale makerroute en RIO-gids | browserdownload is geen getekende activatie |
| `02-CORE-SYSTEMS/AUDIT.md` | auditprincipe | geen duurzame implementatie |
| `registration/registry.mjs` | lokale append-only referentie en previewbesluit | geen productie-autorisatiedienst |

## Autorisatieketen

`intent → consequence preview → authenticated identity → current key binding → scoped signed grant → evidence/proof → revocation check → temporal status → independent review → ExecutionTicket → atomic commit → outcome evidence`.

RIO may explain, prefill and request; it must not issue grants, act as independent reviewer, sign for the maker or call commit. WATERMERK marks provenance, HOLOGRAM displays a verification link, and ERA describes temporal evidence. None grants authority. A signer with an enrolled key still needs the correct role, scope and policy at the exact revision.

## Ontbrekend voor uitrol

1. Authenticated identity provider, enrollment, key rotation, recovery and separation of maker/reviewer/issuer.
2. Server-side policy engine with versioned rules, Citadel tenancy, least privilege and deny-by-default enforcement at every API.
3. Durable database/transactional ledger, atomic monotone sequence and external checkpoint to detect whole-ledger replacement.
4. Signed ERA clock attestations with holdover, uncertainty, drift alarms and recovery; RFC 3161 TSA is a possible external evidence source, not a universal absolute clock.
5. Canonical serialization and interoperable signature profile, key ID and algorithm agility; the current JSON hashing is a local convention, not RFC 8785.
6. Proof verifier for template pin, assets, key status, independence, revocation and historical reconstruction.
7. Atomic ExecutionTicket/commit/outcome service with idempotency, crash recovery and explicit in-flight revocation behavior.
8. Data protection design: purpose, lawful basis, minimization, access/erasure workflow, retention schedule, encrypted backup, incident response and privacy impact assessment as applicable.
9. Negative tests: role/scope escalation, replay, clock rollback, deleted/replaced ledger, direct API bypass, malicious assets, lost/stolen key and conflicting evidence.
10. Browser accessibility and real-device QA; an independent security review before public activation.

## Local computer as temporary external data store

The registry accepts an **absolute data directory** supplied by the operator, such as `PALACO_DATA_DIR` on the maker's own computer. Store event files, backup and keys outside the Git repository. Keep the private signing key in the OS key store or hardware key, never in the event directory. Use OS user permissions, full-disk encryption and an offline backup. This environment cannot access the user's laptop or establish its storage mount; the code has only been tested in a temporary local directory. There is no automatic sync from the browser wizard to that computer.

The local adapter is single-host reference storage. Exclusive writer lock and `wx` event creation stop routine concurrent writes; a crash leaves a lock and requires manual evidence-preserving recovery. A person able to rewrite the entire directory can forge a new hash chain without a separately anchored, signed checkpoint. Therefore local storage is not a production trust anchor.

## External baselines (design mapping, no compliance claim)

- EU GDPR/AVG Regulation (EU) 2016/679, especially Articles 5, 25, 30, 32 and 35: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- NIST SP 800-63-4 identity proofing, authentication and federation: https://pages.nist.gov/800-63-4/
- OWASP ASVS application security verification: https://owasp.org/projects/asvs
- RFC 3161 Time-Stamp Protocol: https://www.rfc-editor.org/rfc/rfc3161
- RFC 8785 JSON Canonicalization Scheme: https://www.rfc-editor.org/rfc/rfc8785

These are engineering references. Applicability and actual legal duties require a project-specific assessment. PALACO constitutional precedence and identity/authority separation remain internal policy, not a substitute for applicable law.
