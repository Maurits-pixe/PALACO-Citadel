"""PALACO RIO v2.7 separately administered checkpoint archive — DRAFT/HOLD.

The archive signs a monotone, hash-linked history of verified third-witness
checkpoints. It must run on a DIFFERENT security boundary and durable storage.
This library does not create independent infrastructure, prevent administrator
rollback of its own database, publish to third parties, or authorize access.
"""
from __future__ import annotations

import base64
from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from visitcard_checkpoint_witness import verify_checkpoint, _packed
from visitcard_witness_enrollment import _canonical

DOMAIN = b"PALACO-RIO-ARCHIVE-SEAL-V1\x00"
ZERO = "0" * 64
SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_checkpoint_archive_history (
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 checkpoint_json TEXT NOT NULL,
 seal_json TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce,event_count)
);
CREATE TABLE IF NOT EXISTS rio_checkpoint_archive_head (
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 checkpoint_sha256 TEXT NOT NULL,
 seal_sha256 TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce)
);
CREATE TRIGGER IF NOT EXISTS rio_archive_history_immutable_update
 BEFORE UPDATE ON rio_checkpoint_archive_history BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER IF NOT EXISTS rio_archive_history_immutable_delete
 BEFORE DELETE ON rio_checkpoint_archive_history BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER IF NOT EXISTS rio_archive_head_no_delete
 BEFORE DELETE ON rio_checkpoint_archive_head BEGIN SELECT RAISE(ABORT,'no-delete'); END;
CREATE TRIGGER IF NOT EXISTS rio_archive_head_monotone
 BEFORE UPDATE ON rio_checkpoint_archive_head
 WHEN NEW.issuer!=OLD.issuer OR NEW.nonce!=OLD.nonce
 OR NEW.event_count!=OLD.event_count+1
 BEGIN SELECT RAISE(ABORT,'nonmonotone'); END;
