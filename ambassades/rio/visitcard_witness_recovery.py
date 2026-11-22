"""RIO v1.5 operator-controlled witness recovery — DRAFT / HOLD.

No scheduler, background retries or automatic replay. An operator explicitly
invokes recover_once for a durable PENDING outbox row. Never synthesize a new
proposal on retry: read the exact stored request and send it once. Only an
independently verified witness receipt may become ACKNOWLEDGED. The returned
state conveys delivery only, not identity verification or authorization.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import sqlite3

from visitcard_recovery_claims import claim_recovery, release_recovery
from visitcard_witness_client import DeliveryState, submit_local_witness
from visitcard_witness_outbox import pending_request, acknowledge, outbox_status
from visitcard_witness_receipt import WitnessTrust


class RecoveryResult(str, Enum):
    ACKNOWLEDGED = "ACKNOWLEDGED"
    PENDING = "PENDING"
    REJECTED = "REJECTED"
    UNKNOWN = "UNKNOWN"


def recover_once(
    db: sqlite3.Connection, issuer: str, sequence: int, trust: WitnessTrust,
    *, operator_approved: bool = False, host: str = "127.0.0.1",
    port: int = 8766, timeout_seconds: float = 2.0,
) -> RecoveryResult:
    """Send one previously saved immutable request, with explicit approval.

    Caller must coordinate recovery operations for the same issuer+sequence,
    and must independently validate that the remote witness's latest signed
    high-water state has not diverged. Not approved for unattended operation.
    """
    if operator_approved is not True:
        return RecoveryResult.UNKNOWN
    if not isinstance(issuer, str) or not issuer or type(sequence) is not int or sequence <= 0:
        return RecoveryResult.UNKNOWN
    if db.in_transaction:
        return RecoveryResult.UNKNOWN
    token = claim_recovery(db, issuer, sequence)
    if token is None:
        # Missing schema, conflict or crash-persisted claim: fail closed.
        return RecoveryResult.UNKNOWN
    try:
        current = outbox_status(db, issuer, sequence)
        if current == "ACKNOWLEDGED":
            return RecoveryResult.ACKNOWLEDGED
        if current != "PENDING":
            return RecoveryResult.UNKNOWN
        immutable = pending_request(db, issuer, sequence)
        if immutable is None:
            return RecoveryResult.UNKNOWN
        delivery = submit_local_witness(
            immutable, trust, expected_issuer=issuer,
            host=host, port=port, timeout_seconds=timeout_seconds,
        )
        if delivery.state == DeliveryState.PENDING:
            return RecoveryResult.PENDING
        if delivery.state == DeliveryState.REJECTED:
            # Keep immutable outbox record pending for manual conflict review.
            return RecoveryResult.REJECTED
        if delivery.state != DeliveryState.ACKNOWLEDGED or delivery.receipt_envelope is None:
            return RecoveryResult.UNKNOWN
        if acknowledge(db, issuer, sequence, delivery.receipt_envelope, trust):
            return RecoveryResult.ACKNOWLEDGED
        return RecoveryResult.UNKNOWN
    finally:
        # A process crash leaves its claim for manual witness reconciliation.
        # Normal return or handled failure releases only this caller's claim.
        release_recovery(db, issuer, sequence, token)
