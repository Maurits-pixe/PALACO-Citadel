"""RIO Witness v1.7 freshness-bound head attestation (DRAFT / HOLD).

An independently pinned witness key signs the current journal head plus an
unpredictable caller challenge. A freshly generated challenge prevents reuse
of a prior answer to a different query, but does not protect a compromised
witness store or confer identity/authorization.
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import secrets
import sqlite3
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from visitcard_witness_receipt import WitnessTrust, _canonical
from visitcard_witness_registry import audit_witness

DOMAIN = b"PALACO-RIO-WITNESS-HEAD-V1\x00"
MAX_AGE = timedelta(seconds=60)


def new_challenge() -> str:
    """Return a 256-bit base64url challenge; never persist/reuse it."""
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")


def _nonce(value: Any) -> bool:
    if not isinstance(value, str) or len(value) != 43:
        return False
    try:
        raw = base64.urlsafe_b64decode(value + "=")
        return len(raw) == 32 and base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii") == value
    except (ValueError, TypeError):
        return False


def _signature(value: Any) -> bytes:
    if not isinstance(value, str) or len(value) != 86:
        raise ValueError("invalid signature size")
    raw = base64.urlsafe_b64decode(value + "==")
    if len(raw) != 64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii") != value:
        raise ValueError("invalid signature encoding")
    return raw


def sign_current_head(
    connection: sqlite3.Connection,
    issuer: str,
    challenge: str,
    key: Ed25519PrivateKey,
    witness_id: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    """Read and sign an audited current head; never advance witness state."""
    try:
        if connection.in_transaction or not isinstance(issuer, str) or not 0 < len(issuer) <= 128:
            return None
        if not _nonce(challenge) or not isinstance(key, Ed25519PrivateKey):
            return None
        if not isinstance(witness_id, str) or not 0 < len(witness_id) <= 128:
            return None
        instant = datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant, datetime) or instant.tzinfo is None or instant.utcoffset() is None:
            return None
        connection.execute("BEGIN")
        if not audit_witness(connection, issuer):
            connection.rollback()
            return None
        row = connection.execute(
            "SELECT sequence,entry_hash FROM witness_heads WHERE issuer=?", (issuer,)
        ).fetchone()
        if row is None:
            connection.rollback()
            return None
        payload = {
            "version": 1, "issuer": issuer, "sequence": row[0],
            "entry_hash": row[1], "challenge": challenge,
            "observed_at": instant.astimezone(timezone.utc).isoformat()
        }
        signature = key.sign(DOMAIN + _canonical(payload))
        connection.commit()
        return {"payload": payload, "witness_id": witness_id,
                "signature": base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")}
    except (sqlite3.Error, ValueError, TypeError, AttributeError, OverflowError):
        if connection.in_transaction:
            connection.rollback()
        return None


def verify_current_head(
    envelope: Any,
    trust: WitnessTrust,
    *,
    issuer: str,
    challenge: str,
    now: datetime | None = None
) -> tuple[int, str] | None:
    """Accept only a fresh signed response for exactly this issuer/challenge."""
    try:
        if not _nonce(challenge) or not isinstance(trust, WitnessTrust):
            return None
        if not isinstance(envelope, dict) or set(envelope) != {"payload","witness_id","signature"}:
            return None
        payload = envelope["payload"]
        if not isinstance(payload, dict) or set(payload) != {
            "version","issuer","sequence","entry_hash","challenge","observed_at"
        }:
            return None
        wid = envelope["witness_id"]
        if not isinstance(wid, str) or wid not in trust.public_keys:
            return None
        if type(payload["version"]) is not int or payload["version"] != 1:
            return None
        if payload["issuer"] != issuer or payload["challenge"] != challenge:
            return None
        if type(payload["sequence"]) is not int or not 0 < payload["sequence"] <= 2**63-1:
            return None
        digest = payload["entry_hash"]
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            return None
        pub = trust.public_keys[wid]
        if not isinstance(pub, bytes) or len(pub) != 32:
            return None
        Ed25519PublicKey.from_public_bytes(pub).verify(
            _signature(envelope["signature"]), DOMAIN + _canonical(payload)
        )
        instant = datetime.fromisoformat(payload["observed_at"].replace("Z","+00:00"))
        current = datetime.now(timezone.utc) if now is None else now
        if not isinstance(current, datetime) or current.tzinfo is None or current.utcoffset() is None:
            return None
        if instant.tzinfo is None or instant.utcoffset() is None:
            return None
        age = current.astimezone(timezone.utc) - instant.astimezone(timezone.utc)
        if age < timedelta(0) or age > MAX_AGE:
            return None
        return payload["sequence"], digest
    except (ValueError, TypeError, KeyError, AttributeError, InvalidSignature, OverflowError):
        return None
