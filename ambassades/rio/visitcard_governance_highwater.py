"""RIO v3.5 independent governance high-water custodian — DRAFT / GO-13 HOLD.

A separately administered SQLite custodian records and signs audited governance
heads. It MUST run outside the lifecycle register's security boundary. This is
an offline protocol only: no remote endpoint, HSM, trusted clock, publication or
actual independent hosting. Checkpoint comparison is non-authorizing.
"""
from __future__ import annotations

import base64
from enum import Enum
import hashlib
import sqlite3
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from visitcard_governance_ledger import _replay, _packed, ZERO
from visitcard_witness_enrollment import _canonical

DOMAIN = b"PALACO-RIO-GOVERNANCE-HIGHWATER-V1\x00"
SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_governance_highwater (
 issuer TEXT NOT NULL, signer_id TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 1000000),
 fingerprint TEXT NOT NULL, revoked INTEGER NOT NULL CHECK(revoked IN (0,1)),
 event_sha256 TEXT NOT NULL, checkpoint_json TEXT NOT NULL,
 PRIMARY KEY(issuer,signer_id)
);
CREATE TABLE IF NOT EXISTS rio_governance_highwater_history (
 issuer TEXT NOT NULL, signer_id TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 1000000),
 fingerprint TEXT NOT NULL, revoked INTEGER NOT NULL CHECK(revoked IN (0,1)),
 event_sha256 TEXT NOT NULL, checkpoint_json TEXT NOT NULL,
 PRIMARY KEY(issuer,signer_id,sequence)
);
CREATE TRIGGER IF NOT EXISTS rio_governance_highwater_history_no_update
 BEFORE UPDATE ON rio_governance_highwater_history
 BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_governance_highwater_history_no_delete
 BEFORE DELETE ON rio_governance_highwater_history
 BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_governance_highwater_no_delete
 BEFORE DELETE ON rio_governance_highwater
 BEGIN SELECT RAISE(ABORT,'no-delete'); END;
CREATE TRIGGER IF NOT EXISTS rio_governance_highwater_monotone
 BEFORE UPDATE ON rio_governance_highwater
 WHEN NEW.issuer!=OLD.issuer OR NEW.signer_id!=OLD.signer_id
 OR NEW.sequence!=OLD.sequence+1
 BEGIN SELECT RAISE(ABORT,'nonmonotone'); END;
