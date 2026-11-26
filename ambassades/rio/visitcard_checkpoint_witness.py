"""RIO v2.5 independently provisioned checkpoint witness — DRAFT / GO-13 HOLD.

A third, separately administered SQLite database can attest to the highest
custody-signed high-water receipt, using its own Ed25519 signing key.
NOT a hosted service, external network delivery, HSM or immutable storage.
Compromise or simultaneous rollback of all copies remains outside this
prototype's protection. Never grants identity or activation authority.
"""
from __future__ import annotations

import base64
from datetime import datetime, timezone
from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from visitcard_anchor_custody import verify_custody_receipt
from visitcard_witness_enrollment import _canonical

DOMAIN = b"PALACO-RIO-THIRD-WITNESS-CHECKPOINT-V1\x00"
SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_checkpoint_witness (
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 events_sha256 TEXT NOT NULL,
 custody_receipt_sha256 TEXT NOT NULL,
 checkpoint_json TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce)
);
CREATE TABLE IF NOT EXISTS rio_checkpoint_witness_history (
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 events_sha256 TEXT NOT NULL,
 custody_receipt_sha256 TEXT NOT NULL,
 checkpoint_json TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce,event_count)
);
CREATE TRIGGER IF NOT EXISTS rio_checkpoint_history_no_update
 BEFORE UPDATE ON rio_checkpoint_witness_history
 BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_checkpoint_history_no_delete
 BEFORE DELETE ON rio_checkpoint_witness_history
 BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_checkpoint_head_no_delete
 BEFORE DELETE ON rio_checkpoint_witness
 BEGIN SELECT RAISE(ABORT,'no-delete'); END;
CREATE TRIGGER IF NOT EXISTS rio_checkpoint_head_no_regress
 BEFORE UPDATE ON rio_checkpoint_witness
 WHEN OLD.issuer!=NEW.issuer OR OLD.nonce!=NEW.nonce OR
 NEW.event_count!=OLD.event_count+1
 BEGIN SELECT RAISE(ABORT,'non-monotone'); END;
