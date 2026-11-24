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

## v1.8 — Mandatory head preflight in the NEW recovery entrypoint (DRAFT / HOLD)

`visitcard_witness_recovery_v18.py` introduces `recover_once_verified`.
Unlike the older v1.5 recovery function, this v1.8 entrypoint **requires**
a fresh, challenge-bound and independently signed witness head before any
publication attempt. It obtains the v1.6 durable exclusive claim first,
then compares the head against the exact immutable outbox proposal.

- A missing, stale or invalid head stays `PENDING`; no request is sent.
- A fork, skipped sequence or wrong predecessor yields `CONFLICT` and
  leaves the outbox pending for manual investigation.
- The next sequential proposal may be sent exactly once; a proposal
  already present with matching head may be sent again to retrieve its
  previously issued receipt.
- A valid signed receipt must still be persisted in the outbox before
  returning `ACKNOWLEDGED`.
- Requests for sequence 1 (genesis) are **never** handled by normal recovery.
  Bootstrap requires a separate, authenticated enrollment ceremony.

**Important rollout boundary:** the preexisting `recover_once` from
v1.5 remains in the DRAFT tree for legacy tests and is NOT replaced by
this new strict entrypoint. No external caller may consider the older
routine production-safe. Integration migration, elimination of the
legacy bypass, secure genesis enrollment and authenticated operator
approval remain release blockers. Also, the preflight query and receipt
publication are not a single atomic witness transaction, although the
witness server independently checks sequence and predecessor.

Twelve additional v1.8 loopback tests have been added and await
actual execution. This is **not** public or deployed. **GO-13 HOLD**.

## v1.9 — Legacy recovery retirement and enrollment evidence (DRAFT / HOLD)

The previous `visitcard_witness_recovery.recover_once` compatibility
entrypoint now delegates **exclusively** to
`visitcard_witness_recovery_v18.recover_once_verified`.
The insecure pre-v1.8 path that published without mandatory fresh signed-head
preflight is removed. Existing integrations still need an audited migration;
the compatibility facade does not enable genesis recovery, public access,
or implicit trust. Old tests were updated to verify the mandatory delegation.

`visitcard_witness_enrollment.py` implements an **evidence-only** admission
envelope: issuer and witness ID, candidate Ed25519 public key, 256-bit nonce,
UTC issue and expiry times, and domain-separated approvals from both an
out-of-band pinned administrative authority and the candidate key owner.
The acceptance window is no longer than 15 minutes. Tampering, missing
signatures, unknown approval authorities or incorrect issuer fail closed.

**There is no automatic key registration.** Evidence validation does not
add a witness to trusted keys, issue sequence 1, grant privileges or update
a live registry. A trusted enrollment authority must implement human-led
review, durable nonce-replay prevention, dual control, key rotation and
independent audit logging before issuing an enrollment decision. Candidate
proof of possession alone is not authority to enroll.

No merge, no production transport and no public RIO site changes.
**GO-13 HOLD.** CI and dynamic Python tests must be executed and reviewed
before any security acceptance claim.

## v2.0 — Evidence-only admission ledger and nonce replay protection (DRAFT / HOLD)

`visitcard_witness_admission.py` stores validated dual-signed v1.9
witness enrollment evidence under a unique `(issuer, nonce)` key, and
rejects all replayed nonces, even for an identical signed request.
A partial unique index also prevents simultaneous pending/reviewed
applications for the same `(issuer, witness_id)`.

Admission starts as `PENDING`. A separately signed reviewer decision
(`REVIEWED` or `REJECTED`) uses the distinct
`PALACO-RIO-WITNESS-REVIEW-V1` domain and binds to the exact enrollment
envelope SHA-256, issuer, nonce and reviewer ID. The intake authority ID
cannot be the same as the reviewer ID. A second review of a final entry
is rejected. Each transaction also appends an audit event; normal SQL
UPDATE and DELETE of audit events are blocked by triggers.

**CRITICAL:** `REVIEWED` is an administrative evidence classification,
NOT approval, not an active trust anchor and not issuance. No key is
ever inserted into `WitnessTrust`, and no genesis sequence is created.
Reviewers are supplied by externally pinned key configuration, but this
draft does not prove independent organizations or prevent the same
underlying key from being registered under multiple IDs. Production
requires independently administered review authority, immutable
external audit anchoring, signed admission decisions with explicit
authorization governance, reconciliation after database restore,
key lifecycle processes and operator authentication. These local
SQLite triggers cannot resist a privileged administrator.

Fifteen new test cases cover nonce replay, evidence validation, review
signatures, duplicate applications and audit consistency. Actual CI
execution is required before claiming any test PASS. **GO-13 HOLD**,
no merge, no production enrollment and no public RIO deployment.

## v2.1 — Signed admission decision audit anchor (DRAFT / HOLD)

`visitcard_admission_anchor.py` constructs a canonical SHA-256 snapshot
of the admission record and all associated local append-only events,
including database event order and reviewer signature metadata. An
independently pinned Ed25519 anchor key signs this digest and binds
issuer, nonce, event count, observation time and anchor key ID under a
domain-separated signature. `verify_admission_anchor` rejects unknown
keys, forgery, different issuer/nonce, future attestations and signatures
older than five minutes. `matches_admission_anchor` detects local
admission-history divergence relative to that verified snapshot.

**Important:** Producing an anchor signature is NOT independent off-site
anchoring. No remote anchor service, append-only external custody,
cross-server high-water mark, secure delivery, acknowledgement, HSM or
backup rollback defense is provided. The verifier must receive the
anchor from a separate authenticated trust channel; do not manufacture
"trusted" reference anchors from the same compromised database.

A `REVIEWED` admission is still only evidence of completed review.
Neither `REVIEWED`, the signed audit anchor nor a matching digest
enables a witness key, adds a trust anchor, issues a first checkpoint or
grants access. Actual activation requires a separately authenticated,
audited and explicitly approved governance operation, not implemented.

Thirteen new tests cover signature failures, stale anchors, wrong
identifiers, missing records, and local history changes. No test PASS
is claimed without execution and skip-count review. **GO-13 HOLD**;
no merge, public-site update or production deployment.

## v2.2 — Separately provisioned anchor custody prototype (DRAFT / HOLD)

`visitcard_anchor_custody.py` introduces an **embeddable independent-custody
ledger**, intended to run with its own database, separately provisioned
signing key and independently pinned audit-anchor producer keys. Its
`archive_anchor` first verifies the v2.1 producer-signed envelope and
validity window. Under `BEGIN IMMEDIATE` it persists a per-(issuer,nonce)
monotone event count (1 to 2), retains both committed historical states
and signs a domain-separated custody receipt before committing. The caller
gets the receipt only after successful commit. An identical retry returns
the original persisted receipt, while same-count forks, skipped genesis
and lower-count rollback attempts fail closed.

`verify_custody_receipt` checks the independently pinned custody signer,
the exact issuer, nonce, event count and SHA-256 digest, and signature
integrity. The receipt is **acknowledgment of custody storage only**.
No admission, key activation or identity authorization is implied.

**Important limitations:** this is a local SQLite library; NO external
server was hosted, NO mTLS communication was established and NO external
receipt was obtained. SQLite triggers are not sufficient against a
privileged storage administrator or complete database restore. The
1-to-2 transition preserves the predecessor receipt, but DOES NOT
cryptographically prove event-history inclusion across both snapshots;
that requires independent inclusion proofs or a separate hash-chain
contract before operational acceptance. A caller must independently
protect and retain the highest signed custody receipt outside the
custody database to detect whole-database rollback. The custody receipt
verifier checks the signed content and binding but does not itself
establish receipt freshness or a trusted high-water timeline.

Fifteen new tests are committed for persistence, idempotence, forks,
rollback, trust isolation and signature rejection. They require actual
execution before declaring PASS. No release, no merge and no public
site update. **GO-13 HOLD**.

## v2.3 — Admission audit-prefix continuity gate (DRAFT / HOLD)

`visitcard_admission_continuity.py` defines a full two-event continuity
proof consisting of the final admission row and ordered `SUBMITTED` and
`REVIEWED`/`REJECTED` events, with matching identifiers and metadata.
The custody operator independently reconstructs the prior `PENDING`
snapshot from the first event and derives its exact canonical SHA-256
digest; it also derives the final digest from the two-event snapshot.
Both computed hashes must match the **previously signed and stored**
custody head and the new producer-signed audit anchor.

