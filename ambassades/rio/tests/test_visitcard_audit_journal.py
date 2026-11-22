"""RIO VisitCard v0.9 journal tests. Local prototype, not external attestation."""
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_audit_journal import (
    ZERO_HASH, WitnessHead, append_checkpoint, initialize_journal,
    inspect_journal, matches_trusted_witness
)
from visitcard_checkpoint_ledger import initialize_schema, provision_trusted_checkpoint
from visitcard_verification_gate import SnapshotCheckpoint


class AuditJournalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / "audit.sqlite")
        self.db = sqlite3.connect(self.path, isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_schema(self.db)
        self.first = SnapshotCheckpoint("issuer.example",datetime(2026,11,22,12,tzinfo=timezone.utc),"a"*64)

    def provision(self):
        provision_trusted_checkpoint(self.db,self.first)

    def test_no_implicit_entries_on_schema_creation(self):
        self.assertIsNone(inspect_journal(self.db, "issuer.example"))

    def test_bootstrap_creates_initial_journal_entry(self):
        self.provision()
        head = inspect_journal(self.db,"issuer.example")
        self.assertEqual(head.sequence,1)
        self.assertEqual(len(head.entry_hash),64)

    def test_trusted_witness_matches_only_exact_head(self):
        self.provision()
        head = inspect_journal(self.db,"issuer.example")
        self.assertTrue(matches_trusted_witness(self.db,head))
        self.assertFalse(matches_trusted_witness(self.db,replace(head,entry_hash="b"*64)))
        self.assertFalse(matches_trusted_witness(self.db,replace(head,sequence=2)))

    def test_append_outside_transaction_fails(self):
        with self.assertRaises(ValueError):
            append_checkpoint(self.db,"issuer.example",1,self.first.checked_at.isoformat(),"a"*64)

    def test_journal_rejects_update_and_delete(self):
        self.provision()
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("UPDATE rio_checkpoint_journal SET entry_hash=? WHERE issuer=?", ("f"*64,"issuer.example"))
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("DELETE FROM rio_checkpoint_journal WHERE issuer=?", ("issuer.example",))

    def test_checkpoint_edit_without_journal_detected(self):
        self.provision()
        self.db.execute("UPDATE rio_revocation_checkpoint SET digest_hex=? WHERE issuer=?", ("b"*64,"issuer.example"))
        self.assertIsNone(inspect_journal(self.db,"issuer.example"))

    def test_transaction_rollback_removes_journal_entry(self):
        self.provision()
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.db.execute("UPDATE rio_revocation_checkpoint SET checked_at=?,digest_hex=?,revision=2 WHERE issuer=?",
                            ("2026-11-22T12:01:00+00:00","b"*64,"issuer.example"))
            append_checkpoint(self.db,"issuer.example",2,"2026-11-22T12:01:00+00:00","b"*64)
            self.db.rollback()
        finally:
            if self.db.in_transaction:self.db.rollback()
        self.assertEqual(inspect_journal(self.db,"issuer.example").sequence,1)

    def test_append_requires_monotone_revision(self):
        self.provision()
        self.db.execute("BEGIN IMMEDIATE")
        try:
            with self.assertRaises(ValueError):
                append_checkpoint(self.db,"issuer.example",3,"2026-11-22T12:01:00+00:00","b"*64)
        finally:self.db.rollback()

    def test_old_database_cannot_match_new_witness(self):
        self.provision()
        original = inspect_journal(self.db,"issuer.example")
        future = WitnessHead("issuer.example",original.sequence+1,"f"*64)
        self.assertFalse(matches_trusted_witness(self.db,future))

    def test_independent_second_connection_sees_committed_head(self):
        self.provision()
        other=sqlite3.connect(self.path,isolation_level=None)
        try:
            self.assertEqual(inspect_journal(other,"issuer.example"),inspect_journal(self.db,"issuer.example"))
        finally:other.close()


if __name__ == "__main__":
    unittest.main()
