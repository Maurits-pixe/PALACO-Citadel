# Nonce Consumption Receipt & Lost-ACK Recovery — DRAFT / HOLD

This isolated PostgreSQL integration test binds **one nonce consumption
and one recovery receipt into the same database transaction**.

The disposable schema stores SHA-256 digests of issued 256-bit nonces
and maintains a receipt table keyed uniquely by registry and nonce.
The synthetic receipt digest uses domain separation and binds registry,
nonce digest, reader ID, fencing epoch, anchor digest and evidence digest.
The receipt is committed atomically with marking the challenge consumed.

Tests verify:
- A successful commit with a deliberately discarded application ACK
  is discoverable in a **second read-only database session**.
- A repeat consumption cannot produce a second receipt.
- A recovery claim with conflicting evidence returns
  `DENY_CONFLICTING_EVIDENCE`, not a false success.
- A reader or fencing epoch mismatch cannot recover another receipt.
- A speculative consumption and receipt insertion rolled back together
  leave no committed evidence; a retry then commits once.
- Receipt counts exactly match consumed challenges.

**Security scope:** this test has **one disposable PostgreSQL backend**,
not a replicated or independently witnessed audit ledger. Lost ACK is
simulated by ignoring the result of a successful commit, not by dropping
a real network packet. Receipts are deterministic SHA-256 hashes, not
digitally signed or independently immutable attestations. The
database owner can alter the fixture. The sample function does not
verify signed observations, trusted time, fresh revocation, secure
challenge delivery or real reader authentication. It MUST NOT be
exposed to live clients as an authorization or mutation service.

Run only with `CITADEL_EPHEMERAL_CI_ONLY=1`,
`PGHOST=127.0.0.1`, `PGPORT=5432`, `PGDATABASE=postgres`:
`bash modules/samenleving-natuur/reviewer-roster-nonce-receipt-recovery-ci.sh`

This test is wired to GitHub Actions on PR #63, which remains
**Draft/HOLD**. No merge, production rollout, live writer or
PALACO MONO modification. All upstream read-only evidence modules
remain `authorization: DENY` and `trust: NOT_ESTABLISHED`.
