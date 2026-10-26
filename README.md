# ☄️ THE BIG BANG — PALACO-Citadel

Dit document is het canonieke entry point van PALACO-Citadel en opent de leesvolgorde van de PALACO Proof Machine.
PALACO-Citadel is now organized as a canonical layered system: read from top to bottom to move from principle to execution.

## Canonieke leesvolgorde / Canonical reading order

1. [01-FOUNDATION](01-FOUNDATION/README.md) — fundamentele constitutionele principes / constitutional principles and authority
2. [02-CORE-SYSTEMS](02-CORE-SYSTEMS/README.md) — CITADEL, QUAY, AUDIT, REPLAY en sealing
3. [03-EVIDENCE](03-EVIDENCE/README.md) — bewijsvoering, cryptographic proofs, verificatie en provenance
4. [04-GOVERNANCE](04-GOVERNANCE/README.md) — constitutionele regels, custody en evolutie-constraints
5. [05-OPERATIONS](05-OPERATIONS/README.md) — federatie, deployment en network protocol operations
6. [06-INTELLIGENCE](06-INTELLIGENCE/README.md) — governed intelligence en decision frameworks
7. [07-IMMORTALITY](07-IMMORTALITY/README.md) — duurzaamheid, certificatie en OMEGA
8. [08-IMPLEMENTATION](08-IMPLEMENTATION/README.md) — code, schemas, tests, examples en praktische implementatie
9. [DOCS](DOCS/README.md) — referentie, glossary, FAQ en status
10. [CANONIEKE_FORMULE](CANONIEKE_FORMULE.md) — de synthesis van het geheel

## GitHub links

- PALACO: `https://github.com/Maurits-pixe/PALACO`
- PALACO Industrie: `https://github.com/Maurits-pixe/PALACO-INDUSTRIE`
- PALACO Genesis: `https://github.com/Maurits-pixe/palaco-genesis`

## Citadel dashboard content (new)

The PALACO 2040 Compass section now includes the following dashboard layers in Citadel (`/index.html`):

- Constitution Dashboard — rules translated into current decision impact
- Proof Dashboard — action status + proof/traceability chains
- Identity Dashboard — identity/session/verification/ownership in one view
- Participation Dashboard — preview → authorization → review → revocation flow
- Governance Dashboard — active policies, deviations, review moments (no score-magic)
- Citadel Health Dashboard — operational + semantic risk signals with per-signal explanation
- RIO Conversation Dashboard — conversations as access to actions with context/consequence panels
- ELIXER Dashboard — available apps/capabilities per context with clear choice impact
- Aether homepage widget — reversible Base64 visual demo; it is not encryption
- [AETHER](citadel/iii6v9/) — local AES-GCM-256 text encryption using PBKDF2-SHA-256; not an audited vault or production security claim
- [Bastion static preview](citadel/bastion/) — fictional command-center simulation; local-only messages, no secure comms or live roster
- [5CRIPTIE](citadel/aegis/) — synthetic code-integrity dashboard; no source scan, live monitoring, detection, or defensive actions
- [PALACO Hoofdkantoor](citadel/) — temporary launcher with administrator-configured HTTPS links and user-reported verification status
- [React launcher](citadel/react/) — separate React entry point for the same previews; source is in `src/`
- [Bastion team prototype](citadel/bastion-app/) — Vue client for the separately hosted Node/PostgreSQL prototype
- Evolution Dashboard — canon/system changes with “what changes for me?” summary
- Public Gateway Dashboard — public orientation layer with core concepts and safe onboarding

Implementation references:

- Structure/content: `/home/runner/work/PALACO-Citadel/PALACO-Citadel/index.html`
- Localization keys: `/home/runner/work/PALACO-Citadel/PALACO-Citadel/app.js`
- UI styling: `/home/runner/work/PALACO-Citadel/PALACO-Citadel/styles.css`

The homepage Aether widget uses a fixed public sample to demonstrate reversible Base64
encoding. It is not encryption, authentication, secure storage, or a production vault.

AETHER encrypts text locally with the browser Web Crypto API using AES-GCM-256 and a key
derived by PBKDF2-SHA-256 (600,000 iterations, per-message random salt and IV). Input and
passphrase remain in the active page memory until cleared; encrypted output is not saved or
uploaded. The page has no account, recovery, persistent storage, or independent security
audit. It is not a production vault; use strong passphrases and do not rely on it for highly
sensitive data.

Bastion uses invented tasks and personnel. Task changes are tab-local; demo messages are
held in memory and removed from the view after 30 seconds. Messages are not transmitted,
persisted, or securely erased, and the demo does not implement access control.

5CRIPTIE generates decorative code-log entries, metrics, and data streams in the browser. It
does not inspect source code or network traffic, monitor system health, detect threats, or
block activity, and must not be used for operational security decisions.

The PALACO Hoofdkantoor launcher has no preconfigured app addresses. Configure each destination
yourself after confirming it with the responsible administrator. The launcher accepts HTTPS
URLs only, shows the destination hostname, and opens apps in a separate tab. Address settings
are held in the current tab's `sessionStorage` and cleared when that tab session ends.
“Verified” means the user checked the destination, administrator, HTTPS, and access controls;
the launcher does not independently verify any of these. Do not treat a configured address or
self-reported status as proof of a working integration or security.

Build the separate React launcher with `npm run build`; it is emitted to `citadel/react/`.
The Pages workflow builds it for deployment. The static `/citadel/bastion/` preview and the
separately hosted Vue prototype remain available, but neither is linked from the configurable
main launcher unless you enter and verify its address yourself.

