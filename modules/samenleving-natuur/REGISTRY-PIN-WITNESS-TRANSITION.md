# PALACO CITADEL — Signed Witness Transition Preflight (Draft/HOLD)

A pure offline verifier for transitions between two **separately signed**
witness-registry snapshots under one pinned issuer key. Enforces:

- Independently pinned digest of the old snapshot.
- Both signatures using ECDSA P-256/SHA-256 and domain separation.
- Strictly increasing register epoch and minimum trusted floor.
- No deletion of existing identities.
- No reactivation of a revoked identity.
- No silent replacement of a registered identity's fingerprint.
- New keys require new unique witness identities.
- Duplicate identities/fingerprints are invalid.

This intentionally does **not** support issuer-signing-key rotation.
Witness key rotation is modelled as revoking the original identity and
enrolling a *new identity*, subject to separately reviewed authorization.

All protection claims are supplied as inputs. A real trusted epoch floor,
independent historical snapshot storage, revocation freshness,
dual authorization, and keys held by independent trustees are **not**
implemented. A valid transition is only locally consistent; it never grants
authority. Outputs always retain DENY/NOT_ESTABLISHED and stateChanged=false.

Run: `node --test modules/samenleving-natuur/registry-pin-witness-transition.test.mjs`.
No connection to PALACO MONO. PR #63 remains Draft/HOLD.