"""


class GovernanceRestore(str, Enum):
    MATCHED_INFORMATIONAL = "MATCHED_INFORMATIONAL"
    REVOKED_ROLLBACK_BLOCKED = "REVOKED_ROLLBACK_BLOCKED"
    LOCAL_BEHIND_BLOCKED = "LOCAL_BEHIND_BLOCKED"
    LOCAL_AHEAD_UNCONFIRMED = "LOCAL_AHEAD_UNCONFIRMED"
    FORK_BLOCKED = "FORK_BLOCKED"
    UNKNOWN_BLOCKED = "UNKNOWN_BLOCKED"


def initialize_highwater_custodian(db: sqlite3.Connection) -> None:
    if db.in_transaction:
        raise ValueError("migration inside transaction")
    db.executescript(SCHEMA)


def _hex(value: Any) -> bool:
    return isinstance(value,str) and len(value)==64 and all(c in "0123456789abcdef" for c in value)


def _signature(value: Any) -> bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature format")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=value:
        raise ValueError("noncanonical signature")
    return raw


def verify_governance_checkpoint(
    checkpoint: Any, pinned_custodians: Mapping[str,bytes], *,
    issuer: str, signer_id: str
) -> tuple[int,str,int,str] | None:
    """Verify independently pinned signature, with no embedded trust roots."""
    try:
        if not isinstance(checkpoint,dict) or set(checkpoint)!={"payload","custodian_id","signature"}:
            return None
        p=checkpoint["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","issuer","signer_id","sequence","fingerprint",
            "revoked","event_sha256"
        }:
            return None
        if type(p["version"]) is not int or p["version"]!=1:
            return None
        if not isinstance(issuer,str) or not issuer or not isinstance(signer_id,str) or not signer_id:
            return None
        if p["issuer"]!=issuer or p["signer_id"]!=signer_id:
            return None
        if type(p["sequence"]) is not int or not 1<=p["sequence"]<=1000000:
            return None
        if type(p["revoked"]) is not int or p["revoked"] not in (0,1):
            return None
        if not _hex(p["fingerprint"]) or not _hex(p["event_sha256"]):
            return None
        cid=checkpoint["custodian_id"]
        if not isinstance(cid,str) or not 0<len(cid)<=128:
            return None
        public=pinned_custodians.get(cid)
        if not isinstance(public,bytes) or len(public)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(public).verify(
            _signature(checkpoint["signature"]),
            DOMAIN+cid.encode("utf-8")+b"\x00"+_canonical(p)
        )
        return p["sequence"],p["fingerprint"],p["revoked"],p["event_sha256"]
    except (InvalidSignature,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        return None


def audit_highwater_custodian(
    db:sqlite3.Connection,issuer:str,signer_id:str,
    pinned_custodians:Mapping[str,bytes]
)->bool:
    """Audit contiguous signed checkpoints and head (not source lifecycle history)."""
    try:
        rows=db.execute(
            """SELECT sequence,fingerprint,revoked,event_sha256,checkpoint_json
               FROM rio_governance_highwater_history
               WHERE issuer=? AND signer_id=? ORDER BY sequence""",
            (issuer,signer_id)
        ).fetchall()
        head=db.execute(
            """SELECT sequence,fingerprint,revoked,event_sha256,checkpoint_json
               FROM rio_governance_highwater WHERE issuer=? AND signer_id=?""",
            (issuer,signer_id)
        ).fetchone()
        if not rows or head!=rows[-1]:
            return False
        import json
        for index,(seq,fp,revoked,event_hash,packed) in enumerate(rows,1):
            if seq!=index or not _hex(fp) or not _hex(event_hash):
                return False
            checkpoint=json.loads(packed)
            if _packed(checkpoint)!=packed:
                return False
            if verify_governance_checkpoint(
                checkpoint,pinned_custodians,issuer=issuer,signer_id=signer_id
            )!=(seq,fp,revoked,event_hash):
                return False
            if revoked and index!=len(rows):
                return False
        return True
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
        return False


def retain_governance_head(
    custody_db:sqlite3.Connection,
    lifecycle_db:sqlite3.Connection,
    issuer:str,signer_id:str,
    pinned_lifecycle_roots:Mapping[str,bytes],
    custodian_private_key:Ed25519PrivateKey,custodian_id:str,
)->dict|None:
    """Verify the full source event chain then sign/commit a separate high-water."""
    if custody_db is lifecycle_db or custody_db.in_transaction or lifecycle_db.in_transaction:
        return None
    if not isinstance(custodian_private_key,Ed25519PrivateKey):
        return None
    if not isinstance(custodian_id,str) or not 0<len(custodian_id)<=128:
        return None
    try:
        source=_replay(lifecycle_db,issuer,signer_id,pinned_lifecycle_roots)
        if source is None:
            return None
        custodian_key=custodian_private_key.public_key().public_bytes(
            Encoding.Raw,PublicFormat.Raw
        )
        custody_db.execute("BEGIN IMMEDIATE")
        head=custody_db.execute(
            """SELECT sequence,fingerprint,revoked,event_sha256,checkpoint_json
               FROM rio_governance_highwater WHERE issuer=? AND signer_id=?""",
            (issuer,signer_id)
        ).fetchone()
        if head is not None:
            if not audit_highwater_custodian(custody_db,issuer,signer_id,{custodian_id:custodian_key}):
                custody_db.rollback()
                return None
            if source[0]==head[0]:
                same=source==head[:4]
                result=__import__("json").loads(head[4]) if same else None
                custody_db.commit()
                return result
            if head[2] or source[0]!=head[0]+1:
                custody_db.rollback()
                return None
        elif source[0]!=1:
            custody_db.rollback()
            return None
        payload={
            "version":1,"issuer":issuer,"signer_id":signer_id,
            "sequence":source[0],"fingerprint":source[1],
            "revoked":source[2],"event_sha256":source[3]
        }
        sig=custodian_private_key.sign(DOMAIN+custodian_id.encode()+b"\x00"+_canonical(payload))
        checkpoint={
            "payload":payload,"custodian_id":custodian_id,
            "signature":base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")
        }
        packed=_packed(checkpoint)
        custody_db.execute(
            """INSERT INTO rio_governance_highwater_history
               VALUES (?,?,?,?,?,?,?)""",
            (issuer,signer_id,*source,packed)
        )
        custody_db.execute(
            """INSERT INTO rio_governance_highwater VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(issuer,signer_id) DO UPDATE SET
               sequence=excluded.sequence,fingerprint=excluded.fingerprint,
               revoked=excluded.revoked,event_sha256=excluded.event_sha256,
               checkpoint_json=excluded.checkpoint_json""",
            (issuer,signer_id,*source,packed)
        )
        custody_db.commit()
        return checkpoint
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if custody_db.in_transaction:
            custody_db.rollback()
        return None


def compare_restored_governance(
    restored_db:sqlite3.Connection,checkpoint:Any,
    pinned_custodians:Mapping[str,bytes],
    pinned_lifecycle_roots:Mapping[str,bytes], *,
    issuer:str,signer_id:str
)->GovernanceRestore:
    """Fail closed on a restored revoked key when a later trusted head survives."""
    if restored_db.in_transaction:
        return GovernanceRestore.UNKNOWN_BLOCKED
    trusted=verify_governance_checkpoint(
        checkpoint,pinned_custodians,issuer=issuer,signer_id=signer_id
    )
    if trusted is None:
        return GovernanceRestore.UNKNOWN_BLOCKED
    local=_replay(restored_db,issuer,signer_id,pinned_lifecycle_roots)
    if local is None:
        return GovernanceRestore.LOCAL_BEHIND_BLOCKED if trusted[0]>0 else GovernanceRestore.UNKNOWN_BLOCKED
    if local[0]<trusted[0]:
        return (GovernanceRestore.REVOKED_ROLLBACK_BLOCKED if trusted[2]
                else GovernanceRestore.LOCAL_BEHIND_BLOCKED)
    if local[0]>trusted[0]:
        return GovernanceRestore.LOCAL_AHEAD_UNCONFIRMED
    if local!=trusted:
        return GovernanceRestore.FORK_BLOCKED
    return GovernanceRestore.MATCHED_INFORMATIONAL


def execution_permitted(status:GovernanceRestore)->bool:
    return False
