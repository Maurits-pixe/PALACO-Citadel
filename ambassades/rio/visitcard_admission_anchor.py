"""RIO v2.1 signed admission audit anchor — DRAFT / GO-13 HOLD.

Exports a cryptographically signed exact snapshot of an admission's two-stage
event history. Signature creation is NOT external anchoring: independently
administered transport, durable witness storage and high-water retention are
NOT implemented. REVIEWED is never permission to activate a witness key.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import sqlite3
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from visitcard_witness_admission import audit_admission
from visitcard_witness_enrollment import _canonical

DOMAIN = b"PALACO-RIO-ADMISSION-ANCHOR-V1\x00"
MAX_AGE = timedelta(minutes=5)


@dataclass(frozen=True)
class VerifiedAnchor:
    issuer: str
    nonce: str
    event_count: int
    events_sha256: str
    anchor_id: str


def _signature(value: Any) -> bytes:
    if not isinstance(value, str) or len(value) != 86:
        raise ValueError("invalid signature")
    raw = base64.urlsafe_b64decode(value + "==")
    if len(raw) != 64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii") != value:
        raise ValueError("non-canonical signature")
    return raw


def _snapshot(db: sqlite3.Connection, issuer: str, nonce: str) -> tuple[int, str] | None:
    """Compute a deterministic hash of full local history and admission state."""
    if not audit_admission(db, issuer, nonce):
        return None
    row = db.execute(
        """SELECT issuer,nonce,witness_id,public_key_hex,intake_authority,
                  envelope_sha256,status,reviewer_id,review_signature
           FROM rio_witness_admission WHERE issuer=? AND nonce=?""",
        (issuer, nonce),
    ).fetchone()
    events = db.execute(
        """SELECT event_id,issuer,nonce,kind,envelope_sha256,reviewer_id,signature
           FROM rio_witness_admission_events WHERE issuer=? AND nonce=?
           ORDER BY event_id""",
        (issuer, nonce),
    ).fetchall()
    if row is None or not events:
        return None
    # Event IDs bind the signed proof to this database's observation order.
    content = _canonical({"domain": "RIO-ADMISSION-SNAPSHOT-V1", "admission": row,
                          "events": events})
    return len(events), hashlib.sha256(content).hexdigest()


def sign_admission_anchor(
    db: sqlite3.Connection, issuer: str, nonce: str,
    signer: Ed25519PrivateKey, anchor_id: str, *, now: datetime | None = None
) -> dict[str, Any] | None:
    """Sign a consistent snapshot, not an authorization or remote anchoring."""
    if db.in_transaction:
        return None
    try:
        if not isinstance(signer, Ed25519PrivateKey) or not isinstance(anchor_id, str) or not 0 < len(anchor_id) <= 128:
            return None
        if not isinstance(issuer, str) or not issuer or not isinstance(nonce, str) or not nonce:
            return None
        instant = datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant, datetime) or instant.tzinfo is None or instant.utcoffset() is None:
            return None
        db.execute("BEGIN")
        digest = _snapshot(db, issuer, nonce)
        if digest is None:
            db.rollback()
            return None
        count, events_hash = digest
        payload = {"version": 1, "issuer": issuer, "nonce": nonce,
                   "event_count": count, "events_sha256": events_hash,
                   "observed_at": instant.astimezone(timezone.utc).isoformat()}
        signature = signer.sign(DOMAIN + anchor_id.encode("utf-8") + b"\x00" + _canonical(payload))
        db.commit()
        return {"payload": payload, "anchor_id": anchor_id,
                "signature": base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")}
    except (sqlite3.Error, ValueError, TypeError, OverflowError, AttributeError):
        if db.in_transaction:
            db.rollback()
        return None


def verify_admission_anchor(
    envelope: Any, pinned_anchors: Mapping[str, bytes], *,
    expected_issuer: str, expected_nonce: str, now: datetime | None = None
) -> VerifiedAnchor | None:
    """Verify an externally supplied signed anchor using independently pinned keys."""
    try:
        if not isinstance(envelope, dict) or set(envelope) != {"payload", "anchor_id", "signature"}:
            return None
        payload = envelope["payload"]
        if not isinstance(payload, dict) or set(payload) != {
            "version", "issuer", "nonce", "event_count", "events_sha256", "observed_at"
        }:
            return None
        if type(payload["version"]) is not int or payload["version"] != 1:
            return None
        if payload["issuer"] != expected_issuer or payload["nonce"] != expected_nonce:
            return None
        if not isinstance(expected_issuer, str) or not expected_issuer:
            return None
        if not isinstance(expected_nonce, str) or not expected_nonce:
            return None
        if type(payload["event_count"]) is not int or payload["event_count"] not in (1, 2):
            return None
        digest = payload["events_sha256"]
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            return None
        anchor_id = envelope["anchor_id"]
        if not isinstance(anchor_id, str) or not 0 < len(anchor_id) <= 128:
            return None
        key = pinned_anchors.get(anchor_id)
        if not isinstance(key, bytes) or len(key) != 32:
            return None
        Ed25519PublicKey.from_public_bytes(key).verify(
            _signature(envelope["signature"]),
            DOMAIN + anchor_id.encode("utf-8") + b"\x00" + _canonical(payload),
        )
        observed = datetime.fromisoformat(payload["observed_at"].replace("Z", "+00:00"))
        instant = datetime.now(timezone.utc) if now is None else now
        if (observed.tzinfo is None or observed.utcoffset() is None or
                not isinstance(instant, datetime) or instant.tzinfo is None or instant.utcoffset() is None):
            return None
        age = instant.astimezone(timezone.utc) - observed.astimezone(timezone.utc)
        if age < timedelta(0) or age > MAX_AGE:
            return None
        return VerifiedAnchor(expected_issuer, expected_nonce, payload["event_count"], digest, anchor_id)
    except (ValueError, TypeError, KeyError, AttributeError, InvalidSignature, OverflowError):
        return None


def matches_admission_anchor(db: sqlite3.Connection, anchor: VerifiedAnchor | None) -> bool:
    """Compare local history to a verified anchor; never trust local signing alone."""
    if not isinstance(anchor, VerifiedAnchor):
        return False
    try:
        if db.in_transaction:
            return False
        db.execute("BEGIN")
        snapshot = _snapshot(db, anchor.issuer, anchor.nonce)
        db.commit()
        return snapshot == (anchor.event_count, anchor.events_sha256)
    except (sqlite3.Error, ValueError, TypeError, AttributeError):
        if db.in_transaction:
            db.rollback()
        return False
