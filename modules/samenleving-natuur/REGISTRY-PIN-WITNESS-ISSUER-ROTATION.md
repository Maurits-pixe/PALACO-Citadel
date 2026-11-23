# PALACO Citadel — Issuer Key Rotation Preflight (DRAFT/HOLD)

Verifies *both* old and new issuer signatures over one byte-exact
rotation statement, in addition to the individual signatures on both
witness-registry snapshots. The statement binds both issuer SPKI
fingerprints, both exact snapshot hashes, and increasing register epochs.

The old issuer fingerprint and previous snapshot digest must already be
independently protected. An attacker controlling those inputs defeats
the local preflight. Revoked witness identities cannot be reactivated;
existing witness keys cannot be rebound, even by a jointly signed rotation.

This is a read-only mathematical proof model. It does not issue a new key,
authorize a rotation, write a key pin, execute a registry update, timestamp
an action, or publish the change. No trusted independent owners, revocation
service, external storage or approvals are connected.

All outcomes remain DENY / NOT_ESTABLISHED / stateChanged=false.

Test: `node --test modules/samenleving-natuur/registry-pin-witness-issuer-rotation.test.mjs`

PR #63 Draft/HOLD; no merge, deployment or PALACO MONO writes.