In v2.3 the existing `archive_anchor` transaction now **rejects a
1→2 transition without a matching continuity proof**. Same-version
idempotent retries remain unchanged, while same-count forks, skipped
initial stages and downgraded heads continue to fail closed. The proof
is validated before inserting the new event history and signed receipt.

The new helper `build_continuity_proof` exports the full event snapshot
only after checking local source-table consistency. Do not publish this
snapshot as a public endpoint: it includes audit metadata and candidate
witness identifiers.

**Security boundary:** this demonstrates *hash continuity of the two
submitted snapshots*. It does not independently verify that an intake
or review was legitimate, or that a remote custody server is honest.
Existing custody data still lacks an independently published high-water
checkpoint resistant to an administrator restoring the entire database.
True external hosting, authenticated transport, durable off-site copies,
separately protected highest-receipt state, replay resistance and cryptographic
review of the entire admission contract remain required. Neither a
continuity proof nor a custody receipt activates a key or grants access.

The v2.2 test suite now contains 19 tests (four added negative cases,
plus revisions to expected successful transitions). Test cases are committed
but are not PASS until executed without skips. **GO-13 HOLD** — no merge,
no live deployment, no modification of the public RIO site.

## v2.4 — Separately retained signed high-water ledger (DRAFT / HOLD)

`visitcard_anchor_highwater.py` provides a **separate SQLite ledger**
for retaining the highest custody-signed admission snapshot. It MUST be
provisioned in separately administered storage from the custody database,
with independently pinned custody public keys. Each incoming receipt is
verified cryptographically before a monotone update is committed. The
ledger retains signed receipts for both phases, requires count 1 before
count 2, rejects stale/forked receipts, and returns identical retries
without producing a second historical entry. All saved signatures and
history continuity are checked before further advancement.

`compare_restored_custody(custody_db, highwater_db, issuer, nonce, keys)`
compares the current custody head against the independently retained
signed high-water. It returns one of:
`MATCHED`, `CUSTODY_BEHIND`, `CUSTODY_AHEAD_UNCONFIRMED`,
`FORK_CONFLICT`, or `UNKNOWN`. Missing or forged trust evidence
always results in `UNKNOWN`, never in approval.

**Security boundary:** This is a reusable storage component, not a
deployed independent host or cloud service. An attacker able to restore
both databases to an earlier consistent state will evade this local
comparison. For genuine cross-machine rollback resistance the highest
receipt must be exported to independently controlled append-only
custody, ideally with a third-party time/sequence witness and verified
recovery procedure. SQLite triggers are not protection against a
privileged storage administrator. A high-water count-2 receipt is
authenticated but this module does not independently revalidate its
v2.3 source-prefix proof. No trust-anchor activation, identity validation
or operation authorization exists in this module.

Seventeen regression tests have been added, covering separate databases,
lost custody history, stale and forged signed receipts, duplicate writes
and history tampering. They are not claimed PASS until executed. No merge,
no public-site update, no deployment. **GO-13 HOLD**.

## v2.5 — Third-party signed checkpoint protocol (DRAFT / HOLD)

`visitcard_checkpoint_witness.py` defines a **separately deployable**
third-witness ledger intended to run on a different independently managed
host and SQLite database from both custody and the high-water register.
Only a valid custody-signed receipt is accepted. Each commit stores its
SHA-256 digest and the exact claimed event count/hash in an append-only
historical table, updates the high-water head transactionally, and returns
a domain-separated Ed25519 checkpoint signed by the third witness. The
receipt is returned only after the database commit; identical resubmissions
receive the exact previously signed checkpoint. Stale, skipped, conflicting
or forged receipts are rejected. Client verification requires an
independently pinned third-witness key.

`compare_checkpoint` compares a separately supplied, correctly signed
third-witness checkpoint against the local high-water record and reports
`MATCHED`, `BEHIND`, `AHEAD_UNCONFIRMED`, `FORK` or `UNKNOWN`.
It can demonstrate a local rollback **only if** the trusted third-party
checkpoint has been retained outside the restored storage.

**No external service has actually been deployed or contacted**. This
repository contains an embeddable protocol and regression tests, not a
hosted independent verification service. SQLite administrator compromise,
restoring all three stores together, lost/withheld latest checkpoints and
key compromise remain open risks. The comparison helper alone does not
authenticate the local high-water history; callers also need
`audit_highwater` with independently pinned custody keys. The third
witness does not independently prove source-prefix continuity and depends
on the custody service's v2.3 enforcement. Real deployment requires
separately managed credentials, authenticated TLS, independently anchored
monotone receipt retention, failure/recovery drills, and security review.

Sixteen regression tests have been added; they have not been confirmed
PASS until a real Python test run and no-skip review. No merge, no
deployment, no automatic key activation. **GO-13 HOLD**.

## v2.6 — Full third-witness history audit and external-head reconciliation (DRAFT / HOLD)

`visitcard_checkpoint_witness.audit_checkpoint_history` validates every
retained checkpoint in strictly contiguous event-count order, verifies each
domain-separated Ed25519 witness signature against **independently pinned**
witness public keys, and requires exact equality between the retained
history tip and the witness's current head. It is now called before a
previously populated witness database can accept any idempotent retry or
new checkpoint. Missing, forged or diverging history fails closed.

`compare_checkpoint_history` compares that fully checked local history
to a **separately supplied signed reference checkpoint**. It reports
`MATCHED`, `BEHIND`, `AHEAD_UNCONFIRMED`, `FORK` or `UNKNOWN`.
An old, internally consistent database can be detected as `BEHIND` only
when the reference was retained independently of that restored database.

**Non-goals:** no remotely hosted witness, external delivery or secure
checkpoint-archive service is implemented here. A compromised witness
private key may enable signing divergent histories; local SQLite triggers
do not resist administrators or full disk restore. If both the witness DB
and its reference checkpoint are rolled back together, this comparison
cannot detect the rollback. The v2.5 `compare_checkpoint` helper remains
a narrower high-water comparison and is not a replacement for full
historical audit. A production consumer must insist on separately
administered custody, trusted highest-head retention, authenticated
transport, key-isolation and replay/rollback recovery drills.

Eight additional regression tests cover tampering, removed history,
wrong trust anchors and independently supplied future/forked checkpoints.
No test should be called PASS without actual execution and skip review.
No authorization, trust-key activation, merge or deployment.
**GO-13 HOLD.**

## v2.7 — Signed archive of third-witness checkpoints (DRAFT / HOLD)

`visitcard_checkpoint_archive.py` adds a **separately provisionable**
SQLite archive for third-witness checkpoints. Every archived checkpoint
must pass verification under independently pinned witness public keys.
An archive-signing key distinct from the witness key signs a
`PALACO-RIO-ARCHIVE-SEAL-V1` envelope binding issuer, nonce, event count,
checkpoint SHA-256 and the SHA-256 hash of the preceding archive seal.
The initial seal uses an explicit zero predecessor; further seals must
extend the prior stored tip monotonically. An identical retry returns
the exact persisted seal without creating another entry.

`audit_archive` traverses the full stored history, verifies the original
witness signatures and archive signatures, checks predecessor links and
ensures the archived tip agrees with the head table. The
`compare_restored_witness` routine compares an archive verified this way
against a locally restored witness head and classifies
`MATCHED`, `RESTORED_BEHIND`, `LOCAL_AHEAD_UNCONFIRMED`, `FORK`, or
`UNKNOWN`. Neither a seal nor matching archive history is an authority
to issue identity material, register keys or grant access.

**Security limits:** This is an embeddable component, NOT an actually
deployed independently administered third-party service. Only separate
database connections are enforced in code; physical storage isolation,
different administrators, hardware key storage, authenticated network
transport, durable backups and independent/public high-water publication
remain unimplemented. Complete coordinated rollback of all databases
and copies of the archive is not detectable without a separately retained
trusted later checkpoint. The archive confirms consistency of signatures
and checkpoint sequencing, not independent correctness of the initial
admission or source-event prefix. Review and deployment authorization
remain outstanding.

Sixteen new archive regression tests have been added. They are not
claimed PASS without actual execution and skip checks. No merge or
public PALACO RIO change. **GO-13 HOLD**.

## v2.8 — Archive publication custody and independently pinned receipts (DRAFT / HOLD)

