# RIO VisitCard verification v0.7 — DRAFT / HOLD

## Deployment boundary

This implementation is a **display-only prototype**. It is not wired into
PALACO ONE, the public RIO site, any authentication system, or issuance.
The status `VERIFIED` never grants access or authorizes an operation.

## Trust inputs

- `GateConfiguration` must come from an authenticated administrative trust
  store, *never* from the scanned credential or a supplied URL.
- Each issuer is bound to exactly one active card public key and one active
  revocation public key at the verification instant. Overlapping active keys
  fail closed. In a deployment, plan a controlled signing rollover rather
  than silently accepting multiple keys.
- The `SnapshotCheckpoint` must be loaded from trusted durable storage.
  `snapshot_checkpoint(snapshot)` only constructs an **untrusted candidate**
  for subsequent atomic persistence and is not itself replay protection.
- `evaluate_visitcard` compares the candidate snapshot with that trusted
  checkpoint and checks signature, timestamps, expiry, audience and revocation.
  It does **not** atomically write or persist the next checkpoint.
- Before any production use, a transactional compare-and-swap store must
  atomically advance the checkpoint and ensure that concurrent verifications
  cannot accept an older snapshot. Until this exists, keep GO-13 HOLD.
- A snapshot older than one hour, an unknown issuer, stale credentials,
  missing trust anchors, or a failed signature must yield `UNKNOWN`.
- Revocation must remain independently auditable; this flat revoked-ID list
  is a prototype, not a scalable registry.

## Tests

`python -m unittest discover -s ambassades/rio/tests -v`

The Ed25519 tests require `cryptography`. If the package is missing, the
crypto-specific test classes may be skipped; check the test runner output.
Do not report skipped crypto tests as passing crypto verification.

## Required before release

1. Independent security review of canonicalization and signature envelopes.
2. Durable atomic checkpoint store, rollback recovery, and race tests.
3. Key lifecycle governance and independently authenticated rotation.
4. Revocation issuer authority, publication cadence and rollback incident plan.
5. Mobile/browser interoperability and privacy threat model.
6. CI execution and documented release authorization. **No automatic merge.**

## v0.8 — Transactional SQLite prototype (Draft / HOLD)

`visitcard_checkpoint_ledger.py` adds a single-SQLite-database
`BEGIN IMMEDIATE` transaction that reads the latest issuer checkpoint,
verifies the signed snapshot against that baseline and only returns a
display status after a successful commit. Update revision and previous
checkpoint fields are checked in the conditional `UPDATE`.

**Bootstrap is strictly out of band.** The administrative
`provision_trusted_checkpoint` inserts an initial checkpoint once; never
derive the first trusted checkpoint from a scanned credential or QR code.
The database contains metadata only, not signed credentials.

**Remaining limitations:** SQLite durability depends on trusted filesystem,
transaction and backup configuration. Restoring an old database snapshot
can still roll back the entire register. Cross-device operation requires
a shared, authenticated authoritative store with monotonic high-water
evidence or an external append-only witness. A timestamp-based checkpoint
also requires trustworthy issuer time and an explicit publication sequence
for stronger anti-replay guarantees. There is no public site integration,
no real issuer enrollment, and no GO-13 authorization.

Ten additional tests are committed but are not considered passing until
executed in CI with `cryptography` installed and skip counts inspected.

## v0.9 — Append-only hash-chained journal (Draft / HOLD)

`visitcard_audit_journal.py` maintains a per-issuer, monotone hash chain of
checkpoint revisions. The ledger's initial administrative provisioning and
subsequent successful checkpoint advances now append corresponding entries
inside their respective SQLite transactions. UPDATE and DELETE triggers reject
ordinary changes to journal rows. Chain inspection also compares the head
against the current checkpoint row.

