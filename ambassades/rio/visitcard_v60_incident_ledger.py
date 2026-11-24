"""RIO v6.0 SQLite append-only split-view incident ledger — GO-13 HOLD.

Stores both signed custodian observations with their pinned digests and
cryptographic incident-chain hashes. Revalidates archived signatures when
reading. Rollback protection REQUIRES a latest-head pin from outside SQLite.
Local SQLite triggers are tamper resistance, not independent durable custody.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any,Mapping

from visitcard_release_review import _hex
from visitcard_v58_api_succession import SuccessionReview
from visitcard_v59_dual_custody import (
    CustodyState, compare_custodian_checkpoints, _verified_observation,
)
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

GENESIS=hashlib.sha256(b"PALACO-RIO-V6.0-SPLIT-VIEW-INCIDENT-GENESIS").hexdigest()
MAX_INCIDENTS=100000
MAX_PAYLOAD=32768


class IncidentState(str,Enum):
    RECORDED_QUARANTINED="RECORDED_QUARANTINED"
    VERIFIED_QUARANTINED="VERIFIED_QUARANTINED"
    BLOCKED="BLOCKED"


@dataclass(frozen=True)
class IncidentResult:
    state:IncidentState
    blockers:tuple[str,...]
    sequence:int|None=None
    head_sha256:str|None=None
    conflict_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def initialize_incident_ledger(db:sqlite3.Connection)->None:
    if not isinstance(db,sqlite3.Connection) or db.in_transaction:
        raise ValueError("invalid database or active transaction")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS rio_v60_incident_events(
       sequence INTEGER PRIMARY KEY NOT NULL,
       conflict_sha256 TEXT NOT NULL UNIQUE,
       evidence_json TEXT NOT NULL,
       previous_sha256 TEXT NOT NULL,
       head_sha256 TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS rio_v60_immutable_update
      BEFORE UPDATE ON rio_v60_incident_events
      BEGIN SELECT RAISE(ABORT,'immutable incident'); END;
    CREATE TRIGGER IF NOT EXISTS rio_v60_immutable_delete
      BEFORE DELETE ON rio_v60_incident_events
      BEGIN SELECT RAISE(ABORT,'immutable incident'); END;
    """)


def _blocked(reason:str)->IncidentResult:
    return IncidentResult(IncidentState.BLOCKED,
                          tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))))


def _chain(db:sqlite3.Connection,roots:Mapping[str,bytes])->tuple[int,str]|None:
    """Read and validate *all* stored events, including original signatures."""
    try:
        rows=db.execute("""SELECT sequence,conflict_sha256,evidence_json,
                        previous_sha256,head_sha256
                        FROM rio_v60_incident_events ORDER BY sequence""").fetchall()
        if len(rows)>MAX_INCIDENTS or not isinstance(roots,Mapping):
            return None
        previous=GENESIS
        seen=set()
        for idx,(seq,conflict,raw,prev,head) in enumerate(rows,1):
            if (type(seq) is not int or seq!=idx or not _hex(conflict)
                or conflict in seen or prev!=previous
                or not isinstance(raw,str) or not 0<len(raw.encode("utf-8"))<=MAX_PAYLOAD
                or not _hex(head)):
                return None
            seen.add(conflict)
            payload=json.loads(raw)
            if not isinstance(payload,dict) or set(payload)!={
                "version","comparison_sha256","conflict_sha256",
                "repository","observation_pins","observations","go13"
            }:
                return None
            if (type(payload["version"]) is not int or payload["version"]!=1
                or payload["go13"]!="HOLD" or payload["conflict_sha256"]!=conflict
                or not _hex(payload["comparison_sha256"])):
                return None
            notes=payload["observations"]
            pins=payload["observation_pins"]
            if not isinstance(notes,list) or len(notes)!=2 or not isinstance(pins,dict):
                return None
            names=[note.get("custodian_id") for note in notes if isinstance(note,dict)]
            if len(names)!=2 or names[0]==names[1] or set(names)!=set(pins):
                return None
            verified=[
                _verified_observation(note,roots,pins[name],
                                      expected_repository=payload["repository"],now=None)
                for note,name in zip(notes,names)
            ]
            # Archived signature validity must not depend on current time.
            # A signature may have expired since capture; verify historical
            # capture by passing original observed_at and ensure expiry itself
            # was bounded by the custody protocol.
            if any(item is None for item in verified):
                return None
            if verified[0][1]==verified[1][1]:
                return None
            a,b=verified[0][2],verified[1][2]
            if (a["sequence"]==b["sequence"] and a["record_sha256"]==b["record_sha256"]
                and a["previous_sha256"]==b["previous_sha256"]):
                return None
            comparison=hashlib.sha256(_canonical({
                "version":1,"scope":"RIO-VISITCARD-V5.9-CHECKPOINT",
                "repository":payload["repository"],"custodians":sorted(names),
                "observation_sha256":dict(sorted(zip(names,[v[3] for v in verified]))),
                "go13":"HOLD",
            })).hexdigest()
            expected_conflict=hashlib.sha256(_canonical({
                "version":1,"type":"SPLIT_VIEW","comparison_sha256":comparison,
                "heads":sorted([
                    {"custodian":name,"sequence":obs["sequence"],
                     "record_sha256":obs["record_sha256"],
                     "previous_sha256":obs["previous_sha256"]}
                    for name,obs in zip(names,[a,b])
                ],key=lambda h:h["custodian"]),"go13":"HOLD",
            })).hexdigest()
            if comparison!=payload["comparison_sha256"] or expected_conflict!=conflict:
                return None
            expected=hashlib.sha256(_canonical({
                "version":1,"sequence":idx,"previous_sha256":previous,
                "evidence_sha256":hashlib.sha256(_canonical(payload)).hexdigest(),
                "conflict_sha256":conflict,"go13":"HOLD",
            })).hexdigest()
            if head!=expected:
                return None
            previous=head
        return len(rows),previous
    except (sqlite3.Error,TypeError,ValueError,KeyError,AttributeError,UnicodeError):
        return None