`visitcard_archive_publication.py` provides a separately provisionable
publication-custodian ledger and a domain-separated Ed25519 receipt contract.
It validates each archive seal against **independently pinned archive keys**,
commits a monotone per-(issuer,nonce) seal sequence to an append-only
historical table, and signs a receipt binding the issuer, nonce, event
count, exact archive seal SHA-256 and predecessor seal SHA-256. The new
receipt is returned only after the storage transaction commits.

Identical submissions return the **exact previously committed receipt**;
missing genesis, forks, wrong predecessors, skipped or stale sequence,
bad signatures and inconsistent history fail closed.
`audit_publication` independently verifies each stored archive signature,
publisher signature, predecessor link, canonical JSON record and head row.
`verify_publication_receipt` accepts only pinned publication-custodian
keys, never keys supplied inside the receipt.

**IMPORTANT:** This is a local storage/verification protocol only. No
remote publication endpoint, independent cloud archive, TLS/mTLS transport,
third-party proof of receipt, public broadcast or off-site backup has
been provisioned. A locally signed publication receipt is evidence of
this module's transaction, NOT proof that a genuinely independent third
party retained the bytes. Administrator access, compromised signing keys,
or a coordinated rollback of the publisher and all retained checkpoints
can defeat local rollback checks. Real independence requires an external
administrative/security boundary plus a separately protected highest
signed receipt. The seal and publication receipt do not grant authority,
register witness keys, or issue identities.

Sixteen new regression tests were committed for signed publication,
duplicate handling, forks, broken history and forged signatures.
A real Python test run with skip-count inspection and deployment/security
review remains mandatory before any release claim. **GO-13 HOLD**.

## v2.9 — Fail-closed publication reconciliation gate (DRAFT / HOLD)

`visitcard_publication_recovery_gate.py` introduces read-only assessment
of a **separately delivered, cryptographically signed** v2.8 publication
receipt against the current locally audited v2.7 archive. It verifies
the receipt with externally pinned publisher keys; validates every
locally archived checkpoint and seal using independently pinned
witness/archive keys; then compares the exact seal SHA-256,
per-(issuer,nonce) count and signed predecessor hash.

The outcome is one of:
- `MATCHED_INFORMATIONAL`: signatures and current local archive match.
- `LOCAL_BEHIND_BLOCKED`: independent receipt proves a higher count.
- `LOCAL_AHEAD_UNCONFIRMED`: local archive is newer than the receipt.
- `FORK_BLOCKED`: same count conflicts with the signed publication.
- `UNKNOWN_BLOCKED`: missing, malformed, untrusted or internally
  inconsistent evidence, or a running local transaction.

**All classifications are non-authorizing.**
`recovery_permitted` deliberately returns `False` for every value.
Even `MATCHED_INFORMATIONAL` does NOT authorize replay, recovery,
merging, issuing, new trust anchors or identity/access privileges.

**Trust assumptions:** The caller MUST acquire the latest published
receipt from a separately administered authenticated source, then keep
the reference beyond possible local rollback. The library does not
fetch or publish externally, guarantee receipt freshness, pin the
latest global high-water, prove third-party custody, or block coordinated
rollback of all storage. A valid old receipt can match an old database,
so it is NOT a release gate. Cryptographic verification and local audit
are necessary but insufficient for production recovery.

Fifteen new tests cover valid informational match, forged signatures,
wrong trust keys, rollback/fork classification, broken history, and
the permanent non-authorization policy. Python test execution and
skip-count review are still required. No merge, deployment, public
RIO site update, or key activation. **GO-13 HOLD**.

## v3.0 — Fresh signed publication high-water challenge protocol (DRAFT / HOLD)

`visitcard_fresh_publication_head.py` defines an independently provisionable
high-water registry that accepts only pinned-publisher-key-verified v2.8
publication receipts. A local SQLite transaction retains the exact signed
receipt and monotone (issuer,nonce) head. The historical audit checks
signatures, continuous counts, canonical receipts, the explicit zero
genesis predecessor and the exact predecessor seal hash at stage 2.
Replayed identical receipts are idempotent; stale/forked heads fail closed.

A verifier produces an unpredictable 256-bit challenge via `challenge()`
and sends it to a separately administered fresh-head signer. That signer
runs `attest_fresh_head` only after local history audit and returns a
domain-separated Ed25519 signed head containing issuer, nonce, count,
seal hash, challenge, and UTC observation time. The client verifies exact
challenge binding, an independently pinned signer key, and a timestamp
between now and 60 seconds old. A stale replay for a different challenge
or incorrect clock fails closed. Clock synchronization is essential.

`classify_fresh_recovery` compares an independently verified fresh head
with the local archive count and hash. Its five statuses are informational
only: `MATCHED_INFORMATIONAL`, `LOCAL_BEHIND_BLOCKED`,
`LOCAL_AHEAD_UNCONFIRMED`, `FORK_BLOCKED`, and `UNKNOWN_BLOCKED`.
`execution_permitted` always returns False. No code path activates
keys, grants access, issues identities, or authorizes recovery.

**Key limitation:** This code does NOT host a separate trusted server,
implement mutual TLS, perform a remote challenge, secure signer hardware,
provide trusted time, or prove operator independence. Freshness of the
signature does not prove freshness of the underlying register if its
administrator or signer is compromised or the whole register is rolled
back. Production additionally requires trusted latest-head publication,
cross-checks from independent witnesses, robust root-key lifecycle,
authenticated transport and rollback recovery procedures.

Twenty-five new regression tests were committed (not yet executed).
Actual Python test runs with skipped-test counts and independent security
review are mandatory before any deployment. **GO-13 HOLD**.

## v3.1 — Integrated read-only verifier and draft CI verification gate (DRAFT / HOLD)

`visitcard_integrated_verification.py` now reconciles the independently
supplied, pinned-publisher-signed archive receipt with a separate
challenge-bound, recent, pinned-signer Ed25519 fresh-head response and
the locally audited complete witness/archive history. The receipt signature
is checked **before** reporting a cryptographic fork; invalid
publication signatures fail as `UNKNOWN_BLOCKED`. Signer and receipt
must agree on the *exact* (issuer, nonce, event_count, seal SHA-256),
and the fresh signer must have answered the verifier's expected
random 256-bit challenge within the 60-second freshness window.

Results are `MATCHED_INFORMATIONAL`, `LOCAL_BEHIND_BLOCKED`,
`LOCAL_AHEAD_UNCONFIRMED`, `FORK_BLOCKED`, or
`UNKNOWN_BLOCKED`. This gate is **read-only and entirely
non-authorizing**: `execution_permitted` always returns `False`,
even on a matching signed and fresh head.

Fifteen integration regression tests exercise real signatures across
custody → third witness → archive → publication → fresh head, including
wrong trust roots, expired and replayed challenges, open DB transactions,
tampered local history, an old independent receipt, and unsigned forgeries.
The new `.github/workflows/rio-visitcard-draft-verification.yml` is
restricted to this draft branch and RIO paths, uses read-only GitHub token
permissions, and runs the entire `ambassades/rio/tests` unittest discovery
suite with mandatory **zero skips**. It includes **no deployment**.

**Verification honesty:** A committed workflow configuration is not
evidence that GitHub Actions executed it. The full-suite result
(PASS/FAIL/skips) must be confirmed from an actual run and its logs
before any release gate can be cleared. The module does not create a
real independent witness, transport, trusted clock, or pre-pinned
production key store. Real operational independence and authenticated
freshness delivery still require third-party infrastructure and
independent review. **GO-13 HOLD.**

## v3.2 — Dual fresh-head witness agreement (DRAFT / GO-13 HOLD)

`visitcard_dual_witness_verification.py` requires **two separately pinned
Ed25519 public keys** and **two different verifier-generated 256-bit challenges**.
Each signed response must be independently verified for signature, audience,
challenge and <=60-second UTC age, and both must agree on exactly the same
publication head (issuer,nonce,event_count,seal SHA-256). Matching results
are further checked by the v3.1 archive/publication/full-history verifier.

The gate rejects using the same public-key bytes under two labels, the same
signer ID, a reused challenge, forged/expired responses, a missing witness
or uncertain advancement. Same-count, differently signed hashes are classified
as `FORK_BLOCKED`; divergent counts become `UNKNOWN_BLOCKED`, never a
verified match. All outputs remain informational and
`execution_permitted` remains unconditionally false.

