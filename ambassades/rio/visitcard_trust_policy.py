"""Fail-closed decision policy for future RIO VisitCard verification (DRAFT).

This module does NOT perform cryptographic verification or grant permissions.
Only an independently audited trusted verification service may supply
ValidationEvidence; callers must not turn untrusted QR claims into evidence.

Outputs are display-only. No identity login, messaging or authorization.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum


class DisplayStatus(str, Enum):
    UNKNOWN = "UNKNOWN"
    VERIFIED = "VERIFIED"
    REVOKED = "REVOKED"


@dataclass(frozen=True)
class ValidationEvidence:
    # Values must originate from a trusted, separately verified service.
    signature_valid: bool = False
    issuer_trusted: bool = False
    subject_bound: bool = False
    audience_bound: bool = False
    revocation_checked: bool = False
    revoked: bool = False
    expires_at: datetime | None = None


def assess(evidence: ValidationEvidence | None, *, now: datetime | None = None) -> DisplayStatus:
    """Return a display status; never an access-control decision.

    Revoked is displayed only after trusted evidence of revocation. Any missing,
    expired, malformed or incomplete evidence is UNKNOWN (fail closed).
    """
    if evidence is None or not isinstance(evidence, ValidationEvidence):
        return DisplayStatus.UNKNOWN
    if now is None:
        now = datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() is None:
        return DisplayStatus.UNKNOWN
    if not evidence.signature_valid or not evidence.issuer_trusted:
        return DisplayStatus.UNKNOWN
    if not evidence.subject_bound or not evidence.audience_bound:
        return DisplayStatus.UNKNOWN
    if not evidence.revocation_checked:
        return DisplayStatus.UNKNOWN
    if not isinstance(evidence.expires_at, datetime):
        return DisplayStatus.UNKNOWN
    if evidence.expires_at.tzinfo is None or evidence.expires_at.utcoffset() is None:
        return DisplayStatus.UNKNOWN
    if now >= evidence.expires_at:
        return DisplayStatus.UNKNOWN
    if evidence.revoked:
        return DisplayStatus.REVOKED
    return DisplayStatus.VERIFIED
