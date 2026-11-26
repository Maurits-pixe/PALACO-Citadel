"""RIO v2.8 independently provisioned archive publication receipt — DRAFT / HOLD.

A separate publication custodian may attest to retained archive seals. This
module stores signed seals in its own SQLite DB and issues a distinct Ed25519
receipt AFTER commit. No network, external host, TLS, HSM or operator identity
is provisioned here. Published means local custodian acceptance ONLY.
"""
from __future__ import annotations

import base64
import hashlib
import json
import sqlite3
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from visitcard_checkpoint_archive import verify_seal, _packed, _digest, ZERO
from visitcard_witness_enrollment import _canonical

DOMAIN = b"PALACO-RIO-ARCHIVE-PUBLICATION-RECEIPT-V1\x00"
SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_archive_publication_head (
 issuer TEXT NOT NULL, nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 seal_sha256 TEXT NOT NULL, receipt_json TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce)
);
CREATE TABLE IF NOT EXISTS rio_archive_publication_history (
 issuer TEXT NOT NULL, nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 seal_sha256 TEXT NOT NULL, seal_json TEXT NOT NULL, receipt_json TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce,event_count)
);
CREATE TRIGGER IF NOT EXISTS rio_publication_history_no_update
 BEFORE UPDATE ON rio_archive_publication_history BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_publication_history_no_delete
 BEFORE DELETE ON rio_archive_publication_history BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_publication_head_no_delete
 BEFORE DELETE ON rio_archive_publication_head BEGIN SELECT RAISE(ABORT,'no-delete'); END;
CREATE TRIGGER IF NOT EXISTS rio_publication_head_monotone
 BEFORE UPDATE ON rio_archive_publication_head
 WHEN NEW.issuer!=OLD.issuer OR NEW.nonce!=OLD.nonce OR NEW.event_count!=OLD.event_count+1
 BEGIN SELECT RAISE(ABORT,'nonmonotone'); END;