**Important boundary:** distinct keys, signer labels and challenges do
NOT establish independent operators, machines, network routes, trust-root
custody or time sources. Both signing keys could still be administered by
one compromised operator. Deployed services need independently attested
key provisioning and physical/administrative isolation, plus receipt
retention and full cross-service recovery drills. This code never
authorizes recovery, identity issuance, witness enrollment or key
activation.

Fourteen negative/positive dual-witness integration tests were added to the
existing zero-skip RIO VisitCard GitHub Actions suite. Their PASS status
must be read from the workflow run, not inferred from source inspection.
**GO-13 HOLD** — no merge and no deployment.

## v3.3 — Signed governance and custody-domain claims (DRAFT / HOLD)

`visitcard_governance_attestation.py` verifies a bounded, signed
administrative claim per fresh-head signer. Each claim is signed by a
separately pinned Ed25519 administrative authority and binds the exact
SHA-256 of that signer's public key, issuer, signer ID, operator ID,
custody-domain claim, failure-domain claim and a validity window of at
most one day. Signature and timestamp verification fail closed.

The new `verify_governed_dual_witness_chain` entrypoint performs
governance verification **before** the existing v3.2 dual-signature
freshness and publication-history check. It rejects the same physical
administrator key under different labels, identical administrator IDs,
shared operator IDs, shared key-custody or claimed failure domains,
expired/malformed claims, and a mismatched signer-key fingerprint.
Two separate prior-pinned administrator public keys are mandatory.

**Security boundary:** Signed statements are evidence of who signed
claims, NOT proof the administrators, hosts, HSMs or physical failure
domains are actually distinct. The IDs and domains are independently
unverified declarations; independent human security audit, trusted
registration of operator identities, external hardware attestation and
administrative segregation remain release prerequisites. No governance
evidence automatically installs trust roots, allows enrollment, grants
access, or authorizes key activation/recovery.

Fifteen new tests cover successful matching plus forged, stale and
overlapping governance claims. GitHub Actions must execute them with
zero skips before calling this build PASS. **GO-13 HOLD.**

## v3.4 — Signed governance lifecycle / rotation / revocation audit (DRAFT / HOLD)

`visitcard_governance_ledger.py` provides a separately provisionable,
SQLite-based governance audit register with signed and append-only
`REGISTER`, `ROTATE` and terminal `REVOKE` events. Each record
is verified against independently pinned governance root public keys,
binds issuer, signer ID, exact key fingerprint, the prior key fingerprint,
its sequence number and previous signed-event hash. The complete event
history is replayed before each update or key-current check, and the
derived state must match the latest stored head. Invalid genesis, broken
hash links, skipped sequence, unknown root, stale rotation and
post-revocation attempts fail closed.

A new **opt-in v3.4 entrypoint**,
`verify_lifecycle_governed_chain`, checks both fresh-head signer
keys against the current, non-revoked lifecycle ledger state *before*
the existing v3.3 governance and dual-witness verification.
Existing v3.2/v3.3 entrypoints are retained as legacy prototype APIs,
not silently claimed to enforce v3.4 lifecycle restrictions.

**Security boundary:** signed governance commands and SQLite history
do not physically install keys, perform authenticated administrator
ceremonies, independently verify organizational identity, or resist
privileged full-database rollback. An independent high-water checkpoint,
key-isolation controls, dual-controlled lifecycle signing ceremonies,
external physical/operator audit and key-rotation procedures remain
required for any production admission. The registry itself cannot
activate credentials or grant authority. A REVOKE is terminal for the
signer ID; a new identity must follow a separately governed process.

Nineteen new declared regression tests plus inherited fixture tests
were added to the zero-skip workflow. Actual CI PASS/FAIL must be
verified from the job logs. No merge, deploy or activation.
**GO-13 HOLD**.

## v3.5 — Extern te bewaren governance high-water (DRAFT / GO-13 HOLD)

`visitcard_governance_highwater.py` levert een **afzonderlijk te beheren**
high-water-protocol voor governance-intrekkingen en sleutelrotaties. Het
checkpoint wordt pas na volledige verificatie van de ondertekende
lifecycle-geschiedenis geproduceerd, en bevat de exacte volgnummerstand,
sleutelvingerafdruk, revocatievlag en hash van het laatste event. Een
afzonderlijke Ed25519-custodiansleutel ondertekent het resultaat met
domeinscheiding; history en head worden atomair in een tweede
SQLite-verbinding vastgelegd. Alle historische checkpoints en de
head-consistentie worden gecontroleerd vóór een nieuwe bevestiging.
Oude, gemanipuleerde of ontbrekende bewijsstukken blokkeren nieuwe
bevestigingen.

`compare_restored_governance` vergelijkt een hersteld en volledig
geauditeerd lokaal governance-register met een **apart ontvangen**
checkpoint dat is geverifieerd met een onafhankelijk vastgepinde
custodian-publieke sleutel. Een lokaal register dat achterloopt op
een extern vastgelegde intrekking resulteert in
`REVOKED_ROLLBACK_BLOCKED`. Verder worden MATCHED_INFORMATIONAL,
LOCAL_BEHIND_BLOCKED, LOCAL_AHEAD_UNCONFIRMED, FORK_BLOCKED en
UNKNOWN_BLOCKED onderscheiden. De functie `execution_permitted`
blijft altijd False.

**Vertrouwensgrenzen:** dit is nog geen daadwerkelijk extern
gehoste dienst en SQLite-triggers verhinderen geen volledige rollback
door een geprivilegieerde beheerder. De externe checkpointdatabase,
de privésleutel en vooral het laatst bevestigde checkpoint moeten
echt onder onafhankelijk beheer staan om rollback te kunnen herkennen.
Een ondertekend oud checkpoint bewijst niet dat het wereldwijd de
nieuwste stand is. De bestaande v3.4-entrypoint krijgt niet
automatisch deze v3.5-controle; integratie in een productiepoort
vereist eerst onafhankelijk getoetste opslag, authenticatie en
herstelprocedures. Er worden geen sleutels geactiveerd of bevoegdheden
toegekend.

Veertien nieuwe regressietests toetsen onder meer een teruggezette
intrekking, rotatie, vervalsing, ontbrekend historisch record en
niet-autoriseren. CI-log en skipaantallen zijn beslissend.
**GO-13 HOLD**: geen merge of uitrol.

## v3.6 — Full fail-closed dual governance high-water integration (DRAFT / HOLD)

`visitcard_highwater_governed_gate.py` supplies an **explicit new
read-only entrypoint** `verify_highwater_governed_chain`. It requires
THREE distinct SQLite connections for the local archive, lifecycle
ledger and independently provisioned custodian history. It also
requires an externally supplied, independently retained, signed
governance checkpoint for **each** of the two current fresh-head
signers. Both custodians must have separately pinned, distinct
Ed25519 public keys and signer identities.

Before invoking v3.4's full lifecycle/governance/freshness/receipt/archive
gate, the new entrypoint authenticates both custodian checkpoints,
audits each custodian's complete signed history, requires each supplied
checkpoint to equal the current stored custodian high-water tip,
compares each against the fully replayed local lifecycle event log,
rejects any revoked/rotated/stale fingerprint, and refuses any
insufficiently evidenced result. Even a fully matching pair of
high-water records remains `MATCHED_INFORMATIONAL`, never an
authorization. `execution_permitted` always returns False.

Sixteen new v3.6 regression tests cover success, fake signatures,
missing checkpoints, reused custodian keys, missing history,
stale remotely delivered checkpoints, revoked signer keys,
old database restore after revocation/rotation, transaction state,
and shared-storage aliases. Verification cannot prove operational
independence of operators or storage just by checking different
handles and keys. In particular, a coordinated rollback of the
local and custodian databases **and** every externally retained
checkpoint remains undetectable. Trusted external most-recent-head
distribution, key isolation, authenticated transport and release
review are not implemented; the legacy entrypoints remain available
and must not be described as enforcing this new requirement.

No merge, production deploy, key activation or access issuance.
**GO-13 HOLD.**

## v3.7 — Single full-chain entrypoint for new RIO consumers (DRAFT / HOLD)

