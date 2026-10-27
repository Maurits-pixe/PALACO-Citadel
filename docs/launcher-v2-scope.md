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
