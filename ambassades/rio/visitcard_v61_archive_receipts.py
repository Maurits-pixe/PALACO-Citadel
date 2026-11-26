"""RIO v6.1 signed dual-archive incident receipts and local receipt succession.

Offline signed receipts only; this module does NOT contact external archives.
SQLite transactions and triggers protect against accidental local edits, not
privileged rollback. Independently pinned latest incident AND receipt heads
are mandatory for rollback detection. DRAFT / GO-13 HOLD / DENY.
"""
from __future__ import annotations
import base64
from dataclasses import dataclass
from datetime import datetime,timedelta,timezone
from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any,Mapping
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from visitcard_release_review import _hex
from visitcard_v60_incident_ledger import _chain,MAX_INCIDENTS
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-V61-INCIDENT-ARCHIVE-RECEIPT\x00"
SCOPE="RIO-VISITCARD-V6.1-INCIDENT-ARCHIVE"
GENESIS=hashlib.sha256(b"PALACO-RIO-V6.1-RECEIPT-LEDGER-GENESIS").hexdigest()
MAX_AGE=timedelta(minutes=15)
MAX_RECEIPT_BYTES=8192
FIELDS=frozenset({
    "version","scope","archive_id","incident_sequence","incident_head_sha256",
    "conflict_sha256","received_at","expires_at","go13",
})


class ArchiveState(str,Enum):
    ACKNOWLEDGED_QUARANTINED="ACKNOWLEDGED_QUARANTINED"
    VERIFIED_QUARANTINED="VERIFIED_QUARANTINED"
    BLOCKED="BLOCKED"


@dataclass(frozen=True)
class ArchiveResult:
    state:ArchiveState
    blockers:tuple[str,...]
    sequence:int|None=None
    head_sha256:str|None=None
    incident_sequence:int|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _blocked(reason:str)->ArchiveResult:
    return ArchiveResult(ArchiveState.BLOCKED,
                         tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))))


def _time(s:Any)->datetime:
    if not isinstance(s,str):
        raise ValueError("timestamp")
    t=datetime.fromisoformat(s.replace("Z","+00:00"))
    if t.utcoffset() is None:
        raise ValueError("timezone required")
    return t.astimezone(timezone.utc)