The module **visitcard_verification_entrypoint.py** provides the sole
supported **new-consumer** read-only verifier, **verify_visitcard**.
Its typed ProofPackage requires a publication receipt, two challenged
fresh-head attestations, two governance claims and two independently
signed custodian high-water checkpoints. VerifiedContext requires every
trust root to be pre-pinned independently of all supplied evidence.
Only the complete v3.6 high-water-governed gate is invoked; no fallback
or legacy mode is accepted. VerificationResult has an informational
state and can_authorize=False. Execution is never granted.

**visitcard_consumer_adapter.py** is a demonstrator adapter for future
consumers. An AST policy test enforces that all files named
visitcard_consumer_*.py under ambassades/rio import the v3.7 facade
rather than lower-level verification implementations. Eighteen
regression tests cover missing and malformed proof parts, missing
trust roots, wrong audience, expired challenge response, a restored
revoked signer, database aliasing, and always-false authorization.

**Important boundary:** This is a source-policy convention for future
named adapters only. Prior v3.1–3.6 prototype entrypoints have not
been removed, disabled, or physically rendered inaccessible. The
public RIO site, PALACO ONE login and production consumers have not
been wired to this facade. The independently trusted newest signed
head, third-party custody, operator independence and secure transport
remain deployment responsibilities. A matching proof is NOT an
authorization, credential, identity issuance or recovery approval.

The GitHub Actions no-skip suite must execute successfully before
claiming tests passed. **GO-13 HOLD**, no merge or deployment.

## v3.8 — Consumer import-chain and trust-origin source policy (DRAFT / HOLD)

The new **visitcard_consumer_policy.py** provides a mandatory static
audit for future Python RIO modules named **visitcard_consumer_*.py**.
Every consumer and local consumer helper must import the v3.7
**visitcard_verification_entrypoint** facade directly. Imports of
lower-level verification implementations, unrelated local modules,
wildcard or relative imports, unapproved stdlib modules, and imports
through a different local helper namespace are refused. Because every
consumer file is independently scanned, a forbidden dependency hidden
in a consumer-prefixed helper is also detected. Python syntax errors,
dynamic import/reflection primitives such as importlib, __import__,
getattr, exec and eval, and constructing VerifiedContext or ProofPackage
within a consumer are rejected. TrustedContext must instead be passed
from a separately administered upstream provisioner; this checker
does not create one.

The draft GitHub Actions workflow executes the policy as a separate
mandatory step **before** the full zero-skip unittest suite. Twenty
new regression tests exercise the real adapter, indirect helper
bypasses, aliases, wildcard and relative imports, dynamic importing,
direct/indirect trust construction, missing facade, malformed Python
and missing consumer modules. Legacy prototypes are retained for
development; this does not make old Python APIs physically inaccessible.

**Boundary:** the AST policy is deliberately scoped to files under
ambassades/rio named visitcard_consumer_*.py and is not a Python
sandbox, a repository-wide import graph audit, a secure provenance
store or a production access-control system. Malicious code can
circumvent static checks. Runtime consumers, the public RIO site and
PALACO ONE are still not wired to this mandatory verifier, and key
provisioning and actual independent custodian infrastructure are
not deployed. A matching verification never grants authority.

No merge, deployment, automatic key activation or access issuance.
**GO-13 HOLD.**

## v3.9 — Out-of-band trust provenance, signed manifest and exact pin (DRAFT / HOLD)

`visitcard_trust_provenance.py` adds the **opt-in read-only**
`verify_with_trust_provenance` gate ahead of the v3.7 full-chain
verifier. All ten keyring roles in `VerifiedContext` are canonically
fingerprinted with SHA-256, including each key ID and exact public key
bytes, plus issuer and nonce. The trust manifest binds this fingerprint,
issuer, nonce, positive integer epoch, issued_at and expires_at and is
domain-separated Ed25519 signed by an **out-of-band pinned administrative
root**, with a validity window of no more than 24 hours. The caller
MUST also provide the exact SHA-256 of the manifest from a separately
protected, latest-version source. Merely presenting a signed older
manifest does not satisfy the independent hash pin.

Before verification the gate checks root signature, exact manifest
pin, expiry and keyring binding and takes an immutable shallow snapshot
of the ten role mappings, then invokes `verify_visitcard`. Missing
roots, changed key bytes or IDs, expired/stale manifests, unknown
or substituted signatures, and incomplete proof sets fail closed.
The result remains informational only: `can_authorize=False`
and `execution_permitted` always False.

Twenty new tests cover a positive full-chain match, replacement of
published and custodian keys, changed key IDs, manifest tampering,
a newer independently retained pin, invalid/expired issuance,
missing signed roots, no proof and snapshot integrity.

**Security boundary:** This code does not provision the root, protect
the independently pinned manifest hash, prove clock integrity, perform
network trust distribution, or prevent a coordinated rollback of BOTH
the manifest store and the independent pin. The v3.9 check is a new
opt-in higher-assurance entrypoint; the legacy v3.7 consumer adapter
has not been globally disabled, and the public RIO site/production
consumers are not connected. Do not treat this as runtime authorization
or complete source isolation. Independent provisioning and external
security review are required before release. **GO-13 HOLD.**

## v4.0 — Required provenance for the supported new-consumer adapter (DRAFT / HOLD)

`visitcard_consumer_adapter.py` now requires the signed v3.9
trust-provenance manifest, separately pinned administrative roots and
an **out-of-band, exact SHA-256 manifest pin** as mandatory keyword
arguments. The adapter calls only `verify_with_trust_provenance`.
It cannot silently fall back to the unguarded v3.7 verifier.
The independently signed manifest fingerprint binds all ten keyrings,
issuer and nonce before the complete double-witness/governance/
high-water proof is evaluated.

The v3.8 source policy now explicitly requires consumer modules to
import the provenance gate and rejects direct imports and calls of
`verify_visitcard`, in addition to its older restrictions against
other lower-level verifier imports, dynamic importing and locally
constructed trust objects. The example adapter is migrated; its
previous positional-only trust/no-manifest call path is rejected.
Twelve new v4 tests verify that missing/expired manifests, wrong pins,
unknown root keys, incomplete evidence, changed witness keys and
legacy direct-call attempts are rejected. Existing earlier tests
were updated to invoke the signed-manifest path as well.

**Important:** The v3.7 verifier still exists as a Python API, and
this policy covers the named consumer adapters in this source tree
only. This is neither a Python security sandbox nor a mandatory
production runtime dispatch. Source access or alternative scripts
could still invoke legacy functions. Physical independent key
custody, authenticated transport, trusted time, and truly immutable
and most-current manifest-pin storage are not deployed. No
authentication decision, access right, recovery approval or identity
issuance may be inferred from `MATCHED_INFORMATIONAL`.

Only an actual GitHub Actions no-skip run establishes test PASS.
**GO-13 HOLD — no merge, production deploy, key activation or public
site changes.**

## v4.1 — Signed release review bundle (DRAFT / GO-13 HOLD)

`visitcard_release_review.py` is an explicit **non-authorizing release
review assessor**. It requires five individually signed attestations
for `CI_ZERO_SKIP`, `EXTERNAL_CUSTODY`, `TRUST_PIN_DURABILITY`,
`SECURITY_REVIEW`, and `RUNTIME_INTEGRATION`. Each attestation
binds the same exact 40-character commit SHA, the same release scope,
a distinct SHA-256 evidence-artifact digest, PASS status, and a
validity window no longer than 24 hours. Each must be verified under
its own previously pinned Ed25519 authority key; repeated authority
IDs, key bytes, artifact digests, categories, missing credentials or
wrong versions fail closed.

The *best possible* result is `READY_FOR_HUMAN_REVIEW`, NOT
`RELEASE_APPROVED`. The result fields `release_permitted`,
`merge_permitted` and `activation_permitted` are always False;
`release_permitted()` also always returns False. A complete signed
bundle is not sufficient evidence of independence, truthful review
or operational readiness.

The five domains are **not currently proven**: CI test success is
only one potential evidence item; independent physical custodian
controls, durable latest-manifest pins, completed external security
review and a real runtime/production integration remain unverified
and must not be fabricated. The module does not fetch CI logs or
external files and does not possess real independent auditor keys.
Test fixtures create ephemeral keys to validate protocol behavior,
not to issue actual release attestations. A reviewer must bind
externally gathered durable evidence and verify source-commit
immutability, root custody and trust-domain separation.

Eighteen new regression tests cover complete but nonauthorizing
bundles, invalid/expired attestations, forged signatures, duplicate
proofs, wrong commit, wrong scope, missing domains and negative
review results. No production deployment or public changes.
**GO-13 HOLD.**