**IMPORTANT SECURITY LIMIT:** SQL triggers and a hash chain are *not*
tamperproof against a database administrator, a compromised machine, or full
database rollback. `WitnessHead` is a comparison format only; this code has
no external witness transport, authentication, persistence or atomic witness
acknowledgment. The checkpoint transaction currently checks its **local**
chain, not an independently authenticated witness. Do not claim global replay
resistance or set VERIFIED in the public RIO app based on this prototype.

To deploy later, first design an external independently authenticated witness
with sequence, issuer, signed hash and durable confirmation. Verification must
fail closed if the witnessed head cannot be reconciled with the database. A
two-phase recovery protocol is needed for a database commit that succeeds
before witness acknowledgment, or vice versa. Until independent review and
race/recovery testing, GO-13 remains HOLD.

Ten new tests have been added for chain continuity and witness mismatches;
these tests need actual CI execution before any PASS claim.

## v1.0 — Independent signed witness receipt and recovery classification (DRAFT / HOLD)

`visitcard_witness_receipt.py` defines a domain-separated Ed25519 witness
receipt with version, issuer, monotone sequence, journal head hash, UTC observation
time, witness key ID and detached signature. Trust anchors must be pinned out of
band; the credential, QR, URL, or receipt cannot select new trust anchors.

Use `verify_and_reconcile(connection, envelope, trust, expected_issuer=..., now=...)`
as the verification-first interface; do not call `reconcile_witness` with a
caller-fabricated `VerifiedReceipt`. The result is **not** an authentication
or access-control decision. Possible recovery classifications are:
- `UNKNOWN`: missing, malformed, stale, untrusted or invalid receipt/local chain.
- `MATCHED`: local journal head matches a correctly signed witness receipt.
- `LOCAL_AHEAD_PENDING_WITNESS`: the local chain extends the witnessed prefix
  but has not yet received an independently authenticated acknowledgment.
- `LOCAL_BEHIND_ROLLBACK_SUSPECTED`: witness sequence exceeds local sequence.
- `FORK_CONFLICT`: mismatched hash at an allegedly common checkpoint.

This implementation **does not provide a remote witness service** and does not
persist a trusted witness high-water mark. A replayed older but still time-valid
signed receipt can be classified as pending publication unless the caller
independently maintains the highest witnessed sequence; production must never
interpret that state as safe. Durable external monotonicity and independent
authenticated witness communication remain mandatory before release.

A witness that verifies a signature but is controlled by the same database
administrator does not provide independent rollback protection. Add an
audited authority model, authenticated time/sequence publication, challenge
and response, network outage and crash recovery tests, and trusted witness
reconciliation before considering deployment. **GO-13 HOLD.**

## v1.1 — Isolated witness high-water registry (DRAFT / HOLD)

`visitcard_witness_registry.py` is an embeddable transactional witness
registry. For real independence it must execute on a **separately administered
host**, using a database and Ed25519 signing key controlled independently of
the RIO issuer and its checkpoint database.

A publisher submits a domain-separated Ed25519-signed proposal containing
`issuer`, `sequence`, `entry_hash` and `predecessor_hash`. The
witness only accepts proposals authenticated by an out-of-band trusted issuer
public key. It advances exactly one sequence, rejecting gaps, forks and
unexpected predecessors. It signs the receipt and commits the receipt and
high-water mark **in the same SQLite transaction**, allowing an identical
retry to retrieve the original receipt after a lost response.

The registry rejects malformed input, orphan journal entries and corrupted
local head history. The witness can only confirm what its authenticated
publisher submits. It cannot infer that the publisher's full checkpoint
history is correct, or verify independent truth of its revocation claims.

**Not yet delivered:** standalone server or authenticated network channel;
secure key storage and rotation; durable witness receipts pushed back to RIO;
high-water checkpoints mirrored to an independent third system; failover,
disaster recovery and full database-rollback resistance. Compromising both
the issuer and witness would defeat this prototype's independence.

Operational recovery classification from v1.0 remains informational only.
Neither a witness signature nor a MATCHED classification grants authorization.
GO-13 HOLD, no public site integration, no merge or issuance.

