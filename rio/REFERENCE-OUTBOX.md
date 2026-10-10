# RIO durable outbox — synthetic reference v0.1

The file-backed reference now joins signed 6RI9ADE evidence to a durable, bounded local outbox and a local synthetic recipient inbox. It does not connect real accounts, open a live contact space, deliver over a network, grant governance authority, or implement E2EE.

## Exact message authorization

The existing v0.1 gate remains read-only and backward compatible. The new outbox accepts only `6ri9ade-transfer-reference/0.2`. Its exact request schema adds:

```json
{
  "transferBinding": {
    "messageId": "synthetic-message-001",
    "payloadDigest": "SHA256_OF_DECODED_OPAQUE_BYTES",
    "payloadByteLength": 22,
    "payloadEncoding": "base64url",
    "idempotencyKey": "synthetic-idempotency-001"
  }
}
```

The full request digest now includes the transfer binding. All eighteen attestations, initiation, NOVA admission, and both exact final receipts therefore bind the same message ID, bytes, size, deduplication key, parties, devices, contexts, key versions and policy versions. Changing a queued payload cannot reuse consent.

The exact message object is `{schemaVersion, classification, requestId, messageId, idempotencyKey, opaquePayload}`, version `rio-opaque-message-reference/0.1`, classification `SYNTHETIC_ONLY`. Payloads contain 1–4096 decoded bytes in canonical, unpadded base64url. Synthetic opaque bytes are **not proof of encryption**; no cryptographic transport protocol is invented here.

## Trusted host API

`openRioReferenceOutbox({databasePath, classification, design, loadEvidence, now, fault})` exposes `commit(message)`, `deliver(messageId)`, `revoke(requestId)`, `status(messageId)`, `inbox(messageId)`, and `close()`.

The host must supply an absolute, dedicated database path in an existing private directory. New files use mode 0600 where the OS supports it; Windows ACLs remain the host's responsibility. Existing symlink/non-file targets, unrelated nonempty SQLite databases, unsupported versions and mismatched classification markers are rejected. This path is not an HTTP request field.

The synchronous `loadEvidence(checkpoint, message)` returns `{input, snapshot}`. The message passed to it is a frozen clone. Loaders belong to the trusted host and cannot be supplied as request JSON. The outbox invokes the actual signature verifier rather than accepting a caller's cached PASS or consent boolean. No private signing keys are stored.

## Service commit

Within a SQLite `BEGIN IMMEDIATE` write transaction:

1. Resolve idempotency, durable revocation and storage capacity.
2. Verify current `SERVICE_COMMIT` evidence, the exact v0.2 message binding and both final receipts.
3. Consume the previously unused commit challenge, insert the immutable queue record and retain only a compact evidence audit digest.
4. Re-read current evidence, trust, rights and time immediately before committing.

Challenge consumption, queue insertion and the audit record commit together. Faults or a competing writer return HOLD and explicitly roll back all partial rows. No positive receipt precedes successful COMMIT.

## Local queued delivery

Delivery uses **a new challenge** and new `QUEUED_DELIVERY` signatures and exact final receipts. Commit evidence cannot stand in for delivery evidence. This is a deliberately conservative single-transfer reference; it does not automatically regenerate human consent on behalf of a person.

The delivery request must preserve the original parties, account/device/context/key fields, scope, request ID, transfer binding and policy/P.P./5CRIPTIE versions. Only challenge and time window can refresh; the new window cannot extend beyond the original committed expiry.

A second write transaction checks the durable tombstone, expiry, retry time, stored payload fingerprint and request digest. After signature checks it atomically consumes the new challenge, inserts one **local synthetic inbox** row, marks the queue delivered and records a digest. A final check after injected faults rejects changed trust/rights, expiry and backwards clock movement. There is no network callback or external relay.

The local SQLite writer lock serializes outbox operations and durable revocations. This does not lock an external identity or safety service: a production integration would need a transactionally compatible rights/revocation store and defined delivery linearization. Remote transport acknowledgements, lease recovery and uncertain network outcomes remain future work.

## Idempotency, stops and retries

- One immutable message per request, message ID and idempotency key; one-time global challenge IDs.
- Repeating the same message or a completed delivery returns its historical state without re-verifying or delivering again.
- Reusing an ID/key with different bytes closes that conflicting attempt and leaves the original record unchanged.
- Missing, stale or invalid evidence waits. An authenticated rejection, expiry or durable revocation closes the queued transfer.
- Replaying an already consumed delivery challenge closes the transfer. Delivery HOLD attempts are stored, separated by at least one second and capped at three; exhaustion closes the transfer. An early retry consumes no additional attempt.
- Revocation can precede queue creation and survives reopening. It never erases or claims to unsend a previously delivered local record.
- Methods reject reentry from host loaders/fault hooks; asynchronous hooks cannot participate in the transaction.
- The bounded reference retains at most 128 message records and 256 revocation tombstones. There is no automatic purge of replay history.

## Privacy and status

Public-shaped results expose only message ID, QUEUED/HOLD/CLOSED/DELIVERED/NOT_FOUND, duplicate/mutation flags and explicit reference boundaries. They omit opaque payload, signing keys, issuer inventory, receipts, private rejection reasons and retry internals.

`inbox(messageId)` is an explicit **trusted-host-only local inspection** API. It returns synthetic opaque bytes only for a consistent already-delivered record. It is not registered as a public route or authenticated real consumer mailbox. The database contains synthetic identifiers and opaque bytes and is not encrypted at rest.

All results retain `mode=REFERENCE_ONLY`, `classification=SYNTHETIC_ONLY`, `operativeAuthority=NONE`, `canOpenContact=false`, `runtimeConnected=false`, `externalSideEffect=false`. `databaseMutated` separately reports local test-database mutation; filesystem writes are real even though there is no external service effect.

## Verification and remaining integration

GitHub runs the reference gate, storage/attack/restart/rollback tests, the existing source checks, kernel tests and browser checks. The source-bound evidence artifact adds seven outbox scenarios without keys, payloads or database files.

Real identity/device/P.P. registration, authenticated human receipt issuance, live bodyguard evidence, durable production rights, maintained E2EE, remote relay, client notifications, operational monitoring and backup/retention policy remain unconnected. A signed synthetic assertion proves its signature and binding; it does not prove a physical human or the truth of a live security service. Absolute safety is not claimed.

Implementation references: [Node 24 SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [SQLite transactions](https://www.sqlite.org/lang_transaction.html).
