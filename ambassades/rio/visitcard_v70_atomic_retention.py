"""RIO v7.0 atomic retention check plus original dual signed evidence.

Writes v6.8 schedule event and corresponding v6.9 signed proof in exactly ONE
SQLite BEGIN IMMEDIATE transaction. A successful event without its original
signed archive evidence is never committed. Late or invalid checks append
quarantined history without disguising it as a valid success.

Checks both independently pinned local ledger heads and verifies all existing
signed history before the write. Local atomicity is not remote custody,
independent pin storage, a trusted clock, or an automated scheduler.
GO-13 DRAFT/HOLD/DENY. No release authority.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime,timedelta
from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any,Mapping

from visitcard_release_review import _hex
from visitcard_v65_exact_readback import ReadbackReview
from visitcard_v67_retention import (
    GENESIS as RETENTION_GENESIS,RetentionState,check_retention_epoch,
)
from visitcard_v68_retention_schedule import (
    MAX_CHECKS,_scan,_utc,
)
from visitcard_v69_historical_proofs import (
    GENESIS as PROOF_GENESIS,MAX_EVIDENCE,_proof_chain,_signed_evidence,
)
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical


class AtomicState(str,Enum):
    RECORDED_QUARANTINED="RECORDED_QUARANTINED"
    BLOCKED="BLOCKED"


@dataclass(frozen=True)
class AtomicReview:
    state:AtomicState
    blockers:tuple[str,...]
    audit_sequence:int|None=None
    audit_head_sha256:str|None=None
    proof_sequence:int|None=None
    proof_head_sha256:str|None=None
    outcome:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _deny(reason:str)->AtomicReview:
    return AtomicReview(AtomicState.BLOCKED,
                        tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))))


def record_atomic_retention_check(db:sqlite3.Connection,*,
    now:datetime,
    pinned_archive_keys:Mapping[str,bytes],
    expected_archive_ids:tuple[str,str],
    independently_pinned_audit_sequence:int,
    independently_pinned_audit_head_sha256:str,
    independently_pinned_proof_sequence:int,
    independently_pinned_proof_head_sha256:str,
    expected_retention_until:datetime|None,
    readback:ReadbackReview|None,
    signed_statements:Any,
    independently_pinned_retention_checkpoint_sha256:str|None,
)->AtomicReview:
    """Atomic success+proof, or atomic quarantine failure without proof.

    The caller must independently verify latest heads and pin new heads
    externally after commit. A successful check demands two original valid
    signed v6.7 archive statements; an expired slot remains MISSED.
    """
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(independently_pinned_audit_sequence) is not int
        or type(independently_pinned_proof_sequence) is not int
        or not 0<=independently_pinned_audit_sequence<MAX_CHECKS
        or not 0<=independently_pinned_proof_sequence<=MAX_CHECKS
        or not _hex(independently_pinned_audit_head_sha256)
        or not _hex(independently_pinned_proof_head_sha256)
        or not isinstance(pinned_archive_keys,Mapping)
        or not isinstance(expected_archive_ids,tuple)
        or len(expected_archive_ids)!=2
        or expected_archive_ids[0]==expected_archive_ids[1]
        or any(not isinstance(x,str) or not x for x in expected_archive_ids)
        or any(not isinstance(pinned_archive_keys.get(x),bytes)
               or len(pinned_archive_keys[x])!=32 for x in expected_archive_ids)
        or pinned_archive_keys[expected_archive_ids[0]]==
           pinned_archive_keys[expected_archive_ids[1]]):
        return _deny("INVALID_ATOMIC_CAS_INPUT")
    try:
        current=_utc(now)
        db.execute("BEGIN IMMEDIATE")
        audit=_scan(db)
        proofs=_proof_chain(db,pinned_archive_keys,expected_archive_ids)
        if audit is None or proofs is None:
            db.rollback()
            return _deny("EXISTING_SIGNED_HISTORY_NOT_VERIFIED")
        if ((audit[0],audit[1])!=
            (independently_pinned_audit_sequence,independently_pinned_audit_head_sha256)
            or proofs[:2]!=
            (independently_pinned_proof_sequence,independently_pinned_proof_head_sha256)):
            db.rollback()
            return _deny("STALE_OR_ROLLED_BACK_ATOMIC_PIN")
        slot=audit[0]+1
        due=audit[2]+timedelta(seconds=audit[0]*audit[3])
        if current<due:
            db.rollback()
            return _deny("RETENTION_SLOT_NOT_DUE")
        late=current>due+timedelta(seconds=audit[4])
        outcome="MISSED_QUARANTINED" if late else "FAILED_QUARANTINED"
        checkpoint=None
        proof_evidence=None
        predecessor=RETENTION_GENESIS
        if proofs[0]:
            last_slot=db.execute("""SELECT audit_slot FROM rio_v69_historical_proofs
                ORDER BY sequence DESC LIMIT 1""").fetchone()[0]
            prev=db.execute("""SELECT event_json FROM rio_v68_history
                WHERE slot=?""",(last_slot,)).fetchone()
            if prev is None:
                db.rollback()
                return _deny("LAST_SIGNED_CHECKPOINT_MISSING")
            predecessor=json.loads(prev[0])["retention_checkpoint_sha256"]
            if not _hex(predecessor):
                db.rollback()
                return _deny("INVALID_SIGNED_PREDECESSOR")
        if not late:
            if (isinstance(readback,ReadbackReview)
                and isinstance(expected_retention_until,datetime)
                and expected_retention_until.utcoffset() is not None
                and _hex(independently_pinned_retention_checkpoint_sha256)):
                signed=check_retention_epoch(
                    readback=readback,statements=signed_statements,
                    pinned_archive_keys=pinned_archive_keys,
                    expected_archive_ids=expected_archive_ids,
                    expected_epoch=slot,
                    independently_pinned_previous_sha256=predecessor,
                    independently_pinned_current_sha256=independently_pinned_retention_checkpoint_sha256,
                    expected_retention_until=expected_retention_until,
                    now=current,
                )
                if signed.state==RetentionState.VERIFIED_INFORMATIONAL:
                    checkpoint=signed.checkpoint_sha256
                    proof_evidence=_signed_evidence(
                        slot,readback,signed_statements,predecessor,
                        expected_retention_until
                    )
                    if len(_canonical(proof_evidence))>MAX_EVIDENCE:
                        db.rollback()
                        return _deny("ATOMIC_PROOF_TOO_LARGE")
                    outcome="VERIFIED_INFORMATIONAL"
        event={
            "version":1,"slot":slot,"due_at":due.isoformat(),
            "checked_at":current.isoformat(),"outcome":outcome,
            "retention_epoch":slot if checkpoint else None,
            "retention_checkpoint_sha256":checkpoint,
            "go13":"HOLD",
        }
        raw=_canonical(event)
        audit_head=hashlib.sha256(_canonical({
            "version":1,"slot":slot,"previous_sha256":audit[1],
            "event_sha256":hashlib.sha256(raw).hexdigest(),
            "go13":"HOLD",
        })).hexdigest()
        db.execute("""INSERT INTO rio_v68_history
            (slot,event_json,previous_sha256,head_sha256) VALUES(?,?,?,?)""",
            (slot,raw.decode(),audit[1],audit_head))
        proof_count=proofs[0]
        proof_head=proofs[1]
        if proof_evidence is not None:
            next_seq=proof_count+1
            evidence=_canonical(proof_evidence)
            updated=hashlib.sha256(_canonical({
                "version":1,"sequence":next_seq,"audit_slot":slot,
                "previous_sha256":proof_head,
                "audit_event_head_sha256":audit_head,
                "evidence_sha256":hashlib.sha256(evidence).hexdigest(),
                "go13":"HOLD",
            })).hexdigest()
            db.execute("""INSERT INTO rio_v69_historical_proofs
                (sequence,audit_slot,evidence_json,previous_sha256,head_sha256)
                VALUES(?,?,?,?,?)""",
                (next_seq,slot,evidence.decode(),proof_head,updated))
            proof_count=next_seq
            proof_head=updated
        final=_scan(db)
        verified=_proof_chain(db,pinned_archive_keys,expected_archive_ids)
        if (final is None or verified is None
            or (final[0],final[1])!=(slot,audit_head)
            or verified[:2]!=(proof_count,proof_head)):
            db.rollback()
            return _deny("ATOMIC_POSTWRITE_VERIFICATION_FAILED")
        db.commit()
        return AtomicReview(AtomicState.RECORDED_QUARANTINED,EXTERNAL_BLOCKERS,
                            slot,audit_head,proof_count,proof_head,outcome)
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return _deny("ATOMIC_RETENTION_WRITE_FAILED")


def execution_permitted(result:AtomicReview)->bool:
    return False
