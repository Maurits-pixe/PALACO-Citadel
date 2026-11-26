"""RIO v6.8 durable retention audit cadence and hash-linked check history.

Local SQLite append-only scheduler journal, NOT an autonomous daemon or
independently anchored audit archive. Every operation requires an external
latest-head pin; caller supplies a trusted clock. Missed checks are never
silently recast as successes. No record grants GO-13 authority.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime,timedelta,timezone
from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any

from visitcard_release_review import _hex
from visitcard_v67_retention import RetentionReview,RetentionState
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

GENESIS=hashlib.sha256(b"PALACO-RIO-V68-RETENTION-AUDIT-GENESIS").hexdigest()
MAX_CHECKS=100000
MAX_INTERVAL=86400*30
MAX_GRACE=86400
FIELDS=frozenset({"version","slot","due_at","checked_at","outcome",
                  "retention_epoch","retention_checkpoint_sha256","go13"})
OUTCOMES=frozenset({"VERIFIED_INFORMATIONAL","MISSED_QUARANTINED",
                   "FAILED_QUARANTINED"})


class AuditState(str,Enum):
    SCHEDULED_HOLD="SCHEDULED_HOLD"
    OVERDUE_QUARANTINED="OVERDUE_QUARANTINED"
    RECORDED_QUARANTINED="RECORDED_QUARANTINED"
    BLOCKED="BLOCKED"


@dataclass(frozen=True)
class AuditReview:
    state:AuditState
    blockers:tuple[str,...]
    sequence:int|None=None
    latest_sha256:str|None=None
    next_due_at:str|None=None
    latest_outcome:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _deny(code:str)->AuditReview:
    return AuditReview(AuditState.BLOCKED,
                       tuple(sorted(set(EXTERNAL_BLOCKERS+(code,)))))


def _time(value:Any)->datetime:
    if not isinstance(value,str):
        raise ValueError("timestamp")
    instant=datetime.fromisoformat(value.replace("Z","+00:00"))
    if instant.utcoffset() is None:
        raise ValueError("timezone required")
    return instant.astimezone(timezone.utc)


def _utc(value:datetime)->datetime:
    if not isinstance(value,datetime) or value.utcoffset() is None:
        raise ValueError("trusted timezone-aware instant required")
    return value.astimezone(timezone.utc)


def initialize_retention_schedule(db:sqlite3.Connection,*,anchor:datetime,
    interval_seconds:int,grace_seconds:int)->None:
    """Create policy only once; immutable policy is checked on every restart."""
    start=_utc(anchor)
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(interval_seconds) is not int or not 1<=interval_seconds<=MAX_INTERVAL
        or type(grace_seconds) is not int or not 0<=grace_seconds<=MAX_GRACE
        or start.year>9000):
        raise ValueError("invalid fixed retention policy")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS rio_v68_schedule(
      id INTEGER PRIMARY KEY CHECK(id=1),
      anchor_at TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL,
      grace_seconds INTEGER NOT NULL,
      go13 TEXT NOT NULL CHECK(go13='HOLD')
    );
    CREATE TABLE IF NOT EXISTS rio_v68_history(
      slot INTEGER PRIMARY KEY,
      event_json TEXT NOT NULL,
      previous_sha256 TEXT NOT NULL,
      head_sha256 TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS rio_v68_policy_update BEFORE UPDATE ON rio_v68_schedule
      BEGIN SELECT RAISE(ABORT,'immutable schedule'); END;
    CREATE TRIGGER IF NOT EXISTS rio_v68_policy_delete BEFORE DELETE ON rio_v68_schedule
      BEGIN SELECT RAISE(ABORT,'immutable schedule'); END;
    CREATE TRIGGER IF NOT EXISTS rio_v68_event_update BEFORE UPDATE ON rio_v68_history
      BEGIN SELECT RAISE(ABORT,'immutable retention history'); END;
    CREATE TRIGGER IF NOT EXISTS rio_v68_event_delete BEFORE DELETE ON rio_v68_history
      BEGIN SELECT RAISE(ABORT,'immutable retention history'); END;
    """)
    policy=(start.isoformat(),interval_seconds,grace_seconds,"HOLD")
    try:
        db.execute("BEGIN IMMEDIATE")
        old=db.execute("""SELECT anchor_at,interval_seconds,grace_seconds,go13
                           FROM rio_v68_schedule WHERE id=1""").fetchone()
        if old is None:
            db.execute("""INSERT INTO rio_v68_schedule
                (id,anchor_at,interval_seconds,grace_seconds,go13)
                VALUES(1,?,?,?,?)""",policy)
        elif old!=policy:
            raise ValueError("schedule policy conflict")
        db.commit()
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise


