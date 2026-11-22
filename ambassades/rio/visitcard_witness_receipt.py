"""RIO v1.0 independently signed witness receipt contract (DRAFT / HOLD).

Only independently provisioned public keys may verify witness receipts.
This is an offline receipt verifier and recovery classifier, NOT an external
witness service, transport, durable witness acknowledgment, or authorization.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from enum import Enum
import json
import sqlite3
from typing import Any, Mapping

from visitcard_audit_journal import WitnessHead, inspect_journal

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
except ImportError:
    InvalidSignature = Exception
    Ed25519PublicKey = None

DOMAIN = b"PALACO-RIO-WITNESS-RECEIPT-V1\x00"
MAX_RECEIPT_AGE = timedelta(days=7)


class RecoveryState(str, Enum):
    UNKNOWN = "UNKNOWN"
    MATCHED = "MATCHED"
    LOCAL_AHEAD_PENDING_WITNESS = "LOCAL_AHEAD_PENDING_WITNESS"
    LOCAL_BEHIND_ROLLBACK_SUSPECTED = "LOCAL_BEHIND_ROLLBACK_SUSPECTED"
    FORK_CONFLICT = "FORK_CONFLICT"


@dataclass(frozen=True)
class WitnessTrust:
    """Pinned independent witness keys. Never read these from a QR or receipt."""
    public_keys: Mapping[str, bytes]


@dataclass(frozen=True)
class VerifiedReceipt:
    head: WitnessHead
    witness_id: str
    observed_at: datetime


def _canonical(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("utf-8")


def _timestamp(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("invalid timestamp")
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if stamp.tzinfo is None or stamp.utcoffset() is None:
        raise ValueError("naive timestamp")
    return stamp.astimezone(timezone.utc)


def _hex64(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def verify_witness_receipt(
    envelope: Any, trust: WitnessTrust, *, expected_issuer: str,
    now: datetime | None = None
) -> VerifiedReceipt | None:
    """Verify an external receipt independently, without deriving keys from it."""
    try:
        if Ed25519PublicKey is None or not isinstance(trust, WitnessTrust):
            return None
        if not isinstance(envelope, dict) or set(envelope) != {"payload", "witness_id", "signature"}:
            return None
        payload, witness_id, signature = envelope["payload"], envelope["witness_id"], envelope["signature"]
        if not isinstance(payload, dict) or set(payload) != {"version", "issuer", "sequence", "entry_hash", "observed_at"}:
            return None
        if not isinstance(witness_id, str) or not witness_id or len(witness_id) > 128:
            return None
        if witness_id not in trust.public_keys:
            return None
        if not isinstance(expected_issuer, str) or not expected_issuer or payload["issuer"] != expected_issuer:
            return None
        if type(payload["version"]) is not int or payload["version"] != 1:
            return None
        if type(payload["sequence"]) is not int or payload["sequence"] <= 0 or not _hex64(payload["entry_hash"]):
            return None
        if not isinstance(signature, str) or len(signature) != 86:
            return None
        if any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in signature):
            return None
        raw = base64.urlsafe_b64decode(signature + "==")
        if len(raw) != 64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii") != signature:
            return None
        key = trust.public_keys[witness_id]
        if not isinstance(key, bytes) or len(key) != 32:
            return None
        Ed25519PublicKey.from_public_bytes(key).verify(raw, DOMAIN + _canonical(payload))
        observed = _timestamp(payload["observed_at"])
        current = now if now is not None else datetime.now(timezone.utc)
        if not isinstance(current, datetime) or current.tzinfo is None or current.utcoffset() is None:
            return None
        current = current.astimezone(timezone.utc)
        if observed > current or current - observed > MAX_RECEIPT_AGE:
            return None
        return VerifiedReceipt(
            WitnessHead(expected_issuer, payload["sequence"], payload["entry_hash"]),
            witness_id, observed
        )
    except (ValueError, TypeError, KeyError, OverflowError, AttributeError, InvalidSignature):
        return None


def reconcile_witness(
    connection: sqlite3.Connection,
    receipt: VerifiedReceipt | None,
    *, expected_issuer: str
) -> RecoveryState:
    """Classify state only: NEVER authorize or silently repair local data.

    A local-ahead journal can be pending publication; a witnessed-ahead journal
    indicates missing local history. Same-sequence mismatches are forks.
    """
    try:
        if not isinstance(receipt, VerifiedReceipt) or receipt.head.issuer != expected_issuer:
            return RecoveryState.UNKNOWN
        local = inspect_journal(connection, expected_issuer)
        if local is None:
            return RecoveryState.UNKNOWN
        if local.sequence < receipt.head.sequence:
            return RecoveryState.LOCAL_BEHIND_ROLLBACK_SUSPECTED
        if local.sequence == receipt.head.sequence:
            return RecoveryState.MATCHED if local.entry_hash == receipt.head.entry_hash else RecoveryState.FORK_CONFLICT
        # If local has advanced beyond the witness, prove the witnessed prefix.
        row = connection.execute(
            "SELECT entry_hash FROM rio_checkpoint_journal WHERE issuer=? AND sequence=?",
            (expected_issuer, receipt.head.sequence)
        ).fetchone()
        if row is None or row[0] != receipt.head.entry_hash:
            return RecoveryState.FORK_CONFLICT
        return RecoveryState.LOCAL_AHEAD_PENDING_WITNESS
    except (sqlite3.Error, ValueError, TypeError, AttributeError, KeyError):
        return RecoveryState.UNKNOWN


def verify_and_reconcile(
    connection: sqlite3.Connection,
    envelope: Any,
    trust: WitnessTrust,
    *,
    expected_issuer: str,
    now: datetime | None = None
) -> RecoveryState:
    """Only public recovery entry point: verify independently before comparing.

    The state is informational and confers no identity or execution authority.
    In particular, LOCAL_AHEAD_PENDING_WITNESS is NOT a successful receipt.
    """
    verified = verify_witness_receipt(
        envelope, trust, expected_issuer=expected_issuer, now=now
    )
    if verified is None:
        return RecoveryState.UNKNOWN
    return reconcile_witness(connection, verified, expected_issuer=expected_issuer)
