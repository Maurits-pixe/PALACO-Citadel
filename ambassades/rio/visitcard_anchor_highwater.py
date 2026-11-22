"""RIO v2.4 independent high-water receipt ledger — DRAFT / GO-13 HOLD.

This ledger MUST live on separately administered, persistently independent
storage from custody. A signed custody receipt is authenticated before being
accepted. Updates are monotone, atomic and conflict-rejecting. An older
restored custody database can be detected against the separately retained
head. If BOTH databases are rolled back together, local comparison cannot
detect that attack: external immutable anchoring remains a requirement.

All results are informational: never activate witness keys or grant access.
"""
from __future__ import annotations

from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any, Mapping

from visitcard_anchor_custody import verify_custody_receipt


class RestoreState(str, Enum):
    MATCHED = "MATCHED"
    CUSTODY_BEHIND = "CUSTODY_BEHIND"
    CUSTODY_AHEAD_UNCONFIRMED = "CUSTODY_AHEAD_UNCONFIRMED"
    FORK_CONFLICT = "FORK_CONFLICT"
    UNKNOWN = "UNKNOWN"


SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_anchor_highwater (
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 events_sha256 TEXT NOT NULL,
 receipt_json TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce)
);
CREATE TABLE IF NOT EXISTS rio_anchor_highwater_history (
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 2),
 events_sha256 TEXT NOT NULL,
 receipt_json TEXT NOT NULL,
 PRIMARY KEY(issuer,nonce,event_count)
);
CREATE TRIGGER IF NOT EXISTS rio_highwater_history_no_update
 BEFORE UPDATE ON rio_anchor_highwater_history BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_highwater_history_no_delete
 BEFORE DELETE ON rio_anchor_highwater_history BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_highwater_no_delete
 BEFORE DELETE ON rio_anchor_highwater BEGIN SELECT RAISE(ABORT,'no-delete'); END;
CREATE TRIGGER IF NOT EXISTS rio_highwater_no_regression
 BEFORE UPDATE ON rio_anchor_highwater
 WHEN OLD.issuer!=NEW.issuer OR OLD.nonce!=NEW.nonce OR
 NEW.event_count<=OLD.event_count OR
 (OLD.event_count!=1 OR NEW.event_count!=2)
 BEGIN SELECT RAISE(ABORT,'non-monotonic highwater'); END;
