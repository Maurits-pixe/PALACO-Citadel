# ∆ GO-02 — Citadel Proof Gate v0.1

This is a Node.js reference implementation for **DRAFT exports** and an activation boundary. It does not import or claim to validate the previously reported Atelier ZIP, which is not in this repository. Run `node --test citadel-proof/proof.test.mjs`.

## Export contract

The Builder should hash the exact bytes of every exported file, call `makeManifest`, serialize `citadel.manifest.json`, and ship it alongside the payload. The manifest includes Citadel ID, pinned foundation template ID/version/SHA-256, Builder version, strictly increasing export sequence, exact file hashes and renderer provenance. Its state is always `DRAFT`. `verifyExport` compares the complete file set and bytes against a trusted template pin and a caller supplied durable latest sequence. The caller must persist sequence per Citadel across devices and restore operations; a stateless verifier cannot detect replay.

The detached `signManifest` helper signs the canonical manifest digest with RSA-PSS-SHA256. It returns the public key and signature, never the private key. A production key must be generated and held in an approved key store outside this reference implementation. The verifier must obtain the trusted public key from an independently authorized Citadel identity registry. A self asserted key inside the binding has no authority.

The state record exposes sequential DRAFT → REVIEWED → VERIFIED → ACTIVATABLE → ACTIVE transitions and REVOKED. Evidence IDs and digests are retained in the returned history. `transition` is a policy reference: its `bindingVerified`, `exportVerified`, authority and commit inputs are assertions made by a trusted service, **not cryptographically validated by this module**. Persist records in append only storage with compare and swap, authenticate reviewer and authority, validate their signatures, enforce role separation, and bind an ExecutionTicket and committed outcome before exposing any activation endpoint. Never allow the browser to call transition as an authorization service. Revocation stops execution; a new authorization is required for restoration.

## Threat model v0.1

| Threat | Gate | Remaining requirement |
|---|---|---|
| Export tampering and missing/added files | Exact byte hashes and file set | Trusted delivery of manifest digest |
| Replay of old manifest | Sequence above caller supplied high water mark | Durable atomic high water mark |
| Foundation template substitution | ID, version and digest pin | Trustworthy pin registry |
| Impersonated Citadel | Detached signature against trusted key | Independent identity enrollment and key custody |
| Audit history edits | Sequence and evidence digests in returned history | Append only signed server log and independent audit |
| Key theft or loss | No implicit private key export | Hardware custody, rotation and recovery ceremony |
| Malicious customization | Hashes bind the bytes | Content sanitization, CSP and human review |
| Direct activation API bypass | Sequential gate and exact digest checks | Server authorization, atomic commit, deny by default |

This implementation is a **reference contract**, not a deployed activation service. No independent review, identity enrollment, authority issuance or production activation has occurred. The local procedural Image Studio renderer remains a provenance value; external providers require explicit provider/model ID, prompt and seed when available, output hash, and separate review.

**Status:** implementation tests PASS locally; Citadel status DRAFT; review, key binding, threat validation and activation OPEN.