## v1.2 — Loopback-only HTTP development adapter (DRAFT / HOLD)

`visitcard_witness_http.py` adds an opt-in HTTP adapter that binds only
`127.0.0.1` and is never automatically started. The administrator must
separately initialize the witness database, pin producer public keys and
provision the witness signing key. Its sole POST endpoint is
`/v1/witness/receipts`, accepting only a bounded JSON document with a
valid issuer-signed proposal. All other actions remain unavailable; no
CORS wildcard, account operations or issuance are exposed.

**This is NOT production-grade network security.** Plain HTTP on loopback
has no mutual TLS, external transport authentication, rate limiting,
cross-process key isolation, durable backup attestation or trusted remote
witness. Never bind to a public interface or use port forwarding.
Run behind independently managed mTLS/ACLs and an HSM or equivalent
signing mechanism only after security review.

CI has been configured to reject skipped regression tests, but results
must be checked before a PASS claim. GO-13 remains HOLD, with no merge,
no PALACO ONE access and no public RIO website update.

## v1.3 — Loopback client and signed acknowledgement (DRAFT / HOLD)

`visitcard_witness_client.py` sends a **single** bounded signed producer
proposal to the loopback-only witness development endpoint. It does not
follow redirects or accept hostnames, external IPs or public URLs. After
a 200 response it cryptographically verifies the independently trusted
witness signature and requires that the receipt match the exact submitted
issuer, sequence and entry hash.

The result is strictly one of:
- `ACKNOWLEDGED`: valid signed receipt of the exact proposed head;
- `REJECTED`: known input/response conflict or invalid signature;
- `PENDING`: timeout, connection failure or ambiguous server response.

A PENDING result is **not** failure of witness persistence: the server may
have committed before the response was lost. Do not automatically issue a
different proposal, advance local trust, grant access or mark proof as
verified. Store the original signed request in protected operational storage
and reconcile against the independent witness's latest signed high-water
receipt before retrying the **same immutable request**. This client itself
does not implement persistent request outbox, reconciliation, TLS/mTLS,
secure external hosting or issuer authorization.

The development-only client uses plain HTTP on 127.0.0.1; it is not an
approved network transport for multiple machines. Security review,
actual test execution, bounded operational retries, independent outbox
storage and privacy review remain required. **GO-13 HOLD**.

## v1.4 — Durable local witness outbox (DRAFT / HOLD)

`visitcard_witness_outbox.py` records an immutable, pre-signed publication
proposal in a separate SQLite outbox before any network attempt. The
`(issuer, sequence)` primary key prevents different proposals from occupying
the same sequence. Repeated enqueue of the exact same signed request is
idempotent; changing it is rejected. DELETE and request mutation are blocked
by database triggers for ordinary SQL writers.

`pending_request` returns only the previously persisted proposal for
explicit, operator-controlled reconciliation. The outbox never sends a
network request itself and never retries automatically. Network failure,
timeout, a 5xx response or an unknown receipt **must remain PENDING** until
reconciliation. `acknowledge` independently verifies the witness Ed25519
signature and exact issuer/sequence/head before atomically persisting the
receipt and changing the state to `ACKNOWLEDGED`. This is an informational
delivery status, NOT cryptographic identity proof or access authorization.

**Limitations:** the outbox currently validates a proposal's envelope format
but cannot assert its producer signature without separately pinned producer
keys. Only a trusted signer/producer pipeline may enqueue requests; the witness
server itself validates the producer signature. The outbox is local SQLite
storage, not a protected cross-machine queue. Neither SQL triggers nor SQLite
alone defend against a malicious database administrator or full database
restore. Actual retry control, remote witness reconciliation, durable
external high-water publication, mTLS, rate limiting and independent
operational review are not delivered.

New outbox tests were committed; they require actual execution and no skips
before claiming PASS. **GO-13 HOLD, no merge or live RIO publication.**

