"""RIO VisitCard v1.4 durable witness outbox (DRAFT / HOLD).

An operator must supply an already-signed proposal. No network calls or
automatic retries occur here. PENDING means that remote persistence is
unknown. Receipt acceptance cryptographically verifies the witness and
checks the exact issuer/sequence/head requested. No access is authorized.

SQLite protects a single operating database transactionally; an administrator,
backup restore or disk compromise can rewrite this outbox. Production needs
independent high-water evidence and protected storage.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import Any

from visitcard_witness_receipt import WitnessTrust, verify_witness_receipt

SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_witness_outbox (
 issuer TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence > 0),
 proposal_json TEXT NOT NULL,
 proposal_sha256 TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PENDING', 'ACKNOWLEDGED')),
 receipt_json TEXT,
 PRIMARY KEY(issuer, sequence),
 CHECK ((status='PENDING' AND receipt_json IS NULL) OR
        (status='ACKNOWLEDGED' AND receipt_json IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS rio_outbox_no_delete
BEFORE DELETE ON rio_witness_outbox BEGIN SELECT RAISE(ABORT,'outbox cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS rio_outbox_immutable_request
BEFORE UPDATE ON rio_witness_outbox
WHEN NEW.issuer != OLD.issuer OR NEW.sequence != OLD.sequence OR
     NEW.proposal_json != OLD.proposal_json OR
     NEW.proposal_sha256 != OLD.proposal_sha256 OR
     (OLD.status='ACKNOWLEDGED' AND
       (NEW.status != OLD.status OR NEW.receipt_json != OLD.receipt_json))
BEGIN SELECT RAISE(ABORT,'immutable witness request'); END;
"""


def initialize_outbox(db: sqlite3.Connection) -> None:
    """Explicit schema migration only; never inside an existing transaction."""
    if db.in_transaction:
        raise ValueError("cannot migrate within transaction")
    db.executescript(SCHEMA)


def _encode(proposal: Any) -> tuple[str, str, int, str]:
    if not isinstance(proposal, dict) or set(proposal) != {"payload", "signature"}:
        raise ValueError("invalid proposal")
    payload = proposal["payload"]
    if not isinstance(payload, dict) or set(payload) != {
        "version", "issuer", "sequence", "entry_hash", "predecessor_hash"
    }:
        raise ValueError("invalid proposal fields")
    if type(payload["version"]) is not int or payload["version"] != 1:
        raise ValueError("invalid version")
    issuer, sequence = payload["issuer"], payload["sequence"]
    if not isinstance(issuer, str) or not issuer or len(issuer) > 128:
        raise ValueError("invalid issuer")
    if type(sequence) is not int or sequence <= 0 or sequence > 2**63 - 1:
        raise ValueError("invalid sequence")
    for key in ("entry_hash", "predecessor_hash"):
        val = payload[key]
        if not isinstance(val, str) or len(val) != 64 or any(c not in "0123456789abcdef" for c in val):
            raise ValueError("invalid chain hash")
    raw = json.dumps(proposal, sort_keys=True, separators=(",", ":"),
                     ensure_ascii=False, allow_nan=False)
    if len(raw.encode("utf-8")) > 4096:
        raise ValueError("oversized request")
    if not isinstance(proposal["signature"], str) or len(proposal["signature"]) != 86:
        raise ValueError("invalid signature shape")
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return issuer, sequence, raw, digest


def enqueue(db: sqlite3.Connection, proposal: Any) -> bool:
    """Persist an immutable request before the caller attempts network I/O."""
    if db.in_transaction:
        return False
    try:
        issuer, sequence, raw, digest = _encode(proposal)
        db.execute("BEGIN IMMEDIATE")
        old = db.execute(
            "SELECT proposal_json,proposal_sha256 FROM rio_witness_outbox WHERE issuer=? AND sequence=?",
            (issuer, sequence)
        ).fetchone()
        if old is None:
            db.execute(
                """INSERT INTO rio_witness_outbox
                   (issuer,sequence,proposal_json,proposal_sha256,status)
                   VALUES (?,?,?,?,'PENDING')""",
                (issuer, sequence, raw, digest)
            )
        elif old != (raw, digest):
            db.rollback()
            return False
        db.commit()
        return True
    except (ValueError, TypeError, sqlite3.Error, OverflowError):
        if db.in_transaction:
            db.rollback()
        return False


def pending_request(db: sqlite3.Connection, issuer: str, sequence: int) -> dict | None:
    """Return precisely the previously persisted request, never make a new one."""
    try:
        row = db.execute(
            "SELECT proposal_json,proposal_sha256,status FROM rio_witness_outbox WHERE issuer=? AND sequence=?",
            (issuer, sequence)
        ).fetchone()
        if row is None or row[2] != "PENDING":
            return None
        raw, digest, _ = row
        if hashlib.sha256(raw.encode("utf-8")).hexdigest() != digest:
            return None
        result = json.loads(raw)
        return result if _encode(result) == (issuer, sequence, raw, digest) else None
    except (sqlite3.Error, TypeError, ValueError, AttributeError):
        return None


def acknowledge(
    db: sqlite3.Connection, issuer: str, sequence: int, receipt: Any,
    trust: WitnessTrust
) -> bool:
    """Persist only an independently verified receipt of the exact request.

    The receipt must be cryptographically verified before the transaction,
    then the request is reread and checked within BEGIN IMMEDIATE to prevent
    inconsistent local changes. No implicit retry or remote operation.
    """
    verified = verify_witness_receipt(receipt, trust, expected_issuer=issuer)
    if verified is None or verified.head.sequence != sequence or db.in_transaction:
        return False
    try:
        raw_receipt = json.dumps(receipt, sort_keys=True, separators=(",", ":"),
                                 ensure_ascii=False, allow_nan=False)
        if len(raw_receipt.encode("utf-8")) > 4096:
            return False
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT proposal_json,proposal_sha256,status,receipt_json FROM rio_witness_outbox WHERE issuer=? AND sequence=?",
            (issuer, sequence)
        ).fetchone()
        if row is None:
            db.rollback()
            return False
        raw, digest, status, saved = row
        if hashlib.sha256(raw.encode("utf-8")).hexdigest() != digest:
            db.rollback()
            return False
        request = json.loads(raw)
        if _encode(request) != (issuer, sequence, raw, digest):
            db.rollback()
            return False
        if verified.head.entry_hash != request["payload"]["entry_hash"]:
            db.rollback()
            return False
        if status == "ACKNOWLEDGED":
            db.commit()
            return saved == raw_receipt
        if status != "PENDING":
            db.rollback()
            return False
        db.execute(
            """UPDATE rio_witness_outbox SET status='ACKNOWLEDGED',receipt_json=?
               WHERE issuer=? AND sequence=? AND status='PENDING'""",
            (raw_receipt, issuer, sequence)
        )
        db.commit()
        return True
    except (sqlite3.Error, ValueError, TypeError, AttributeError, OverflowError):
        if db.in_transaction:
            db.rollback()
        return False


def outbox_status(db: sqlite3.Connection, issuer: str, sequence: int) -> str:
    """Display-only status, not evidence of authorization."""
    try:
        row = db.execute(
            "SELECT status FROM rio_witness_outbox WHERE issuer=? AND sequence=?",
            (issuer, sequence)
        ).fetchone()
        return row[0] if row is not None and row[0] in ("PENDING", "ACKNOWLEDGED") else "UNKNOWN"
    except sqlite3.Error:
        return "UNKNOWN"