"""


class ArchiveComparison(str, Enum):
    MATCHED = "MATCHED"
    RESTORED_BEHIND = "RESTORED_BEHIND"
    LOCAL_AHEAD_UNCONFIRMED = "LOCAL_AHEAD_UNCONFIRMED"
    FORK = "FORK"
    UNKNOWN = "UNKNOWN"


def initialize_archive(db: sqlite3.Connection) -> None:
    if db.in_transaction:
        raise ValueError("migration inside transaction")
    db.executescript(SCHEMA)


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _hex(value: Any) -> bool:
    return isinstance(value,str) and len(value)==64 and all(c in "0123456789abcdef" for c in value)


def verify_seal(
    seal: Any, archive_keys: Mapping[str,bytes], *,
    issuer: str, nonce: str
) -> tuple[int,str,str] | None:
    """Check a separately pinned archive signature; never infer trusted keys."""
    try:
        if not isinstance(seal,dict) or set(seal)!={"payload","archive_id","signature"}:
            return None
        p=seal["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","issuer","nonce","event_count",
            "checkpoint_sha256","previous_seal_sha256"
        }:
            return None
        if type(p["version"]) is not int or p["version"]!=1 or p["issuer"]!=issuer or p["nonce"]!=nonce:
            return None
        if type(p["event_count"]) is not int or p["event_count"] not in (1,2):
            return None
        if not _hex(p["checkpoint_sha256"]) or not _hex(p["previous_seal_sha256"]):
            return None
        aid=seal["archive_id"]
        if not isinstance(aid,str) or not 0<len(aid)<=128:
            return None
        pub=archive_keys.get(aid)
        if not isinstance(pub,bytes) or len(pub)!=32:
            return None
        signature=seal["signature"]
        if not isinstance(signature,str) or len(signature)!=86:
            return None
        raw=base64.urlsafe_b64decode(signature+"==")
        if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=signature:
            return None
        Ed25519PublicKey.from_public_bytes(pub).verify(
            raw,DOMAIN+aid.encode("utf-8")+b"\x00"+_canonical(p)
        )
        return p["event_count"],p["checkpoint_sha256"],p["previous_seal_sha256"]
    except (ValueError,TypeError,KeyError,AttributeError,InvalidSignature,OverflowError):
        return None


def audit_archive(
    db: sqlite3.Connection, issuer: str, nonce: str,
    witness_keys: Mapping[str,bytes], archive_keys: Mapping[str,bytes],
) -> bool:
    """Audit all signed checkpoints, seal links, and durable head metadata."""
    try:
        rows=db.execute(
            """SELECT event_count,checkpoint_json,seal_json
               FROM rio_checkpoint_archive_history WHERE issuer=? AND nonce=?
               ORDER BY event_count""",(issuer,nonce)
        ).fetchall()
        head=db.execute(
            """SELECT event_count,checkpoint_sha256,seal_sha256
               FROM rio_checkpoint_archive_head WHERE issuer=? AND nonce=?""",
            (issuer,nonce)
        ).fetchone()
        if not rows or len(rows)>2 or head is None:
            return False
        previous=ZERO
        for expected,(count,checkpoint_json,seal_json) in enumerate(rows,1):
            if count!=expected:
                return False
            checkpoint=json.loads(checkpoint_json)
            seal=json.loads(seal_json)
            if _packed(checkpoint)!=checkpoint_json or _packed(seal)!=seal_json:
                return False
            signed=verify_checkpoint(checkpoint,witness_keys,issuer=issuer,nonce=nonce)
            if signed is None or signed[0]!=count:
                return False
            if verify_seal(seal,archive_keys,issuer=issuer,nonce=nonce)!=(
                count,_digest(checkpoint_json),previous
            ):
                return False
            previous=_digest(seal_json)
        return head==(rows[-1][0],_digest(rows[-1][1]),previous)
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
        return False


def archive_checkpoint(
    db: sqlite3.Connection, checkpoint: Any, witness_keys: Mapping[str,bytes],
    archive_private_key: Ed25519PrivateKey, archive_id: str
) -> dict | None:
    """Verify, insert and seal atomically; return only a committed seal."""
    if db.in_transaction or not isinstance(archive_private_key,Ed25519PrivateKey):
        return None
    if not isinstance(archive_id,str) or not 0<len(archive_id)<=128:
        return None
    try:
        if not isinstance(checkpoint,dict) or not isinstance(checkpoint.get("payload"),dict):
            return None
        p=checkpoint["payload"]
        issuer,nonce=p["issuer"],p["nonce"]
        if not isinstance(issuer,str) or not 0<len(issuer)<=128:
            return None
        if not isinstance(nonce,str) or not 0<len(nonce)<=128:
            return None
        signed=verify_checkpoint(checkpoint,witness_keys,issuer=issuer,nonce=nonce)
        if signed is None:
            return None
        count=signed[0]
        checkpoint_json=_packed(checkpoint)
        if len(checkpoint_json.encode("utf-8"))>4096:
            return None
        archive_pub=archive_private_key.public_key().public_bytes(
            Encoding.Raw,PublicFormat.Raw
        )
        db.execute("BEGIN IMMEDIATE")
        head=db.execute(
            """SELECT event_count,checkpoint_sha256,seal_sha256
               FROM rio_checkpoint_archive_head WHERE issuer=? AND nonce=?""",
            (issuer,nonce)
        ).fetchone()
        previous=ZERO
        if head is not None:
            if not audit_archive(db,issuer,nonce,witness_keys,{archive_id:archive_pub}):
                db.rollback()
                return None
            if count==head[0]:
                if head[1]!=_digest(checkpoint_json):
                    db.rollback()
                    return None
                row=db.execute(
                    """SELECT seal_json FROM rio_checkpoint_archive_history
                       WHERE issuer=? AND nonce=? AND event_count=?""",
                    (issuer,nonce,count)
                ).fetchone()
                if row is None:
                    db.rollback()
                    return None
                result=json.loads(row[0])
                db.commit()
                return result
            if count!=head[0]+1:
                db.rollback()
                return None
            previous=head[2]
        elif count!=1:
            db.rollback()
            return None
        payload={"version":1,"issuer":issuer,"nonce":nonce,"event_count":count,
                 "checkpoint_sha256":_digest(checkpoint_json),
                 "previous_seal_sha256":previous}
        sig=archive_private_key.sign(
            DOMAIN+archive_id.encode("utf-8")+b"\x00"+_canonical(payload)
        )
        seal={"payload":payload,"archive_id":archive_id,
              "signature":base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")}
        seal_json=_packed(seal)
        db.execute(
            """INSERT INTO rio_checkpoint_archive_history
               (issuer,nonce,event_count,checkpoint_json,seal_json)
               VALUES (?,?,?,?,?)""",(issuer,nonce,count,checkpoint_json,seal_json)
        )
        db.execute(
            """INSERT INTO rio_checkpoint_archive_head
               (issuer,nonce,event_count,checkpoint_sha256,seal_sha256)
               VALUES (?,?,?,?,?)
               ON CONFLICT(issuer,nonce) DO UPDATE SET
               event_count=excluded.event_count,
               checkpoint_sha256=excluded.checkpoint_sha256,
               seal_sha256=excluded.seal_sha256""",
            (issuer,nonce,count,_digest(checkpoint_json),_digest(seal_json))
        )
        db.commit()
        return seal
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return None


def compare_restored_witness(
    archive_db: sqlite3.Connection, witness_db: sqlite3.Connection,
    issuer: str, nonce: str,
    witness_keys: Mapping[str,bytes], archive_keys: Mapping[str,bytes],
) -> ArchiveComparison:
    """Use audited independent archive history as restore reference.

    The two DB connections must differ. Physical/operator independence is
    a DEPLOYMENT responsibility; this function cannot prove it.
    """
    if archive_db is witness_db or archive_db.in_transaction or witness_db.in_transaction:
        return ArchiveComparison.UNKNOWN
    if not audit_archive(archive_db,issuer,nonce,witness_keys,archive_keys):
        return ArchiveComparison.UNKNOWN
    try:
        archived=archive_db.execute(
            """SELECT event_count,checkpoint_sha256 FROM rio_checkpoint_archive_head
               WHERE issuer=? AND nonce=?""",(issuer,nonce)
        ).fetchone()
        local=witness_db.execute(
            """SELECT event_count,checkpoint_json FROM rio_checkpoint_witness
               WHERE issuer=? AND nonce=?""",(issuer,nonce)
        ).fetchone()
        if local is None:
            return ArchiveComparison.RESTORED_BEHIND
        count,checkpoint_json=local
        if type(count) is not int or count not in (1,2):
            return ArchiveComparison.UNKNOWN
        checkpoint=json.loads(checkpoint_json)
        checked=verify_checkpoint(checkpoint,witness_keys,issuer=issuer,nonce=nonce)
        if checked is None or checked[0]!=count:
            return ArchiveComparison.UNKNOWN
        if count<archived[0]:
            return ArchiveComparison.RESTORED_BEHIND
        if count>archived[0]:
            return ArchiveComparison.LOCAL_AHEAD_UNCONFIRMED
        return (ArchiveComparison.MATCHED if _digest(checkpoint_json)==archived[1]
                else ArchiveComparison.FORK)
    except (sqlite3.Error,TypeError,ValueError,KeyError,AttributeError):
        return ArchiveComparison.UNKNOWN
