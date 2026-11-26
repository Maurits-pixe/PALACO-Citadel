"""RIO VisitCard v0.7 proof-consumption gate (DRAFT; display-only).

Provides configured key-rotation windows and a rollback-resistant snapshot
checkpoint check. This does not store the checkpoint: the caller MUST obtain
the checkpoint from durable, trusted, non-rollback storage and atomically
advance it before treating any status as current. If unavailable, UNKNOWN.
No account access or sending permissions are granted.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from typing import Any, Mapping

from visitcard_ed25519_verifier import TrustedRegistry, _canonical, _dt, verify_visitcard
from visitcard_trust_policy import DisplayStatus


@dataclass(frozen=True)
class KeyWindow:
    issuer: str
    public_key: bytes
    not_before: datetime
    not_after: datetime


@dataclass(frozen=True)
class SnapshotCheckpoint:
    issuer: str
    checked_at: datetime
    digest_hex: str


@dataclass(frozen=True)
class GateConfiguration:
    issuer_windows: tuple[KeyWindow, ...]
    revocation_windows: tuple[KeyWindow, ...]


def _active_key(windows: tuple[KeyWindow, ...], issuer: str, now: datetime) -> bytes:
    matches = []
    for window in windows:
        if window.issuer != issuer:
            continue
        if not isinstance(window.public_key, bytes) or len(window.public_key) != 32:
            raise ValueError("bad key")
        if not isinstance(window.not_before, datetime) or not isinstance(window.not_after, datetime):
            raise ValueError("bad key window")
        if window.not_before.tzinfo is None or window.not_after.tzinfo is None:
            raise ValueError("naive key window")
        start = window.not_before.astimezone(timezone.utc)
        end = window.not_after.astimezone(timezone.utc)
        if start >= end:
            raise ValueError("inverted key window")
        if start <= now < end:
            matches.append(window.public_key)
    # Fail closed on overlapping active windows. No implicit "first key wins".
    if len(matches) != 1:
        raise ValueError("missing or ambiguous active key")
    return matches[0]


def _checkpoint_matches(snapshot: Any, checkpoint: SnapshotCheckpoint, issuer: str) -> bool:
    if not isinstance(checkpoint, SnapshotCheckpoint):
        return False
    if checkpoint.issuer != issuer or not isinstance(checkpoint.checked_at, datetime):
        return False
    if checkpoint.checked_at.tzinfo is None:
        return False
    if not isinstance(checkpoint.digest_hex, str) or len(checkpoint.digest_hex) != 64:
        return False
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("payload"), dict):
        return False
    payload = snapshot["payload"]
    if payload.get("issuer") != issuer:
        return False
    checked_at = _dt(payload.get("checked_at"))
    stored = checkpoint.checked_at.astimezone(timezone.utc)
    if checked_at < stored:
        return False
    # Equal timestamp MUST be bitwise the same signed snapshot envelope.
    current_digest = hashlib.sha256(_canonical(snapshot)).hexdigest()
    if checked_at == stored and current_digest != checkpoint.digest_hex:
        return False
    return True


def evaluate_visitcard(
    credential: Any,
    revocation_snapshot: Any,
    configuration: GateConfiguration,
    checkpoint: SnapshotCheckpoint,
    *,
    expected_issuer: str,
    expected_subject: str,
    expected_audience: str,
    now: datetime | None = None,
) -> DisplayStatus:
    """Fail closed if trust anchors or durable checkpoint cannot be established.

    Caller MUST update checkpoint atomically with verification acceptance.
    The returned value is display-only; it is NOT an authorization token.
    """
    try:
        now = now if now is not None else datetime.now(timezone.utc)
        if not isinstance(now, datetime) or now.tzinfo is None or now.utcoffset() is None:
            return DisplayStatus.UNKNOWN
        now = now.astimezone(timezone.utc)
        if not isinstance(configuration, GateConfiguration):
            return DisplayStatus.UNKNOWN
        if not isinstance(expected_issuer, str) or not expected_issuer:
            return DisplayStatus.UNKNOWN
        if not isinstance(credential, dict) or not isinstance(credential.get("payload"), dict):
            return DisplayStatus.UNKNOWN
        if credential["payload"].get("issuer") != expected_issuer:
            return DisplayStatus.UNKNOWN
        if not _checkpoint_matches(revocation_snapshot, checkpoint, expected_issuer):
            return DisplayStatus.UNKNOWN
        issuer_key = _active_key(configuration.issuer_windows, expected_issuer, now)
        revocation_key = _active_key(configuration.revocation_windows, expected_issuer, now)
        registry = TrustedRegistry(
            issuer_keys={expected_issuer: issuer_key},
            revocation_keys={expected_issuer: revocation_key},
        )
        return verify_visitcard(
            credential, revocation_snapshot, registry,
            expected_subject=expected_subject,
            expected_audience=expected_audience,
            now=now,
        )
    except (ValueError, TypeError, AttributeError, KeyError, OverflowError):
        return DisplayStatus.UNKNOWN


def snapshot_checkpoint(snapshot: Mapping[str, Any]) -> SnapshotCheckpoint:
    """Build a checkpoint candidate only; requires trusted durable persistence.

    Do not accept a caller-supplied checkpoint without reading trusted storage.
    """
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("payload"), dict):
        raise ValueError("invalid snapshot")
    payload = snapshot["payload"]
    if not isinstance(payload.get("issuer"), str) or not payload["issuer"]:
        raise ValueError("issuer absent")
    return SnapshotCheckpoint(
        issuer=payload["issuer"],
        checked_at=_dt(payload.get("checked_at")),
        digest_hex=hashlib.sha256(_canonical(snapshot)).hexdigest(),
    )
