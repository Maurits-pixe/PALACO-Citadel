"""RIO v1.8 verified witness recovery path — DEVELOPMENT DRAFT / GO-13 HOLD.

Unlike the legacy v1.5 procedure, this opt-in entry point REQUIRES a fresh,
challenge-bound, independently signed witness head before *every* retry.
Signed genesis of a new witness cannot be recovered here: it needs separate
authenticated enrollment outside this module.

No unattended retries, no automatic reconciliation, no access authorization.
"""
from __future__ import annotations

from enum import Enum
import sqlite3

from visitcard_recovery_claims import claim_recovery, release_recovery
from visitcard_witness_client import submit_local_witness, DeliveryState
from visitcard_witness_head_client import read_current_head, assess_current_head, HeadDecision
from visitcard_witness_outbox import pending_request, acknowledge, outbox_status
from visitcard_witness_receipt import WitnessTrust


class VerifiedRecoveryState(str, Enum):
    ACKNOWLEDGED = "ACKNOWLEDGED"
    PENDING = "PENDING"
    CONFLICT = "CONFLICT"
    UNKNOWN = "UNKNOWN"


def recover_once_verified(
    db: sqlite3.Connection, issuer: str, sequence: int,
    witness_trust: WitnessTrust, *,
    operator_approved: bool = False, host: str = "127.0.0.1",
    port: int = 8766, timeout_seconds: float = 2.0
) -> VerifiedRecoveryState:
    """Preflight -> publish exact immutable proposal once -> persist signed receipt.

    Locks are released after handled return; process death leaves the claim
    persisted. HEAD query and publish are not one atomic remote operation:
    the witness server independently rejects forks and skipped sequences.
    """
    if operator_approved is not True:
        return VerifiedRecoveryState.UNKNOWN
    if not isinstance(issuer, str) or not issuer or type(sequence) is not int or sequence < 2:
        # No implicit genesis or bootstrap using an absent witness head.
        return VerifiedRecoveryState.UNKNOWN
    if db.in_transaction or not isinstance(witness_trust, WitnessTrust):
        return VerifiedRecoveryState.UNKNOWN
    if outbox_status(db, issuer, sequence) == "ACKNOWLEDGED":
        # Existing local delivery record; never implies head is still current.
        return VerifiedRecoveryState.ACKNOWLEDGED
    token = claim_recovery(db, issuer, sequence)
    if token is None:
        return VerifiedRecoveryState.UNKNOWN
    try:
        immutable = pending_request(db, issuer, sequence)
        if immutable is None:
            return VerifiedRecoveryState.UNKNOWN
        # Mandatory challenge-response check; no send when unavailable.
        head = read_current_head(
            witness_trust, issuer=issuer, host=host,
            port=port, timeout_seconds=timeout_seconds
        )
        classification = assess_current_head(immutable, head)
        if classification == HeadDecision.UNKNOWN:
            return VerifiedRecoveryState.PENDING
        if classification == HeadDecision.CONFLICT:
            return VerifiedRecoveryState.CONFLICT
        if classification not in (HeadDecision.ALREADY_WITNESSED, HeadDecision.NEXT_PUBLICATION):
            return VerifiedRecoveryState.UNKNOWN
        delivery = submit_local_witness(
            immutable, witness_trust, expected_issuer=issuer,
            host=host, port=port, timeout_seconds=timeout_seconds
        )
        if delivery.state == DeliveryState.PENDING:
            return VerifiedRecoveryState.PENDING
        if delivery.state != DeliveryState.ACKNOWLEDGED or delivery.receipt_envelope is None:
            return VerifiedRecoveryState.CONFLICT if delivery.state == DeliveryState.REJECTED else VerifiedRecoveryState.UNKNOWN
        if acknowledge(db, issuer, sequence, delivery.receipt_envelope, witness_trust):
            return VerifiedRecoveryState.ACKNOWLEDGED
        return VerifiedRecoveryState.UNKNOWN
    finally:
        release_recovery(db, issuer, sequence, token)