### Bastion team prototype

The Vue client and Node API are a bounded development prototype, not a production-secure
service. GitHub Pages can host the client but cannot run the API; the Node service and PostgreSQL
database must be operated separately. Configure `VITE_BASTION_API_URL` and
`VITE_BASTION_SOCKET_URL` to the API origin before building for a remote API, and configure
`ALLOWED_ORIGINS` on the API to the exact client origin.

Copy `.env.example` to `.env`, set a PostgreSQL connection URL and a random `JWT_SECRET` of at
least 32 bytes. Use a TLS-protected PostgreSQL connection for any remote database. Then run:

```sh
npm install
npm run db:migrate:bastion
export BOOTSTRAP_USERNAME=commander
read -rsp 'Bootstrap password: ' BOOTSTRAP_PASSWORD; printf '\n'
export BOOTSTRAP_PASSWORD
export BOOTSTRAP_TEAM='Example team'
export BOOTSTRAP_CHANNEL='General'
npm run db:bootstrap:bastion
```

Run `npm run server:bastion` in one terminal and `npm run dev:bastion` in another. The API binds
to localhost by default; remote deployments must use HTTPS through a correctly configured
reverse proxy and set the API URL/origin configuration.

Provision operatives out of band with `PROVISION_USERNAME`, `PROVISION_PASSWORD`,
`PROVISION_TEAM_ID`, `PROVISION_CLEARANCE_LEVEL`, and explicit comma-separated
`PROVISION_CHANNEL_IDS`, then run `npm run db:provision:bastion`. Provisioning does not expose a
public account-creation or role-escalation endpoint. The access policy requires team membership,
clearance and, for operatives, assignment/creation to see tasks; channel membership is explicit.
Only commanders can create tasks, and operatives can update tasks assigned to them.

The API uses password hashes and short-lived signed access tokens; it rejects the sample
`x-user-id` identity header and requires authentication on both HTTP and Socket.IO. Messages are
stored as server-readable plaintext, are not end-to-end encrypted, and their expiry only removes
the active database row content. Backups, database logs, caches, clients, screenshots and memory
may retain copies. Audit rows reject application-level updates/deletes but are not tamper-proof
against a database owner. No independent security review, operational authorization policy,
production deployment, recovery/rotation process, or assurance for sensitive plans is provided.
Use synthetic data only until those gates are addressed.
When deploying the client through Pages, set the repository variables `BASTION_API_URL` and
`BASTION_SOCKET_URL`; without `BASTION_API_URL`, the login form remains disabled.

## GitHub preparation canon

- [PALACO-GITHUB-001 — Foundation Repository Assembly Manifest v1.0.0](PALACO-GITHUB-001.md)

## Migratie-overzicht

- De vroegere losse consolidatiebestanden zijn bewaard onder [ARCHIVE/legacy-sources/](ARCHIVE/legacy-sources/).
- De nieuwe canonieke laagstructuur is het primaire navigatiemodel voor lezers.
- De aanvullende thematische ordening van die grote bronbestanden staat in [CANON/README.md](CANON/README.md).
- Verborgen repository-infrastructuur zoals `.github/` is behouden; historisch bootstrapmateriaal is canoniek geplaatst onder `08-IMPLEMENTATION/examples/setup/`.
- Nieuwe website-, RIO-, VisitCard- en Emerald-documentatie van `main` blijft behouden naast de canonieke laagstructuur.

## Snelle oriëntatie

- Begin bij de foundation als je de legitimiteitsketen wilt begrijpen.
- Ga naar core systems als je de Proof Machine als mechaniek wilt lezen.
- Gebruik [CANON/README.md](CANON/README.md) als file map voor de grote historische syntheses.
- Eindig bij de canonieke formule voor de compacte synthese.

## Bestaande previews vernieuwen

De bestaande GitHub Pages-publicatie behoudt `CNAME` (`hoofdkantoor.info`) en deze routes:

- Citadel-website/PWA en RIO: `https://hoofdkantoor.info/`
- Atelier-wizard, uitsluitend lokaal DRAFT-concept: `https://hoofdkantoor.info/atelier/wizard.html`
- Levensader-objectinspectie, read-only fixture: `https://hoofdkantoor.info/DOCS/levensader-readonly/`
  (ook de bestaande route met `index.html` blijft werken).
- AETHER, legacy route `/citadel/iii6v9/`: `https://hoofdkantoor.info/citadel/iii6v9/`.
- Bastion, uitsluitend lokale commandocentrumsimulatie: `https://hoofdkantoor.info/citadel/bastion/`.
- 5CRIPTIE, legacy route `/citadel/aegis/`: `https://hoofdkantoor.info/citadel/aegis/`.
- PALACO Hoofdkantoor launcher: `https://hoofdkantoor.info/citadel/`.

De homepage linkt naar de afzonderlijke statische previews. Online vraagt de service worker
de actuele bestanden op dezelfde URL op; offline toont hij de laatst opgeslagen versie.
Oude Citadel-shellcaches worden bij de update verwijderd, zonder caches van andere apps te wissen.

Publicatie volgt via de bestaande Pages-workflow na een push naar `main` of een handmatige
`workflow_dispatch`. De workflow controleert de statische oppervlakken en de geïsoleerde lokale
previewtests. Een branchwijziging alleen is geen bevestigde live publicatie.
De Registration-preview blijft loopback-only met bestaande toelatingscontroles; andere repositories
en externe Sites-publicaties worden hiermee niet opnieuw gepubliceerd of geactiveerd.