"""


def initialize_publication(db: sqlite3.Connection) -> None:
    if db.in_transaction:
        raise ValueError("migration inside transaction")
    db.executescript(SCHEMA)


def _hex(value: Any) -> bool:
    return isinstance(value,str) and len(value)==64 and all(c in "0123456789abcdef" for c in value)


def _signature(value: Any) -> bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("invalid signature")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=value:
        raise ValueError("noncanonical signature")
    return raw


def verify_publication_receipt(
    receipt: Any, publisher_keys: Mapping[str,bytes], *,
    issuer: str, nonce: str, event_count: int, seal_sha256: str
) -> bool:
    """Validate exact seal binding and independent pre-pinned publisher key."""
    try:
        if not isinstance(receipt,dict) or set(receipt)!={"payload","publisher_id","signature"}:
            return False
        p=receipt["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","issuer","nonce","event_count","seal_sha256","previous_seal_sha256"
        }:
            return False
        if (type(p["version"]) is not int or p["version"]!=1 or
            p["issuer"]!=issuer or p["nonce"]!=nonce or
            type(p["event_count"]) is not int or p["event_count"]!=event_count or
            p["event_count"] not in (1,2) or p["seal_sha256"]!=seal_sha256 or
            not _hex(seal_sha256) or not _hex(p["previous_seal_sha256"])):
            return False
        publisher=receipt["publisher_id"]
        if not isinstance(publisher,str) or not 0<len(publisher)<=128:
            return False
        pub=publisher_keys.get(publisher)
        if not isinstance(pub,bytes) or len(pub)!=32:
            return False
        Ed25519PublicKey.from_public_bytes(pub).verify(
            _signature(receipt["signature"]),
            DOMAIN + publisher.encode("utf-8") + b"\x00" + _canonical(p)
        )
        return True
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return False


def audit_publication(
    db: sqlite3.Connection, issuer: str, nonce: str,
    archive_keys: Mapping[str,bytes], publisher_keys: Mapping[str,bytes]
) -> bool:
    """Ensure all retained seals and receipts form one signed contiguous chain."""
    try:
        rows=db.execute(
            """SELECT event_count,seal_sha256,seal_json,receipt_json
               FROM rio_archive_publication_history WHERE issuer=? AND nonce=?
               ORDER BY event_count""",(issuer,nonce)
        ).fetchall()
        head=db.execute(
            """SELECT event_count,seal_sha256,receipt_json
               FROM rio_archive_publication_head WHERE issuer=? AND nonce=?""",
            (issuer,nonce)
        ).fetchone()
        if not rows or len(rows)>2 or head is None:
            return False
        prior=ZERO
        for expected,(count,digest,seal_json,receipt_json) in enumerate(rows,1):
            if count!=expected or not _hex(digest) or _digest(seal_json)!=digest:
                return False
            seal=json.loads(seal_json)
            receipt=json.loads(receipt_json)
            if _packed(seal)!=seal_json or _packed(receipt)!=receipt_json:
                return False
            checked=verify_seal(seal,archive_keys,issuer=issuer,nonce=nonce)
            if checked is None or checked[0]!=count or checked[2]!=prior:
                return False
            if not verify_publication_receipt(
                receipt,publisher_keys,issuer=issuer,nonce=nonce,
                event_count=count,seal_sha256=digest
            ):
                return False
            if receipt["payload"]["previous_seal_sha256"]!=prior:
                return False
            prior=digest
        return head==(rows[-1][0],rows[-1][1],rows[-1][3])
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
        return False


def publish_archive_seal(
    db: sqlite3.Connection, seal: Any, archive_keys: Mapping[str,bytes],
    publisher_key: Ed25519PrivateKey, publisher_id: str
) -> dict | None:
    """Commit a checked seal exactly once and then return the saved receipt."""
    if db.in_transaction or not isinstance(publisher_key,Ed25519PrivateKey):
        return None
    if not isinstance(publisher_id,str) or not 0<len(publisher_id)<=128:
        return None
    try:
        if not isinstance(seal,dict) or not isinstance(seal.get("payload"),dict):
            return None
        issuer,nonce=seal["payload"]["issuer"],seal["payload"]["nonce"]
        if not isinstance(issuer,str) or not 0<len(issuer)<=128:
            return None
        if not isinstance(nonce,str) or not 0<len(nonce)<=128:
            return None
        signed=verify_seal(seal,archive_keys,issuer=issuer,nonce=nonce)
        if signed is None:
            return None
        count,_,prior=signed
        seal_json=_packed(seal)
        if len(seal_json.encode("utf-8"))>4096:
            return None
        digest=_digest(seal_json)
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
        own_key=publisher_key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        db.execute("BEGIN IMMEDIATE")
        head=db.execute(
            """SELECT event_count,seal_sha256,receipt_json FROM rio_archive_publication_head
               WHERE issuer=? AND nonce=?""",(issuer,nonce)
        ).fetchone()
        if head is not None:
            if not audit_publication(db,issuer,nonce,archive_keys,{publisher_id:own_key}):
                db.rollback()
                return None
            if count==head[0]:
                if digest!=head[1]:
                    db.rollback()
                    return None
                receipt=json.loads(head[2])
                db.commit()
                return receipt
            if count!=head[0]+1 or prior!=head[1]:
                db.rollback()
                return None
        elif count!=1 or prior!=ZERO:
            db.rollback()
            return None
        payload={
            "version":1,"issuer":issuer,"nonce":nonce,"event_count":count,
            "seal_sha256":digest,"previous_seal_sha256":prior
        }
        signature=publisher_key.sign(DOMAIN+publisher_id.encode("utf-8")+b"\x00"+_canonical(payload))
        receipt={
            "payload":payload,"publisher_id":publisher_id,
            "signature":base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")
        }
        receipt_json=_packed(receipt)
        db.execute(
            """INSERT INTO rio_archive_publication_history
               (issuer,nonce,event_count,seal_sha256,seal_json,receipt_json)
               VALUES (?,?,?,?,?,?)""",(issuer,nonce,count,digest,seal_json,receipt_json)
        )
        db.execute(
            """INSERT INTO rio_archive_publication_head
               (issuer,nonce,event_count,seal_sha256,receipt_json)
               VALUES (?,?,?,?,?)
               ON CONFLICT(issuer,nonce) DO UPDATE SET
               event_count=excluded.event_count,seal_sha256=excluded.seal_sha256,
               receipt_json=excluded.receipt_json""",
            (issuer,nonce,count,digest,receipt_json)
        )
        db.commit()
        return receipt
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return None
