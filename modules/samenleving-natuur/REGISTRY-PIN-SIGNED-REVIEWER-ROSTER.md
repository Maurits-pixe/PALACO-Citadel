# PALACO Citadel — Signed Reviewer Roster (DRAFT/HOLD)

This purely offline preflight validates a cryptographically signed reviewer
roster with ECDSA P-256/SHA-256, byte-exact digest pinning, issuer SPKI
fingerprint checking, minimum roster revision, and the pre-existing dual
reviewer signature checks over a single rotation statement.

Eight regression tests cover intact roster, signature corruption, issuer
substitution, stale revision, revoked reviewer, duplicate enrollment,
different rotation statement and hostile object getters.

**This does not create an independent trust source.** The issuer fingerprint,
roster digest, revision floor and revocation data are caller-provided.
Successful local verification is **not** authorization. Independently
protected issuer enrollment, revoked key detection, reviewer identity,
separation of duties, and durable publication remain outstanding.

Always DENY / NOT_ESTABLISHED / stateChanged=false. No production DB writes,
deploys, key creation or signing authority. PR #63 remains Draft/HOLD.
