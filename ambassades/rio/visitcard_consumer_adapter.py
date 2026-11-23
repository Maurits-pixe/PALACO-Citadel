"""RIO consumer adapter v3.7 — only the full-chain verification route.

This is a reusable adapter for FUTURE RIO consumers, not a wired public app.
Never import v3.1–3.6 verification APIs into consumer code. GO-13 HOLD.
"""
from __future__ import annotations

from datetime import datetime
import sqlite3

from visitcard_verification_entrypoint import (
    ProofPackage, VerifiedContext, VerificationResult, verify_visitcard,
)


def inspect_visitcard(
    archive_db: sqlite3.Connection,
    governance_db: sqlite3.Connection,
    custodian_db: sqlite3.Connection,
    proof: ProofPackage,
    trust: VerifiedContext,
    *,
    now: datetime | None = None,
) -> VerificationResult:
    """One mandatory consumer route; no fallback or authority conversion."""
    return verify_visitcard(
        archive_db, governance_db, custodian_db,
        proof=proof, trust=trust, now=now,
    )
