"""RIO VisitCard v1.6 durable single-flight recovery gate — DRAFT / HOLD.

A persisted per-(issuer, sequence) claim prevents concurrent recoveries.
Crash leaves the claim in place (fail closed); there is deliberately NO
automatic expiry or automatic lock stealing. A separate, audited operator
procedure is required to reconcile the remote witness before resetting it.

This module does not authorize operators; operator approval in v1.5 is
a development interlock only. SQLite is not tamper resistant.
"""
from __future__ import annotations

import secrets
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_recovery_claims (
 issuer TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence > 0),
 token_hash TEXT NOT NULL CHECK(length(token_hash) = 64),
 PRIMARY KEY(issuer, sequence)
);
"""


def initialize_recovery_claims(db: sqlite3.Connection) -> None:
    if db.in_transaction:
        raise ValueError("migration in transaction")
    db.executescript(SCHEMA)


def claim_recovery(db: sqlite3.Connection, issuer: str, sequence: int) -> str | None:
    """Exclusively claim a specific recovery; never replace existing claims."""
    if db.in_transaction or not isinstance(issuer, str) or not issuer or len(issuer)>128:
        return None
    if type(sequence) is not int or not 0 < sequence <= 2**63-1:
        return None
    token = secrets.token_hex(32)
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT status FROM rio_witness_outbox WHERE issuer=? AND sequence=?",
            (issuer,sequence),
        ).fetchone()
        if row is None or row[0] != "PENDING":
            db.rollback()
            return None
        db.execute(
            "INSERT INTO rio_recovery_claims (issuer,sequence,token_hash) VALUES (?,?,?)",
            (issuer, sequence, token),
        )
        db.commit()
        return token
    except sqlite3.Error:
        if db.in_transaction:
            db.rollback()
        return None


def release_recovery(db: sqlite3.Connection, issuer: str, sequence: int, token: str) -> bool:
    """Only the specific claim owner may release it after a handled attempt."""
    if db.in_transaction or not isinstance(token, str) or len(token) != 64:
        return False
    try:
        db.execute("BEGIN IMMEDIATE")
        cursor = db.execute(
            "DELETE FROM rio_recovery_claims WHERE issuer=? AND sequence=? AND token_hash=?",
            (issuer,sequence,token),
        )
        db.commit()
        return cursor.rowcount == 1
    except sqlite3.Error:
        if db.in_transaction:
            db.rollback()
        return False


def recovery_claim_exists(db: sqlite3.Connection, issuer: str, sequence: int) -> bool:
    """Information-only inspection for a manual recovery runbook."""
    try:
        return db.execute(
            "SELECT 1 FROM rio_recovery_claims WHERE issuer=? AND sequence=?",
            (issuer,sequence),
        ).fetchone() is not None
    except sqlite3.Error:
        return True  # Cannot prove clear: fail closed.
