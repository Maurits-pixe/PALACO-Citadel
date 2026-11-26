"""RIO v4.9 restart-safe pending session inspection and signed acknowledgement.

Read-only inspection verifies an untrusted SQLite replay ledger and binds
the pending event to out-of-band expected challenge, checkpoint, and head.
A pending event can ONLY be finalized by the existing signed v4.7
acknowledgement gate, never by local timeout or re-issuing a challenge.

DRAFT/GO-13 HOLD: no remote custodian, durable external pins or authorization.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import sqlite3
from typing import Any,Mapping

from visitcard_release_review import _hex
from visitcard_shared_replay_cas import (
    GENESIS,read_shared_head,acknowledge_head,SyncState,_challenge,
)


class PendingState(str,Enum):
    PENDING_EXTERNAL_ACK="PENDING_EXTERNAL_ACK"
    ACKNOWLEDGED_INFORMATIONAL="ACKNOWLEDGED_INFORMATIONAL"
    NO_PENDING="NO_PENDING"
    BLOCKED="BLOCKED"


@dataclass(frozen=True)
class PendingReview:
    state:PendingState
    blockers:tuple[str,...]
    sequence:int|None=None
    head_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def inspect_pending_session(
    db:sqlite3.Connection,*,
    independently_pinned_acknowledged_head_sha256:str,
    expected_sequence:int,
    expected_challenge:str,
    expected_checkpoint_sha256:str,
    expected_pending_head_sha256:str,
)->PendingReview:
    """Require exact out-of-band pending intent; no automatic state changes."""
    def denied(reason:str)->PendingReview:
        return PendingReview(PendingState.BLOCKED,(reason,))
    if not isinstance(db,sqlite3.Connection) or db.in_transaction:
        return denied("STORE_NOT_IDLE")
    if (type(expected_sequence) is not int or expected_sequence<1 or
        not _challenge(expected_challenge) or not _hex(expected_checkpoint_sha256) or
        not _hex(expected_pending_head_sha256) or
        not _hex(independently_pinned_acknowledged_head_sha256)):
        return denied("MISSING_OR_INVALID_INDEPENDENT_EXPECTATIONS")
    try:
        db.execute("BEGIN")
        state=read_shared_head(db)
        if state is None:
            return denied("SHARED_CHAIN_INVALID")
        seq,head,ackseq,ackhead=state
        if ackhead!=independently_pinned_acknowledged_head_sha256:
            return denied("ACKNOWLEDGED_HEAD_PIN_MISMATCH")
        if seq!=expected_sequence or head!=expected_pending_head_sha256:
            return denied("PENDING_SESSION_ID_MISMATCH")
        row=db.execute(
            """SELECT challenge,checkpoint_sha256,previous_sha256,head_sha256
               FROM rio_shared_replay_events WHERE sequence=?""",(seq,)
        ).fetchone()
        if row is None:
            return denied("PENDING_EVENT_NOT_FOUND")
        challenge,checkpoint,previous,current=row
        if (challenge!=expected_challenge or checkpoint!=expected_checkpoint_sha256 or
            current!=head):
            return denied("PENDING_EVENT_CONTENT_MISMATCH")
        if seq==ackseq+1:
            if previous!=ackhead:
                return denied("PENDING_PREDECESSOR_MISMATCH")
            return PendingReview(PendingState.PENDING_EXTERNAL_ACK,(),seq,head)
        if seq==ackseq:
            # An acknowledgement received before restart may already be
            # committed; verify by re-presenting the signed receipt below.
            if head!=ackhead:
                return denied("ACKNOWLEDGED_STATE_MISMATCH")
            return PendingReview(PendingState.ACKNOWLEDGED_INFORMATIONAL,(),seq,head)
        return denied("UNEXPECTED_REPLAY_STATE")
    except (sqlite3.Error,ValueError,TypeError,AttributeError):
        return denied("STORE_READ_FAILED")
    finally:
        if db.in_transaction:
            db.rollback()


def resume_signed_acknowledgement(
    db:sqlite3.Connection,*,
    independently_pinned_acknowledged_head_sha256:str,
    expected_sequence:int,
    expected_challenge:str,
    expected_checkpoint_sha256:str,
    expected_pending_head_sha256:str,
    signed_receipt:Any,
    pinned_custodians:Mapping[str,bytes],
    independently_pinned_receipt_sha256:str,
)->PendingReview:
    """Never manufacture or substitute external receipt; retry idempotently."""
    preflight=inspect_pending_session(
        db,
        independently_pinned_acknowledged_head_sha256=independently_pinned_acknowledged_head_sha256,
        expected_sequence=expected_sequence,
        expected_challenge=expected_challenge,
        expected_checkpoint_sha256=expected_checkpoint_sha256,
        expected_pending_head_sha256=expected_pending_head_sha256,
    )
    if preflight.state==PendingState.BLOCKED:
        return preflight
    result=acknowledge_head(
        db,receipt=signed_receipt,pinned_custodians=pinned_custodians,
        independently_pinned_receipt_sha256=independently_pinned_receipt_sha256
    )
    if result.state!=SyncState.ACKNOWLEDGED_INFORMATIONAL:
        return PendingReview(PendingState.BLOCKED,
                             result.blockers or ("SIGNED_ACK_NOT_ACCEPTED",))
    if result.sequence!=expected_sequence or result.head_sha256!=expected_pending_head_sha256:
        return PendingReview(PendingState.BLOCKED,("POST_ACK_STATE_MISMATCH",))
    return PendingReview(PendingState.ACKNOWLEDGED_INFORMATIONAL,(),
                         result.sequence,result.head_sha256)


def execution_permitted(result:PendingReview)->bool:
    return False
