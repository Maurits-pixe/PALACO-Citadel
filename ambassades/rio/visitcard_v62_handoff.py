"""RIO v6.2 durable idempotent outbox for external archive handoff.

Offline-first transport interface, not a deployed offsite archive client.
A retry may re-send the same immutable request; remote exactly-once delivery
requires archive-side idempotency. Only verified signed v6.1 receipts count.
All statuses remain quarantined. GO-13 DRAFT / HOLD / DENY.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any,Callable,Mapping

from visitcard_release_review import _hex
from visitcard_v60_incident_ledger import _chain
from visitcard_v61_archive_receipts import (
    ArchiveState,append_archive_receipts,verify_archive_receipt,
)
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

SCOPE="RIO-VISITCARD-V6.2-HANDOFF"
MAX_ENVELOPE=8192


class HandoffState(str,Enum):
    PREPARED_QUARANTINED="PREPARED_QUARANTINED"
    AWAITING_RECEIPTS="AWAITING_RECEIPTS"
    BOTH_RECEIPTS_QUARANTINED="BOTH_RECEIPTS_QUARANTINED"
    FINALIZED_QUARANTINED="FINALIZED_QUARANTINED"
    BLOCKED="BLOCKED"


@dataclass(frozen=True)
class HandoffResult:
    state:HandoffState
    blockers:tuple[str,...]
    handoff_id:str|None=None
    acknowledged:int=0
    receipt_head_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _deny(reason:str)->HandoffResult:
    return HandoffResult(HandoffState.BLOCKED,
                         tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))))


def _request(incident_sequence:int,head:str,conflict:str,archive:str)->dict[str,Any]:
    return {
        "version":1,"scope":SCOPE,"archive_id":archive,
        "incident_sequence":incident_sequence,
        "incident_head_sha256":head,
        "conflict_sha256":conflict,"go13":"HOLD"
    }


def _id(req:Mapping[str,Any])->str:
    return hashlib.sha256(_canonical(req)).hexdigest()


def initialize_handoff_outbox(db:sqlite3.Connection)->None:
    if not isinstance(db,sqlite3.Connection) or db.in_transaction:
        raise ValueError("invalid database or transaction")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS rio_v62_outbox(
      handoff_id TEXT PRIMARY KEY NOT NULL,
      incident_sequence INTEGER NOT NULL,
      archive_id TEXT NOT NULL,
      request_json TEXT NOT NULL,
      UNIQUE(incident_sequence,archive_id)
    );
    CREATE TABLE IF NOT EXISTS rio_v62_ack(
      handoff_id TEXT PRIMARY KEY NOT NULL,
      receipt_json TEXT NOT NULL,
      FOREIGN KEY(handoff_id) REFERENCES rio_v62_outbox(handoff_id)
    );
    CREATE TRIGGER IF NOT EXISTS rio_v62_outbox_no_update
      BEFORE UPDATE ON rio_v62_outbox
      BEGIN SELECT RAISE(ABORT,'immutable outbox'); END;
    CREATE TRIGGER IF NOT EXISTS rio_v62_outbox_no_delete
      BEFORE DELETE ON rio_v62_outbox
      BEGIN SELECT RAISE(ABORT,'immutable outbox'); END;
    CREATE TRIGGER IF NOT EXISTS rio_v62_ack_no_update
      BEFORE UPDATE ON rio_v62_ack
      BEGIN SELECT RAISE(ABORT,'immutable acknowledgement'); END;
    CREATE TRIGGER IF NOT EXISTS rio_v62_ack_no_delete
      BEFORE DELETE ON rio_v62_ack
      BEGIN SELECT RAISE(ABORT,'immutable acknowledgement'); END;
    """)


def _read_pair(db:sqlite3.Connection,sequence:int,archives:tuple[str,str],
               incident_head:str,conflict:str)->list[tuple[str,dict[str,Any]]]|None:
    try:
        rows=db.execute("""SELECT handoff_id,archive_id,request_json
            FROM rio_v62_outbox WHERE incident_sequence=?
            ORDER BY archive_id""",(sequence,)).fetchall()
        if len(rows)!=2:
            return None
        result=[]
        for handoff_id,name,raw in rows:
            if name not in archives or not isinstance(raw,str) or len(raw.encode())>MAX_ENVELOPE:
                return None
            item=json.loads(raw)
            if (_canonical(item)!=raw.encode("utf-8")
                or item!=_request(sequence,incident_head,conflict,name)
                or handoff_id!=_id(item)):
                return None
            result.append((handoff_id,item))
        if {p["archive_id"] for _,p in result}!=set(archives):
            return None
        return result
    except (sqlite3.Error,TypeError,ValueError,KeyError,UnicodeError):
        return None


