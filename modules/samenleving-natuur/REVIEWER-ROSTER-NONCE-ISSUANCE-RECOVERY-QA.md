# Database-Issued Nonce Challenge & Recovery — DRAFT / HOLD

This integration regression creates an **isolated disposable PostgreSQL
fixture** that issues 256-bit random nonces using PostgreSQL `pgcrypto`,
stores only each nonce's SHA-256 digest, and binds issuance to a specific
registry, reader ID, fencing epoch, anchor digest and bounded expiry.

The fixture's single-statement conditional `UPDATE` consumes a challenge
only if the submitted nonce hashes to a stored unused challenge with the
same registry, reader, epoch and anchor and whose expiry is still valid.
PostgreSQL row locking ensures competing sessions cannot both consume
one challenge. A read-only `inspect` operation reports
`ISSUED_UNUSED`, `CONSUMED`, `EXPIRED` or `UNKNOWN`.

## Test coverage

- Issued nonces are random 256-bit values; two issuances must differ
- Wrong reader, epoch, anchor or guessed nonce cannot consume a challenge
- Two real PostgreSQL sessions compete to consume the same nonce; only
  the first committed attempt succeeds
- Replay with changed evidence is denied
- A transaction rolled back before commit leaves the challenge available,
  permitting exactly one subsequent successful consumption
- A challenge forced past its expiry must be refused and reported expired
- Final consumption count remains exact, with no side effects from denials

## Security boundaries

This is **not a production nonce issuer or signed-observation verifier**.
The SQL fixture does not verify reader signatures, authenticated caller
identity, independent checkpoint freshness, external monotonic epoch pins
or key revocation. Verification of signed evidence in a separate Node.js
test harness is not a trusted PostgreSQL authorization check. The fixture
does not prevent a privileged database administrator from resetting
consumed rows and does not provide replication consensus or a second
independent authority.

The local challenge issuer returns the nonce to the disposable test
process; real deployment requires protected challenge delivery, secure
reader binding, authenticated fresh storage reads, trusted clocks and
governed single-operation verification plus nonce consumption. No
production write credentials or PALACO MONO data are accessed.

Run only with `CITADEL_EPHEMERAL_CI_ONLY=1`,
`PGHOST=127.0.0.1`, `PGPORT=5432`, `PGDATABASE=postgres`:
`bash modules/samenleving-natuur/reviewer-roster-nonce-issuance-recovery-ci.sh`

New CI outcomes must be checked before claiming test PASS.
**PR #63 remains Draft/HOLD; execution and release DENY.**
No merge or production rollout.
