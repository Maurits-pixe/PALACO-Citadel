"""RIO v4.8 audit-to-shared-replay bridge — DRAFT / GO-13 HOLD.

The v4.6 signed local recovery head is validated as a READ-ONLY preflight
(no local challenge consumption). Full dossier+transfer audit and signed
v4.5 checkpoint are verified, then the v4.7 shared SQLite CAS is the sole
replay consumption point. External pins and signing keys MUST be supplied
out-of-band. This is not a distributed atomic transaction: trust inputs can
change between audit and reserve; bind them in an authenticated provisioner.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
import sqlite3
from typing import Any,Mapping

from visitcard_replay_recovery import replay_log_head,verify_replay_highwater
from visitcard_release_transfer_audit import audit_release_transfer,AuditState
from visitcard_audit_checkpoint import verify_checkpoint
from visitcard_shared_replay_cas import (
    reserve_challenge,acknowledge_head,SyncState,SyncResult,
)


class BridgeState(str,Enum):
    RECOVERY_BLOCKED="RECOVERY_BLOCKED"
    AUDIT_BLOCKED="AUDIT_BLOCKED"
    CHECKPOINT_BLOCKED="CHECKPOINT_BLOCKED"
    SHARED_REPLAY_BLOCKED="SHARED_REPLAY_BLOCKED"
    PENDING_EXTERNAL_ACK="PENDING_EXTERNAL_ACK"
    ACKNOWLEDGED_INFORMATIONAL="ACKNOWLEDGED_INFORMATIONAL"


@dataclass(frozen=True)
class BridgeResult:
    state:BridgeState
    blockers:tuple[str,...]
    sequence:int|None=None
    shared_head_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def verify_and_reserve_shared(
    local_recovery_db:sqlite3.Connection,
    shared_replay_db:sqlite3.Connection,*,
    recovery_snapshot:Any,
    pinned_recovery_custodians:Mapping[str,bytes],
    independently_pinned_recovery_snapshot_sha256:str,
    recovery_scope:str,
    dossier_manifest:Any,dossier_manifest_sha256:Any,evidence_bytes:Any,
    pinned_review_keys:Mapping[str,bytes],receipts:Any,
    pinned_transfer_custodians:Mapping[str,bytes],
    independently_pinned_latest_receipt_sha256:str,
    expected_commit_sha:str,
    audit_checkpoint:Any,pinned_auditor_keys:Mapping[str,bytes],
    expected_challenge:str,independently_pinned_checkpoint_sha256:str,
    expected_shared_sequence:int,expected_shared_head_sha256:str,
    independently_pinned_shared_head_sha256:str,
    now:datetime|None=None,
)->BridgeResult:
    """No replay reservation unless ALL evidence checks are consistent."""
    def denied(state:BridgeState,reason:str)->BridgeResult:
        return BridgeResult(state,(reason,))
    if not isinstance(local_recovery_db,sqlite3.Connection) or local_recovery_db.in_transaction:
        return denied(BridgeState.RECOVERY_BLOCKED,"LOCAL_RECOVERY_DATABASE_UNAVAILABLE")
    if not isinstance(shared_replay_db,sqlite3.Connection) or shared_replay_db.in_transaction:
        return denied(BridgeState.SHARED_REPLAY_BLOCKED,"SHARED_DATABASE_UNAVAILABLE")
    # Read-only preflight. The shared CAS, not the local v4.6 table,
    # performs the irreversible replay reservation.
    head=replay_log_head(local_recovery_db)
    if head is None or not verify_replay_highwater(
        recovery_snapshot,pinned_recovery_custodians,
        expected_scope=recovery_scope,expected_commit=expected_commit_sha,
        expected_local_head=head,
        externally_pinned_snapshot_sha256=independently_pinned_recovery_snapshot_sha256
    ):
        return denied(BridgeState.RECOVERY_BLOCKED,"SIGNED_RECOVERY_HEAD_DIVERGES")
    audit=audit_release_transfer(
        dossier_manifest=dossier_manifest,
        dossier_manifest_sha256=dossier_manifest_sha256,
        evidence_bytes=evidence_bytes,pinned_review_keys=pinned_review_keys,
        receipts=receipts,pinned_custodians=pinned_transfer_custodians,
        independently_pinned_latest_receipt_sha256=independently_pinned_latest_receipt_sha256,
        expected_commit_sha=expected_commit_sha,now=now,
    )
    if audit.state!=AuditState.MATCHED_INFORMATIONAL:
        return BridgeResult(BridgeState.AUDIT_BLOCKED,
                            audit.blockers or ("UNDERLYING_AUDIT_FAILED",))
    digest=verify_checkpoint(
        audit_checkpoint,pinned_auditor_keys,
        expected_commit=expected_commit_sha,
        expected_dossier_sha256=audit.dossier_sha256,
        expected_latest_receipt_sha256=audit.latest_receipt_sha256,
        expected_challenge=expected_challenge,
        externally_pinned_checkpoint_sha256=independently_pinned_checkpoint_sha256,
        now=now
    )
    if digest is None:
        return denied(BridgeState.CHECKPOINT_BLOCKED,"AUDIT_CHECKPOINT_INVALID")
    result=reserve_challenge(
        shared_replay_db,challenge=expected_challenge,
        checkpoint_sha256=digest,
        expected_sequence=expected_shared_sequence,
        expected_head_sha256=expected_shared_head_sha256,
        externally_pinned_head_sha256=independently_pinned_shared_head_sha256,
    )
    if result.state!=SyncState.PENDING_EXTERNAL_ACK:
        return BridgeResult(BridgeState.SHARED_REPLAY_BLOCKED,
                            result.blockers or ("SHARED_CAS_FAILED",),
                            result.sequence,result.head_sha256)
    return BridgeResult(BridgeState.PENDING_EXTERNAL_ACK,
                        ("EXTERNAL_ACK_REQUIRED",),result.sequence,result.head_sha256)


def confirm_shared_handoff(
    shared_replay_db:sqlite3.Connection,*,
    receipt:Any,pinned_custodians:Mapping[str,bytes],
    independently_pinned_receipt_sha256:str
)->BridgeResult:
    """Only signed, externally pinned receipt can resolve a pending CAS."""
    r=acknowledge_head(
        shared_replay_db,receipt=receipt,pinned_custodians=pinned_custodians,
        independently_pinned_receipt_sha256=independently_pinned_receipt_sha256
    )
    if r.state!=SyncState.ACKNOWLEDGED_INFORMATIONAL:
        return BridgeResult(BridgeState.SHARED_REPLAY_BLOCKED,r.blockers,
                            r.sequence,r.head_sha256)
    return BridgeResult(BridgeState.ACKNOWLEDGED_INFORMATIONAL,(),
                        r.sequence,r.head_sha256)


def execution_permitted(result:BridgeResult)->bool:
    return False