## v4.2 — Reproducible release dossier and explicit evidence blockers (DRAFT / HOLD)

`visitcard_release_dossier.py` assembles a deterministic signed-evidence
index for the **same five v4.1 review domains**. Evidence bytes must
be supplied separately by the reviewer, never manufactured by the
application. The SHA-256 of each artifact's exact bytes must equal
the digest in its separately authenticated v4.1 review attestation.
Every indexed artifact contains the domain, the content-addressed
`sha256:<hex-digest>` reference and its length. The deterministic,
ordered dossier binds the exact source commit, the five signed
attestations, the evidence index, release policy and GO-13 HOLD,
with a reproducible canonical SHA-256 manifest fingerprint.

`build_release_dossier` produces a sorted blocker list and **no**
manifest when any evidence artifact, signature, category, trust anchor,
content digest, commit binding, scope or timestamp fails validation.
`validate_release_dossier` recomputes the manifest, verifies the
original bytes and signed reviews, and rejects changed fields even
when an attacker recomputes the unkeyed manifest hash. GO-13 HOLD is
embedded in the verified schema, and merge/activation/release flags
are always False.

Twenty v4.2 regression tests exercise reproducibility, missing
evidence, tampering before and after dossier construction, changed
manifest structures, altered commit, wrong review keys, expiration,
unauthorized release flags, oversized artifacts and blocking reasons.

**Boundary:** This is an offline testable protocol, not a claim
that the five external evidence domains are currently complete.
The dossier index is NOT an independent archive, network retrieval,
authenticated external storage, actual human approval or a
non-repudiable public timestamp. Test fixtures use disposable signing
keys and synthetic artifact bytes. Independent reviews, operational
custody, durable pins and integration evidence remain missing
until independently supplied and checked. Do not use synthetic
fixtures as production evidence. **GO-13 HOLD** — no merge, rollout,
key activation or access approval.

## v4.3 — Signed offline dossier handoff chain (DRAFT / GO-13 HOLD)

The new `visitcard_dossier_handoff.py` implements a content-addressed
protocol for transferring v4.2 release dossiers between distinct
receiving custodians. Each signed Ed25519 receipt cryptographically
binds the dossier SHA-256, exact source commit SHA, contiguous sequence,
previous receipt SHA-256, receiving custodian key ID, claimed receipt
timestamp and `GO-13 HOLD`. Verifiers require separately **pre-pinned**
receiving public keys, distinct physical key bytes and custodian IDs,
and an **out-of-band independently retained latest signed receipt hash**.
A valid old signed transfer history fails closed against a newer head
pin, as do missing/reordered/tampered receipts, forked artifacts,
substituted commits, unknown keys and incomplete chains.

The v4.3 result remains `CHAIN_MATCHED_INFORMATIONAL` at best:
`release_permitted`, `merge_permitted` and
`activation_permitted` remain False for all outcomes.
20 new regression tests exercise chain agreement, missing and outdated
heads, tampering, duplicated custodians, substituted evidence,
noncanonical signatures, future timestamps and maximum chain length.

**Scope and limitations:** this is a self-contained offline transfer
*verification protocol* only; it does not transfer bytes, store
artifacts externally, provision signer keys, certify the real identity
or physical separation of custodians, or attest that a claimed
receipt time is trusted. The independently retained latest-head pin
must be provisioned and maintained elsewhere. Coordinated rollback
of all retained copies and the pin is not detectable here. The v4.2
dossier validation must run separately on the actual evidence bytes,
not just on a claimed SHA-256. No externally audited operational
custodian service or production release authority is established.
**GO-13 HOLD**.

## v4.4 — Unified byte-backed dossier and signed handoff audit (DRAFT / HOLD)

The new read-only `visitcard_release_transfer_audit.py` composes
`validate_release_dossier` (v4.2) and `verify_dossier_handoff` (v4.3)
as a **single fail-closed audit entrypoint**. It first re-verifies the
complete original evidence bytes, independently pinned review authority
keys, five signed review attestations, exact Git commit and canonical
manifest digest. Only the hash derived from that fully validated dossier
can be passed as the expected content identifier to the independently
signed transfer-receipt chain. The latter also must match an externally
retained latest receipt hash and the exact same source commit.

The result distinguishes `DOSSIER_BLOCKED`, `TRANSFER_BLOCKED`,
and `MATCHED_INFORMATIONAL`; all outcomes have release, merge and
activation permission fixed to False. Missing original evidence,
altered manifest, bad review key, rollback to an older signed transfer
head, swapped dossier, tampered receipt and repeated custodian keys
fail closed. Seventeen direct integration tests cover the complete
chain and failures in either subverification.

This remains an **offline proof contract**, not operational external
storage, an independent trusted clock, a physically delivered package,
or production authorization. Receiving a valid signed receipt does not
establish the legal identity or independent control of the recipient.
The externally pinned latest receipt must actually be provisioned
outside the claimant's control. The v4.4 module is not connected to
a release workflow capable of merging or deploying. **GO-13 HOLD**.

## v4.5 — Signed audit checkpoint with an independently pinned head (DRAFT / HOLD)

`visitcard_audit_checkpoint.py` provides an explicit higher-level
`verify_checkpointed_audit` offline verifier. It first runs the entire
byte-backed v4.4 release/transfer audit. Next, a separately pinned
Ed25519 auditor key must verify a five-minute (maximum) signed
checkpoint binding the exact source commit, dossier hash, latest
transfer receipt hash, a caller-supplied 32-byte canonical base64url
challenge, informational audit state and `GO-13 HOLD`. The signed
checkpoint's canonical SHA-256 must match a separately **externally
pinned current** digest. This independent pin must NOT be derived from
the untrusted checkpoint or handed to the verifier by the same party
whose evidence is being verified.

Upon a fully matching checkpoint, the random challenge is atomically
recorded in a local SQLite replay table under `BEGIN IMMEDIATE`.
Its unique primary key and no-update/no-delete triggers reject
subsequent local replay of the same challenge and accidental
history mutations. `MATCHED_INFORMATIONAL`, `AUDIT_BLOCKED`,
`CHECKPOINT_BLOCKED` and `REPLAY_BLOCKED` remain non-authorizing;
release, merge and key activation flags are always false.
22 new regression tests cover the first use and replay, alternate
fresh challenges, forged signatures, wrong pins, expiry, incorrect
dossier/receipt binding, missing archive evidence and schema damage.

**Critical caveat:** independent latest-head storage, random
challenge generation, trusted clock and database durability are
**not implemented** in this module. The SQLite replay log can be
rolled back by a privileged actor; two independent replicas do not
share its consumed-challenge state. Actual global replay prevention
requires a separately managed durable monotonic/CAS challenge ledger,
proper clock and true out-of-band freshness guarantees. Source-code
tests do NOT prove any of these deployed properties. No merge,
release or production activation is permitted. **GO-13 HOLD.**

## v4.6 — Externally signed replay-log high-water recovery (DRAFT / HOLD)

The new `visitcard_replay_recovery.py` verifies the exact
SQLite consumed-challenge log against a separately **signed, pinned**
monotonic replay-head snapshot. The snapshot must bind the exact
commit, bounded release scope, numeric row count, canonical SHA-256
of each stored challenge/checkpoint/timestamp row and GO-13 HOLD.
A previously pinned recovery custodian Ed25519 key authenticates the
snapshot; its canonical hash must match a second latest-head digest
retained separately from the claimant's database. A restored local
database with fewer challenge rows or altered row content therefore
fails closed **when the newer external snapshot is still available**.

The verifier acquires a SQLite `BEGIN IMMEDIATE` lock before comparing
the replay head; it holds that transaction through the full v4.4
dossier audit, v4.5 challenge-bound signed audit-checkpoint
verification, and insertion of the newly consumed challenge.
On successful commit, the signed external snapshot is now *stale*
and must be renewed before further verification can succeed.
Twenty negative/positive regressions cover stale external heads,
local rollback, forged signatures, wrong scope, independent pin
mismatch, repeat use, transaction rejection and fail-closed writes.

