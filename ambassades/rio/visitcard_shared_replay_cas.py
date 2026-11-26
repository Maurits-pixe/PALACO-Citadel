"""RIO VisitCard v4.7 shared SQLite replay CAS and signed synchronization receipt.

DRAFT / GO-13 HOLD. This is one shared SQLite database opened by multiple
processes, NOT a distributed transactional service or independent custodian.
No merge, deployment, identity issuance, or authorization.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from enum import Enum
import hashlib
import sqlite3
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from visitcard_witness_enrollment import _canonical
from visitcard_release_review import _hex

DOMAIN=b"PALACO-RIO-REPLAY-SYNC-V1\x00"
GENESIS=hashlib.sha256(b"PALACO-RIO-V4.7-REPLAY-GENESIS").hexdigest()
MAX_EVENTS=100000


class SyncState(str, Enum):
    PENDING_EXTERNAL_ACK="PENDING_EXTERNAL_ACK"
    ACKNOWLEDGED_INFORMATIONAL="ACKNOWLEDGED_INFORMATIONAL"
    STALE_HEAD_BLOCKED="STALE_HEAD_BLOCKED"
    REPLAY_BLOCKED="REPLAY_BLOCKED"
    SYNC_BLOCKED="SYNC_BLOCKED"
    STORE_BLOCKED="STORE_BLOCKED"


@dataclass(frozen=True)
class SyncResult:
    state:SyncState
    blockers:tuple[str,...]
    sequence:int|None=None
    head_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _challenge(value:Any)->bool:
    try:
        if not isinstance(value,str) or len(value)!=43:
            return False
        raw=base64.urlsafe_b64decode(value+"==")
        return len(raw)==32 and base64.urlsafe_b64encode(raw).rstrip(b"=").decode()==value
    except (ValueError,TypeError):
        return False


def initialize_shared_replay(db:sqlite3.Connection)->None:
    if not isinstance(db,sqlite3.Connection) or db.in_transaction:
        raise ValueError("transaction already active")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS rio_shared_replay_head (
      singleton INTEGER PRIMARY KEY CHECK (singleton=1),
      sequence INTEGER NOT NULL,
      head_sha256 TEXT NOT NULL,
      acknowledged_sequence INTEGER NOT NULL,
      acknowledged_head_sha256 TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rio_shared_replay_events (
      sequence INTEGER PRIMARY KEY NOT NULL,
      challenge TEXT UNIQUE NOT NULL,
      checkpoint_sha256 TEXT NOT NULL,
      previous_sha256 TEXT NOT NULL,
      head_sha256 TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS rio_shared_no_delete BEFORE DELETE ON
      rio_shared_replay_events BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TRIGGER IF NOT EXISTS rio_shared_no_update BEFORE UPDATE ON
      rio_shared_replay_events BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TABLE IF NOT EXISTS rio_shared_sync_receipts (
      sequence INTEGER PRIMARY KEY,
      receipt_sha256 TEXT NOT NULL
    );
    INSERT OR IGNORE INTO rio_shared_replay_head
      VALUES (1,0,'""" + GENESIS + """',0,'""" + GENESIS + """');
    """)


def _state(db:sqlite3.Connection)->tuple[int,str,int,str]|None:
    """Verify full append-only event chain and acknowledgement consistency."""
    try:
        header=db.execute("""SELECT sequence,head_sha256,acknowledged_sequence,
                            acknowledged_head_sha256 FROM rio_shared_replay_head
                            WHERE singleton=1""").fetchone()
        if header is None or len(header)!=4:
            return None
        seq,head,ackseq,ackhead=header
        if type(seq) is not int or type(ackseq) is not int or not 0<=ackseq<=seq<=MAX_EVENTS or seq-ackseq>1:
            return None
        rows=db.execute("""SELECT sequence,challenge,checkpoint_sha256,previous_sha256,
                           head_sha256 FROM rio_shared_replay_events ORDER BY sequence""").fetchall()
        if len(rows)!=seq:
            return None
        previous=GENESIS
        acknowledged=GENESIS
        for i,(num,challenge,checkpoint,prev,current) in enumerate(rows,1):
            if type(num) is not int or num!=i or not _challenge(challenge) or not _hex(checkpoint):
                return None
            expected=hashlib.sha256(_canonical({
                "sequence":num,"challenge":challenge,"checkpoint_sha256":checkpoint,
                "previous_sha256":previous,"go13":"HOLD",
            })).hexdigest()
            if prev!=previous or current!=expected:
                return None
            previous=current
            if num==ackseq:
                acknowledged=current
        if head!=previous or ackhead!=acknowledged:
            return None
        receipts=db.execute(
            "SELECT sequence,receipt_sha256 FROM rio_shared_sync_receipts ORDER BY sequence"
        ).fetchall()
        if len(receipts)>1 or any(type(n) is not int or not _hex(d) or n!=ackseq for n,d in receipts):
            return None
        if ackseq==0 and receipts:
            return None
        if ackseq>0 and not receipts:
            return None
        return seq,head,ackseq,ackhead
    except (sqlite3.Error,TypeError,ValueError,OverflowError):
        return None