def _scan(db:sqlite3.Connection)->tuple[int,str,datetime,int,int,str|None]|None:
    """Reconstruct every event, including deterministic slot due times."""
    try:
        policy=db.execute("""SELECT anchor_at,interval_seconds,grace_seconds,go13
                  FROM rio_v68_schedule WHERE id=1""").fetchone()
        if policy is None or len(policy)!=4:
            return None
        anchor=_time(policy[0])
        interval,grace,hold=policy[1:]
        if (type(interval) is not int or not 1<=interval<=MAX_INTERVAL
            or type(grace) is not int or not 0<=grace<=MAX_GRACE
            or hold!="HOLD" or anchor.isoformat()!=policy[0]):
            return None
        rows=db.execute("""SELECT slot,event_json,previous_sha256,head_sha256
                    FROM rio_v68_history ORDER BY slot""").fetchall()
        if len(rows)>MAX_CHECKS:
            return None
        previous=GENESIS
        last=None
        for expected,(slot,raw,prev,head) in enumerate(rows,1):
            if (type(slot) is not int or slot!=expected
                or not isinstance(raw,str) or not 0<len(raw.encode())<=2048
                or prev!=previous or not _hex(head)):
                return None
            event=json.loads(raw)
            if (not isinstance(event,dict) or set(event)!=FIELDS
                or _canonical(event)!=raw.encode()
                or type(event["version"]) is not int or event["version"]!=1
                or type(event["slot"]) is not int or event["slot"]!=expected
                or event["go13"]!="HOLD" or event["outcome"] not in OUTCOMES):
                return None
            due=anchor+timedelta(seconds=(expected-1)*interval)
            checked=_time(event["checked_at"])
            if (_time(event["due_at"])!=due
                or event["due_at"]!=due.isoformat() or checked<due):
                return None
            missed=checked>due+timedelta(seconds=grace)
            if (event["outcome"]=="MISSED_QUARANTINED")!=missed:
                return None
            if (event["outcome"]=="VERIFIED_INFORMATIONAL"
                and (type(event["retention_epoch"]) is not int
                     or event["retention_epoch"]<1
                     or not _hex(event["retention_checkpoint_sha256"]))):
                return None
            if (event["outcome"]!="VERIFIED_INFORMATIONAL"
                and (event["retention_epoch"] is not None
                     or event["retention_checkpoint_sha256"] is not None)):
                return None
            calculated=hashlib.sha256(_canonical({
                "version":1,"slot":expected,"previous_sha256":previous,
                "event_sha256":hashlib.sha256(raw.encode()).hexdigest(),
                "go13":"HOLD",
            })).hexdigest()
            if head!=calculated:
                return None
            previous=head
            last=event["outcome"]
        return len(rows),previous,anchor,interval,grace,last
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        return None