def prepare_handoffs(db:sqlite3.Connection,*,incident_sequence:int,
    independently_pinned_incident_head_sha256:str,
    pinned_custodian_keys:Mapping[str,bytes],
    archive_ids:tuple[str,str],
)->HandoffResult:
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(incident_sequence) is not int or incident_sequence<1
        or not _hex(independently_pinned_incident_head_sha256)
        or not isinstance(archive_ids,tuple) or len(archive_ids)!=2
        or archive_ids[0]==archive_ids[1]
        or any(not isinstance(a,str) or not 0<len(a)<=128 for a in archive_ids)):
        return _deny("INVALID_PREPARATION_INPUT")
    try:
        db.execute("BEGIN IMMEDIATE")
        chain=_chain(db,pinned_custodian_keys)
        if chain!=(incident_sequence,independently_pinned_incident_head_sha256):
            db.rollback()
            return _deny("INCIDENT_HEAD_NOT_INDEPENDENTLY_PINNED")
        row=db.execute("""SELECT conflict_sha256 FROM rio_v60_incident_events
            WHERE sequence=?""",(incident_sequence,)).fetchone()
        if row is None or not _hex(row[0]):
            db.rollback()
            return _deny("INCIDENT_NOT_FOUND")
        if _read_pair(db,incident_sequence,archive_ids,chain[1],row[0]) is not None:
            db.commit()
            return HandoffResult(HandoffState.PREPARED_QUARANTINED,EXTERNAL_BLOCKERS,
                                 _id(_request(incident_sequence,chain[1],row[0],archive_ids[0])))
        count=db.execute("SELECT count(*) FROM rio_v62_outbox WHERE incident_sequence=?",
                         (incident_sequence,)).fetchone()[0]
        if count:
            db.rollback()
            return _deny("EXISTING_HANDOFF_CONFLICT")
        for archive in archive_ids:
            req=_request(incident_sequence,chain[1],row[0],archive)
            raw=_canonical(req)
            if len(raw)>MAX_ENVELOPE:
                db.rollback()
                return _deny("HANDOFF_TOO_LARGE")
            db.execute("""INSERT INTO rio_v62_outbox
                (handoff_id,incident_sequence,archive_id,request_json)
                VALUES(?,?,?,?)""",(_id(req),incident_sequence,archive,raw.decode()))
        db.commit()
        return HandoffResult(HandoffState.PREPARED_QUARANTINED,EXTERNAL_BLOCKERS,
                             _id(_request(incident_sequence,chain[1],row[0],archive_ids[0])))
    except (sqlite3.Error,ValueError,TypeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return _deny("PREPARATION_FAILED")


def deliver_handoffs(db:sqlite3.Connection,*,incident_sequence:int,
    independently_pinned_incident_head_sha256:str,
    pinned_custodian_keys:Mapping[str,bytes],archive_ids:tuple[str,str],
    pinned_archive_keys:Mapping[str,bytes],
    transport:Callable[[dict[str,Any]],Any],
    now:Any=None,
)->HandoffResult:
    """One bounded retry pass. The external receiver must dedupe by handoff_id."""
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or not callable(transport) or not _hex(independently_pinned_incident_head_sha256)
        or type(incident_sequence) is not int or incident_sequence<1
        or not isinstance(archive_ids,tuple) or len(archive_ids)!=2
        or archive_ids[0]==archive_ids[1]):
        return _deny("INVALID_DISPATCH_INPUT")
    try:
        db.execute("BEGIN")
        if _chain(db,pinned_custodian_keys)!=(incident_sequence,independently_pinned_incident_head_sha256):
            db.rollback()
            return _deny("INCIDENT_HEAD_CHANGED")
        row=db.execute("""SELECT conflict_sha256 FROM rio_v60_incident_events
            WHERE sequence=?""",(incident_sequence,)).fetchone()
        if row is None or not _hex(row[0]):
            db.rollback()
            return _deny("INCIDENT_MISSING")
        pair=_read_pair(db,incident_sequence,archive_ids,
                        independently_pinned_incident_head_sha256,row[0])
        if pair is None:
            db.rollback()
            return _deny("INVALID_OUTBOX")
        db.rollback()
        for handoff_id,req in pair:
            existing=db.execute("SELECT receipt_json FROM rio_v62_ack WHERE handoff_id=?",
                                (handoff_id,)).fetchone()
            if existing is not None:
                receipt=json.loads(existing[0])
                if verify_archive_receipt(
                    receipt,pinned_archive_keys,
                    expected_archive_id=req["archive_id"],
                    expected_incident_sequence=incident_sequence,
                    expected_incident_head_sha256=req["incident_head_sha256"],
                    expected_conflict_sha256=req["conflict_sha256"],
                    now=now if now is not None else None
                ) is None:
                    return _deny("STORED_ACK_INVALID")
                continue
            try:
                # Network callback is untrusted: validate the signed response.
                reply=transport({"handoff_id":handoff_id,**req})
            except Exception:
                continue
            if verify_archive_receipt(
                reply,pinned_archive_keys,expected_archive_id=req["archive_id"],
                expected_incident_sequence=incident_sequence,
                expected_incident_head_sha256=req["incident_head_sha256"],
                expected_conflict_sha256=req["conflict_sha256"],now=now
            ) is None:
                continue
            raw=_canonical(reply)
            if len(raw)>MAX_ENVELOPE:
                return _deny("ACK_TOO_LARGE")
            db.execute("BEGIN IMMEDIATE")
            # Recheck request under the write transaction.
            latest=_read_pair(db,incident_sequence,archive_ids,
                              independently_pinned_incident_head_sha256,row[0])
            if latest!=pair:
                db.rollback()
                return _deny("OUTBOX_CHANGED_DURING_DELIVERY")
            db.execute("INSERT OR IGNORE INTO rio_v62_ack (handoff_id,receipt_json) VALUES (?,?)",
                       (handoff_id,raw.decode()))
            stored=db.execute("SELECT receipt_json FROM rio_v62_ack WHERE handoff_id=?",
                              (handoff_id,)).fetchone()
            if stored is None or stored[0]!=raw.decode():
                db.rollback()
                return _deny("CONFLICTING_RECEIPT_REPLAY")
            db.commit()
        n=db.execute("""SELECT count(*) FROM rio_v62_ack
             WHERE handoff_id IN (?,?)""",(pair[0][0],pair[1][0])).fetchone()[0]
        return HandoffResult(HandoffState.BOTH_RECEIPTS_QUARANTINED
                             if n==2 else HandoffState.AWAITING_RECEIPTS,
                             EXTERNAL_BLOCKERS,pair[0][0],n)
    except (sqlite3.Error,TypeError,ValueError,KeyError,AttributeError):
        if db.in_transaction:
            db.rollback()
        return _deny("DISPATCH_FAILED")


