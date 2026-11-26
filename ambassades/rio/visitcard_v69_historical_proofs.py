"""RIO v6.9 independently revalidated historical retention signature evidence.

A fail-closed companion registry for v6.8 successful audit events. It retains
both original signed v6.7 archive claims and independently supplied upstream
readback fingerprint, verifies the signatures at the historical checked_at
instant, and rechecks every successful history event on restart.

Local SQLite is NOT independent durable pin custody. This protocol does not
re-run remote v6.5 byte retrieval. Previous missed/failed audit events keep
the historical quarantine sticky. GO-13 DRAFT / HOLD / DENY.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any,Mapping

from visitcard_release_review import _hex
from visitcard_v65_exact_readback import ReadbackReview,ReadbackState
from visitcard_v67_retention import (
    GENESIS as RETENTION_GENESIS,RetentionState,check_retention_epoch,_time
)
from visitcard_v68_retention_schedule import _scan as scan_schedule,GENESIS as AUDIT_GENESIS
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

GENESIS=hashlib.sha256(b"PALACO-RIO-V69-HISTORICAL-RETENTION-ROOT").hexdigest()
MAX_EVIDENCE=8192


class HistoricalState(str,Enum):
    VERIFIED_INFORMATIONAL="VERIFIED_INFORMATIONAL"
    HISTORICAL_QUARANTINE="HISTORICAL_QUARANTINE"
    BLOCKED="BLOCKED"


@dataclass(frozen=True)
class HistoricalReview:
    state:HistoricalState
    blockers:tuple[str,...]
    audit_sequence:int|None=None
    evidence_count:int|None=None
    evidence_head_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _deny(reason:str)->HistoricalReview:
    return HistoricalReview(HistoricalState.BLOCKED,
                            tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))))


def initialize_historical_proofs(db:sqlite3.Connection)->None:
    if not isinstance(db,sqlite3.Connection) or db.in_transaction:
        raise ValueError("invalid database or transaction")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS rio_v69_historical_proofs(
      sequence INTEGER PRIMARY KEY,
      audit_slot INTEGER NOT NULL UNIQUE,
      evidence_json TEXT NOT NULL,
      previous_sha256 TEXT NOT NULL,
      head_sha256 TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS rio_v69_no_update
      BEFORE UPDATE ON rio_v69_historical_proofs
      BEGIN SELECT RAISE(ABORT,'immutable signed proof'); END;
    CREATE TRIGGER IF NOT EXISTS rio_v69_no_delete
      BEFORE DELETE ON rio_v69_historical_proofs
      BEGIN SELECT RAISE(ABORT,'immutable signed proof'); END;
    """)


def _signed_evidence(slot:int,readback:ReadbackReview,statements:Any,
    predecessor:str,retention_until:datetime)->dict[str,Any]:
    if (type(slot) is not int or slot<1
        or not isinstance(readback,ReadbackReview)
        or readback.state!=ReadbackState.VERIFIED_INFORMATIONAL
        or readback.archive_count!=2
        or not _hex(readback.evidence_sha256)
        or not _hex(readback.verification_sha256)
        or not isinstance(statements,(tuple,list)) or len(statements)!=2
        or not _hex(predecessor)
        or not isinstance(retention_until,datetime)
        or retention_until.utcoffset() is None):
        raise ValueError("invalid signed evidence metadata")
    return {
        "version":1,"slot":slot,
        "readback_evidence_sha256":readback.evidence_sha256,
        "readback_verification_sha256":readback.verification_sha256,
        "statements":list(statements),
        "previous_retention_sha256":predecessor,
        "minimum_retention_until":retention_until.isoformat(),
        "go13":"HOLD",
    }


