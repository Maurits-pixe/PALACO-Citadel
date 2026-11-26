# Signed Witness Registry Preflight (PALACO Citadel, DRAFT/HOLD)

This module verifies a byte-exact witness enrollment registry signed by
ECDSA P-256 with SHA-256 and domain separation. The verifier checks a
pinned issuer SPKI fingerprint, an exact registry SHA-256 value, a minimum
registry epoch, and the existing two-witness enrollment/revocation policy.

Seven negative/positive tests cover registry substitution, stale signed
epochs, revoked witnesses, issuer-key replacement, tampered signatures,
and hostile inputs. No persistent storage or network access is used.

**Trust boundary:** the input fingerprint, registry hash, and minimum epoch
are NOT themselves authenticated by this module. If their origin is
attacker-controlled, local cryptographic validation alone offers no
independent authenticity or freshness. Registry-signing key custody,
fresh revocation checks, independent publication, trusted time and an
external monotonic store remain unimplemented. A successful verification
ALWAYS returns DENY, NOT_ESTABLISHED and stateChanged=false.

Run: `node --test modules/samenleving-natuur/registry-pin-signed-witness-registry.test.mjs`.

PR #63: Draft/HOLD. No production deployment, no live DB writes.
