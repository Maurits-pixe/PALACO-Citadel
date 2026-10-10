# RIO second-device recovery reference v0.1

This is a SYNTHETIC_ONLY, trusted-host test integration. It replaces an endpoint identity with newly generated non-extractable keys on another browser profile. It does not recover the old private key, decrypt old messages on the new device, authenticate a real person, or deploy a wifi relay.

## Explicit replacement

The Node 24 SQLite registry owns the current sender/receiver public identities, bound device identifiers, pair revision, retired pins, pending challenge and bounded global send/receive ledger. Private keys remain in the browser vault. Host enrollment is explicit, checks canonical SPKI, native key parameters and SHA256 pins, and cannot overwrite an enrolled registry.

1. Create fresh keys in the new browser profile; retain the original account identifier and role.
2. The trusted host proposes a replacement bound to the current revision, account, old/new pins and devices, peer account/pin/device, random challenge and a two-minute expiry.
3. The candidate proves private-key possession: a domain-separated P-256 signature for SENDER, or recovery-only labelled RSA-OAEP decryption of a fresh 32-byte challenge for RECEIVER. No private key is exported.
4. Separate host functions record the simulated owner and peer confirmations after valid possession proof. Both bind the exact same current challenge. These functions are test-host capabilities, not proof of independent real human approval.
5. Activation atomically consumes the challenge, retires the old pin, advances the pair revision and installs the new device. Only one concurrent activation can succeed.
6. The unchanged peer explicitly calls authority-gated rebindPeer. Its own key and epoch stay unchanged; local peer rotation compares the complete old peer and snapshots inputs before awaiting authorization.
7. New transfers still require the existing NOVA admissions, simulated bilateral checks and both exact final choices at service commit and delivery.

The challenge grants only a test key replacement. It grants no governance, merge, release or execution authority.

## Transfer enforcement and persistence

The optional recoveryAuthority adapter has exact checkPair and authorize functions. The host binds the device identifier outside client input. It must return exactly true; errors, missing results and timeouts in the browser adapter reject. The default encrypted client remains available without this integration and cannot itself enforce registry policy.

SEAL_START durably spends a global message identifier before crypto. SEAL_FINISH binds that reservation to the current pair revision, device, complete context and SHA256 canonical envelope digest. Reception checks those bindings before decryption and again before preview/consume release; consumption is durably recorded once. Local vault freshness is checked again after the final authorization callback. IDs remain spent after failed or interrupted crypto and after device replacement. Limits are 128 sends, 128 consumed receptions and eight replacements over the registry lifetime; history is never pruned to make a replacement pass.

The host's optional OPAQUE_TRANSPORT gate calls acceptTransport when initiating and acting on pending requests, including immediately before queue/delivery writes. It verifies canonical bounded bytes, current pins/revision/context, time, completed send ledger and native sender signature. Stale queued ciphertext closes through the durable revocation route; writer contention leaves HOLD with choices invalidated. Plaintext is never needed by this gate.

Registry transactions use synchronous FULL SQLite durability, exact schema/state validation and a persisted clock high-water mark. Failed activation commits leave the previous device active. Reopening an intact registry preserves approvals, retired pins and replay state. Native IndexedDB persists each browser's keys independently. The unchanged peer can resume a historical pinned peer locally, but actual registry-integrated transfer stays denied until an authorized rebind.

Acceptance is defined at the synchronous registry checkpoint. Registry and outbox writes are separate transactions; they do not provide a distributed atomic transaction across competing external hosts. These tests use one trusted synchronous host. External valid rollback, deletion or tampering of registry/vault storage is outside continuity guarantees. Retiring a key cannot cryptographically recall ciphertext already held with its old private key; it rejects the old identity on the controlled transfer route.

## Actual verification

Node integration tests exercise both role replacements, possession, exact approvals, expiry, clock rollback, global replay after reopen, interrupted operations, concurrent activation, rollback, lifetime bounds, malformed transport and sender signatures. Chromium tests use three separate persistent profiles, native non-extractable keys and real HTTP contact approval rounds. The test authority bridge binds each device in the test-host closure; it is not a public recovery endpoint. Old queued delivery closes, fresh encrypted transfer succeeds, then the registry handle is closed/reopened and the Chromium processes are restarted with preserved replay. Separate Node subprocess tests are killed after the actual SQLite update before COMMIT, and immediately after completed activation; reopening preserves respectively the old active state or the committed replacement, with used message IDs still spent.

Additional native browser cases revoke the vault while a final authority callback is pending and mutate a peer argument during asynchronous approval. No envelope/plaintext is released after the local revocation checkpoint, and the approved immutable peer snapshot is stored.

Run npm run test:rio:contact and npm run test:rio:encrypted:browser. Workflow logs are the proof for these cases. No browser profile, private key, session, original encrypted test text or database is uploaded.

## Remaining integrations

Production identity, device enrollment and independent human recovery authorization; reviewed maintained messaging cryptography with forward secrecy; actual signed delivery receipts; a hosted authenticated relay; live 6RI9ADE verdicts; real P.P. and 5CRIPTIE bindings. Existing contact human/guardian contracts retain fixed synthetic fixture identifiers and a separate synthetic key epoch; the registry supplies actual public-pin binding only within this reference. No live account or cross-wifi service is claimed.
