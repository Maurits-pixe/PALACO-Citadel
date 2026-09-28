# Autorisatiemodule — grens en uitrolkaart

**Update v0.3:** zie [PREVIEW-INTEGRATION.md](PREVIEW-INTEGRATION.md) en [REMEDIATION-PR15.md](REMEDIATION-PR15.md) voor de gebouwde integratie, monotone trust/tijdcontrole, semantische receipts en automatische crash recovery. De hieronder genoemde productiepoorten blijven OPEN.

## Bestaand in deze repository

| Component | Aanwezig | Grens |
|---|---|---|
| GO-7 Digital Identity | UX/protocoltekst, status, privacy, QR → proof | geen draaiende identity provider |
| GO-8 Participation & Authority | preview, aanvraag, denial, review, revocation | geen server-side policy engine |
| `emerald/schemas/*` | identity gate, WATERMERK, HOLOGRAM, registry seal | Emerald-domein, geen Citadel-brede autorisatie |
| `citadel-proof/` | DRAFT manifest, handtekeningcontrole, overgangscontract | caller assertions zijn niet zelfstandig vertrouwd |
| `atelier/` | lokale makerroute en RIO-gids | browserdownload is geen getekende activatie |
| `02-CORE-SYSTEMS/AUDIT.md` | auditprincipe | geen duurzame implementatie |
| `registration/registry.mjs` | lokale append-only referentie, hash chain en herstelbare previewbesluit-events | geen productie-autorisatiedienst |
| `registration/trust-registry.mjs` | append-only trust snapshots met epoch, predecessor-digest en rollback/conflict-denial | geen externe authority of sleutel-enrollment |
| `registration/contract-gateway.mjs` | tenant/project-bound contractpoort, semantische receipt-binding, trust pinning, idempotency en preview-only output | geen activation/execution/publicatie |

## Autorisatieketen

`intent → consequence preview → authenticated identity → current key binding → scoped signed grant → evidence/proof → revocation check → temporal status → independent review → ExecutionTicket → atomic commit → outcome evidence`.

RIO may explain, prefill and request; it must not issue grants, act as independent reviewer, sign for the maker or call commit. WATERMERK marks provenance, HOLOGRAM displays a verification link, and ERA describes temporal evidence. None grants authority. A signer with an enrolled key still needs the correct role, scope and policy at the exact revision.

## Ontbrekend voor uitrol

1. Authenticated identity provider, enrollment, key rotation, recovery and separation of maker/reviewer/issuer.
2. Server-side policy engine with versioned rules, Citadel tenancy, least privilege and deny-by-default enforcement at every API.
3. Durable database/transactional ledger, atomic monotone sequence and external checkpoint to detect whole-ledger replacement.
4. Signed ERA clock attestations with holdover, uncertainty, drift alarms and recovery; the local monotone high-water is fail-closed but is not an external time authority. RFC 3161 TSA is a possible external evidence source, not a universal absolute clock.
5. Canonical serialization and interoperable signature profile, key ID and algorithm agility; the current JSON hashing is a local convention, not RFC 8785.
6. Proof verifier for template pin, assets, key status, independence, revocation and historical reconstruction.
7. Atomic ExecutionTicket/commit/outcome service for activation; the preview adapter now has idempotency and automatic local crash recovery, but execution remains OPEN.
8. Data protection design: purpose, lawful basis, minimization, access/erasure workflow, retention schedule, encrypted backup, incident response and privacy impact assessment as applicable.
9. Negative tests: role/scope escalation, replay, clock rollback, deleted/replaced ledger, direct API bypass, malicious assets, lost/stolen key and conflicting evidence.
10. Browser accessibility and real-device QA; an independent security review before public activation.

## Local computer as temporary external data store

The registry requires an operator-configured absolute data root bounded by an explicit `allowedRoot`. Paths cannot be supplied by an HTTP caller. Symlinks and permissive directories are rejected. The verified storage profile is Linux/POSIX; Windows is blocked pending ACL and durability verification. Store event files, backup and keys outside the Git repository. Keep the private signing key in the OS key store or hardware key, never in the event directory. Use OS user permissions, full-disk encryption and an offline backup. This environment cannot access the user's laptop or establish its storage mount; the code has only been tested in a temporary local directory. There is no automatic sync from the browser wizard to that computer.

The local adapter is single-host reference storage. Exclusive writer lock and no-replace event creation stop routine concurrent writes; a dead writer PID and orphan staging bytes are recovered automatically on the next transaction, while a live writer or malformed ownership metadata fails closed. A person able to rewrite the entire directory can forge a new hash chain without a separately anchored, signed checkpoint. Therefore local storage is not a production trust anchor.

## External baselines (design mapping, no compliance claim)

- EU GDPR/AVG Regulation (EU) 2016/679, especially Articles 5, 25, 30, 32 and 35: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- NIST SP 800-63-4 identity proofing, authentication and federation: https://pages.nist.gov/800-63-4/
- OWASP ASVS application security verification: https://owasp.org/projects/asvs
- RFC 3161 Time-Stamp Protocol: https://www.rfc-editor.org/rfc/rfc3161
- RFC 8785 JSON Canonicalization Scheme: https://www.rfc-editor.org/rfc/rfc8785

These are engineering references. Applicability and actual legal duties require a project-specific assessment. PALACO constitutional precedence and identity/authority separation remain internal policy, not a substitute for applicable law.
