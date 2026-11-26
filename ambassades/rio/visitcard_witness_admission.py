"""RIO v2.0 evidence-only witness admission register — DRAFT / GO-13 HOLD.

SQLite-backed duplicate-nonce exclusion, independent signed reviewer decisions,
and append-only local audit. This module NEVER activates a witness key, changes
trusted verifier keys, authorizes identity or provisions a genesis checkpoint.
A privileged DB administrator can still rewrite local storage; independent
audit anchoring and authenticated administration remain release blockers.
"""
from __future__ import annotations

import base64
from datetime import datetime
import hashlib
import json
import sqlite3
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from visitcard_witness_enrollment import (
    EnrollmentEvidence, verify_enrollment_evidence, _canonical
)

REVIEW_DOMAIN = b"PALACO-RIO-WITNESS-REVIEW-V1\x00"

SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_witness_admission (
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 witness_id TEXT NOT NULL,
 public_key_hex TEXT NOT NULL,
 intake_authority TEXT NOT NULL,
 envelope_sha256 TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PENDING','REVIEWED','REJECTED')),
 reviewer_id TEXT,
 review_signature TEXT,
 PRIMARY KEY(issuer,nonce),
 CHECK ((status='PENDING' AND reviewer_id IS NULL AND review_signature IS NULL)
 OR (status!='PENDING' AND reviewer_id IS NOT NULL AND review_signature IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS rio_witness_unique_pending_key
 ON rio_witness_admission(issuer,witness_id)
 WHERE status IN ('PENDING','REVIEWED');
CREATE TABLE IF NOT EXISTS rio_witness_admission_events (
 event_id INTEGER PRIMARY KEY AUTOINCREMENT,
 issuer TEXT NOT NULL,
 nonce TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('SUBMITTED','REVIEWED','REJECTED')),
 envelope_sha256 TEXT NOT NULL,
 reviewer_id TEXT,
 signature TEXT
);
CREATE TRIGGER IF NOT EXISTS rio_admission_event_no_update
 BEFORE UPDATE ON rio_witness_admission_events BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_admission_event_no_delete
 BEFORE DELETE ON rio_witness_admission_events BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_admission_no_delete
 BEFORE DELETE ON rio_witness_admission BEGIN SELECT RAISE(ABORT,'no-delete'); END;
CREATE TRIGGER IF NOT EXISTS rio_admission_immutable
 BEFORE UPDATE ON rio_witness_admission
 WHEN OLD.issuer!=NEW.issuer OR OLD.nonce!=NEW.nonce OR
 OLD.witness_id!=NEW.witness_id OR OLD.public_key_hex!=NEW.public_key_hex OR
 OLD.intake_authority!=NEW.intake_authority OR OLD.envelope_sha256!=NEW.envelope_sha256 OR
 OLD.status!='PENDING' OR NEW.status='PENDING'
 BEGIN SELECT RAISE(ABORT,'immutable-intake'); END;
"""


def initialize_admission(db: sqlite3.Connection) -> None:
    if db.in_transaction:
        raise ValueError("migration requires no transaction")
    db.executescript(SCHEMA)


def _base64_signature(value: Any) -> bytes:
    if not isinstance(value, str) or len(value)!=86:
        raise ValueError("bad signature length")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=value:
        raise ValueError("noncanonical signature")
    return raw


def submit_admission(
    db: sqlite3.Connection, envelope: Any, authorities: Mapping[str, bytes],
    *, issuer: str, now: datetime | None = None,
) -> bool:
    """Consume validated nonce once, atomically; NEVER activate public key."""
    if db.in_transaction:
        return False
    evidence=verify_enrollment_evidence(envelope,authorities,expected_issuer=issuer,now=now)
    if evidence is None:
        return False
    try:
        nonce=envelope["payload"]["nonce"]
        encoded=_canonical(envelope)
        if len(encoded)>8192:
            return False
        digest=hashlib.sha256(encoded).hexdigest()
        db.execute("BEGIN IMMEDIATE")
        db.execute(
            """INSERT INTO rio_witness_admission
               (issuer,nonce,witness_id,public_key_hex,intake_authority,envelope_sha256,status)
               VALUES (?,?,?,?,?,?,'PENDING')""",
            (evidence.issuer,nonce,evidence.witness_id,evidence.candidate_public_key.hex(),
             evidence.authority_id,digest),
        )
        db.execute(
            """INSERT INTO rio_witness_admission_events
               (issuer,nonce,kind,envelope_sha256) VALUES (?,?,'SUBMITTED',?)""",
            (evidence.issuer,nonce,digest),
        )
        db.commit()
        return True
    except (sqlite3.Error,ValueError,TypeError,AttributeError):
        if db.in_transaction:
            db.rollback()
        return False


def review_admission(
    db: sqlite3.Connection, review: Any, reviewers: Mapping[str,bytes],
) -> bool:
    """Independent signed review; REVIEWED is evidence only, NOT key approval."""
    if db.in_transaction:
        return False
    try:
        if not isinstance(review,dict) or set(review)!={"payload","signature"}:
            return False
        payload=review["payload"]
        if not isinstance(payload,dict) or set(payload)!={
            "version","issuer","nonce","envelope_sha256","reviewer_id","decision"
        }:
            return False
        if type(payload["version"]) is not int or payload["version"]!=1:
            return False
        issuer,nonce,digest,reviewer,decision=(
            payload["issuer"],payload["nonce"],payload["envelope_sha256"],
            payload["reviewer_id"],payload["decision"]
        )
        if not all(isinstance(x,str) and 0<len(x)<=128 for x in (issuer,nonce,reviewer)):
            return False
        if not isinstance(digest,str) or len(digest)!=64 or any(x not in "0123456789abcdef" for x in digest):
            return False
        if decision not in ("REVIEWED","REJECTED"):
            return False
        key=reviewers.get(reviewer)
        if not isinstance(key,bytes) or len(key)!=32:
            return False
        Ed25519PublicKey.from_public_bytes(key).verify(
            _base64_signature(review["signature"]), REVIEW_DOMAIN+_canonical(payload)
        )
        db.execute("BEGIN IMMEDIATE")
        row=db.execute(
            """SELECT status,intake_authority,envelope_sha256 FROM rio_witness_admission
               WHERE issuer=? AND nonce=?""",(issuer,nonce)
        ).fetchone()
        if row is None or row[0]!="PENDING" or row[1]==reviewer or row[2]!=digest:
            db.rollback()
            return False
        db.execute(
            """UPDATE rio_witness_admission SET status=?,reviewer_id=?,review_signature=?
               WHERE issuer=? AND nonce=? AND status='PENDING'""",
            (decision,reviewer,review["signature"],issuer,nonce),
        )
        db.execute(
            """INSERT INTO rio_witness_admission_events
               (issuer,nonce,kind,envelope_sha256,reviewer_id,signature)
               VALUES (?,?,?,?,?,?)""",
            (issuer,nonce,decision,digest,reviewer,review["signature"]),
        )
        db.commit()
        return True
    except (sqlite3.Error,ValueError,TypeError,AttributeError,KeyError,InvalidSignature):
        if db.in_transaction:
            db.rollback()
        return False


def audit_admission(db: sqlite3.Connection, issuer: str, nonce: str) -> bool:
    """Local consistency audit; not a proof against full database rollback."""
    try:
        row=db.execute(
            """SELECT envelope_sha256,status,reviewer_id,review_signature
               FROM rio_witness_admission WHERE issuer=? AND nonce=?""",(issuer,nonce)
        ).fetchone()
        events=db.execute(
            """SELECT kind,envelope_sha256,reviewer_id,signature
               FROM rio_witness_admission_events WHERE issuer=? AND nonce=?
               ORDER BY event_id""",(issuer,nonce)
        ).fetchall()
        if row is None or not events or events[0] != ("SUBMITTED",row[0],None,None):
            return False
        if row[1]=="PENDING":
            return len(events)==1 and row[2] is None and row[3] is None
        return len(events)==2 and events[1]==(row[1],row[0],row[2],row[3])
    except (sqlite3.Error,TypeError,AttributeError):
        return False
