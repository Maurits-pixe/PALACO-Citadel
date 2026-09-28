# Authority lifecycle — required production contract

Status: SPECIFICATION / KEY AUTHORITY OPEN. No real identity enrollment or legitimate issuing authority was established by this review. Test key possession proves possession of test material only. The local operator trust-root configuration is not self-validating authority.

| Stage | Required evidence and control | Production gate |
|---|---|---|
| IDENTITY | Verified subject identifier, responsible enrollment authority, tenant membership, assurance level, lawful data handling | OPEN |
| KEY ENROLLMENT | Challenge-response, public key fingerprint, key custody record, authenticator/custodian, issued time and enrollment evidence | OPEN |
| KEY BINDING | Authority-signed binding of identity to key, tenant/project, purpose, valid-from/until, issuer chain and evidence references | Technical contract present; authority chain OPEN |
| AUTHORITY SCOPE | Who may grant PREVIEW, permitted subjects/objects/actions, no transitive authority merely from identity or role display | Issuer mandate OPEN |
| ROTATION | New key ID and enrollment, explicit overlap window, signed supersession, historical old key retained for verification | Production procedure OPEN |
| REVOCATION | Effective sequence/time, verified revoker, signed reason, atomic immutable registry generation, current request denial | Transactional provider OPEN |
| RECOVERY | Separate recovery authority, independent review, proof of custody, revoked compromised credentials, new authorization | OPEN |
| AUDIT | Immutable signed records, historical key status reconstruction, external checkpoint, dissent and incident trail | External anchoring OPEN |

Before activation, the authority registry must return an immutable, authenticated snapshot with a content digest, generation and effective time. Every update must advance generation atomically; rollback or inconsistent same-generation content is denied. Concurrent grant revocation and receipt issuance require a documented transaction/lease protocol, not merely a mutable callback. Current code checks configured signatures/scopes but does not prove these service guarantees.

No RIO, WATERMERK or HOLOGRAM role grants authority by appearance or self-assertion. ERA time quality and rollback policy are explicit. Revocation must not disappear through a clock rollback or ledger rollback. Recovery never deletes historical evidence. All new authority requires a current independently accepted mandate.
