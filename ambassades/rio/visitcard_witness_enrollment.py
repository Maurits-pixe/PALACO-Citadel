"""RIO v1.9 witness enrollment evidence contract — DRAFT / HOLD.

Validates two independent Ed25519 proofs: an operator authority's approval
using an OUT-OF-BAND pinned administration key, and proof-of-possession by
the candidate witness private key. It DOES NOT install or trust the new key,
mutate a trust registry, authorize a witness, or bootstrap sequence one.
A human-governed admission ceremony and independently anchored key register
remain mandatory. Do not place private keys or secrets in the envelope.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
import json
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

ADMIN_DOMAIN = b"PALACO-RIO-WITNESS-ENROLL-ADMIN-V1\x00"
POSSESSION_DOMAIN = b"PALACO-RIO-WITNESS-ENROLL-POP-V1\x00"
MAX_WINDOW = timedelta(minutes=15)


@dataclass(frozen=True)
class EnrollmentEvidence:
    issuer: str
    witness_id: str
    candidate_public_key: bytes
    authority_id: str
    expires_at: datetime


def _decode(value: Any, size: int) -> bytes:
    if not isinstance(value, str):
        raise ValueError("invalid base64url")
    raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    if len(raw) != size or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii") != value:
        raise ValueError("noncanonical base64url")
    return raw


def _canonical(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def _stamp(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("invalid timestamp")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None or result.utcoffset() is None:
        raise ValueError("naive time")
    return result.astimezone(timezone.utc)


def verify_enrollment_evidence(
    envelope: Any,
    pinned_authorities: Mapping[str, bytes],
    *,
    expected_issuer: str,
    now: datetime | None = None
) -> EnrollmentEvidence | None:
    """Validate admission evidence only; do NOT register the candidate key."""
    try:
        if not isinstance(envelope, dict) or set(envelope) != {
            "payload", "authority_id", "authority_signature", "candidate_signature"
        }:
            return None
        payload = envelope["payload"]
        if not isinstance(payload, dict) or set(payload) != {
            "version", "issuer", "witness_id", "public_key", "nonce",
            "requested_at", "expires_at"
        }:
            return None
        if type(payload["version"]) is not int or payload["version"] != 1:
            return None
        issuer, witness_id = payload["issuer"], payload["witness_id"]
        if not isinstance(issuer, str) or not issuer or len(issuer) > 128 or issuer != expected_issuer:
            return None
        if not isinstance(witness_id, str) or not 0 < len(witness_id) <= 128:
            return None
        authority_id = envelope["authority_id"]
        if not isinstance(authority_id, str) or not authority_id or len(authority_id) > 128:
            return None
        authority_key = pinned_authorities.get(authority_id)
        if not isinstance(authority_key, bytes) or len(authority_key) != 32:
            return None
        candidate_key = _decode(payload["public_key"], 32)
        _decode(payload["nonce"], 32)
        issued = _stamp(payload["requested_at"])
        expiry = _stamp(payload["expires_at"])
        current = datetime.now(timezone.utc) if now is None else now
        if not isinstance(current, datetime) or current.tzinfo is None or current.utcoffset() is None:
            return None
        current = current.astimezone(timezone.utc)
        if not (issued <= current < expiry) or expiry - issued > MAX_WINDOW:
            return None
        content = _canonical(payload)
        # Binding authority_id in signed data avoids signature reinterpretation.
        authority_msg = ADMIN_DOMAIN + authority_id.encode("utf-8") + b"\x00" + content
        Ed25519PublicKey.from_public_bytes(authority_key).verify(
            _decode(envelope["authority_signature"], 64), authority_msg
        )
        Ed25519PublicKey.from_public_bytes(candidate_key).verify(
            _decode(envelope["candidate_signature"], 64), POSSESSION_DOMAIN + content
        )
        return EnrollmentEvidence(issuer, witness_id, candidate_key, authority_id, expiry)
    except (ValueError, TypeError, KeyError, OverflowError, AttributeError, InvalidSignature):
        return None