def _sig(s:Any)->bytes:
    if not isinstance(s,str) or len(s)!=86:
        raise ValueError("signature length")
    raw=base64.urlsafe_b64decode(s+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=s:
        raise ValueError("noncanonical signature")
    return raw


def verify_archive_receipt(
    receipt:Any,keys:Mapping[str,bytes],*,
    expected_archive_id:str,expected_incident_sequence:int,
    expected_incident_head_sha256:str,expected_conflict_sha256:str,
    now:datetime|None=None,
)->bytes|None:
    """Verify one independently provisioned Ed25519 receipt; no issuance."""
    try:
        if not isinstance(receipt,dict) or set(receipt)!={"payload","signer_id","signature"}:
            return None
        p=receipt["payload"]
        if not isinstance(p,dict) or set(p)!=FIELDS:
            return None
        if (type(p["version"]) is not int or p["version"]!=1
            or p["scope"]!=SCOPE or p["go13"]!="HOLD"):
            return None
        if (not isinstance(expected_archive_id,str) or not 1<=len(expected_archive_id)<=128
            or type(expected_incident_sequence) is not int
            or not 1<=expected_incident_sequence<=MAX_INCIDENTS
            or not _hex(expected_incident_head_sha256)
            or not _hex(expected_conflict_sha256)):
            return None
        if (p["archive_id"]!=expected_archive_id
            or type(p["incident_sequence"]) is not int
            or p["incident_sequence"]!=expected_incident_sequence
            or p["incident_head_sha256"]!=expected_incident_head_sha256
            or p["conflict_sha256"]!=expected_conflict_sha256):
            return None
        issued=_time(p["received_at"])
        expires=_time(p["expires_at"])
        current=datetime.now(timezone.utc) if now is None else now
        if not isinstance(current,datetime) or current.utcoffset() is None:
            return None
        if not (issued<=current.astimezone(timezone.utc)<expires
            and timedelta(0)<expires-issued<=MAX_AGE):
            return None
        signer=receipt["signer_id"]
        if not isinstance(signer,str) or signer!=expected_archive_id:
            return None
        pub=keys.get(signer)
        if not isinstance(pub,bytes) or len(pub)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(pub).verify(
            _sig(receipt["signature"]),
            DOMAIN+signer.encode("utf-8")+b"\x00"+_canonical(p)
        )
        return pub
    except (TypeError,ValueError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def initialize_archive_ledger(db:sqlite3.Connection)->None:
    if not isinstance(db,sqlite3.Connection) or db.in_transaction:
        raise ValueError("invalid database or active transaction")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS rio_v61_archive_receipts(
      sequence INTEGER PRIMARY KEY NOT NULL,
      incident_sequence INTEGER NOT NULL UNIQUE,
      receipts_json TEXT NOT NULL,
      previous_sha256 TEXT NOT NULL,
      head_sha256 TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS rio_v61_archive_no_update
      BEFORE UPDATE ON rio_v61_archive_receipts
      BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
    CREATE TRIGGER IF NOT EXISTS rio_v61_archive_no_delete
      BEFORE DELETE ON rio_v61_archive_receipts
      BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
    """)


def _chain_receipts(
    db:sqlite3.Connection,keys:Mapping[str,bytes],
)->tuple[int,str,int]|None:
    """Revalidate every archived signature and actual parent incident row."""
    try:
        rows=db.execute("""SELECT sequence,incident_sequence,receipts_json,
                      previous_sha256,head_sha256 FROM rio_v61_archive_receipts
                      ORDER BY sequence""").fetchall()
        if not isinstance(keys,Mapping) or len(rows)>MAX_INCIDENTS:
            return None
        previous=GENESIS
        last_incident=0
        for idx,(seq,inc,raw,prev,head) in enumerate(rows,1):
            if (type(seq) is not int or seq!=idx
                or type(inc) is not int or inc<=last_incident or inc>MAX_INCIDENTS
                or not isinstance(raw,str) or not 0<len(raw.encode())<=MAX_RECEIPT_BYTES
                or prev!=previous or not _hex(head)):
                return None
            batch=json.loads(raw)
            if (not isinstance(batch,dict) or set(batch)!={"version","receipts","go13"}
                or type(batch["version"]) is not int or batch["version"]!=1
                or batch["go13"]!="HOLD" or _canonical(batch)!=raw.encode("utf-8")):
                return None
            receipts=batch["receipts"]
            if not isinstance(receipts,list) or len(receipts)!=2:
                return None
            row=db.execute("""SELECT conflict_sha256,head_sha256 FROM
                    rio_v60_incident_events WHERE sequence=?""",(inc,)).fetchone()
            if row is None or len(row)!=2 or not all(_hex(x) for x in row):
                return None
            archives=set()
            public=set()
            for receipt in receipts:
                name=receipt["payload"]["archive_id"]
                if name in archives:
                    return None
                archives.add(name)
                observed_at=_time(receipt["payload"]["received_at"])
                key=verify_archive_receipt(
                    receipt,keys,expected_archive_id=name,
                    expected_incident_sequence=inc,
                    expected_incident_head_sha256=row[1],
                    expected_conflict_sha256=row[0],now=observed_at
                )
                if key is None or key in public:
                    return None
                public.add(key)
            evidence_hash=hashlib.sha256(_canonical(batch)).hexdigest()
            calculated=hashlib.sha256(_canonical({
                "version":1,"sequence":idx,"incident_sequence":inc,
                "previous_sha256":previous,"evidence_sha256":evidence_hash,
                "go13":"HOLD"
            })).hexdigest()
            if head!=calculated:
                return None
            previous=head
            last_incident=inc
        return len(rows),previous,last_incident
    except (sqlite3.Error,TypeError,ValueError,KeyError,AttributeError,OverflowError):
        return None


def read_archive_head(db:sqlite3.Connection,*,pinned_keys:Mapping[str,bytes],
    expected_receipt_sequence:int,independently_pinned_receipt_head_sha256:str,
    expected_last_incident_sequence:int,
)->ArchiveResult:
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(expected_receipt_sequence) is not int or expected_receipt_sequence<0
        or type(expected_last_incident_sequence) is not int or expected_last_incident_sequence<0
        or not _hex(independently_pinned_receipt_head_sha256)):
        return _blocked("MISSING_INDEPENDENT_ARCHIVE_PIN")
    try:
        db.execute("BEGIN")
        value=_chain_receipts(db,pinned_keys)
        db.rollback()
        if value is None:
            return _blocked("ARCHIVE_CHAIN_INVALID")
        if value!=(expected_receipt_sequence,independently_pinned_receipt_head_sha256,
                  expected_last_incident_sequence):
            return _blocked("ARCHIVE_ROLLBACK_OR_HEAD_MISMATCH")
        return ArchiveResult(ArchiveState.VERIFIED_QUARANTINED,EXTERNAL_BLOCKERS,*value)
    except sqlite3.Error:
        if db.in_transaction:
            db.rollback()
        return _blocked("ARCHIVE_STORE_UNAVAILABLE")


def append_archive_receipts(db:sqlite3.Connection,*,receipts:Any,
    expected_archive_ids:tuple[str,str],pinned_archive_keys:Mapping[str,bytes],
    pinned_custodian_keys:Mapping[str,bytes],
    expected_incident_sequence:int,independently_pinned_incident_head_sha256:str,
    expected_receipt_sequence:int,independently_pinned_receipt_head_sha256:str,
    now:datetime|None=None,
)->ArchiveResult:
    """Local atomic compare-and-append; no external network or acknowledgement issuance."""
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or type(expected_incident_sequence) is not int or expected_incident_sequence<1
        or type(expected_receipt_sequence) is not int or expected_receipt_sequence<0
        or not _hex(independently_pinned_incident_head_sha256)
        or not _hex(independently_pinned_receipt_head_sha256)
        or not isinstance(expected_archive_ids,tuple) or len(expected_archive_ids)!=2
        or expected_archive_ids[0]==expected_archive_ids[1]
        or not isinstance(receipts,(tuple,list)) or len(receipts)!=2
        or not isinstance(pinned_archive_keys,Mapping)):
        return _blocked("INVALID_ARCHIVE_CAS_INPUT")
    try:
        db.execute("BEGIN IMMEDIATE")
        incident=_chain(db,pinned_custodian_keys)
        archived=_chain_receipts(db,pinned_archive_keys)
        if incident is None or archived is None:
            db.rollback()
            return _blocked("INVALID_INCIDENT_OR_ARCHIVE_CHAIN")
        if (incident!=(expected_incident_sequence,independently_pinned_incident_head_sha256)
            or archived[:2]!=(expected_receipt_sequence,independently_pinned_receipt_head_sha256)
            or archived[2]>=expected_incident_sequence):
            db.rollback()
            return _blocked("STALE_OR_ROLLED_BACK_LEDGER_HEAD")
        row=db.execute("""SELECT conflict_sha256 FROM rio_v60_incident_events
                          WHERE sequence=?""",(expected_incident_sequence,)).fetchone()
        if row is None or not _hex(row[0]):
            db.rollback()
            return _blocked("INCIDENT_CONFLICT_NOT_FOUND")
        roots=set()
        for item,ident in zip(receipts,expected_archive_ids):
            key=verify_archive_receipt(
                item,pinned_archive_keys,expected_archive_id=ident,
                expected_incident_sequence=expected_incident_sequence,
                expected_incident_head_sha256=independently_pinned_incident_head_sha256,
                expected_conflict_sha256=row[0],now=now
            )
            if key is None or key in roots:
                db.rollback()
                return _blocked("INVALID_OR_REUSED_ARCHIVE_RECEIPT_KEY")
            roots.add(key)
        batch={"version":1,"receipts":list(receipts),"go13":"HOLD"}
        raw=_canonical(batch)
        if len(raw)>MAX_RECEIPT_BYTES:
            db.rollback()
            return _blocked("ARCHIVE_BATCH_TOO_LARGE")
        sequence=archived[0]+1
        head=hashlib.sha256(_canonical({
            "version":1,"sequence":sequence,"incident_sequence":expected_incident_sequence,
            "previous_sha256":archived[1],
            "evidence_sha256":hashlib.sha256(raw).hexdigest(),"go13":"HOLD",
        })).hexdigest()
        db.execute("""INSERT INTO rio_v61_archive_receipts
           (sequence,incident_sequence,receipts_json,previous_sha256,head_sha256)
           VALUES (?,?,?,?,?)""",
           (sequence,expected_incident_sequence,raw.decode("utf-8"),archived[1],head))
        db.commit()
        return ArchiveResult(ArchiveState.ACKNOWLEDGED_QUARANTINED,EXTERNAL_BLOCKERS,
                             sequence,head,expected_incident_sequence)
    except (sqlite3.Error,TypeError,ValueError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return _blocked("ARCHIVE_APPEND_BLOCKED")


def execution_permitted(result:ArchiveResult)->bool:
    return False
