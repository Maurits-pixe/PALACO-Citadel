"""RIO consumer adapter v4.0 — provenance REQUIRED, never authorized.

Only the out-of-band pinned manifest can establish trusted key origin.
This is a private DRAFT adapter, not a production endpoint. GO-13 HOLD.
"""
from __future__ import annotations

from datetime import datetime
import sqlite3
from typing import Any, Mapping

from visitcard_verification_entrypoint import (
    ProofPackage, VerifiedContext, VerificationResult,
)
from visitcard_trust_provenance import verify_with_trust_provenance


def inspect_visitcard(
    archive_db: sqlite3.Connection,
    governance_db: sqlite3.Connection,
    custodian_db: sqlite3.Connection,
    proof: ProofPackage,
    trust: VerifiedContext,
    *,
    manifest: Any,
    independently_pinned_roots: Mapping[str, bytes],
    externally_pinned_manifest_sha256: str,
    now: datetime | None = None,
) -> VerificationResult:
    """No legacy verifier fallback; requires signed externally pinned trust."""
    return verify_with_trust_provenance(
        archive_db, governance_db, custodian_db,
        proof=proof, trust=trust, manifest=manifest,
        independently_pinned_roots=independently_pinned_roots,
        externally_pinned_manifest_sha256=externally_pinned_manifest_sha256,
        now=now,
    )