def _proof_chain(db:sqlite3.Connection,roots:Mapping[str,bytes],
    expected_archive_ids:tuple[str,str],
)->tuple[int,str,int,bool]|None:
    try:
        if (not isinstance(roots,Mapping)
            or not isinstance(expected_archive_ids,tuple)
            or len(expected_archive_ids)!=2
            or expected_archive_ids[0]==expected_archive_ids[1]
            or any(not isinstance(x,str) or not x for x in expected_archive_ids)):
            return None
        audit=scan_schedule(db)
        if audit is None:
            return None
        total=audit[0]
        events=db.execute("""SELECT slot,event_json,head_sha256
            FROM rio_v68_history ORDER BY slot""").fetchall()
        if len(events)!=total:
            return None
        proofs=db.execute("""SELECT sequence,audit_slot,evidence_json,
            previous_sha256,head_sha256
            FROM rio_v69_historical_proofs ORDER BY sequence""").fetchall()
        if len(proofs)>total:
            return None
        byslot={}
        previous=GENESIS
        last_retention=RETENTION_GENESIS
        for seq,slot,raw,prev,head in proofs:
            if (type(seq) is not int or seq!=len(byslot)+1
                or type(slot) is not int or not 1<=slot<=total
                or slot in byslot or not isinstance(raw,str)
                or not 0<len(raw.encode())<=MAX_EVIDENCE
                or prev!=previous or not _hex(head)):
                return None
            obj=json.loads(raw)
            if (not isinstance(obj,dict)
                or set(obj)!={"version","slot","readback_evidence_sha256",
                    "readback_verification_sha256","statements",
                    "previous_retention_sha256","minimum_retention_until","go13"}
                or raw.encode()!=_canonical(obj)
                or type(obj["version"]) is not int or obj["version"]!=1
                or type(obj["slot"]) is not int or obj["slot"]!=slot
                or obj["go13"]!="HOLD"
                or obj["previous_retention_sha256"]!=last_retention):
                return None
            recorded=json.loads(events[slot-1][1])
            if (recorded["outcome"]!="VERIFIED_INFORMATIONAL"
                or recorded["retention_epoch"]!=slot):
                return None
            rb=ReadbackReview(
                ReadbackState.VERIFIED_INFORMATIONAL,(),
                obj["readback_evidence_sha256"],2,
                obj["readback_verification_sha256"]
            )
            review=check_retention_epoch(
                readback=rb,statements=obj["statements"],
                pinned_archive_keys=roots,expected_archive_ids=expected_archive_ids,
                expected_epoch=slot,
                independently_pinned_previous_sha256=last_retention,
                independently_pinned_current_sha256=recorded["retention_checkpoint_sha256"],
                expected_retention_until=_time(obj["minimum_retention_until"]),
                now=_time(recorded["checked_at"])
            )
            if (review.state!=RetentionState.VERIFIED_INFORMATIONAL
                or review.checkpoint_sha256!=recorded["retention_checkpoint_sha256"]):
                return None
            calculated=hashlib.sha256(_canonical({
                "version":1,"sequence":seq,"audit_slot":slot,
                "previous_sha256":previous,
                "audit_event_head_sha256":events[slot-1][2],
                "evidence_sha256":hashlib.sha256(raw.encode()).hexdigest(),
                "go13":"HOLD"
            })).hexdigest()
            if head!=calculated:
                return None
            previous=head
            last_retention=review.checkpoint_sha256
            byslot[slot]=True
        for slot,raw,_ in events:
            event=json.loads(raw)
            if event["outcome"]=="VERIFIED_INFORMATIONAL" and slot not in byslot:
                # Pending proof is blocked, never silently accepted.
                return None
        sticky=any(json.loads(raw)["outcome"]!="VERIFIED_INFORMATIONAL"
                   for _,raw,_ in events)
        return len(proofs),previous,total,sticky
    except (sqlite3.Error,TypeError,ValueError,KeyError,AttributeError,OverflowError):
        return None


def inspect_historical_proofs(db:sqlite3.Connection,*,
    pinned_archive_keys:Mapping[str,bytes],
    expected_archive_ids:tuple[str,str],
    independently_pinned_audit_sequence:int,
    independently_pinned_audit_head_sha256:str,
    independently_pinned_proof_sequence:int,
    independently_pinned_proof_head_sha256:str,
)->HistoricalReview:
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(independently_pinned_audit_sequence) is not int
        or type(independently_pinned_proof_sequence) is not int
        or independently_pinned_audit_sequence<0
        or independently_pinned_proof_sequence<0
        or not _hex(independently_pinned_audit_head_sha256)
        or not _hex(independently_pinned_proof_head_sha256)):
        return _deny("HISTORICAL_PIN_INPUT_INVALID")
    try:
        db.execute("BEGIN")
        audit=scan_schedule(db)
        chain=_proof_chain(db,pinned_archive_keys,expected_archive_ids)
        db.rollback()
        if (audit is None or chain is None):
            return _deny("SIGNED_RETENTION_HISTORY_INVALID")
        if ((audit[0],audit[1])!=
            (independently_pinned_audit_sequence,independently_pinned_audit_head_sha256)
            or chain[:2]!=
            (independently_pinned_proof_sequence,independently_pinned_proof_head_sha256)):
            return _deny("HISTORICAL_ROLLBACK_OR_SPLIT_VIEW")
        state=(HistoricalState.HISTORICAL_QUARANTINE if chain[3]
               else HistoricalState.VERIFIED_INFORMATIONAL)
        return HistoricalReview(state,EXTERNAL_BLOCKERS,audit[0],chain[0],chain[1])
    except sqlite3.Error:
        if db.in_transaction:
            db.rollback()
        return _deny("HISTORICAL_AUDIT_FAILED")


