# Signed issuer rotation reviewer approvals — Draft/HOLD

This offline preflight verifies two **distinct** ECDSA P-256 reviewer
signatures over one exact byte sequence representing an issuer rotation
statement. A supplied roster binds reviewer IDs to their SPKI SHA-256
fingerprints and ACTIVE/REVOKED statuses. A supplied minimum roster revision
and exact statement digest guard against local substitution and rollback.

**Crucial:** the roster, minimum revision and statement digest are all
caller-supplied, not independently protected. A malicious caller can replace
the entire input. The check establishes only local signature consistency;
it cannot establish actual reviewer identity, separation of duties, fresh
revocation information, authorization, trusted time or durable publication.

Outputs always remain **DENY / NOT_ESTABLISHED / stateChanged=false**.
No writer, production DB operation, key issuance or authorization is enabled.

Run `node --test modules/samenleving-natuur/registry-pin-issuer-review-approvals.test.mjs`.
PR #63 remains Draft/HOLD.
