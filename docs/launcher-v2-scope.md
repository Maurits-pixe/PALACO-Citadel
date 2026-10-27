# PALACO NEO launcher scope

This note records the requested launcher direction and separates implemented behavior from
proposed integrations. **NEO is the Vue launcher's display name only**; PALACO remains the
platform identity. This change does not declare a canonical product rename or a v2.0 release.

## Implemented in this repository

- The Vue launcher at `/citadel/` displays PALACO NEO in English, Dutch, and Esperanto.
- The launcher checks module metadata only for exact HTTPS origins explicitly configured in its
  deployment allowlist. It does not assume that a module is reachable or safe.
- A successful check confirms only the expected, self-declared `appId` and metadata schema.
  Evidence is held in page memory for 60 seconds; status is not independently verified.
- The displayed duration is measured by the browser for that single metadata request and response
  body read. It is not service latency, continuous monitoring, a heartbeat, or proof of health.
- AETHER's existing `/citadel/iii6v9/` page performs local browser Web Crypto encryption; it is not
  a Rust backend or a persistent secure vault.
- Bastion previews and backend prototypes are separate surfaces. The launcher does not connect
  them. 5CRIPTIE remains a synthetic dashboard, not a live code-integrity service.

## Requested, not implemented or independently verified

The previous request described a Rust AETHER service, a real-time Node Bastion service, five
local services, Ngrok tunnels, module health/heartbeat and latency, a global audit log, and a
D-013 rejection flow. Those descriptions are requirements/proposals, not evidence that these
services, routes, tunnels, logs, or controls exist in this repository. This change does not add
them, configure external origins, or claim D-013 compliance.

Before any such integration, establish the service contracts and authorized origins, verify
operator-controlled deployment and transport configuration, define authentication and audit
boundaries, and provide an applicable D-013 source and approval. The launcher metadata check must
remain distinct from service health and authorization.

## Follow-up request recorded (2026-10-27)

The follow-up proposed all of the following; this record preserves the request without treating
its proposed code or paths as evidence of working services:

- Add an AETHER checkbox labelled “Maak automatisch taak aan in Bastion” and an AETHER-to-Bastion
  dispatch after encryption. The proposed payload stores the AETHER1 encrypted envelope as a
  Bastion task description, with a critical priority and clearance 5.
- Add `POST /api/tasks/secure-drop` to a proposed `services/bastion-core/server.js`, creating a
  pending task assigned to `WAITING_DECRYPTION`, writing a `SECURE_DROP_RECEIVED` audit entry, and
  emitting a `task_created` Socket.IO event. The request also suggests allowing the AETHER
  frontend origin through CORS.
- Add a root Docker Compose stack with `services/aether-engine`, `services/bastion-core`,
  `apps/neo-launcher`, `apps/aether-frontend`, and `apps/bastion-frontend`, mapped to ports
  3006, 3005, 5173, 5174, and 5175 respectively, with persistent database volumes.
- Replace/expand the GitHub Actions CI workflow to build Rust, test Node, and build three
  frontends. The request suggests Rust 1.70 and Node 18.

None of the named `apps/` or `services/` trees exists here. AETHER is the static, browser-only
`citadel/iii6v9/` demo; the separate `bastion-backend/` is a loopback HTTPS SQLite API for
fictional tasks, with no task-creation, audit-log, or Socket.IO implementation. CORS is not
authentication, and persisting a submitted envelope would contradict AETHER's current “not
uploaded or persistently stored” notice. Consequently, the proposed dispatch route, checkbox,
five-service Compose topology, and their Dockerfiles remain unimplemented; do not send real or
sensitive data to the existing demo backend. A safe integration requires an explicitly approved
data flow, caller authentication/authorization, retention and deletion rules, a decryption
custody model, and a review of the network exposure before implementation.

The repository already has `.github/workflows/ci.yml`; it was a placeholder, not a missing file.
It now runs the existing root `npm test` suite (including Playwright Chromium) and the separate
`bastion-backend/` tests. It deliberately does not pretend to build absent Rust or frontend
projects. Node 22 is the CI runtime; the proposed Node 18/Rust 1.70 values are not adopted as
repository requirements.
