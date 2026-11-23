# Reviewer Roster Checkpoint Attestation — DRAFT / HOLD

This offline, read-only verifier checks a domain-separated P-256/SHA-256
signature from a distinct checkpoint witness, the pinned witness SPKI SHA-256
fingerprint, the expected checkpoint head, the checkpoint schema, and a
bounded UTC validity window (maximum 24 hours). Canonical JSON field order
is fixed for the signed payload, and malformed/unknown fields are rejected.

**This does not establish independent trust.** The caller supplies the
witness key, expected fingerprint, expected head and current clock; the
code neither retrieves an independently authenticated checkpoint nor
persists it atomically. A compromised caller can replace all supplied pins
and the claimed time. It does not prove that the signer is a trusted
PALACO witness, nor prove freshness of revocations or independence of
witness custody. An attestation can only become evidence after trusted,
independently protected pins and an authenticated checkpoint read exist.

Every result returns `authorization: DENY`, `trust: NOT_ESTABLISHED`,
`stateChanged: false`, and `executionAllowed: false`.

Local test:
`node --test modules/samenleving-natuur/registry-pin-reviewer-roster-attestation.test.mjs`

GitHub Actions also runs these tests with the existing nature QA.
No merge, deployment, live database changes or PALACO MONO writes.
