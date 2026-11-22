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
