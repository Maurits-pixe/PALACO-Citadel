"""RIO legacy recovery compatibility facade — RETIRED / GO-13 HOLD.

The unsafe v1.5 path without signed current-head preflight has been removed.
All invocations delegate to the v1.8 verified gate; the legacy return enum is
retained only for existing callers. Sequence 1 is always blocked and requires
separate authenticated enrollment. No automatic authority is granted.
"""
from __future__ import annotations

from enum import Enum
import sqlite3

from visitcard_witness_recovery_v18 import recover_once_verified, VerifiedRecoveryState
from visitcard_witness_receipt import WitnessTrust


class RecoveryResult(str, Enum):
    ACKNOWLEDGED = "ACKNOWLEDGED"
    PENDING = "PENDING"
    REJECTED = "REJECTED"
    UNKNOWN = "UNKNOWN"


def recover_once(
    db: sqlite3.Connection, issuer: str, sequence: int, trust: WitnessTrust,
    *, operator_approved: bool = False, host: str = "127.0.0.1",
    port: int = 8766, timeout_seconds: float = 2.0
) -> RecoveryResult:
    """Compatibility entrypoint: NEVER bypass mandatory signed-head preflight."""
    outcome = recover_once_verified(
        db, issuer, sequence, trust,
        operator_approved=operator_approved, host=host,
        port=port, timeout_seconds=timeout_seconds,
    )
    return {
        VerifiedRecoveryState.ACKNOWLEDGED: RecoveryResult.ACKNOWLEDGED,
        VerifiedRecoveryState.PENDING: RecoveryResult.PENDING,
        VerifiedRecoveryState.CONFLICT: RecoveryResult.REJECTED,
        VerifiedRecoveryState.UNKNOWN: RecoveryResult.UNKNOWN,
    }[outcome]
