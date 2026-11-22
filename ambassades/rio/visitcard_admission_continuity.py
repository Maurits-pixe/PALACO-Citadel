"""RIO v2.3 admission event-prefix continuity verification — DRAFT / HOLD.

A source snapshot discloses the full two-event record to the independent
custody operator. Validate that the previous signed snapshot is precisely
the PENDING projection of the final two-event history, and that final event
metadata agrees with the admission row. This proves consistency *between
snapshots*, not the underlying factual validity of intake/review signatures.
Do not expose the snapshot publicly: it contains witness identifiers.
"""
from __future__ import annotations

import hashlib
import sqlite3
from typing import Any

from visitcard_witness_enrollment import _canonical
from visitcard_witness_admission import audit_admission

ROW_COLUMNS = """issuer,nonce,witness_id,public_key_hex,intake_authority,
                  envelope_sha256,status,reviewer_id,review_signature"""
EVENT_COLUMNS = """event_id,issuer,nonce,kind,envelope_sha256,reviewer_id,signature"""


def snapshot_digest(row: Any, events: Any) -> str:
    return hashlib.sha256(_canonical({
        "domain":"RIO-ADMISSION-SNAPSHOT-V1",
        "admission":row, "events":events,
    })).hexdigest()


def build_continuity_proof(db: sqlite3.Connection, issuer: str, nonce: str) -> dict | None:
    """Extract locally audited two-event source evidence, without modifying DB."""
    if db.in_transaction:
        return None
    try:
        db.execute("BEGIN")
        if not audit_admission(db,issuer,nonce):
            db.rollback()
            return None
        row=db.execute(
            f"SELECT {ROW_COLUMNS} FROM rio_witness_admission WHERE issuer=? AND nonce=?",
            (issuer,nonce),
        ).fetchone()
        events=db.execute(
            f"SELECT {EVENT_COLUMNS} FROM rio_witness_admission_events "
            "WHERE issuer=? AND nonce=? ORDER BY event_id",
            (issuer,nonce),
        ).fetchall()
        db.commit()
        if row is None or len(events)!=2:
            return None
        return {"version":1,"admission":list(row),"events":[list(e) for e in events]}
    except (sqlite3.Error,ValueError,TypeError):
        if db.in_transaction:
            db.rollback()
        return None


def verify_continuity_proof(
    proof: Any, *, issuer: str, nonce: str,
    previous_hash: str, final_hash: str
) -> bool:
    """Cryptographically compare the exact prior and final anchor digests.

    Must be invoked only after both anchor signatures are independently
    verified by their trusted-key validation paths.
    """
    if not isinstance(proof,dict) or set(proof)!={"version","admission","events"}:
        return False
    if type(proof["version"]) is not int or proof["version"]!=1:
        return False
    row,events=proof["admission"],proof["events"]
    if not isinstance(row,list) or len(row)!=9 or not isinstance(events,list) or len(events)!=2:
        return False
    if any(not isinstance(e,list) or len(e)!=7 for e in events):
        return False
    if not all(isinstance(x,str) and len(x)==64 and all(c in "0123456789abcdef" for c in x)
               for x in (previous_hash,final_hash)):
        return False
    if row[0]!=issuer or row[1]!=nonce or row[6] not in ("REVIEWED","REJECTED"):
        return False
    if not all(isinstance(x,str) and x for x in (row[2],row[3],row[4],row[5],row[7],row[8])):
        return False
    if len(row[3])!=64 or len(row[5])!=64:
        return False
    first,last=events
    if type(first[0]) is not int or type(last[0]) is not int or first[0]<=0 or last[0]<=first[0]:
        return False
    if first[1:] != [issuer,nonce,"SUBMITTED",row[5],None,None]:
        return False
    if last[1:] != [issuer,nonce,row[6],row[5],row[7],row[8]]:
        return False
    try:
        pending_row=list(row)
        pending_row[6:9]=["PENDING",None,None]
        return (snapshot_digest(pending_row,[first])==previous_hash and
                snapshot_digest(row,events)==final_hash)
    except (TypeError,ValueError,OverflowError):
        return False