def append_historical_proof(db:sqlite3.Connection,*,audit_slot:int,
    statements:Any,readback:ReadbackReview,
    expected_retention_until:datetime,
    pinned_archive_keys:Mapping[str,bytes],
    expected_archive_ids:tuple[str,str],
    independently_pinned_audit_sequence:int,
    independently_pinned_audit_head_sha256:str,
    independently_pinned_proof_sequence:int,
    independently_pinned_proof_head_sha256:str,
)->HistoricalReview:
    """Add evidence for an existing successful event; no release clearance."""
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(audit_slot) is not int or audit_slot<1
        or type(independently_pinned_audit_sequence) is not int
        or type(independently_pinned_proof_sequence) is not int
        or not _hex(independently_pinned_audit_head_sha256)
        or not _hex(independently_pinned_proof_head_sha256)):
        return _deny("INVALID_HISTORICAL_APPEND")
    try:
        db.execute("BEGIN IMMEDIATE")
        audit=scan_schedule(db)
        if (audit is None or (audit[0],audit[1])!=
            (independently_pinned_audit_sequence,independently_pinned_audit_head_sha256)):
            db.rollback()
            return _deny("AUDIT_HISTORY_HEAD_NOT_PINNED")
        # Partial proof coverage is permitted during backfill, but every
        # previously attached proof must remain valid and chained.
        rows=db.execute("""SELECT audit_slot,evidence_json,head_sha256
            FROM rio_v69_historical_proofs ORDER BY sequence""").fetchall()
        previous=GENESIS
        predecessor=RETENTION_GENESIS
        if rows:
            # Assess the existing prefix by verifying its signatures against
            # a temporary view limited to audited slots with proofs.
            # _proof_chain is intentionally strict for final read; here use
            # direct matching with each original signed record.
            for oldslot,raw,head in rows:
                event=db.execute("SELECT event_json FROM rio_v68_history WHERE slot=?",
                                 (oldslot,)).fetchone()
                if event is None:
                    db.rollback()
                    return _deny("EARLIER_SIGNED_HISTORY_MISSING")
                obj=json.loads(raw)
                rb=ReadbackReview(ReadbackState.VERIFIED_INFORMATIONAL,(),
                    obj["readback_evidence_sha256"],2,obj["readback_verification_sha256"])
                v=check_retention_epoch(
                    readback=rb,statements=obj["statements"],
                    pinned_archive_keys=pinned_archive_keys,
                    expected_archive_ids=expected_archive_ids,
                    expected_epoch=oldslot,
                    independently_pinned_previous_sha256=predecessor,
                    independently_pinned_current_sha256=json.loads(event[0])["retention_checkpoint_sha256"],
                    expected_retention_until=_time(obj["minimum_retention_until"]),
                    now=_time(json.loads(event[0])["checked_at"])
                )
                if v.state!=RetentionState.VERIFIED_INFORMATIONAL:
                    db.rollback()
                    return _deny("EARLIER_SIGNED_PROOF_INVALID")
                predecessor=v.checkpoint_sha256
                previous=head
        seq=len(rows)+1
        if ((seq-1,previous)!=
            (independently_pinned_proof_sequence,independently_pinned_proof_head_sha256)
            or audit_slot<= (rows[-1][0] if rows else 0)
            or audit_slot>audit[0]):
            db.rollback()
            return _deny("PROOF_CAS_OR_ORDER_MISMATCH")
        entry=db.execute("""SELECT event_json,head_sha256 FROM rio_v68_history
            WHERE slot=?""",(audit_slot,)).fetchone()
        if entry is None:
            db.rollback()
            return _deny("AUDIT_EVENT_NOT_FOUND")
        event=json.loads(entry[0])
        if event["outcome"]!="VERIFIED_INFORMATIONAL":
            db.rollback()
            return _deny("NON_SUCCESS_CANNOT_BE_REWRITTEN")
        obj=_signed_evidence(audit_slot,readback,statements,predecessor,
                             expected_retention_until)
        verified=check_retention_epoch(
            readback=readback,statements=statements,pinned_archive_keys=pinned_archive_keys,
            expected_archive_ids=expected_archive_ids,expected_epoch=audit_slot,
            independently_pinned_previous_sha256=predecessor,
            independently_pinned_current_sha256=event["retention_checkpoint_sha256"],
            expected_retention_until=expected_retention_until,
            now=_time(event["checked_at"])
        )
        if verified.state!=RetentionState.VERIFIED_INFORMATIONAL:
            db.rollback()
            return _deny("SIGNED_ORIGINAL_EVIDENCE_UNVERIFIED")
        raw=_canonical(obj)
        if len(raw)>MAX_EVIDENCE:
            db.rollback()
            return _deny("HISTORICAL_EVIDENCE_TOO_LARGE")
        head=hashlib.sha256(_canonical({
            "version":1,"sequence":seq,"audit_slot":audit_slot,
            "previous_sha256":previous,"audit_event_head_sha256":entry[1],
            "evidence_sha256":hashlib.sha256(raw).hexdigest(),"go13":"HOLD",
        })).hexdigest()
        db.execute("""INSERT INTO rio_v69_historical_proofs
            (sequence,audit_slot,evidence_json,previous_sha256,head_sha256)
            VALUES(?,?,?,?,?)""",(seq,audit_slot,raw.decode(),previous,head))
        db.commit()
        return HistoricalReview(HistoricalState.HISTORICAL_QUARANTINE,
                                EXTERNAL_BLOCKERS,audit[0],seq,head)
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return _deny("HISTORICAL_APPEND_BLOCKED")


def execution_permitted(result:HistoricalReview)->bool:
    return False