def read_shared_head(db:sqlite3.Connection)->tuple[int,str,int,str]|None:
    return _state(db)


def reserve_challenge(
    db:sqlite3.Connection,*,challenge:str,checkpoint_sha256:str,
    expected_sequence:int,expected_head_sha256:str,
    externally_pinned_head_sha256:str
)->SyncResult:
    """Atomic CAS: reserve once, block further writes pending external ack."""
    if not isinstance(db,sqlite3.Connection) or db.in_transaction:
        return SyncResult(SyncState.STORE_BLOCKED,("DATABASE_NOT_IDLE",))
    if (not _challenge(challenge) or not _hex(checkpoint_sha256) or
        type(expected_sequence) is not int or not 0<=expected_sequence<MAX_EVENTS or
        not _hex(expected_head_sha256) or not _hex(externally_pinned_head_sha256)):
        return SyncResult(SyncState.STORE_BLOCKED,("INVALID_INPUT",))
    if expected_head_sha256!=externally_pinned_head_sha256:
        return SyncResult(SyncState.STALE_HEAD_BLOCKED,("EXTERNAL_HEAD_MISMATCH",))
    try:
        db.execute("BEGIN IMMEDIATE")
        state=_state(db)
        if state is None:
            return SyncResult(SyncState.STORE_BLOCKED,("LEDGER_INTEGRITY_FAILED",))
        sequence,head,acksequence,ackhead=state
        if sequence!=expected_sequence or head!=expected_head_sha256:
            return SyncResult(SyncState.STALE_HEAD_BLOCKED,("CAS_MISMATCH",))
        if acksequence!=sequence or ackhead!=head:
            return SyncResult(SyncState.SYNC_BLOCKED,("EXTERNAL_ACK_PENDING",))
        if db.execute("SELECT 1 FROM rio_shared_replay_events WHERE challenge=?",
                      (challenge,)).fetchone():
            return SyncResult(SyncState.REPLAY_BLOCKED,("CHALLENGE_ALREADY_CONSUMED",))
        new_sequence=sequence+1
        digest=hashlib.sha256(_canonical({
            "sequence":new_sequence,"challenge":challenge,"checkpoint_sha256":checkpoint_sha256,
            "previous_sha256":head,"go13":"HOLD",
        })).hexdigest()
        db.execute("""INSERT INTO rio_shared_replay_events
                   (sequence,challenge,checkpoint_sha256,previous_sha256,head_sha256)
                   VALUES (?,?,?,?,?)""",
                   (new_sequence,challenge,checkpoint_sha256,head,digest))
        changed=db.execute("""UPDATE rio_shared_replay_head
                         SET sequence=?,head_sha256=?
                         WHERE singleton=1 AND sequence=? AND head_sha256=?""",
                         (new_sequence,digest,sequence,head)).rowcount
        if changed!=1:
            return SyncResult(SyncState.STALE_HEAD_BLOCKED,("CAS_UPDATE_LOST",))
        db.commit()
        return SyncResult(SyncState.PENDING_EXTERNAL_ACK,("EXTERNAL_ACK_REQUIRED",),
                          new_sequence,digest)
    except sqlite3.IntegrityError:
        return SyncResult(SyncState.REPLAY_BLOCKED,("CHALLENGE_ALREADY_CONSUMED",))
    except (sqlite3.Error,TypeError,ValueError,OverflowError):
        return SyncResult(SyncState.STORE_BLOCKED,("DATABASE_FAILURE",))
    finally:
        if db.in_transaction:
            db.rollback()