**Not production replay protection:** there is no implemented
external replay registrar, external CAS transaction, independently
durable storage, trusted clock, or authenticated checkpoint delivery.
Multiple replicas still could accept the same challenge if they
share an old snapshot and operate on different SQLite databases.
The caller must provision unpredictable challenges and securely
retain the newest custodian snapshot, otherwise rollback is not
detectable. A locally signed and pinned checkpoint is not proof of
physical or administrative independence. Even matching results are
informational only, never release, identity, merge or access rights.
**GO-13 HOLD — no merge, public deployment or key activation.**

## v4.7 — Shared SQLite CAS and signed synchronization acknowledgement (DRAFT / HOLD)

`visitcard_shared_replay_cas.py` implements a **two-phase, single-DB
shared replay coordination contract** for processes using the same
SQLite database file. A transaction protected by `BEGIN IMMEDIATE`
validates the complete append-only event/hash chain, an expected
monotonic sequence and SHA-256 head, and a separately supplied external
head pin before reserving an unused 32-byte challenge. A committed
reservation returns `PENDING_EXTERNAL_ACK` and *blocks all subsequent
reservations* until a separately pinned Ed25519 custodian signs the
exact new sequence and head. The signed receipt itself must match
an independently retained SHA-256 pin. A duplicated identical receipt
can safely be retried after an interrupted acknowledgement; conflicting
receipts are rejected. The latest acknowledged state and signed
receipt digest are retained in SQLite. The full event chain is
rehashed before each CAS or acknowledgement.

22 new tests use **two separate SQLite connections pointing at the
same file**, checking stale-CAS conflict, one-challenge reuse,
external-ack pending stops, key/signature replacement, wrong sequence
or head, idempotent acknowledgement, malformed or deleted event
rows, overlapping SQLite transactions and two successive signed
acknowledgements.

**Critical operational limits:** This is not a cross-database/global
transaction protocol, authenticated remote endpoint, distributed
consensus, HSM, real durable independent custodian, or external
monotonic timestamp. Two replicas that do not share the same durable
SQLite file can independently accept a challenge; no remote
compare-and-swap is implemented. The latest external head pin and
acknowledgement SHA are caller-provisioned, not securely stored
by this module. After a local reservation, the external signer must
actually observe and independently authenticate the corresponding
committed head before acknowledgement. Full rollback of BOTH the
SQLite file and external pins cannot be detected. Local SQLite
storage durability depends on the host and filesystem settings.
This module does not directly invoke the full v4.6 audit; consumers
must ensure the supplied checkpoint hash comes from an independently
verified v4.6 result. All result permission fields remain False.

**GO-13 HOLD:** no release, merge, installation, key activation or
production authorization.

## v4.8 — Verified audit-to-shared-CAS bridge with interrupted-ack recovery (DRAFT / HOLD)

`visitcard_shared_audit_bridge.py` defines a read-only v4.6
**recovery-head preflight**, followed by the full byte-backed v4.4
dossier and signed handoff verification and v4.5 signed challenge-bound
checkpoint validation. Only then does it call the v4.7 shared SQLite
compare-and-swap to reserve the canonical checkpoint and challenge.
The v4.6 local SQLite consumed-challenge table is **NOT** also mutated;
the shared v4.7 table is the only replay-consumption point in this
composed route. Invalid evidence cannot consume a shared challenge.
A successful reservation is explicitly
`PENDING_EXTERNAL_ACK`, not completed authorization. A separately
signed and independently pinned v4.7 receipt can subsequently be
verified by `confirm_shared_handoff`; retrying the same signed
acknowledgement is idempotent.

18 integration regressions cover valid pending and acknowledgement,
wrong external pins, damaged evidence and checkpoints, stale CAS,
second process losing the CAS, replay, interrupted acknowledgement,
invalid signed receipt, local preflight not consuming the challenge
and transactional lock errors.

**Scope:** neither v4.6 nor v4.7 is a globally atomic distributed
consensus mechanism. The read-only recovery preflight and shared
SQLite CAS are separate resources; no cross-resource transaction
exists, and adversarial external trust-input changes in that interval
require authenticated immutable provisioning. A live external
signer, durable independent latest-head pins and the actual public
RIO runtime remain unimplemented. No release, merge, production
activation or permission follows from a matching audit. **GO-13 HOLD.**

## v4.9 — Restart-safe pending-session reconciliation (DRAFT / GO-13 HOLD)

`visitcard_pending_recovery.py` adds explicit read-only recovery
inspection for a v4.7/v4.8 shared SQLite replay reservation after a
process crash. It verifies the **entire v4.7 append-only hash chain**
and requires out-of-band, exact expected sequence, 32-byte challenge,
signed audit-checkpoint digest, pending head digest and **previously
acknowledged external head**. A missing, altered, reordered or
unrecognized pending reservation fails closed. The inspection uses
one SQLite read transaction and performs no replay consumption or
automatic acknowledgement.

`resume_signed_acknowledgement` only advances a valid pending
reservation through the original signed and independently pinned
v4.7 `acknowledge_head` gate. An identical already-acknowledged
receipt can be retried after a process restart **only if** the
caller supplies the updated externally pinned acknowledged head.
A missing, forged or conflicting receipt never promotes a pending
verification. Results distinguish pending, acknowledged and blocked;
no state grants release, merge, execution or key activation.
21 regressions exercise reconnecting to the same SQLite file,
idempotent retry, crash before receipt delivery, forged ack,
wrong checkpoint, stale head, corrupted event and active transaction.

**Security boundary:** This is a restart/reconciliation *contract*,
not an independent recipient service. All expected values and pins
must come from authenticated independent provisioning; the caller
must not derive its 'external' head directly from the same mutable
database being verified. SQLite rollback across both the local
file and independent external state is out of scope. Pending
requests are never automatically timed out or deleted; an operator
must resolve them using authentic external evidence. The
existing v4.8 read-only audit + v4.7 replay CAS remains the
reservation path. **GO-13 HOLD — no merge, release or deployment.**

## v5.0 — Consolidated security review inventory (DRAFT / GO-13 HOLD)

`visitcard_v5_security_review.py` provides a non-authorizing,
deterministic source inventory and explicit production blocker register.
It covers the consumer provenance path plus the signed release review,
byte-backed dossier, handoff, unified audit, audit checkpoint,
monotonic replay recovery, SQLite shared compare-and-swap,
audit-to-CAS bridge and pending session restart recovery. Each of the
13 audited modules is referenced by its exact filename and SHA-256,
which is included in a canonical inventory digest. An expected digest
for each module MUST be provisioned from an independent trusted
inventory; computing the expected hashes from the same untrusted tree
does not establish a trusted source baseline.

The review rejects missing/linked source files, mismatched hashes,
invalid syntax, unexpected network/subprocess imports, missing
contract entrypoints and dataclass fields that default release, merge
or activation permission to a value other than False. The AST checks
are intentionally a *limited heuristic*, not complete static analysis,
taint analysis, vulnerability testing or a Python security sandbox.
The caller's test count is informational **self-reported metadata**,
not an independent CI attestation or evidence of the tests running.

The best possible v5.0 classification is
`EXTERNAL_EVIDENCE_REQUIRED`, never production-ready. Seven
non-negotiable blockers remain: independent key custody,
durable latest-pin storage, genuinely global replay CAS,
an operational external signed receipt service, runtime
enforcement/integration, independent security assessment,
and trusted time and recovery infrastructure. No purely
local source inventory can resolve those controls. Nineteen
new v5 regression tests cover deterministic inventory,
modified source, missing files, missing pins, forbidden
imports, incorrect authorization defaults, invalid syntax
and absent external evidence.

The previous modules remain separately callable Python APIs.
In particular, v4.8 uses a read-only v4.6 recovery preflight
and v4.7 shared replay CAS: this is not one distributed
transaction over separately managed stores. External pins
and independently signed receipts are not automatically
provisioned by any of these modules. v5.0 does not make
claims about completed real-world code audits beyond the
specific tests performed.

**GO-13 HOLD** — never auto-merge, issue identities,
activate keys, deploy or grant access.

## v5.1 — Signed source, CI and independent-review packet (DRAFT / GO-13 HOLD)

