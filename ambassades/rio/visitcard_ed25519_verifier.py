"""RIO VisitCard signed-envelope verifier, experimental and display-only.

Requires `cryptography`. All signing keys must be provisioned out of band.
This module NEVER grants account, communication or execution authority.
Untrusted JSON/QR data MUST NOT supply its own trust keys.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
import json
from typing import Any, Mapping

from visitcard_trust_policy import DisplayStatus, ValidationEvidence, assess

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.exceptions import InvalidSignature
except ImportError:
    Ed25519PublicKey = None
    InvalidSignature = Exception

DOMAIN_CARD = b"PALACO-RIO-VISITCARD-V1\x00"
DOMAIN_REVOCATION = b"PALACO-RIO-REVOCATION-V1\x00"
MAX_SNAPSHOT_AGE = timedelta(hours=1)
MAX_CREDENTIAL_AGE = timedelta(days=365)


@dataclass(frozen=True)
class TrustedRegistry:
    """Trusted configuration only, never sourced from credential/QR contents."""
    issuer_keys: Mapping[str, bytes]
    revocation_keys: Mapping[str, bytes]


def _canonical(data: Mapping[str, Any]) -> bytes:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def _dt(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("invalid timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("timestamp missing timezone")
    return parsed.astimezone(timezone.utc)


def _signature(raw: str) -> bytes:
    if not isinstance(raw, str) or not raw or len(raw) > 128:
        raise ValueError("invalid signature")
    if any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in raw):
        raise ValueError("signature encoding")
    output = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    if len(output) != 64 or base64.urlsafe_b64encode(output).rstrip(b"=").decode() != raw:
        raise ValueError("invalid signature length/canonical form")
    return output


def _signed(envelope: Any, keys: Mapping[str, bytes], domain: bytes) -> Mapping[str, Any]:
    if Ed25519PublicKey is None:
        raise ValueError("crypto library unavailable")
    if not isinstance(envelope, dict) or set(envelope) != {"payload", "signature", "key_id"}:
        raise ValueError("invalid envelope")
    payload, key_id = envelope["payload"], envelope["key_id"]
    if not isinstance(payload, dict) or not isinstance(key_id, str):
        raise ValueError("invalid payload or key ID")
    # Registry keys are scoped to issuer identity, not arbitrary key aliases.
    if not key_id or len(key_id) > 128 or key_id not in keys or payload.get("issuer") != key_id:
        raise ValueError("untrusted issuer or key")
    key = keys[key_id]
    if not isinstance(key, bytes) or len(key) != 32:
        raise ValueError("invalid trusted key")
    Ed25519PublicKey.from_public_bytes(key).verify(
        _signature(envelope["signature"]), domain + _canonical(payload)
    )
    return payload


def verify_visitcard(
    credential: Any, revocation_snapshot: Any, trust: TrustedRegistry,
    *, expected_subject: str, expected_audience: str, now: datetime | None = None
) -> DisplayStatus:
    """Fail-closed cryptographic status for UI display, NOT authorization.

    Both the credential and revocation snapshot require independently trusted
    Ed25519 signatures; snapshot freshness is bounded to one hour.
    """
    try:
        if not isinstance(trust, TrustedRegistry):
            return DisplayStatus.UNKNOWN
        if not isinstance(expected_subject, str) or not expected_subject or not isinstance(expected_audience, str) or not expected_audience:
            return DisplayStatus.UNKNOWN
        now = now or datetime.now(timezone.utc)
        if not isinstance(now, datetime) or now.tzinfo is None or now.utcoffset() is None:
            return DisplayStatus.UNKNOWN
        now = now.astimezone(timezone.utc)
        card = _signed(credential, trust.issuer_keys, DOMAIN_CARD)
        snap = _signed(revocation_snapshot, trust.revocation_keys, DOMAIN_REVOCATION)
        if set(card) != {"version", "credential_id", "issuer", "subject", "audience", "issued_at", "expires_at"}:
            return DisplayStatus.UNKNOWN
        if set(snap) != {"version", "issuer", "checked_at", "revoked_ids"}:
            return DisplayStatus.UNKNOWN
        if card["version"] != 1 or snap["version"] != 1:
            return DisplayStatus.UNKNOWN
        if not all(isinstance(card[k], str) and 0 < len(card[k]) <= 256 for k in ("credential_id", "issuer", "subject", "audience")):
            return DisplayStatus.UNKNOWN
        if snap["issuer"] != card["issuer"] or card["subject"] != expected_subject or card["audience"] != expected_audience:
            return DisplayStatus.UNKNOWN
        revoked = snap["revoked_ids"]
        if not isinstance(revoked, list) or len(revoked) > 10000 or any(not isinstance(v, str) or not v for v in revoked):
            return DisplayStatus.UNKNOWN
        if len(set(revoked)) != len(revoked):
            return DisplayStatus.UNKNOWN
        issued, expiry, checked = _dt(card["issued_at"]), _dt(card["expires_at"]), _dt(snap["checked_at"])
        if not (issued <= now < expiry) or expiry <= issued or expiry - issued > MAX_CREDENTIAL_AGE:
            return DisplayStatus.UNKNOWN
        if not (checked <= now and now - checked <= MAX_SNAPSHOT_AGE):
            return DisplayStatus.UNKNOWN
        evidence = ValidationEvidence(
            signature_valid=True, issuer_trusted=True, subject_bound=True,
            audience_bound=True, revocation_checked=True,
            revoked=card["credential_id"] in revoked, expires_at=expiry,
        )
        return assess(evidence, now=now)
    except (ValueError, TypeError, OverflowError, InvalidSignature, AttributeError, KeyError):
        return DisplayStatus.UNKNOWN
