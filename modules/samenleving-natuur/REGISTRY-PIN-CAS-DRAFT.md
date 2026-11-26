# Registry pin transactional storage contract — DRAFT / HOLD

`registry-pin-cas-draft.sql` is an intentionally **inert DDL proposal**,
not a deployed migration. It defines a private schema for current pins and
append-only pin history. It enables FORCE RLS, revokes PUBLIC access,
and defines UPDATE/DELETE/TRUNCATE rejection triggers for the history table.
It also rejects INSERT, UPDATE, DELETE and TRUNCATE on the current pin-state
record. Direct INSERT into the audit history is likewise denied while HOLD is
active: append-only semantics alone do not authenticate who may append.
The entire draft data surface stays frozen until a separately reviewed
activation explicitly replaces these barriers. The SQL functions use paired
PL/pgSQL dollarquote delimiters, checked by static regression tests.

The only example CAS function **unconditionally raises an exception**.
No transaction actually updates a pin. No roles are granted and no code
has been run against PALACO MONO or any external database. The SQL is
not in the repository's migrations folder.

## Before considering a real CAS function

An actual service would require a single serializable transaction or a
row lock (`SELECT ... FOR UPDATE`) on the current registry key, exact
compare of expected revision + registry hash + head hash, verified
authorization and two authenticated independent reviewers, current signed
revocation state, and append+head update in the **same transaction**.

Post-commit audit protection must also address privileged DB owners,
superuser bypass, backups, immutable audit export, and externally anchored
ledger-head checkpoints. FORCE RLS alone does not protect against
database-owner/superuser privilege bypass.

The static contract test checks the draft for crucial DENY defaults.
It is **not** a PostgreSQL execution or security penetration test:

`node --test modules/samenleving-natuur/registry-pin-cas-draft.test.mjs`

PR #63 stays Draft/HOLD; no merge, DB migration or release.
