"""RIO v1.1 isolated witness registry prototype — DRAFT / HOLD.

Run on a separately administered host with a separately provisioned SQLite
database and witness signing key. This module is NOT a network service and
does not provide secure key management, external timestamp attestation,
backup anti-rollback, or release authorization.

A producer-signed journal claim is required before any witness is issued.
Signed witness receipt is persisted in the same transaction as the high-water
mark, so retries after crash return the exact same receipt.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import json
import sqlite3
from typing import Any, Mapping

from visitcard_audit_journal import ZERO_HASH
from visitcard_witness_receipt import DOMAIN as RECEIPT_DOMAIN, _canonical, verify_witness_receipt, WitnessTrust

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

PROPOSAL_DOMAIN = b"PALACO-RIO-WITNESS-PROPOSAL-V1\x00"

SCHEMA = """
CREATE TABLE IF NOT EXISTS witness_heads (
 issuer TEXT PRIMARY KEY NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence > 0),
 entry_hash TEXT NOT NULL,
 receipt_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS witness_entries (
 issuer TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence > 0),
 entry_hash TEXT NOT NULL,
 predecessor_hash TEXT NOT NULL,
 receipt_json TEXT NOT NULL,
 PRIMARY KEY (issuer, sequence)
);
CREATE TRIGGER IF NOT EXISTS witness_entries_no_update
BEFORE UPDATE ON witness_entries BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS witness_entries_no_delete
BEFORE DELETE ON witness_entries BEGIN SELECT RAISE(ABORT,'append-only'); END;
"""


def initialize_witness(connection: sqlite3.Connection) -> None:
    """Administrative migration, outside an active transaction."""
    if connection.in_transaction:
        raise ValueError("migration cannot commit caller transaction")
    connection.executescript(SCHEMA)


def _hex(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(x in "0123456789abcdef" for x in value)


def _signature(raw: Any) -> bytes:
    if not isinstance(raw, str) or len(raw) != 86:
        raise ValueError("signature must be canonical base64url")
    if any(x not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for x in raw):
        raise ValueError("signature alphabet")
    sig = base64.urlsafe_b64decode(raw + "==")
    if len(sig) != 64 or base64.urlsafe_b64encode(sig).rstrip(b"=").decode() != raw:
        raise ValueError("non-canonical signature")
    return sig


def _validate_proposal(envelope: Any, producer_keys: Mapping[str, bytes]) -> dict[str, Any]:
    if not isinstance(envelope, dict) or set(envelope) != {"payload", "signature"}:
        raise ValueError("invalid proposal")
    payload = envelope["payload"]
    if not isinstance(payload, dict) or set(payload) != {"version", "issuer", "sequence", "entry_hash", "predecessor_hash"}:
        raise ValueError("invalid proposal fields")
    issuer = payload["issuer"]
    if not isinstance(issuer, str) or not issuer or len(issuer) > 128:
        raise ValueError("invalid issuer")
    if type(payload["version"]) is not int or payload["version"] != 1:
        raise ValueError("unsupported version")
    if type(payload["sequence"]) is not int or not 1 <= payload["sequence"] <= 2**63-1:
        raise ValueError("invalid sequence")
    if not _hex(payload["entry_hash"]) or not _hex(payload["predecessor_hash"]):
        raise ValueError("invalid chain hashes")
    key = producer_keys.get(issuer)
    if not isinstance(key, bytes) or len(key) != 32:
        raise ValueError("untrusted producer")
    Ed25519PublicKey.from_public_bytes(key).verify(
        _signature(envelope["signature"]), PROPOSAL_DOMAIN + _canonical(payload)
    )
    return payload


def publish(
    connection: sqlite3.Connection, proposal: Any,
    producer_keys: Mapping[str, bytes], witness_private_key: Ed25519PrivateKey,
    *, witness_id: str, now: datetime | None = None,
) -> dict[str, Any] | None:
    """Persist witnessed sequence and exact signed receipt atomically.

    No implicit trust/bootstrap from QR: first sequence still requires an
    administrator-pinned producer public key and a signed genesis claim.
    Never return a receipt from a failed commit.
    """
    if connection.in_transaction:
        return None
    try:
        if not isinstance(witness_private_key, Ed25519PrivateKey):
            return None
        if not isinstance(witness_id, str) or not witness_id or len(witness_id) > 128:
            return None
        payload = _validate_proposal(proposal, producer_keys)
        instant = datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant, datetime) or instant.tzinfo is None or instant.utcoffset() is None:
            return None
        instant = instant.astimezone(timezone.utc)
        issuer, sequence, entry_hash, prev = (
            payload["issuer"], payload["sequence"], payload["entry_hash"], payload["predecessor_hash"]
        )
        connection.execute("BEGIN IMMEDIATE")
        head = connection.execute(
            "SELECT sequence,entry_hash,receipt_json FROM witness_heads WHERE issuer=?", (issuer,)
        ).fetchone()
        if head is None:
            if sequence != 1 or prev != ZERO_HASH:
                connection.rollback()
                return None
        elif sequence == head[0] and entry_hash == head[1]:
            receipt = json.loads(head[2])
            connection.commit()
            return receipt
        elif sequence != head[0] + 1 or prev != head[1]:
            connection.rollback()
            return None
        receipt_payload = {
            "version": 1, "issuer": issuer, "sequence": sequence,
            "entry_hash": entry_hash, "observed_at": instant.isoformat(),
        }
        sig = witness_private_key.sign(RECEIPT_DOMAIN + _canonical(receipt_payload))
        receipt = {
            "payload": receipt_payload, "witness_id": witness_id,
            "signature": base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii"),
        }
        packed = json.dumps(receipt, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        connection.execute(
            "INSERT INTO witness_entries (issuer,sequence,entry_hash,predecessor_hash,receipt_json) VALUES (?,?,?,?,?)",
            (issuer, sequence, entry_hash, prev, packed),
        )
        connection.execute(
            """INSERT INTO witness_heads (issuer,sequence,entry_hash,receipt_json) VALUES (?,?,?,?)
               ON CONFLICT(issuer) DO UPDATE SET sequence=excluded.sequence,
               entry_hash=excluded.entry_hash,receipt_json=excluded.receipt_json""",
            (issuer, sequence, entry_hash, packed),
        )
        connection.commit()
        return receipt
    except (sqlite3.Error, ValueError, TypeError, AttributeError, KeyError, InvalidSignature, OverflowError):
        if connection.in_transaction:
            connection.rollback()
        return None


def audit_witness(connection: sqlite3.Connection, issuer: str) -> bool:
    """Verify contiguous persisted witness history, not external disk rollback."""
    try:
        rows = connection.execute(
            """SELECT sequence,entry_hash,predecessor_hash,receipt_json
               FROM witness_entries WHERE issuer=? ORDER BY sequence""", (issuer,)
        ).fetchall()
        head = connection.execute(
            "SELECT sequence,entry_hash,receipt_json FROM witness_heads WHERE issuer=?", (issuer,)
        ).fetchone()
        if not rows or head is None:
            return False
        prev = ZERO_HASH
        for expected, (seq, entry_hash, predecessor, receipt_json) in enumerate(rows, 1):
            if seq != expected or predecessor != prev or not _hex(entry_hash):
                return False
            receipt = json.loads(receipt_json)
            if receipt.get("payload", {}).get("sequence") != seq or receipt["payload"].get("entry_hash") != entry_hash:
                return False
            prev = entry_hash
        return head == (rows[-1][0], rows[-1][1], rows[-1][3])
    except (sqlite3.Error, ValueError, TypeError, KeyError, AttributeError):
        return False
