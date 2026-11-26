"""RIO v2.7 signed checkpoint archive tests — offline, independent SQLite handles."""
from pathlib import Path
import sqlite3
import sys
import unittest
from datetime import datetime,timezone

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_anchor_custody import _receipt
from visitcard_admission_anchor import VerifiedAnchor
from visitcard_checkpoint_witness import (
    initialize_checkpoint_witness, attest_checkpoint
)
from visitcard_checkpoint_archive import (
    initialize_archive,archive_checkpoint,audit_archive,verify_seal,
    compare_restored_witness,ArchiveComparison
)

NOW=datetime(2026,11,22,12,tzinfo=timezone.utc)
ISSUER="issuer.example"
NONCE="nonce-test"


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.witness=sqlite3.connect(":memory:",isolation_level=None)
        self.archive=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.witness.close)
        self.addCleanup(self.archive.close)
        initialize_checkpoint_witness(self.witness)
        initialize_archive(self.archive)
        self.custody_key=Ed25519PrivateKey.generate()
        self.witness_key=Ed25519PrivateKey.generate()
        self.archive_key=Ed25519PrivateKey.generate()
        public=lambda key:key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.custody_keys={"custody-a":public(self.custody_key)}
        self.witness_keys={"witness-a":public(self.witness_key)}
        self.archive_keys={"archive-a":public(self.archive_key)}
        self.first=self.checkpoint(1,"a"*64)

    def checkpoint(self,count,digest):
        receipt=_receipt(
            VerifiedAnchor(ISSUER,NONCE,count,digest,"producer-a"),
            self.custody_key,"custody-a",NOW
        )
        return attest_checkpoint(
            self.witness,receipt,self.custody_keys,self.witness_key,
            "witness-a",now=NOW
        )

    def store(self,checkpoint=None):
        return archive_checkpoint(
            self.archive,self.first if checkpoint is None else checkpoint,
            self.witness_keys,self.archive_key,"archive-a"
        )

    def audit(self):
        return audit_archive(
            self.archive,ISSUER,NONCE,self.witness_keys,self.archive_keys
        )

    def restore(self,db=None):
        return compare_restored_witness(
            self.archive,self.witness if db is None else db,
            ISSUER,NONCE,self.witness_keys,self.archive_keys
        )

    def test_signed_first_checkpoint_archived(self):
        seal=self.store()
        self.assertIsNotNone(seal)
        self.assertEqual(verify_seal(seal,self.archive_keys,issuer=ISSUER,nonce=NONCE)[0],1)
        self.assertTrue(self.audit())

    def test_identical_retry_returns_same_seal(self):
        original=self.store()
        self.assertEqual(original,self.store())
        self.assertEqual(self.archive.execute(
            "SELECT COUNT(*) FROM rio_checkpoint_archive_history").fetchone()[0],1)

    def test_two_steps_form_hash_link(self):
        first=self.store()
        second_checkpoint=self.checkpoint(2,"b"*64)
        second=self.store(second_checkpoint)
        self.assertIsNotNone(second)
        import hashlib,json
        packed=json.dumps(first,sort_keys=True,separators=(",",":"),ensure_ascii=False)
        self.assertEqual(
            second["payload"]["previous_seal_sha256"],
            hashlib.sha256(packed.encode()).hexdigest()
        )
        self.assertTrue(self.audit())

    def test_skipped_initial_checkpoint_is_rejected(self):
        self.assertIsNotNone(self.first)
        second=self.checkpoint(2,"b"*64)
        self.assertIsNotNone(second)
        # The source witness has both stages, but archive has not seen stage 1.
        self.assertIsNone(self.store(second))

    def test_fork_on_same_sequence_rejected(self):
        self.assertIsNotNone(self.store())
        altered=dict(self.first)
        altered["payload"]=dict(altered["payload"])
        altered["payload"]["events_sha256"]="f"*64
        self.assertIsNone(self.store(altered))

    def test_missing_history_fails_audit(self):
        self.assertIsNotNone(self.store())
        self.archive.execute("DROP TRIGGER rio_archive_history_immutable_delete")
        self.archive.execute("DELETE FROM rio_checkpoint_archive_history")
        self.assertFalse(self.audit())
        second=self.checkpoint(2,"b"*64)
        self.assertIsNone(self.store(second))

    def test_modified_history_fails_audit(self):
        self.assertIsNotNone(self.store())
        self.archive.execute("DROP TRIGGER rio_archive_history_immutable_update")
        self.archive.execute("UPDATE rio_checkpoint_archive_history SET checkpoint_json='{}'")
        self.assertFalse(self.audit())

    def test_wrong_archive_public_key_fails_audit(self):
        self.assertIsNotNone(self.store())
        other=Ed25519PrivateKey.generate()
        public=other.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.assertFalse(audit_archive(
            self.archive,ISSUER,NONCE,self.witness_keys,{"archive-a":public}
        ))

    def test_wrong_witness_public_key_fails_audit(self):
        self.assertIsNotNone(self.store())
        self.assertFalse(audit_archive(
            self.archive,ISSUER,NONCE,{},self.archive_keys
        ))

    def test_matching_restore_is_informational(self):
        self.assertIsNotNone(self.store())
        self.assertEqual(self.restore(),ArchiveComparison.MATCHED)

    def test_restored_older_witness_is_detected(self):
        self.assertIsNotNone(self.store())
        second=self.checkpoint(2,"b"*64)
        self.assertIsNotNone(self.store(second))
        old=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(old.close)
        initialize_checkpoint_witness(old)
        entry=self.witness.execute(
            """SELECT event_count,events_sha256,custody_receipt_sha256,checkpoint_json
               FROM rio_checkpoint_witness_history WHERE event_count=1"""
        ).fetchone()
        old.execute(
            """INSERT INTO rio_checkpoint_witness
               (issuer,nonce,event_count,events_sha256,custody_receipt_sha256,checkpoint_json)
               VALUES (?,?,?,?,?,?)""",(ISSUER,NONCE,*entry)
        )
        self.assertEqual(self.restore(old),ArchiveComparison.RESTORED_BEHIND)

    def test_missing_witness_head_is_behind(self):
        self.assertIsNotNone(self.store())
        old=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(old.close)
        initialize_checkpoint_witness(old)
        self.assertEqual(self.restore(old),ArchiveComparison.RESTORED_BEHIND)

    def test_same_db_cannot_be_own_archive(self):
        self.assertIsNotNone(self.store())
        self.assertEqual(compare_restored_witness(
            self.archive,self.archive,ISSUER,NONCE,self.witness_keys,
            self.archive_keys
        ),ArchiveComparison.UNKNOWN)

    def test_bad_seal_signature_rejected(self):
        seal=self.store()
        seal["signature"]="A"*86
        self.assertIsNone(verify_seal(seal,self.archive_keys,issuer=ISSUER,nonce=NONCE))

    def test_history_cannot_be_deleted_by_normal_sql(self):
        self.assertIsNotNone(self.store())
        with self.assertRaises(sqlite3.DatabaseError):
            self.archive.execute("DELETE FROM rio_checkpoint_archive_history")

    def test_no_activation_or_authority(self):
        self.assertNotIn("AUTHORIZED",ArchiveComparison.__members__)
        tables={r[0] for r in self.archive.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        self.assertNotIn("trusted_witness_keys",tables)
