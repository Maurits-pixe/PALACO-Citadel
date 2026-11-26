# Ephemeral PostgreSQL concurrency and optimistic CAS test

A **two-connection integration test**, executed only inside the disposable
PostgreSQL CI service, using a dedicated `citadel_cas_concurrency_ci` fixture
schema. This is NOT the PALACO Citadel production schema or a real enabled
CAS writer.

Connection A obtains a row lock with `SELECT ... FOR UPDATE`, then holds it.
Connection B demonstrates a real `lock_timeout` while attempting the same
row lock. After A commits its revision, B's stale optimistic
`UPDATE ... WHERE revision/hash/head match` affects exactly zero rows.
A further speculative revision is rolled back, and the unchanged committed
revision is verified.

The test is guarded by `CITADEL_EPHEMERAL_CI_ONLY=1`,
`PGHOST=127.0.0.1`, and `PGDATABASE=postgres`. Those checks prevent
accidental invocation in the usual non-CI environment; they are not a
general-purpose authorization or production isolation mechanism.
The dedicated schema is deleted on exit.

Crucial limits: this does **not** activate writes to the frozen
`citadel_pin_draft` tables, attest reviewer authority, validate a
trusted time source, or test real authorization and audit anchoring.
Any production CAS design requires separate approval and hardening.

CI command:
`CITADEL_EPHEMERAL_CI_ONLY=1 bash modules/samenleving-natuur/registry-pin-cas-concurrency-ci.sh`

PR #63 remains Draft/HOLD.