def read_incident_head(
    db:sqlite3.Connection,*,pinned_custodian_keys:Mapping[str,bytes],
    expected_sequence:int,independently_pinned_head_sha256:str,
)->IncidentResult:
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(expected_sequence) is not int or not 0<=expected_sequence<=MAX_INCIDENTS
        or not _hex(independently_pinned_head_sha256)):
        return _blocked("INDEPENDENT_LEDGER_PIN_MISSING")
    try:
        db.execute("BEGIN")
        state=_chain(db,pinned_custodian_keys)
        db.rollback()
        if state is None:
            return _blocked("INCIDENT_CHAIN_INVALID")
        if state!=(expected_sequence,independently_pinned_head_sha256):
            return _blocked("LEDGER_ROLLBACK_OR_HEAD_MISMATCH")
        return IncidentResult(IncidentState.VERIFIED_QUARANTINED,EXTERNAL_BLOCKERS,*state)
    except sqlite3.Error:
        if db.in_transaction:
            db.rollback()
        return _blocked("INCIDENT_STORE_UNAVAILABLE")


def append_split_view_incident(
    db:sqlite3.Connection,*,upstream:SuccessionReview,
    observations:Any,pinned_custodian_keys:Mapping[str,bytes],
    independently_pinned_observation_sha256:Mapping[str,str],
    expected_custodian_ids:tuple[str,str],expected_repository:str,
    expected_previous_record_sha256:str,expected_min_sequence:int,
    expected_ledger_sequence:int,independently_pinned_ledger_head_sha256:str,
    now:Any=None,
)->IncidentResult:
    """Atomic local append; the *external* current-head pin is caller-owned."""
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(expected_ledger_sequence) is not int
        or not 0<=expected_ledger_sequence<MAX_INCIDENTS
        or not _hex(independently_pinned_ledger_head_sha256)):
        return _blocked("INVALID_LEDGER_CAS_INPUT")
    review=compare_custodian_checkpoints(
        upstream,observations=observations,pinned_custodian_keys=pinned_custodian_keys,
        independently_pinned_observation_sha256=independently_pinned_observation_sha256,
        expected_custodian_ids=expected_custodian_ids,
        expected_repository=expected_repository,
        expected_previous_sha256=expected_previous_record_sha256,
        expected_min_sequence=expected_min_sequence,now=now
    )
    if (review.state!=CustodyState.SPLIT_VIEW_QUARANTINED
        or not _hex(review.conflict_sha256)
        or not _hex(review.comparison_sha256)):
        return _blocked("NO_VERIFIED_SPLIT_VIEW_CONFLICT")
    try:
        payload={
            "version":1,"comparison_sha256":review.comparison_sha256,
            "conflict_sha256":review.conflict_sha256,"repository":expected_repository,
            "observation_pins":dict(independently_pinned_observation_sha256),
            "observations":list(observations),"go13":"HOLD",
        }
        evidence=_canonical(payload)
        if len(evidence)>MAX_PAYLOAD:
            return _blocked("INCIDENT_EVIDENCE_TOO_LARGE")
        db.execute("BEGIN IMMEDIATE")
        state=_chain(db,pinned_custodian_keys)
        if state is None:
            db.rollback()
            return _blocked("INCIDENT_CHAIN_INVALID")
        if state!=(expected_ledger_sequence,independently_pinned_ledger_head_sha256):
            db.rollback()
            return _blocked("LEDGER_CAS_OR_ROLLBACK_MISMATCH")
        seq=state[0]+1
        head=hashlib.sha256(_canonical({
            "version":1,"sequence":seq,"previous_sha256":state[1],
            "evidence_sha256":hashlib.sha256(evidence).hexdigest(),
            "conflict_sha256":review.conflict_sha256,"go13":"HOLD",
        })).hexdigest()
        db.execute("""INSERT INTO rio_v60_incident_events
              (sequence,conflict_sha256,evidence_json,previous_sha256,head_sha256)
              VALUES (?,?,?,?,?)""",
              (seq,review.conflict_sha256,evidence.decode("utf-8"),state[1],head))
        db.commit()
        return IncidentResult(IncidentState.RECORDED_QUARANTINED,
                              EXTERNAL_BLOCKERS,seq,head,review.conflict_sha256)
    except (sqlite3.Error,ValueError,TypeError,UnicodeError):
        if db.in_transaction:
            db.rollback()
        return _blocked("INCIDENT_INSERT_REJECTED")


def execution_permitted(result:IncidentResult)->bool:
    return False