"""


def initialize_highwater(db: sqlite3.Connection) -> None:
    """Administrative migration on independently controlled database."""
    if db.in_transaction:
        raise ValueError("migration inside active transaction")
    db.executescript(SCHEMA)


def _valid_hash(value: Any) -> bool:
    return isinstance(value,str) and len(value)==64 and all(c in "0123456789abcdef" for c in value)



def audit_highwater(db: sqlite3.Connection, issuer: str, nonce: str,
                    pinned_custody_keys: Mapping[str,bytes]) -> bool:
    """Check every retained custody signature and contiguous high-water history."""
    try:
        rows=db.execute(
            """SELECT event_count,events_sha256,receipt_json FROM rio_anchor_highwater_history
               WHERE issuer=? AND nonce=? ORDER BY event_count""",(issuer,nonce)
        ).fetchall()
        head=db.execute(
            "SELECT event_count,events_sha256,receipt_json FROM rio_anchor_highwater WHERE issuer=? AND nonce=?",
            (issuer,nonce)
        ).fetchone()
        if not rows or head is None or len(rows)>2:
            return False
        for index,(count,digest,packed) in enumerate(rows,1):
            if count!=index or not _valid_hash(digest):
                return False
            receipt=json.loads(packed)
            if not verify_custody_receipt(
                receipt,pinned_custody_keys,expected_issuer=issuer,
                expected_nonce=nonce,expected_count=count,expected_hash=digest
            ):
                return False
        return head==rows[-1]
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
        return False


def store_confirmed_receipt(
    db: sqlite3.Connection, receipt: Any, pinned_custody_keys: Mapping[str,bytes]
) -> bool:
    """Persist only a correctly signed custody receipt, rejecting forks/rollback.

    A transition from count 1 to 2 assumes custody's independent proof check
    already occurred. This highwater layer does NOT verify event-prefix
    continuity itself; no unsigned receipt is considered sufficient.
    """
    if db.in_transaction or not isinstance(receipt,dict):
        return False
    try:
        payload=receipt["payload"]
        if not isinstance(payload,dict):
            return False
        issuer,nonce,count,digest=(payload["issuer"],payload["nonce"],
                                   payload["event_count"],payload["events_sha256"])
        if not isinstance(issuer,str) or not 0<len(issuer)<=128:
            return False
        if not isinstance(nonce,str) or not 0<len(nonce)<=128 or not _valid_hash(digest):
            return False
        if type(count) is not int or count not in (1,2):
            return False
        if not verify_custody_receipt(
            receipt,pinned_custody_keys,expected_issuer=issuer,
            expected_nonce=nonce,expected_count=count,expected_hash=digest
        ):
            return False
        packed=json.dumps(receipt,sort_keys=True,separators=(",",":"),
                          ensure_ascii=False,allow_nan=False)
        if len(packed.encode("utf-8"))>4096:
            return False
        db.execute("BEGIN IMMEDIATE")
        head=db.execute(
            "SELECT event_count,events_sha256,receipt_json FROM rio_anchor_highwater WHERE issuer=? AND nonce=?",
            (issuer,nonce)
        ).fetchone()
        if head is None:
            # Require explicit genesis receipt; cannot bootstrap at count 2.
            if count!=1:
                db.rollback()
                return False
        elif not audit_highwater(db,issuer,nonce,pinned_custody_keys):
            db.rollback()
            return False
        elif count==head[0]:
            # Idempotence demands the IDENTICAL signed custody receipt.
            identical=digest==head[1] and packed==head[2]
            db.commit()
            return identical
        elif head[0]!=1 or count!=2:
            db.rollback()
            return False
        db.execute(
            """INSERT INTO rio_anchor_highwater_history
               (issuer,nonce,event_count,events_sha256,receipt_json)
               VALUES (?,?,?,?,?)""",(issuer,nonce,count,digest,packed)
        )
        db.execute(
            """INSERT INTO rio_anchor_highwater
               (issuer,nonce,event_count,events_sha256,receipt_json) VALUES (?,?,?,?,?)
               ON CONFLICT(issuer,nonce) DO UPDATE SET
               event_count=excluded.event_count,events_sha256=excluded.events_sha256,
               receipt_json=excluded.receipt_json""",
            (issuer,nonce,count,digest,packed)
        )
        db.commit()
        return True
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return False


def compare_restored_custody(
    custody_db: sqlite3.Connection, highwater_db: sqlite3.Connection,
    issuer: str, nonce: str, pinned_custody_keys: Mapping[str,bytes]
) -> RestoreState:
    """Compare independently retained highest signed receipt with custody DB.

    Detects an older/forked custody head, but DOES NOT establish whether
    the high-water database has itself been restored or compromised.
    """
    if custody_db is highwater_db or custody_db.in_transaction or highwater_db.in_transaction:
        return RestoreState.UNKNOWN
    try:
        high=highwater_db.execute(
            "SELECT event_count,events_sha256,receipt_json FROM rio_anchor_highwater WHERE issuer=? AND nonce=?",
            (issuer,nonce)
        ).fetchone()
        current=custody_db.execute(
            "SELECT event_count,events_sha256,receipt_json FROM rio_anchor_custody WHERE issuer=? AND nonce=?",
            (issuer,nonce)
        ).fetchone()
        if high is None or not audit_highwater(highwater_db,issuer,nonce,pinned_custody_keys):
            return RestoreState.UNKNOWN
        count,digest,packed=high
        if type(count) is not int or count not in (1,2) or not _valid_hash(digest):
            return RestoreState.UNKNOWN
        signed=json.loads(packed)
        if not verify_custody_receipt(
            signed,pinned_custody_keys,expected_issuer=issuer,
            expected_nonce=nonce,expected_count=count,expected_hash=digest
        ):
            return RestoreState.UNKNOWN
        if current is None:
            return RestoreState.CUSTODY_BEHIND
        local_count,local_hash,local_packed=current
        if type(local_count) is not int or local_count not in (1,2) or not _valid_hash(local_hash):
            return RestoreState.UNKNOWN
        local_signed=json.loads(local_packed)
        if not verify_custody_receipt(
            local_signed,pinned_custody_keys,expected_issuer=issuer,
            expected_nonce=nonce,expected_count=local_count,expected_hash=local_hash
        ):
            return RestoreState.UNKNOWN
        if local_count<count:
            return RestoreState.CUSTODY_BEHIND
        if local_count>count:
            return RestoreState.CUSTODY_AHEAD_UNCONFIRMED
        if local_hash!=digest or local_packed!=packed:
            return RestoreState.FORK_CONFLICT
        return RestoreState.MATCHED
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        return RestoreState.UNKNOWN
