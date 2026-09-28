# Registratie- en verificatiedocumenten v0.1

Every material action has a dossier with references, not raw private data embedded in public Git history. A verifier records the exact revision and a result (`VERIFIED`, `UNVERIFIED`, `REVOKED`, `EXPIRED`, `UNKNOWN`, `IN_DOUBT`, `CONFLICTED`). An absent proof remains `UNKNOWN` or `UNVERIFIED`, never inferred success.

| Document | Required fields | Producer / check |
|---|---|---|
| Identity enrollment | subject ID, Citadel ID, issuer, consent or other lawful basis, key ID, status, scope, evidence digest, revocation endpoint | independent issuer; enrollment review |
| Key binding | identity ID, SPKI fingerprint, algorithm, key custody, challenge proof, valid from/to, rotation/suspension | key registrar; possession verification |
| ERA temporal record | sequence, previous hash, observed wall time, source, precision/uncertainty, clock sync evidence, attestation reference, signed time token if present | clock witness; never overwrite an earlier observation |
| WATERMERK | marker ID, object/asset ID, content digest, issuing context, visibility, version, provenance pointer | registry; visual mark alone is not verification |
| HOLOGRAM | hologram ID, referenced immutable record digest, live verification target, status and expiry | proof verifier; animation/rendering has no authority |
| Proof bundle | manifest digest, file digests, template pin, source, verifier version, checks, outcome, dissent, reviewer ID and signature | independent verifier |
| Authority grant | issuer identity/key, subject, action, Citadel scope, exact manifest digest, validity, evidence, policy revision, signature | authorized issuer; role separation |
| Activation ceremony | preview, grant ID, identity and proof checks, ExecutionTicket, commit ID, exact outcome and revocation route | trusted server and independent review |
| Revocation | grant ID, issuer, reason code, effective sequence, signature, in-flight disposition, new status | authorized revoker; history retained |

Verification steps: (1) validate schema and references; (2) recompute file and record hashes; (3) validate issuer chain and key status at the event's effective sequence; (4) compare exact Citadel, subject, action, scope, manifest and validity; (5) verify ERA evidence quality, distinguishing sequence from wall time; (6) check revocation and supersession; (7) inspect reviewer independence; (8) emit signed determination and retain dissent. A failed or unavailable check denies execution.

The v0.3 preview adapter validates a subset of this dossier: complete export bytes, pinned template, maker/project binding, ordered trajectory, application-signed ERA evidence, signed grants/revocation, sequence/replay, monotone trust epoch, temporal high-water and a persisted semantic verification receipt. It revalidates grants, ERA, trust digest and receipt fields on every preview request. The generic `ERA_ATTESTED` event still stores only an opaque reference; the adapter instead checks its own domain-bound signed attestation. Neither authenticates an atomic clock or validates an RFC 3161 token. WATERMERK/HOLOGRAM authenticity, caller authentication, independent review, external ledger checkpoints and execution remain OPEN. See [the integration report](PREVIEW-INTEGRATION.md).