def inspect_retention_schedule(db:sqlite3.Connection,*,
    independently_pinned_sequence:int,independently_pinned_head_sha256:str,
    now:datetime)->AuditReview:
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(independently_pinned_sequence) is not int
        or not 0<=independently_pinned_sequence<=MAX_CHECKS
        or not _hex(independently_pinned_head_sha256)):
        return _deny("INDEPENDENT_SCHEDULE_PIN_REQUIRED")
    try:
        current=_utc(now)
        db.execute("BEGIN")
        scan=_scan(db)
        db.rollback()
        if scan is None:
            return _deny("RETENTION_HISTORY_INVALID")
        seq,head,anchor,interval,grace,last=scan
        if (seq,head)!=(independently_pinned_sequence,
                        independently_pinned_head_sha256):
            return _deny("RETENTION_HISTORY_ROLLBACK_OR_PIN_MISMATCH")
        due=anchor+timedelta(seconds=seq*interval)
        overdue=current>due+timedelta(seconds=grace)
        state=AuditState.OVERDUE_QUARANTINED if overdue else AuditState.SCHEDULED_HOLD
        return AuditReview(state,EXTERNAL_BLOCKERS,seq,head,due.isoformat(),last)
    except (sqlite3.Error,ValueError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return _deny("RETENTION_SCHEDULE_AUDIT_FAILED")


def record_retention_check(db:sqlite3.Connection,*,now:datetime,
    independently_pinned_sequence:int,independently_pinned_head_sha256:str,
    retention_review:RetentionReview|None)->AuditReview:
    """Append one check for the next due slot; late checks stay MISSED forever."""
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(independently_pinned_sequence) is not int
        or not 0<=independently_pinned_sequence<MAX_CHECKS
        or not _hex(independently_pinned_head_sha256)):
        return _deny("INVALID_RETENTION_CAS")
    try:
        current=_utc(now)
        db.execute("BEGIN IMMEDIATE")
        scan=_scan(db)
        if scan is None:
            db.rollback()
            return _deny("RETENTION_HISTORY_INVALID")
        seq,head,anchor,interval,grace,_=scan
        if (seq,head)!=(independently_pinned_sequence,
                        independently_pinned_head_sha256):
            db.rollback()
            return _deny("RETENTION_CAS_OR_ROLLBACK_MISMATCH")
        slot=seq+1
        due=anchor+timedelta(seconds=seq*interval)
        if current<due:
            db.rollback()
            return _deny("RETENTION_CHECK_NOT_DUE")
        if current>due+timedelta(seconds=grace):
            outcome="MISSED_QUARANTINED"
        elif (isinstance(retention_review,RetentionReview)
              and retention_review.state==RetentionState.VERIFIED_INFORMATIONAL
              and type(retention_review.epoch) is int
              and retention_review.epoch==slot
              and _hex(retention_review.checkpoint_sha256)):
            outcome="VERIFIED_INFORMATIONAL"
        else:
            outcome="FAILED_QUARANTINED"
        success=outcome=="VERIFIED_INFORMATIONAL"
        event={
            "version":1,"slot":slot,"due_at":due.isoformat(),
            "checked_at":current.isoformat(),"outcome":outcome,
            "retention_epoch":slot if success else None,
            "retention_checkpoint_sha256":
                retention_review.checkpoint_sha256 if success else None,
            "go13":"HOLD",
        }
        raw=_canonical(event)
        digest=hashlib.sha256(_canonical({
            "version":1,"slot":slot,"previous_sha256":head,
            "event_sha256":hashlib.sha256(raw).hexdigest(),"go13":"HOLD",
        })).hexdigest()
        db.execute("""INSERT INTO rio_v68_history
             (slot,event_json,previous_sha256,head_sha256) VALUES(?,?,?,?)""",
             (slot,raw.decode(),head,digest))
        db.commit()
        return AuditReview(AuditState.RECORDED_QUARANTINED,
                           EXTERNAL_BLOCKERS,slot,digest,
                           (due+timedelta(seconds=interval)).isoformat(),outcome)
    except (sqlite3.Error,ValueError,TypeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return _deny("RETENTION_RECORD_FAILED")


def execution_permitted(result:AuditReview)->bool:
    return False