"""


class CheckpointState(str, Enum):
    MATCHED = "MATCHED"
    BEHIND = "BEHIND"
    AHEAD_UNCONFIRMED = "AHEAD_UNCONFIRMED"
    FORK = "FORK"
    UNKNOWN = "UNKNOWN"


def initialize_checkpoint_witness(db: sqlite3.Connection) -> None:
    if db.in_transaction:
        raise ValueError("migration in active transaction")
    db.executescript(SCHEMA)


def _packed(value: Any) -> str:
    return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False)


def _hash(value: Any) -> bool:
    return isinstance(value,str) and len(value)==64 and all(c in "0123456789abcdef" for c in value)


def verify_checkpoint(
    checkpoint: Any, pinned_keys: Mapping[str,bytes], *,
    issuer: str, nonce: str
) -> tuple[int,str,str] | None:
    """Independently validate signed checkpoint; never bootstrap keys from it."""
    try:
        if not isinstance(checkpoint,dict) or set(checkpoint)!={"payload","witness_id","signature"}:
            return None
        p=checkpoint["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","issuer","nonce","event_count","events_sha256",
            "custody_receipt_sha256","observed_at"
        }:
            return None
        if type(p["version"]) is not int or p["version"]!=1 or p["issuer"]!=issuer or p["nonce"]!=nonce:
            return None
        if type(p["event_count"]) is not int or p["event_count"] not in (1,2):
            return None
        if not _hash(p["events_sha256"]) or not _hash(p["custody_receipt_sha256"]):
            return None
        wid=checkpoint["witness_id"]
        if not isinstance(wid,str) or not wid or len(wid)>128:
            return None
        pub=pinned_keys.get(wid)
        if not isinstance(pub,bytes) or len(pub)!=32:
            return None
        timestamp=datetime.fromisoformat(p["observed_at"].replace("Z","+00:00"))
        if timestamp.tzinfo is None or timestamp.utcoffset() is None:
            return None
        sig=checkpoint["signature"]
        if not isinstance(sig,str) or len(sig)!=86:
            return None
        raw=base64.urlsafe_b64decode(sig+"==")
        if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=sig:
            return None
        Ed25519PublicKey.from_public_bytes(pub).verify(
            raw, DOMAIN + wid.encode("utf-8") + b"\x00" + _canonical(p)
        )
        return p["event_count"],p["events_sha256"],p["custody_receipt_sha256"]
    except (ValueError,TypeError,KeyError,AttributeError,InvalidSignature,OverflowError):
        return None



def audit_checkpoint_history(
    db: sqlite3.Connection, issuer: str, nonce: str,
    pinned_witness_keys: Mapping[str,bytes],
) -> bool:
    """Verify contiguous signed history and exact equality to current head.

    Requires an independently pinned witness public key; a local row cannot
    select its own key. Database administrators can still roll back the
    *entire* coherent history unless a separate highest head is retained.
    """
    try:
        rows=db.execute(
            """SELECT event_count,events_sha256,custody_receipt_sha256,checkpoint_json
               FROM rio_checkpoint_witness_history WHERE issuer=? AND nonce=?
               ORDER BY event_count""",(issuer,nonce)
        ).fetchall()
        head=db.execute(
            """SELECT event_count,events_sha256,custody_receipt_sha256,checkpoint_json
               FROM rio_checkpoint_witness WHERE issuer=? AND nonce=?""",(issuer,nonce)
        ).fetchone()
        if not rows or len(rows)>2 or head!=rows[-1]:
            return False
        for index,(count,digest,receipt_hash,packed) in enumerate(rows,1):
            if count!=index or not _hash(digest) or not _hash(receipt_hash):
                return False
            checkpoint=json.loads(packed)
            if verify_checkpoint(checkpoint,pinned_witness_keys,issuer=issuer,nonce=nonce) != (
                count,digest,receipt_hash
            ):
                return False
            if _packed(checkpoint)!=packed:
                return False
        return True
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
        return False


def compare_checkpoint_history(
    db: sqlite3.Connection, external_head: Any,
    pinned_witness_keys: Mapping[str,bytes], *, issuer: str, nonce: str
) -> CheckpointState:
    """Reconcile complete local witness history against independently held head.

    The external head MUST have been retrieved from separately protected
    custody, not from this same database; otherwise whole-DB rollback is
    undetectable. No automatic recovery or authorization.
    """
    signed=verify_checkpoint(external_head,pinned_witness_keys,issuer=issuer,nonce=nonce)
    if signed is None or db.in_transaction:
        return CheckpointState.UNKNOWN
    if not audit_checkpoint_history(db,issuer,nonce,pinned_witness_keys):
        return CheckpointState.UNKNOWN
    try:
        row=db.execute(
            """SELECT event_count,events_sha256,custody_receipt_sha256
               FROM rio_checkpoint_witness WHERE issuer=? AND nonce=?""",
            (issuer,nonce)
        ).fetchone()
        if row is None:
            return CheckpointState.UNKNOWN
        if row[0]<signed[0]:
            return CheckpointState.BEHIND
        if row[0]>signed[0]:
            return CheckpointState.AHEAD_UNCONFIRMED
        return CheckpointState.MATCHED if row==signed else CheckpointState.FORK
    except (sqlite3.Error,TypeError,ValueError):
        return CheckpointState.UNKNOWN


def attest_checkpoint(
    db: sqlite3.Connection, custody_receipt: Any, custody_keys: Mapping[str,bytes],
    witness_private_key: Ed25519PrivateKey, witness_id: str,
    *, now: datetime | None = None
) -> dict | None:
    """Only sign an independently verified receipt; commit before return."""
    if db.in_transaction:
        return None
    try:
        if not isinstance(custody_receipt,dict) or not isinstance(witness_private_key,Ed25519PrivateKey):
            return None
        if not isinstance(witness_id,str) or not 0<len(witness_id)<=128:
            return None
        p=custody_receipt["payload"]
        issuer,nonce,count,digest=(p["issuer"],p["nonce"],p["event_count"],p["events_sha256"])
        if (not isinstance(issuer,str) or not 0<len(issuer)<=128 or
            not isinstance(nonce,str) or not 0<len(nonce)<=128 or
            type(count) is not int or count not in (1,2) or not _hash(digest)):
            return None
        if not verify_custody_receipt(
            custody_receipt,custody_keys,expected_issuer=issuer,expected_nonce=nonce,
            expected_count=count,expected_hash=digest
        ):
            return None
        raw_custody=_packed(custody_receipt).encode("utf-8")
        if len(raw_custody)>4096:
            return None
        receipt_hash=hashlib.sha256(raw_custody).hexdigest()
        instant=datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant,datetime) or instant.tzinfo is None or instant.utcoffset() is None:
            return None
        db.execute("BEGIN IMMEDIATE")
        head=db.execute(
            """SELECT event_count,events_sha256,custody_receipt_sha256,checkpoint_json
               FROM rio_checkpoint_witness WHERE issuer=? AND nonce=?""",
            (issuer,nonce),
        ).fetchone()
        if head is not None:
            own_key=witness_private_key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
            if not audit_checkpoint_history(db,issuer,nonce,{witness_id:own_key}):
                db.rollback()
                return None
            if count==head[0]:
                if (digest,receipt_hash)!=(head[1],head[2]):
                    db.rollback()
                    return None
                result=json.loads(head[3])
                db.commit()
                return result
            if not (head[0]==1 and count==2):
                db.rollback()
                return None
        elif count!=1:
            db.rollback()
            return None
        payload={"version":1,"issuer":issuer,"nonce":nonce,"event_count":count,
                 "events_sha256":digest,"custody_receipt_sha256":receipt_hash,
                 "observed_at":instant.astimezone(timezone.utc).isoformat()}
        sig=witness_private_key.sign(DOMAIN+witness_id.encode("utf-8")+b"\x00"+_canonical(payload))
        result={"payload":payload,"witness_id":witness_id,
                "signature":base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")}
        packed=_packed(result)
        db.execute(
            """INSERT INTO rio_checkpoint_witness_history
               (issuer,nonce,event_count,events_sha256,custody_receipt_sha256,checkpoint_json)
               VALUES (?,?,?,?,?,?)""",(issuer,nonce,count,digest,receipt_hash,packed)
        )
        db.execute(
            """INSERT INTO rio_checkpoint_witness
               (issuer,nonce,event_count,events_sha256,custody_receipt_sha256,checkpoint_json)
               VALUES (?,?,?,?,?,?)
               ON CONFLICT(issuer,nonce) DO UPDATE SET
               event_count=excluded.event_count,events_sha256=excluded.events_sha256,
               custody_receipt_sha256=excluded.custody_receipt_sha256,
               checkpoint_json=excluded.checkpoint_json""",
            (issuer,nonce,count,digest,receipt_hash,packed)
        )
        db.commit()
        return result
    except (sqlite3.Error,ValueError,TypeError,KeyError,OverflowError,AttributeError):
        if db.in_transaction:
            db.rollback()
        return None


def compare_checkpoint(
    highwater_db: sqlite3.Connection, checkpoint: Any,
    witness_keys: Mapping[str,bytes], *, issuer: str, nonce: str
) -> CheckpointState:
    """Compare externally supplied pinned-key checkpoint to local highwater."""
    if highwater_db.in_transaction:
        return CheckpointState.UNKNOWN
    signed=verify_checkpoint(checkpoint,witness_keys,issuer=issuer,nonce=nonce)
    if signed is None:
        return CheckpointState.UNKNOWN
    try:
        row=highwater_db.execute(
            """SELECT event_count,events_sha256,receipt_json
               FROM rio_anchor_highwater WHERE issuer=? AND nonce=?""",
            (issuer,nonce)
        ).fetchone()
        if row is None:
            return CheckpointState.BEHIND
        count,digest,receipt_json=row
        if type(count) is not int or count not in (1,2) or not _hash(digest):
            return CheckpointState.UNKNOWN
        if count<signed[0]:
            return CheckpointState.BEHIND
        if count>signed[0]:
            return CheckpointState.AHEAD_UNCONFIRMED
        receipt_hash=hashlib.sha256(receipt_json.encode("utf-8")).hexdigest()
        return (CheckpointState.MATCHED if (digest,receipt_hash)==signed[1:]
                else CheckpointState.FORK)
    except (sqlite3.Error,ValueError,TypeError,AttributeError):
        return CheckpointState.UNKNOWN