`visitcard_v51_review_packet.py` adds an offline, non-authorizing
security review packet. A complete packet requires an externally
pinned SHA-256 inventory of the 13 v5.0 source modules, an exact
source-commit identifier, and two separately signed Ed25519 review
attestations: `CI_ZERO_SKIP` and `SECURITY_REVIEW`. Each attestation
must bind the **same exact commit** and the `RIO-VISITCARD-V5.1-SECURITY-REVIEW`
domain/scope, a different independently provisioned signer key, a
distinct SHA-256 digest of the exact supplied evidence bytes, and a
valid bounded lifetime under the original v4.1 verifier. The review
packet computes a deterministic canonical SHA-256 digest of the
inventory and signed evidence. Corrupted evidence, missing review
files, unpinned keys, expired or forged signatures, scope mismatch,
duplicate reviewers, or source hash mismatch fail closed.

The best possible software classification is
`REVIEWABLE_INFORMATIONAL`: **seven external production blockers
remain open**, independently of the evidence supplied here. Real
key custody, global replay coordination, independent pin storage,
trusted time, signed receipt service, runtime enforcement, and an
actual independent security assessment must be verified operationally.
Signing synthetic test evidence does not establish that CI actually
ran or that an independent professional auditor approved the system.

Twenty new regressions exercise valid synthetic protocol paths,
incomplete or forged evidence, changed source files, reused signer
keys, expiry, wrong commit/scope and permanent nonauthorization.
The `test_count` in the v5.0 source report is placeholder metadata
inside this packet; the packet does not scrape the GitHub Actions API
or automatically verify CI provenance. Independently pin GitHub
run identifiers, immutable log bytes and auditor identities in
a real evidence provisioner before making any such claim.

**GO-13 HOLD:** no merge, live deployment, permission or key issuance.

## v5.2 — Signed provenance claims for CI and security-review evidence (DRAFT / HOLD)

The new `visitcard_v52_provenance.py` layers a provenance-claim
verification step **after** the v5.1 source and exact-byte evidence
checks. Both `CI_ZERO_SKIP` and `SECURITY_REVIEW` require distinct
Ed25519-signed provenance claims, scoped to the same exact Git
commit, separately pinned source inventory hash and SHA-256 of
their respective source evidence bytes. Claims bind explicit
repository, workflow or independent-review reference, execution
identifier, execution attempt, executor identity, canonical
content-addressed `sha256:` artifact URI, and bounded issuance/
expiration dates. Each claim is verified against independently
provisioned expected identity/reference and pinned signer keys.
Reusing the same key across the two provenance domains, unknown
signers, wrong runner metadata, wrong SHA, changed source, forged
signatures and stale provenance are rejected. The canonical digest
of the combined provenances and the previously verified v5.1
packet is reproducible.

**Trust boundary:** Signed provenance is a cryptographically
authenticated *claim made by the named signer*, not direct
evidence that GitHub itself authenticated an Actions workflow,
runner or artifact. The module does not call GitHub, validate
GitHub OIDC issuer/audience/JWKS, compare workflow_run/run_attempt
against the authenticated GitHub API, or verify that a reviewer
was operationally independent. Upstream trusted provisioners
must supply genuine immutable run identifiers, actor identity,
review references, expected executions and trust roots.
Synthetic fixtures do not fulfill any external blocker.

23 added regressions exercise source and artifact substitution,
changed workflow/repository/runner identity, key reuse, missing
or forged claims, incorrect execution IDs/attempts, expiration
and permanent no-release flags. The best possible result remains
`REVIEWABLE_INFORMATIONAL`; all seven v5.0 external production
blockers remain active.

**GO-13 HOLD:** no merge, deployment, live credentials or authority.

## v5.3 — Signed GitHub workflow run observation verification (DRAFT / HOLD)

`visitcard_v53_github_run.py` verifies a separately Ed25519-signed
and pinned *run observation* after the entire v5.2 source, CI-evidence,
auditor evidence and provenance chain. The signed observation binds
the exact repository, workflow path, source commit, workflow source
SHA, head branch, GitHub run ID, run attempt, declared runner event,
completed/successful state, canonical GitHub Actions run URL, SHA-256
of the original CI artifact bytes and a short (maximum 15-minute)
verification interval. Its run ID and attempt must agree with the
previously verified v5.2 provenance claim. Forged signatures, unpinned
observers, stale observations, other workflows/branches/commits,
failed or queued runs and changed artifact bytes are rejected.

**Critical provenance boundary:** the observed metadata is a
signed assertion by the pinned observer, NOT an authenticated GitHub
API response or GitHub OIDC trust chain. This module does NOT
authenticate GitHub API transport, OIDC issuer/audience/JWKS,
the original Actions runner or independent GitHub-hosted artifact
attestation. A properly secured external observation service must
validate authenticated GitHub metadata before signing. Fixture
signers and invented test run IDs do not establish a real production
run, authenticated provenance, or independent professional audit.
The independent seven production blockers remain in force.

23 new negative/positive tests cover run ID/attempt, SHA, branch,
workflow, repository, expiry, signature, completed/success status,
missing source provenance and permanent GO-13 HOLD. Even the most
favorable result is `REVIEWABLE_INFORMATIONAL`, never authorization.

**GO-13 HOLD:** no merge, deployment, access or key activation.

## v5.4 — Byte-exact job log acquisition receipt (DRAFT / GO-13 HOLD)

`visitcard_v54_log_custody.py` extends the verified v5.3 run-observation
protocol with an independently signed and pinned *log acquisition
receipt*. The original bytes of a retrieved GitHub Actions job log
must be available (bounded to 8 MiB); the receipt must bind their
exact SHA-256 digest and byte count, an explicit expected numeric
job ID, the same repository, source commit, pinned workflow SHA,
GitHub run ID and attempt already checked by v5.3, a declared
`GITHUB_ACTIONS_JOB_LOGS_API` retrieval method, and an at-most
15-minute verification interval. The receipt signer must be a
separately pinned Ed25519 collector key, **different from the pinned
v5.3 observation signing key**. Failure in either verification layer
blocks; no local log substring or keyword alone can establish CI
trust. Twenty-two new regression tests cover log substitutions,
missing bytes, stale/future retrieval claims, wrong job/run/attempt,
forged signatures, reused signing keys and unchanged GO-13 HOLD.

**Important:** the retrieval method is a *signed declaration*, not
cryptographic proof that TLS, GitHub API authorization or the
authenticated GitHub job log source was used. The collector
service, Github token binding, run/job membership verification,
GitHub-managed artifact attestation/OIDC and immutable third-party
pin storage are NOT implemented in this offline module. Synthetic
job logs are only fixtures. Verification does not establish a real
independent external auditor. The seven external production
blockers continue to apply, and even a matching packet remains
`REVIEWABLE_INFORMATIONAL`.

**GO-13 HOLD:** No merge, deployment, issuance, key activation,
production authentication or release.

## v5.5 — Signed job metadata and contiguous log evidence dossier (DRAFT / HOLD)

`visitcard_v55_job_dossier.py` adds a signed job-observation
dossier on top of the entire v5.4 verified source, CI,
provenance, run-observation and acquisition-receipt chain. The
job dossier binds repository, run ID, run attempt, numeric
job ID, source commit SHA, workflow SHA, successful completed job
claim and SHA-256 and exact byte count of the original CI job log.

A bounded ordered segment manifest (1–128 chunks) must reconstruct
**every byte** of the original log without gaps, overlaps, empty
chunks, reordering, trailing omissions or altered segment hashes.
Each segment carries its byte offset, size, SHA-256 and the
previous segment SHA-256; the first predecessor is all zeroes.
Ed25519 verification requires a separately pinned job-observer
key which must differ from BOTH the v5.3 run observer and the
v5.4 log collector public keys. Exact log bytes, job metadata and
signature must all agree. The signed observation is valid for at
most 15 minutes and GO-13 remains HOLD for all outcomes.

24 new v5.5 tests exercise valid synthetic evidence, omitted/
overlapping/changed segments, wrong job/run/attempt/commit/workflow,
forged/reused keys, failed job states, expiry and permanent
non-authorization. The best result is
`REVIEWABLE_INFORMATIONAL` and all seven external blockers remain.

**External trust boundary:** this offline component verifies
signatures and exact supplied bytes, NOT a direct authenticated
GitHub API job response, the run-job parent relationship, actual
runner identity, GitHub-native artifact attestation, or independent
physical custody. A trusted upstream provisioner must establish
those conditions before evidence may be considered externally
authenticated. The segment manifest detects local omissions relative
to the signed *supplied* log, not remote GitHub truncation if a
signer attests incomplete data. No merge, rollout, key activation
or release is permitted. **GO-13 HOLD.**
