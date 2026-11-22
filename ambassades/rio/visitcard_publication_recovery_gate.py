"""RIO v2.9 fail-closed publication reconciliation gate — DRAFT / GO-13 HOLD.

Read-only classification against a separately delivered signed publication
receipt. There is NO auto-recovery, approval, registration, key activation,
HTTP fetch or authority. A matching receipt proves only signature/binding
consistency, not actual external administrative independence or freshness.
"""
from __future__ import annotations

from enum import Enum
import sqlite3
from typing import Any, Mapping

from visitcard_archive_publication import verify_publication_receipt
from visitcard_checkpoint_archive import audit_archive, _packed, _digest, _hex


class RecoveryGate(str, Enum):
    MATCHED_INFORMATIONAL = "MATCHED_INFORMATIONAL"
    LOCAL_BEHIND_BLOCKED = "LOCAL_BEHIND_BLOCKED"
    LOCAL_AHEAD_UNCONFIRMED = "LOCAL_AHEAD_UNCONFIRMED"
    FORK_BLOCKED = "FORK_BLOCKED"
    UNKNOWN_BLOCKED = "UNKNOWN_BLOCKED"


def assess_publication_recovery(
    archive_db: sqlite3.Connection,
    independently_received_receipt: Any,
    *,
    issuer: str,
    nonce: str,
    witness_keys: Mapping[str, bytes],
    archive_keys: Mapping[str, bytes],
    publisher_keys: Mapping[str, bytes],
) -> RecoveryGate:
    """Fail closed unless the *audited* local archive matches the signed receipt.

    The caller must independently obtain and protect the latest publication
    receipt. An old but valid receipt is insufficient to assert global
    currency; MATCHED_INFORMATIONAL never authorizes a recovery operation.
    """
    unknown = RecoveryGate.UNKNOWN_BLOCKED
    if archive_db.in_transaction:
        return unknown
    try:
        if not isinstance(issuer, str) or not issuer or not isinstance(nonce, str) or not nonce:
            return unknown
        if not isinstance(independently_received_receipt, dict):
            return unknown
        payload = independently_received_receipt.get("payload")
        if not isinstance(payload, dict):
            return unknown
        count = payload.get("event_count")
        digest = payload.get("seal_sha256")
        if type(count) is not int or count not in (1, 2) or not _hex(digest):
            return unknown
        if not verify_publication_receipt(
            independently_received_receipt, publisher_keys,
            issuer=issuer, nonce=nonce, event_count=count, seal_sha256=digest
        ):
            return unknown
        if not audit_archive(archive_db, issuer, nonce, witness_keys, archive_keys):
            return unknown
        head = archive_db.execute(
            """SELECT event_count,seal_sha256
               FROM rio_checkpoint_archive_head WHERE issuer=? AND nonce=?""",
            (issuer, nonce)
        ).fetchone()
        if head is None or type(head[0]) is not int or head[0] not in (1, 2) or not _hex(head[1]):
            return unknown
        local_count, local_digest = head
        if local_count < count:
            return RecoveryGate.LOCAL_BEHIND_BLOCKED
        if local_count > count:
            return RecoveryGate.LOCAL_AHEAD_UNCONFIRMED
        if local_digest != digest:
            return RecoveryGate.FORK_BLOCKED
        row = archive_db.execute(
            """SELECT seal_json FROM rio_checkpoint_archive_history
               WHERE issuer=? AND nonce=? AND event_count=?""",
            (issuer, nonce, count)
        ).fetchone()
        if row is None:
            return unknown
        import json
        local_seal = json.loads(row[0])
        if _digest(_packed(local_seal)) != digest:
            return unknown
        if local_seal["payload"]["previous_seal_sha256"] != payload.get("previous_seal_sha256"):
            return RecoveryGate.FORK_BLOCKED
        return RecoveryGate.MATCHED_INFORMATIONAL
    except (sqlite3.Error, KeyError, TypeError, ValueError, AttributeError):
        return unknown


def recovery_permitted(state: RecoveryGate) -> bool:
    """An informational signature comparison can NEVER authorize execution."""
    return False
