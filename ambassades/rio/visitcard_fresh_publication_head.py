"""RIO v3.0 fresh publication head witness — DEVELOPMENT DRAFT / GO-13 HOLD.

Separate-service contract, NOT a deployed service. Accept signed publication
receipts into independent monotone high-water storage; respond to verifier
supplied random challenge with a *fresh* Ed25519 signed head. Challenge and
timestamp guard replay of an old response, provided this witness database
and signing key are truly independent and not simultaneously rolled back.
No automatic recovery, activation, or permissions.
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from enum import Enum
import json
import secrets
import sqlite3
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from visitcard_archive_publication import verify_publication_receipt
from visitcard_witness_enrollment import _canonical

DOMAIN = b"PALACO-RIO-FRESH-PUBLICATION-HEAD-V1\x00"
MAX_AGE = timedelta(seconds=60)
SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_fresh_publication_head (
 issuer TEXT NOT NULL, nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count IN (1,2)),
 seal_sha256 TEXT NOT NULL,
 receipt_json TEXT NOT NULL,
 PRIMARY KEY (issuer,nonce)
);
CREATE TABLE IF NOT EXISTS rio_fresh_publication_history (
 issuer TEXT NOT NULL, nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count IN (1,2)),
 seal_sha256 TEXT NOT NULL, receipt_json TEXT NOT NULL,
 PRIMARY KEY (issuer,nonce,event_count)
);
CREATE TRIGGER IF NOT EXISTS rio_fresh_history_immutable_update
 BEFORE UPDATE ON rio_fresh_publication_history BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER IF NOT EXISTS rio_fresh_history_immutable_delete
 BEFORE DELETE ON rio_fresh_publication_history BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER IF NOT EXISTS rio_fresh_head_no_delete
 BEFORE DELETE ON rio_fresh_publication_head BEGIN SELECT RAISE(ABORT,'no-delete'); END;
CREATE TRIGGER IF NOT EXISTS rio_fresh_head_monotone
 BEFORE UPDATE ON rio_fresh_publication_head
 WHEN NEW.issuer!=OLD.issuer OR NEW.nonce!=OLD.nonce
 OR NEW.event_count!=OLD.event_count+1
 BEGIN SELECT RAISE(ABORT,'nonmonotone'); END;
"""


class FreshnessStatus(str, Enum):
    MATCHED_INFORMATIONAL = "MATCHED_INFORMATIONAL"
    LOCAL_BEHIND_BLOCKED = "LOCAL_BEHIND_BLOCKED"
    LOCAL_AHEAD_UNCONFIRMED = "LOCAL_AHEAD_UNCONFIRMED"
    FORK_BLOCKED = "FORK_BLOCKED"
    UNKNOWN_BLOCKED = "UNKNOWN_BLOCKED"


def initialize_fresh_head(db: sqlite3.Connection) -> None:
    if db.in_transaction:
        raise ValueError("migration requires autocommit")
    db.executescript(SCHEMA)


def _hex(value: Any) -> bool:
    return isinstance(value,str) and len(value)==64 and all(c in "0123456789abcdef" for c in value)


def _encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: Any, size: int) -> bytes:
    if not isinstance(value,str):
        raise ValueError("base64url required")
    raw=base64.urlsafe_b64decode(value+"="*(-len(value)%4))
    if len(raw)!=size or _encoded(raw)!=value:
        raise ValueError("noncanonical base64url")
    return raw


def challenge() -> str:
    return _encoded(secrets.token_bytes(32))


def audit_fresh_head(
    db: sqlite3.Connection, issuer: str, nonce: str,
    pinned_publishers: Mapping[str,bytes]
) -> bool:
    try:
        rows=db.execute(
            """SELECT event_count,seal_sha256,receipt_json FROM rio_fresh_publication_history
               WHERE issuer=? AND nonce=? ORDER BY event_count""",(issuer,nonce)
        ).fetchall()
        head=db.execute(
            """SELECT event_count,seal_sha256,receipt_json FROM rio_fresh_publication_head
               WHERE issuer=? AND nonce=?""",(issuer,nonce)
        ).fetchone()
        if not rows or head!=rows[-1] or len(rows)>2:
            return False
        for i,(count,digest,packed) in enumerate(rows,1):
            if count!=i or not _hex(digest):
                return False
            receipt=json.loads(packed)
            if json.dumps(receipt,sort_keys=True,separators=(",",":"),ensure_ascii=False)!=packed:
                return False
            if not verify_publication_receipt(
                receipt,pinned_publishers,issuer=issuer,nonce=nonce,
                event_count=count,seal_sha256=digest
            ):
                return False
        return True
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
        return False


