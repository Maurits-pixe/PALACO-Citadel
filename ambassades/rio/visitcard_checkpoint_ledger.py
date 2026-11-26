"""RIO VisitCard v0.8 SQLite checkpoint ledger — DRAFT / HOLD.

Local, single-database transactional compare-and-advance for revocation snapshots.
The database must be initialized by an independently trusted administrator.
SQLite transactions protect concurrent writers; they DO NOT protect against
disk/database backup rollback, hostile local administrators, or stolen keys.
This module returns display statuses only and grants NO authority.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import sqlite3
from pathlib import Path
from typing import Iterator, Any

from visitcard_audit_journal import initialize_journal, append_checkpoint, inspect_journal
from visitcard_trust_policy import DisplayStatus
from visitcard_verification_gate import (
    GateConfiguration, SnapshotCheckpoint, evaluate_visitcard, snapshot_checkpoint
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_revocation_checkpoint (
  issuer TEXT PRIMARY KEY NOT NULL,
  checked_at TEXT NOT NULL,
  digest_hex TEXT NOT NULL CHECK(length(digest_hex) = 64),
  revision INTEGER NOT NULL CHECK(revision >= 1)
);
"""


def initialize_schema(connection: sqlite3.Connection) -> None:
    """Create tables only: never fabricate or implicitly trust a checkpoint."""
    connection.execute(SCHEMA)
    initialize_journal(connection)


def _utc(dt: datetime) -> datetime:
    if not isinstance(dt, datetime) or dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError("UTC-aware timestamp required")
    return dt.astimezone(timezone.utc)


def _checkpoint_row(row: tuple[Any, ...], issuer: str) -> SnapshotCheckpoint:
    stamp, digest, revision = row
    if type(revision) is not int or revision < 1:
        raise ValueError("invalid revision")
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError("invalid checkpoint digest")
    return SnapshotCheckpoint(issuer=issuer, checked_at=_utc(datetime.fromisoformat(stamp)), digest_hex=digest)


def _read_checkpoint(connection: sqlite3.Connection, issuer: str) -> tuple[SnapshotCheckpoint, int] | None:
    row = connection.execute(
        "SELECT checked_at, digest_hex, revision FROM rio_revocation_checkpoint WHERE issuer = ?",
        (issuer,)
    ).fetchone()
    if row is None:
        return None
    return _checkpoint_row(row, issuer), row[2]


def provision_trusted_checkpoint(connection: sqlite3.Connection, checkpoint: SnapshotCheckpoint) -> None:
    """One-time administrative bootstrap, never callable from untrusted QR input.

    Production requires out-of-band authentication of the checkpoint source.
    A pre-existing record is never overwritten here.
    """
    if connection.in_transaction:
        raise ValueError("bootstrap requires its own transaction")
    if not isinstance(checkpoint, SnapshotCheckpoint) or not isinstance(checkpoint.issuer, str) or not checkpoint.issuer:
        raise ValueError("invalid checkpoint")
    stamp = _utc(checkpoint.checked_at).isoformat()
    digest = checkpoint.digest_hex
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError("invalid digest")
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute(
            "INSERT INTO rio_revocation_checkpoint (issuer, checked_at, digest_hex, revision) VALUES (?, ?, ?, 1)",
            (checkpoint.issuer, stamp, digest)
        )
        append_checkpoint(connection, checkpoint.issuer, 1, stamp, digest)
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def evaluate_and_advance(
    connection: sqlite3.Connection,
    credential: Any,
    revocation_snapshot: Any,
    configuration: GateConfiguration,
    *,
    expected_issuer: str,
    expected_subject: str,
    expected_audience: str,
    now: datetime | None = None,
) -> DisplayStatus:
    """Verify within an exclusive writer transaction; commit checkpoint first.

    No auto-bootstrap. If validation or persistence fails, return UNKNOWN.
    Concurrent writers serialize through BEGIN IMMEDIATE. The checkpoint
    advances for both VERIFIED and REVOKED display statuses.
    """
    if connection.in_transaction:
        return DisplayStatus.UNKNOWN
    try:
        if not isinstance(expected_issuer, str) or not expected_issuer:
            return DisplayStatus.UNKNOWN
        connection.execute("BEGIN IMMEDIATE")
        previous = _read_checkpoint(connection, expected_issuer)
        if previous is None:
            connection.rollback()
            return DisplayStatus.UNKNOWN
        baseline, revision = previous
        journal_head = inspect_journal(connection, expected_issuer)
        if journal_head is None or journal_head.sequence != revision:
            connection.rollback()
            return DisplayStatus.UNKNOWN
        outcome = evaluate_visitcard(
            credential, revocation_snapshot, configuration, baseline,
            expected_issuer=expected_issuer,
            expected_subject=expected_subject,
            expected_audience=expected_audience,
            now=now
        )
        if outcome not in (DisplayStatus.VERIFIED, DisplayStatus.REVOKED):
            connection.rollback()
            return DisplayStatus.UNKNOWN
        candidate = snapshot_checkpoint(revocation_snapshot)
        if _utc(candidate.checked_at) > _utc(baseline.checked_at):
            cursor = connection.execute(
                """UPDATE rio_revocation_checkpoint
                   SET checked_at=?, digest_hex=?, revision=?
                   WHERE issuer=? AND revision=? AND checked_at=? AND digest_hex=?""",
                (candidate.checked_at.astimezone(timezone.utc).isoformat(),
                 candidate.digest_hex, revision + 1, expected_issuer, revision,
                 baseline.checked_at.astimezone(timezone.utc).isoformat(), baseline.digest_hex)
            )
            if cursor.rowcount != 1:
                connection.rollback()
                return DisplayStatus.UNKNOWN
            append_checkpoint(
                connection, expected_issuer, revision + 1,
                candidate.checked_at.astimezone(timezone.utc).isoformat(),
                candidate.digest_hex,
            )
        connection.commit()
        return outcome
    except (sqlite3.Error, ValueError, TypeError, AttributeError, KeyError, OverflowError):
        if connection.in_transaction:
            connection.rollback()
        return DisplayStatus.UNKNOWN
