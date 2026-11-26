# PALACO Citadel — Witness Registry Policy v1 (DRAFT/HOLD)

An offline fail-closed preflight for two named audit witnesses. It checks
that both witness identities are enrolled in a supplied registry,
their exact P-256 SPKI SHA-256 fingerprints match their registrations,
their status is ACTIVE rather than REVOKED, and the registry's epoch
meets an externally protected monotone lower bound. A separate
signature verifier checks their cryptographic signatures over the
exact SHA-256 digest of the anchor.

This **does not** implement an independently authenticated registry,
protected epoch floor, actual revocation service, custody separation,
trusted clock, or external publication. A caller able to replace the
registry and its epoch can forge enrollment; an ACTIVE status is not
proof of fresh revocation status. Every output reports
authorization DENY, stateChanged false, and trust NOT_ESTABLISHED.

Run: `node --test modules/samenleving-natuur/registry-pin-witness-registry.test.mjs`

No live credentials, database writes, deploys or release authorization.
PR #63 remains Draft/HOLD.