def retain_published_head(
    db: sqlite3.Connection, receipt: Any,
    pinned_publishers: Mapping[str,bytes]
) -> bool:
    """Retain only pinned-key signed, strictly increasing publication receipts."""
    if db.in_transaction or not isinstance(receipt,dict):
        return False
    try:
        p=receipt["payload"]
        issuer,nonce,count,digest=p["issuer"],p["nonce"],p["event_count"],p["seal_sha256"]
        if not isinstance(issuer,str) or not 0<len(issuer)<=128:
            return False
        if not isinstance(nonce,str) or not 0<len(nonce)<=128:
            return False
        if type(count) is not int or count not in (1,2) or not _hex(digest):
            return False
        if not verify_publication_receipt(
            receipt,pinned_publishers,issuer=issuer,nonce=nonce,
            event_count=count,seal_sha256=digest
        ):
            return False
        packed=json.dumps(receipt,sort_keys=True,separators=(",",":"),ensure_ascii=False)
        if len(packed.encode("utf-8"))>4096:
            return False
        db.execute("BEGIN IMMEDIATE")
        head=db.execute(
            """SELECT event_count,seal_sha256,receipt_json FROM rio_fresh_publication_head
               WHERE issuer=? AND nonce=?""",(issuer,nonce)
        ).fetchone()
        if head is not None:
            if not audit_fresh_head(db,issuer,nonce,pinned_publishers):
                db.rollback()
                return False
            if count==head[0]:
                same=(digest,packed)==(head[1],head[2])
                db.commit()
                return same
            if head[0]!=1 or count!=2:
                db.rollback()
                return False
            if p["previous_seal_sha256"]!=head[1]:
                db.rollback()
                return False
        elif count!=1:
            db.rollback()
            return False
        db.execute(
            """INSERT INTO rio_fresh_publication_history VALUES (?,?,?,?,?)""",
            (issuer,nonce,count,digest,packed)
        )
        db.execute(
            """INSERT INTO rio_fresh_publication_head VALUES (?,?,?,?,?)
               ON CONFLICT(issuer,nonce) DO UPDATE SET
               event_count=excluded.event_count,
               seal_sha256=excluded.seal_sha256,
               receipt_json=excluded.receipt_json""",
            (issuer,nonce,count,digest,packed)
        )
        db.commit()
        return True
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return False


def attest_fresh_head(
    db: sqlite3.Connection, issuer: str, nonce: str, client_challenge: str,
    pinned_publishers: Mapping[str,bytes],
    signer: Ed25519PrivateKey, signer_id: str,
    *, now: datetime | None = None
) -> dict | None:
    """Answer a newly supplied challenge only after auditing retained history."""
    if db.in_transaction:
        return None
    try:
        _decode(client_challenge,32)
        if not isinstance(signer,Ed25519PrivateKey):
            return None
        if not isinstance(signer_id,str) or not 0<len(signer_id)<=128:
            return None
        instant=datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant,datetime) or instant.tzinfo is None or instant.utcoffset() is None:
            return None
        db.execute("BEGIN")
        if not audit_fresh_head(db,issuer,nonce,pinned_publishers):
            db.rollback()
            return None
        head=db.execute(
            """SELECT event_count,seal_sha256 FROM rio_fresh_publication_head
               WHERE issuer=? AND nonce=?""",(issuer,nonce)
        ).fetchone()
        if head is None:
            db.rollback()
            return None
        payload={
            "version":1,"issuer":issuer,"nonce":nonce,
            "event_count":head[0],"seal_sha256":head[1],
            "challenge":client_challenge,
            "observed_at":instant.astimezone(timezone.utc).isoformat()
        }
        signature=signer.sign(DOMAIN+signer_id.encode("utf-8")+b"\x00"+_canonical(payload))
        db.commit()
        return {"payload":payload,"signer_id":signer_id,"signature":_encoded(signature)}
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return None


def verify_fresh_head(
    response: Any, pinned_signers: Mapping[str,bytes], *,
    issuer: str, nonce: str, expected_challenge: str,
    now: datetime | None = None
) -> tuple[int,str] | None:
    """Verify independent fresh, challenge-bound proof; no trust-on-first-use."""
    try:
        _decode(expected_challenge,32)
        if not isinstance(response,dict) or set(response)!={"payload","signer_id","signature"}:
            return None
        p=response["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","issuer","nonce","event_count","seal_sha256",
            "challenge","observed_at"
        }:
            return None
        if (type(p["version"]) is not int or p["version"]!=1 or
            p["issuer"]!=issuer or p["nonce"]!=nonce or
            p["challenge"]!=expected_challenge or
            type(p["event_count"]) is not int or p["event_count"] not in (1,2) or
            not _hex(p["seal_sha256"])):
            return None
        signer_id=response["signer_id"]
        if not isinstance(signer_id,str) or not 0<len(signer_id)<=128:
            return None
        pub=pinned_signers.get(signer_id)
        if not isinstance(pub,bytes) or len(pub)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(pub).verify(
            _decode(response["signature"],64),
            DOMAIN+signer_id.encode("utf-8")+b"\x00"+_canonical(p)
        )
        timestamp=datetime.fromisoformat(p["observed_at"].replace("Z","+00:00"))
        instant=datetime.now(timezone.utc) if now is None else now
        if (timestamp.tzinfo is None or timestamp.utcoffset() is None or
            not isinstance(instant,datetime) or instant.tzinfo is None or instant.utcoffset() is None):
            return None
        age=instant.astimezone(timezone.utc)-timestamp.astimezone(timezone.utc)
        if age<timedelta(0) or age>MAX_AGE:
            return None
        return p["event_count"],p["seal_sha256"]
    except (ValueError,TypeError,KeyError,AttributeError,InvalidSignature,OverflowError):
        return None


def classify_fresh_recovery(
    head: tuple[int,str] | None, local_count: int, local_seal_hash: str
) -> FreshnessStatus:
    """No authorization can be derived from a matching fresh signed head."""
    if (head is None or type(local_count) is not int or local_count not in (1,2) or
        not _hex(local_seal_hash)):
        return FreshnessStatus.UNKNOWN_BLOCKED
    if local_count<head[0]:
        return FreshnessStatus.LOCAL_BEHIND_BLOCKED
    if local_count>head[0]:
        return FreshnessStatus.LOCAL_AHEAD_UNCONFIRMED
    if local_seal_hash!=head[1]:
        return FreshnessStatus.FORK_BLOCKED
    return FreshnessStatus.MATCHED_INFORMATIONAL


def execution_permitted(status: FreshnessStatus) -> bool:
    return False
