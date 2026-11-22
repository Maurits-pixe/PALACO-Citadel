"""RIO v2.2 separately provisioned anchor custody prototype — DRAFT / HOLD.

Run on an independently administered database/host with independently pinned
anchor producer keys and a custody signing key. This is NOT deployed external
storage. No network transport, HSM, independent backup, or anti-rollback of
the custody database itself is provided. No activation or access authority.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import json
import sqlite3
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from visitcard_admission_anchor import verify_admission_anchor, VerifiedAnchor, _signature
from visitcard_witness_enrollment import _canonical

RECEIPT_DOMAIN = b"PALACO-RIO-ANCHOR-CUSTODY-RECEIPT-V1\x00"

SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_anchor_custody (
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 events_sha256 TEXT NOT NULL,
 anchor_id TEXT NOT NULL,
 anchor_json TEXT NOT NULL,
 receipt_json TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce)
);
CREATE TABLE IF NOT EXISTS rio_anchor_custody_history (
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 events_sha256 TEXT NOT NULL,
 anchor_json TEXT NOT NULL,
 receipt_json TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce,event_count)
);
CREATE TRIGGER IF NOT EXISTS rio_custody_history_no_update
 BEFORE UPDATE ON rio_anchor_custody_history BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_custody_history_no_delete
 BEFORE DELETE ON rio_anchor_custody_history BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_custody_no_delete
 BEFORE DELETE ON rio_anchor_custody BEGIN SELECT RAISE(ABORT,'no-delete'); END;
"""


def initialize_custody(db: sqlite3.Connection) -> None:
    if db.in_transaction:
        raise ValueError("migration inside transaction")
    db.executescript(SCHEMA)


def _packed(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _receipt(
    anchor: VerifiedAnchor, custody_key: Ed25519PrivateKey, custody_id: str,
    now: datetime,
) -> dict[str, Any]:
    payload = {
        "version": 1, "issuer": anchor.issuer, "nonce": anchor.nonce,
        "event_count": anchor.event_count, "events_sha256": anchor.events_sha256,
        "observed_at": now.astimezone(timezone.utc).isoformat(),
    }
    sig = custody_key.sign(RECEIPT_DOMAIN + custody_id.encode("utf-8") + b"\x00" + _canonical(payload))
    return {"payload": payload, "custody_id": custody_id,
            "signature": base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")}


def archive_anchor(
    db: sqlite3.Connection, envelope: Any, producer_keys: Mapping[str, bytes],
    custody_key: Ed25519PrivateKey, custody_id: str, *,
    expected_issuer: str, expected_nonce: str, now: datetime | None = None,
) -> dict[str, Any] | None:
    """Sign receipt only after durable independent-DB transaction commits."""
    if db.in_transaction:
        return None
    try:
        if not isinstance(custody_key, Ed25519PrivateKey) or not isinstance(custody_id, str) or not 0 < len(custody_id) <= 128:
            return None
        instant = datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant, datetime) or instant.tzinfo is None or instant.utcoffset() is None:
            return None
        verified = verify_admission_anchor(
            envelope, producer_keys, expected_issuer=expected_issuer,
            expected_nonce=expected_nonce, now=instant
        )
        if verified is None:
            return None
        packed = _packed(envelope)
        if len(packed.encode("utf-8")) > 4096:
            return None
        db.execute("BEGIN IMMEDIATE")
        head = db.execute(
            """SELECT event_count,events_sha256,anchor_id,anchor_json,receipt_json
               FROM rio_anchor_custody WHERE issuer=? AND nonce=?""",
            (verified.issuer, verified.nonce)
        ).fetchone()
        if head is not None:
            if verified.event_count == head[0] and verified.events_sha256 == head[1]:
                # Same anchored state already committed; no new receipt.
                saved = json.loads(head[4])
                db.commit()
                return saved
            if head[0] != 1 or verified.event_count != 2:
                db.rollback()
                return None
            # REVIEWED state must extend the earlier SUBMITTED state. Both
            # hashes are retained, but this receipt does not prove extension
            # cryptographically without source event inclusion proofs.
        elif verified.event_count != 1:
            db.rollback()
            return None
        receipt = _receipt(verified, custody_key, custody_id, instant)
        recorded = _packed(receipt)
        db.execute(
            """INSERT INTO rio_anchor_custody_history
               (issuer,nonce,event_count,events_sha256,anchor_json,receipt_json)
               VALUES (?,?,?,?,?,?)""",
            (verified.issuer,verified.nonce,verified.event_count,verified.events_sha256,packed,recorded),
        )
        db.execute(
            """INSERT INTO rio_anchor_custody
               (issuer,nonce,event_count,events_sha256,anchor_id,anchor_json,receipt_json)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(issuer,nonce) DO UPDATE SET
               event_count=excluded.event_count,events_sha256=excluded.events_sha256,
               anchor_id=excluded.anchor_id,anchor_json=excluded.anchor_json,
               receipt_json=excluded.receipt_json""",
            (verified.issuer,verified.nonce,verified.event_count,verified.events_sha256,
             verified.anchor_id,packed,recorded),
        )
        db.commit()
        return receipt
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,InvalidSignature):
        if db.in_transaction:
            db.rollback()
        return None


def verify_custody_receipt(
    envelope: Any, custody_keys: Mapping[str, bytes], *,
    expected_issuer: str, expected_nonce: str,
    expected_count: int, expected_hash: str,
) -> bool:
    """Verify independently pinned custody signature and exact anchor identity."""
    try:
        if not isinstance(envelope, dict) or set(envelope) != {"payload","custody_id","signature"}:
            return False
        payload = envelope["payload"]
        if not isinstance(payload, dict) or set(payload) != {
            "version","issuer","nonce","event_count","events_sha256","observed_at"
        }:
            return False
        if type(payload["version"]) is not int or payload["version"] != 1:
            return False
        if (payload["issuer"] != expected_issuer or payload["nonce"] != expected_nonce or
            type(payload["event_count"]) is not int or payload["event_count"] != expected_count or
            payload["events_sha256"] != expected_hash):
            return False
        if not isinstance(expected_hash,str) or len(expected_hash)!=64 or any(c not in "0123456789abcdef" for c in expected_hash):
            return False
        cid = envelope["custody_id"]
        if not isinstance(cid,str) or not cid or len(cid)>128:
            return False
        key = custody_keys.get(cid)
        if not isinstance(key,bytes) or len(key)!=32:
            return False
        stamp = datetime.fromisoformat(payload["observed_at"].replace("Z","+00:00"))
        if stamp.tzinfo is None or stamp.utcoffset() is None:
            return False
        Ed25519PublicKey.from_public_bytes(key).verify(
            _signature(envelope["signature"]),
            RECEIPT_DOMAIN + cid.encode("utf-8") + b"\x00" + _canonical(payload),
        )
        return True
    except (ValueError,TypeError,KeyError,AttributeError,InvalidSignature,OverflowError):
        return False
