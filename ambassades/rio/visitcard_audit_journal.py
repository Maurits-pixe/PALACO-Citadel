"""RIO VisitCard v0.9 append-only checkpoint journal — prototype / HOLD.

Hash chaining reveals local edits but is NOT tamper proof: a database owner can
rewrite the chain. An independent trusted witness head is mandatory to detect
whole-database rollback or forged replacement; witness delivery is NOT implemented.
No authority, identity login, issuance, or message permissions.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import sqlite3

ZERO_HASH = "0" * 64

SCHEMA = """
CREATE TABLE IF NOT EXISTS rio_checkpoint_journal (
  issuer TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  revision INTEGER NOT NULL CHECK(revision = sequence),
  checked_at TEXT NOT NULL,
  snapshot_digest TEXT NOT NULL CHECK(length(snapshot_digest)=64),
  predecessor_hash TEXT NOT NULL CHECK(length(predecessor_hash)=64),
  entry_hash TEXT NOT NULL CHECK(length(entry_hash)=64),
  PRIMARY KEY(issuer,sequence)
);
CREATE TRIGGER IF NOT EXISTS rio_journal_no_update
BEFORE UPDATE ON rio_checkpoint_journal BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_journal_no_delete
BEFORE DELETE ON rio_checkpoint_journal BEGIN SELECT RAISE(ABORT,'append-only'); END;
"""


@dataclass(frozen=True)
class WitnessHead:
    """Out-of-band trusted witness data, never constructed from a scanned card."""
    issuer: str
    sequence: int
    entry_hash: str


def _hex(value: str) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _hash(issuer: str, seq: int, revision: int, checked: str, digest: str, previous: str) -> str:
    value = ["PALACO-RIO-JOURNAL-V1", issuer, seq, revision, checked, digest, previous]
    canonical = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def initialize_journal(connection: sqlite3.Connection) -> None:
    # executescript may commit an open transaction: schema migration only!
    if connection.in_transaction:
        raise ValueError("cannot migrate journal inside a transaction")
    connection.executescript(SCHEMA)


def append_checkpoint(
    connection: sqlite3.Connection, issuer: str, revision: int, checked_at: str, digest: str
) -> WitnessHead:
    """Append within caller's BEGIN IMMEDIATE transaction; never commit here."""
    if not connection.in_transaction:
        raise ValueError("journal append requires an existing transaction")
    if not isinstance(issuer, str) or not issuer or type(revision) is not int or revision <= 0:
        raise ValueError("invalid journal identity")
    if not isinstance(checked_at, str) or not _hex(digest):
        raise ValueError("invalid journal checkpoint")
    last = connection.execute(
        "SELECT sequence,entry_hash FROM rio_checkpoint_journal WHERE issuer=? ORDER BY sequence DESC LIMIT 1",
        (issuer,),
    ).fetchone()
    seq = 1 if last is None else last[0] + 1
    if revision != seq:
        raise ValueError("non-monotone revision")
    prev = ZERO_HASH if last is None else last[1]
    if not _hex(prev):
        raise ValueError("corrupt predecessor")
    head = _hash(issuer, seq, revision, checked_at, digest, prev)
    connection.execute(
        """INSERT INTO rio_checkpoint_journal
           (issuer,sequence,revision,checked_at,snapshot_digest,predecessor_hash,entry_hash)
           VALUES (?,?,?,?,?,?,?)""",
        (issuer,seq,revision,checked_at,digest,prev,head),
    )
    return WitnessHead(issuer,seq,head)


def inspect_journal(connection: sqlite3.Connection, issuer: str) -> WitnessHead | None:
    """Validate entire chain and correspondence with the current checkpoint."""
    entries = connection.execute(
        """SELECT sequence,revision,checked_at,snapshot_digest,predecessor_hash,entry_hash
           FROM rio_checkpoint_journal WHERE issuer=? ORDER BY sequence""",
        (issuer,),
    ).fetchall()
    if not entries:
        return None
    prev = ZERO_HASH
    for expected, (seq, revision, checked, digest, predecessor, head) in enumerate(entries, 1):
        if type(seq) is not int or type(revision) is not int or seq != expected or revision != expected:
            return None
        if not _hex(digest) or not _hex(head) or predecessor != prev:
            return None
        if _hash(issuer,seq,revision,checked,digest,predecessor) != head:
            return None
        prev = head
    checkpoint = connection.execute(
        "SELECT revision,checked_at,digest_hex FROM rio_revocation_checkpoint WHERE issuer=?", (issuer,)
    ).fetchone()
    if checkpoint != (entries[-1][1], entries[-1][2], entries[-1][3]):
        return None
    return WitnessHead(issuer, entries[-1][0], prev)


def matches_trusted_witness(connection: sqlite3.Connection, witness: WitnessHead) -> bool:
    """Compare against externally authenticated witness, not a database-local one."""
    if not isinstance(witness, WitnessHead) or not _hex(witness.entry_hash):
        return False
    local = inspect_journal(connection, witness.issuer)
    return local is not None and local == witness