## v1.5 — Operator-approved one-shot recovery (DRAFT / HOLD)

`visitcard_witness_recovery.py` links the v1.4 durable Outbox with the v1.3
loopback witness client. `recover_once` requires explicit
`operator_approved=True`, rejects missing or already malformed Outbox
requests, submits only the exact persisted immutable signed proposal, and
stores an independently verified receipt through `acknowledge`.

A timeout or lost network reply remains `PENDING`, and a server conflict
remains `REJECTED` for explicit investigation while the stored Outbox row
remains unchanged. An already acknowledged row returns `ACKNOWLEDGED`
without sending again. None of these results grant access or confirm a
real-world identity.

**Not built:** a trusted remote witness latest-head query, automatic
resolution of conflicting histories, a cross-process single-flight lock,
authenticated TLS transport, producer signing-key isolation, disaster-recovery
witness persistence, and independently verified operator authentication.
The explicit boolean approval flag is *only a development interlock*, not
strong authorization. Do not use unattended retries or expose publicly.
Ten additional integration-test cases cover restart, conflicts, deliberate
manual recovery, pending connections and duplicate requests. Tests have
not been verified as PASS until CI actually executes. **GO-13 HOLD**.

## v1.6 — Persistent single-flight recovery gate (DRAFT / HOLD)

`visitcard_recovery_claims.py` adds an operator-triggered, durable
single-flight claim for each `(issuer, sequence)` pair. Only a PENDING
Outbox request can be claimed. The claim's random token is hashed before
database persistence; a second claimant is rejected rather than sending
concurrently. The existing `recover_once` path must obtain the claim before
network I/O and releases its own claim after normal completion.

A crash can leave the claim persisted, deliberately blocking further
retries. There is **no automatic timeout, stealing, or background unlock**.
A future authenticated, audited recovery procedure must reconcile the
witness's independently signed latest head *before* any stuck claim can
be manually cleared. The current interface has no such administrative
unlock operation. SQL custody is not administrative authentication.

**Scope:** this phase implements concurrency exclusion and crash-safe
blocking only. It does **not** implement a remote latest-head challenge
endpoint, trusted high-water reconciliation, TLS/mTLS or release approval.
Do not infer that signed receipts or the recovery lock provide identity
or execution authority. GO-13 HOLD, no merge, no public-site update.

## v1.7 — Signed challenge-response current head (DRAFT / HOLD)

`visitcard_witness_head.py` signs the latest audited witness head using a
**separate Ed25519 domain** and a new 256-bit random challenge per request.
The signed response binds issuer, sequence, journal head hash, challenge,
witness ID and UTC observation time. The verifier rejects invalid
signatures, wrong issuer/challenge, unknown witness keys, future timestamps,
or attestations older than 60 seconds.

`visitcard_witness_http.py` now exposes a local-only JSON
`POST /v1/witness/head` endpoint with a 512-byte request limit. The
`visitcard_witness_head_client.py` client accepts only localhost traffic
and verifies every response using independently configured trust anchors.
Its purely informational comparison returns ALREADY_WITNESSED,
NEXT_PUBLICATION, CONFLICT or UNKNOWN.

**Recovery gating not yet activated:** v1.5 `recover_once` still has no
mandatory latest-head preflight. Introducing mandatory preflight requires
a trusted genesis/bootstrap procedure for the initially empty witness and
safe reconciliation of a head confirmed at the same sequence; those are
not implemented. An existing v1.6 single-flight claim also lacks a
cryptographically authenticated release ceremony.

This challenge proves **response freshness from the selected signing
key**, not integrity of the witness's underlying storage against a
privileged attacker. Independent deployment, time synchronization,
authoritative high-water anchoring, mTLS, audited key storage, negative
network tests, test execution and security review remain necessary.
Never treat a signed head or ACKNOWLEDGED as identity authority.
**GO-13 HOLD; no merge or public site publication.**
