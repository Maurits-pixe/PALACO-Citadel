# PALACO-Citadel Repository Maintenance Handoff

This repository-wide note preserves verified project context for future maintenance. It is an
orientation aid, not new canon, deployment approval, or evidence that proposed integrations exist.
For the numbered PALACO source hierarchy, follow the [root README](../README.md).

## Repository shape

- The root `index.html`, `styles.css`, `app.js`, manifest, and service worker provide the static,
  multilingual PALACO Citadel PWA. See the [root README](../README.md) for the architecture and
  capability disclosures.
- The numbered `01-FOUNDATION/` through `08-IMPLEMENTATION/` directories are the documented
  principle-to-execution reading order; `DOCS/` and `CANONIEKE_FORMULE.md` are supplemental
  references.
- RIO's code under [`rio/`](../rio/) is a versioned implementation profile derived from its
  specifications. It does not create canon, consent, authorization, or authority. See the
  [RIO maintenance handoff](../rio/MAINTENANCE-HANDOFF.md).
- The Vue launcher at `/citadel/` is branded PALACO NEO. It checks metadata only for explicitly
  allowlisted HTTPS origins; a successful check is not service health, identity proof,
  authorization, or security evidence. See [launcher scope](launcher-v2-scope.md).

## Existing module boundaries

- **AETHER:** `/citadel/iii6v9/` performs local AES-GCM-256 encryption in the browser with a
  PBKDF2-derived key. It is not a Rust service or a production vault; text and output are not
  uploaded or persistently stored by this page. See the [root README](../README.md).
- **Bastion:** `/citadel/bastion/` is a fictional local simulation. There is also a separate
  `bastion-backend/` SQLite demo API and a Bastion team prototype; these are not one integrated,
  production service. The SQLite API has no authentication or authorization and its documentation
  says not to expose it to a network.
- **5CRIPTIE:** `/citadel/aegis/` is a synthetic visualization, not a live scanner, monitor, or
  defense system.
- **NEO:** The launcher is a display name for the existing PALACO Vue launcher, not a declaration
  that PALACO itself has been canonically renamed.

## Build, tests, and local container

- Root validation: `npm test` runs the RIO conformance, server, launcher, build, and browser
  suites. `npm run test:rio` is the focused RIO profile check.
- The separate backend package has its own check: `npm ci --prefix bastion-backend` followed by
  `npm --prefix bastion-backend test`.
- `.github/workflows/ci.yml` runs the root suite, validates/builds the Docker Compose service,
  smoke-tests its health plus `/` and `/citadel/`, and runs the separate backend tests.
- Root `docker-compose.yml` packages only the existing static site in Nginx. It binds to
  `127.0.0.1:8080`, uses a read-only container filesystem, and drops Linux capabilities. Start it
  with `docker compose up --build -d`; it does not start Rust AETHER or a live Bastion service.

## Proposals are not implementation

The requested Rust AETHER engine, Socket.IO task delivery, AETHER-to-Bastion secure-drop endpoint,
five-service Compose topology, Ngrok tunnels, global audit log, and D-013 enforcement were not
verified as existing services and were not added. The details and constraints are retained in
[launcher-v2-scope.md](launcher-v2-scope.md). Do not introduce data transfer or real/sensitive
data storage into the demos without an approved data-flow contract, authentication and
authorization, retention/deletion rules, and a reviewed operational boundary.

## Validation and change discipline

Use the tests for the affected subsystem and the root suite when practical. A passing test suite
proves only the behavior it exercises; it does not prove deployment, production readiness,
identity, authorization, or constitutional approval. Preserve subsystem disclosures and keep
proposed capabilities clearly distinguished from implemented behavior.