def finalize_handoffs(db:sqlite3.Connection,*,incident_sequence:int,
    independently_pinned_incident_head_sha256:str,
    pinned_custodian_keys:Mapping[str,bytes],archive_ids:tuple[str,str],
    pinned_archive_keys:Mapping[str,bytes],
    expected_receipt_sequence:int,independently_pinned_receipt_head_sha256:str,
    now:Any=None,
)->HandoffResult:
    """Read immutable receipt pair; let v6.1 do its own CAS and signature audit."""
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(incident_sequence) is not int or incident_sequence<1
        or not _hex(independently_pinned_incident_head_sha256)
        or not isinstance(archive_ids,tuple) or len(archive_ids)!=2):
        return _deny("INVALID_FINALIZE_INPUT")
    try:
        row=db.execute("SELECT conflict_sha256 FROM rio_v60_incident_events WHERE sequence=?",
                       (incident_sequence,)).fetchone()
        if row is None or not _hex(row[0]):
            return _deny("INCIDENT_NOT_FOUND")
        pair=_read_pair(db,incident_sequence,archive_ids,
                        independently_pinned_incident_head_sha256,row[0])
        if pair is None:
            return _deny("OUTBOX_NOT_READY")
        receipts=[]
        for handoff_id,req in pair:
            stored=db.execute("SELECT receipt_json FROM rio_v62_ack WHERE handoff_id=?",
                              (handoff_id,)).fetchone()
            if stored is None:
                return HandoffResult(HandoffState.AWAITING_RECEIPTS,EXTERNAL_BLOCKERS,
                                     pair[0][0],len(receipts))
            receipt=json.loads(stored[0])
            if (_canonical(receipt)!=stored[0].encode()
                or verify_archive_receipt(receipt,pinned_archive_keys,
                    expected_archive_id=req["archive_id"],
                    expected_incident_sequence=incident_sequence,
                    expected_incident_head_sha256=independently_pinned_incident_head_sha256,
                    expected_conflict_sha256=row[0],now=now) is None):
                return _deny("ACK_INVALID_AT_FINALIZE")
            receipts.append(receipt)
        r=append_archive_receipts(
            db,receipts=receipts,expected_archive_ids=tuple(x[1]["archive_id"] for x in pair),
            pinned_archive_keys=pinned_archive_keys,pinned_custodian_keys=pinned_custodian_keys,
            expected_incident_sequence=incident_sequence,
            independently_pinned_incident_head_sha256=independently_pinned_incident_head_sha256,
            expected_receipt_sequence=expected_receipt_sequence,
            independently_pinned_receipt_head_sha256=independently_pinned_receipt_head_sha256,
            now=now,
        )
        if r.state!=ArchiveState.ACKNOWLEDGED_QUARANTINED:
            return _deny("V61_FINALIZE_CAS_BLOCKED")
        return HandoffResult(HandoffState.FINALIZED_QUARANTINED,EXTERNAL_BLOCKERS,
                             pair[0][0],2,r.head_sha256)
    except (sqlite3.Error,TypeError,ValueError,KeyError,AttributeError):
        return _deny("FINALIZE_FAILED")


def execution_permitted(result:HandoffResult)->bool:
    return False
