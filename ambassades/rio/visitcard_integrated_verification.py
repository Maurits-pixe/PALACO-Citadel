"""RIO v3.1 integrated, read-only publication and freshness gate — DRAFT / GO-13 HOLD.

Caller must obtain the latest receipt and challenge response over authenticated,
independently managed channels. This gate does NOT fetch either, provide trust
roots, grant permissions, authorize recovery or install witness keys. It
verifies both independently signed attestations against the same archived
seal and the complete locally audited archive chain.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
import sqlite3
from typing import Any, Mapping

from visitcard_publication_recovery_gate import (
    RecoveryGate, assess_publication_recovery,
)
from visitcard_fresh_publication_head import verify_fresh_head
from visitcard_checkpoint_archive import _hex
from visitcard_archive_publication import verify_publication_receipt


class IntegratedState(str, Enum):
    MATCHED_INFORMATIONAL = "MATCHED_INFORMATIONAL"
    LOCAL_BEHIND_BLOCKED = "LOCAL_BEHIND_BLOCKED"
    LOCAL_AHEAD_UNCONFIRMED = "LOCAL_AHEAD_UNCONFIRMED"
    FORK_BLOCKED = "FORK_BLOCKED"
    UNKNOWN_BLOCKED = "UNKNOWN_BLOCKED"


def verify_integrated_chain(
    archive_db: sqlite3.Connection,
    publication_receipt: Any,
    fresh_response: Any,
    challenge: str,
    *,
    issuer: str,
    nonce: str,
    witness_keys: Mapping[str, bytes],
    archive_keys: Mapping[str, bytes],
    publisher_keys: Mapping[str, bytes],
    fresh_signer_keys: Mapping[str, bytes],
    now: datetime | None = None,
) -> IntegratedState:
    """Fail closed until BOTH signed attestations agree about the same head.

    A valid signature merely identifies a key holder. Operational freshness,
    security-domain independence and anti-rollback still require deployment
    controls that this read-only code does not implement.
    """
    unknown = IntegratedState.UNKNOWN_BLOCKED
    if archive_db.in_transaction:
        return unknown
    try:
        if not isinstance(publication_receipt, dict):
            return unknown
        payload = publication_receipt.get("payload")
        if not isinstance(payload, dict):
            return unknown
        receipt_count = payload.get("event_count")
        receipt_hash = payload.get("seal_sha256")
        if type(receipt_count) is not int or receipt_count not in (1, 2) or not _hex(receipt_hash):
            return unknown
        # Authenticate the independently supplied publication claim BEFORE
        # comparing its hash to a second signature. A forged claim is UNKNOWN,
        # not a genuine cryptographic fork.
        if not verify_publication_receipt(
            publication_receipt, publisher_keys,
            issuer=issuer, nonce=nonce,
            event_count=receipt_count, seal_sha256=receipt_hash,
        ):
            return unknown
        # Fresh attestation includes the expected random challenge and a
        # bounded UTC timestamp, verified against a separately pinned key.
        head = verify_fresh_head(
            fresh_response, fresh_signer_keys, issuer=issuer, nonce=nonce,
            expected_challenge=challenge, now=now,
        )
        if head is None:
            return unknown
        # A fresh signer and a publication custodian must agree on one exact
        # hash. Different counts imply incomplete independent replication;
        # same-count mismatches are an explicit fork, never "verified".
        if head[0] != receipt_count:
            return unknown
        if head[1] != receipt_hash:
            return IntegratedState.FORK_BLOCKED

        local = assess_publication_recovery(
            archive_db, publication_receipt,
            issuer=issuer, nonce=nonce, witness_keys=witness_keys,
            archive_keys=archive_keys, publisher_keys=publisher_keys,
        )
        return {
            RecoveryGate.MATCHED_INFORMATIONAL: IntegratedState.MATCHED_INFORMATIONAL,
            RecoveryGate.LOCAL_BEHIND_BLOCKED: IntegratedState.LOCAL_BEHIND_BLOCKED,
            RecoveryGate.LOCAL_AHEAD_UNCONFIRMED: IntegratedState.LOCAL_AHEAD_UNCONFIRMED,
            RecoveryGate.FORK_BLOCKED: IntegratedState.FORK_BLOCKED,
            RecoveryGate.UNKNOWN_BLOCKED: IntegratedState.UNKNOWN_BLOCKED,
        }.get(local, unknown)
    except (sqlite3.Error, TypeError, KeyError, ValueError, AttributeError):
        return unknown


def execution_permitted(state: IntegratedState) -> bool:
    """Constitutional HOLD: verification never equals authorization."""
    return False