def acknowledge_head(
    db:sqlite3.Connection,*,receipt:Any,pinned_custodians:Mapping[str,bytes],
    independently_pinned_receipt_sha256:str
)->SyncResult:
    """Recover a pending commit using an external custodian's signed receipt."""
    if not isinstance(db,sqlite3.Connection) or db.in_transaction:
        return SyncResult(SyncState.STORE_BLOCKED,("DATABASE_NOT_IDLE",))
    try:
        if not isinstance(receipt,dict) or set(receipt)!={"payload","custodian_id","signature"}:
            return SyncResult(SyncState.SYNC_BLOCKED,("INVALID_RECEIPT",))
        p=receipt["payload"]
        if not isinstance(p,dict) or set(p)!={"version","sequence","head_sha256","go13"}:
            return SyncResult(SyncState.SYNC_BLOCKED,("INVALID_RECEIPT",))
        if type(p["version"]) is not int or p["version"]!=1 or p["go13"]!="HOLD":
            return SyncResult(SyncState.SYNC_BLOCKED,("INVALID_RECEIPT",))
        custodian=receipt["custodian_id"]
        if not isinstance(custodian,str) or not 0<len(custodian)<=128:
            return SyncResult(SyncState.SYNC_BLOCKED,("INVALID_CUSTODIAN",))
        key=pinned_custodians.get(custodian)
        if not isinstance(key,bytes) or len(key)!=32:
            return SyncResult(SyncState.SYNC_BLOCKED,("UNPINNED_CUSTODIAN",))
        signature=receipt["signature"]
        if not isinstance(signature,str) or len(signature)!=86:
            return SyncResult(SyncState.SYNC_BLOCKED,("BAD_SIGNATURE",))
        sig=base64.urlsafe_b64decode(signature+"==")
        if len(sig)!=64 or base64.urlsafe_b64encode(sig).rstrip(b"=").decode()!=signature:
            return SyncResult(SyncState.SYNC_BLOCKED,("BAD_SIGNATURE",))
        Ed25519PublicKey.from_public_bytes(key).verify(
            sig,DOMAIN+custodian.encode()+b"\x00"+_canonical(p))
        receipt_digest=hashlib.sha256(_canonical(receipt)).hexdigest()
        if not _hex(independently_pinned_receipt_sha256) or receipt_digest!=independently_pinned_receipt_sha256:
            return SyncResult(SyncState.SYNC_BLOCKED,("EXTERNAL_RECEIPT_PIN_MISMATCH",))
        db.execute("BEGIN IMMEDIATE")
        state=_state(db)
        if state is None:
            return SyncResult(SyncState.STORE_BLOCKED,("LEDGER_INTEGRITY_FAILED",))
        seq,head,ackseq,ackhead=state
        if type(p["sequence"]) is not int or p["sequence"]!=seq or p["head_sha256"]!=head:
            return SyncResult(SyncState.STALE_HEAD_BLOCKED,("RECEIPT_HEAD_MISMATCH",))
        if ackseq==seq and seq!=0:
            old=db.execute("SELECT receipt_sha256 FROM rio_shared_sync_receipts WHERE sequence=?",
                           (seq,)).fetchone()
            if old is not None and old[0]==receipt_digest:
                return SyncResult(SyncState.ACKNOWLEDGED_INFORMATIONAL,(),seq,head)
            return SyncResult(SyncState.SYNC_BLOCKED,("CONFLICTING_RECEIPT",))
        if ackseq!=seq-1:
            return SyncResult(SyncState.SYNC_BLOCKED,("ACK_SEQUENCE_GAP",))
        db.execute("DELETE FROM rio_shared_sync_receipts")  # keep the last externally signed receipt only
        db.execute("INSERT INTO rio_shared_sync_receipts VALUES (?,?)",(seq,receipt_digest))
        changed=db.execute("""UPDATE rio_shared_replay_head
                   SET acknowledged_sequence=?,acknowledged_head_sha256=?
                   WHERE singleton=1 AND sequence=? AND head_sha256=?
                   AND acknowledged_sequence=?""",
                   (seq,head,seq,head,ackseq)).rowcount
        if changed!=1:
            return SyncResult(SyncState.SYNC_BLOCKED,("ACK_CAS_LOST",))
        db.commit()
        return SyncResult(SyncState.ACKNOWLEDGED_INFORMATIONAL,(),seq,head)
    except (ValueError,TypeError,KeyError,AttributeError,sqlite3.Error,InvalidSignature):
        return SyncResult(SyncState.SYNC_BLOCKED,("ACKNOWLEDGEMENT_INVALID",))
    finally:
        if db.in_transaction:
            db.rollback()


def execution_permitted(result:SyncResult)->bool:
    return False
