"""RIO v2.8 archive publication custody tests — independent local DB prototype."""
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
from visitcard_checkpoint_witness import initialize_checkpoint_witness,attest_checkpoint
from visitcard_checkpoint_archive import initialize_archive,archive_checkpoint
from visitcard_archive_publication import (
    initialize_publication,publish_archive_seal,
    verify_publication_receipt,audit_publication
)

NOW=datetime(2026,11,22,12,tzinfo=timezone.utc)
ISSUER="issuer.example"
NONCE="nonce-test"


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.witness=sqlite3.connect(":memory:",isolation_level=None)
        self.archive=sqlite3.connect(":memory:",isolation_level=None)
        self.publisher=sqlite3.connect(":memory:",isolation_level=None)
        for db in (self.witness,self.archive,self.publisher):
            self.addCleanup(db.close)
        initialize_checkpoint_witness(self.witness)
        initialize_archive(self.archive)
        initialize_publication(self.publisher)
        self.custody_key=Ed25519PrivateKey.generate()
        self.witness_key=Ed25519PrivateKey.generate()
        self.archive_key=Ed25519PrivateKey.generate()
        self.publisher_key=Ed25519PrivateKey.generate()
        pub=lambda key:key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.custody_keys={"custody-a":pub(self.custody_key)}
        self.witness_keys={"witness-a":pub(self.witness_key)}
        self.archive_keys={"archive-a":pub(self.archive_key)}
        self.publisher_keys={"publisher-a":pub(self.publisher_key)}
        self.first=self.make_seal(1,"a"*64)

    def make_seal(self,count,digest):
        custody=_receipt(VerifiedAnchor(ISSUER,NONCE,count,digest,"anchor"),
                         self.custody_key,"custody-a",NOW)
        checkpoint=attest_checkpoint(
            self.witness,custody,self.custody_keys,
            self.witness_key,"witness-a",now=NOW
        )
        self.assertIsNotNone(checkpoint)
        seal=archive_checkpoint(
            self.archive,checkpoint,self.witness_keys,self.archive_key,"archive-a"
        )
        return seal

    def publish(self,seal=None):
        return publish_archive_seal(
            self.publisher,self.first if seal is None else seal,
            self.archive_keys,self.publisher_key,"publisher-a"
        )

    def audit(self):
        return audit_publication(self.publisher,ISSUER,NONCE,self.archive_keys,self.publisher_keys)

    def verify(self,receipt):
        p=receipt["payload"]
        return verify_publication_receipt(
            receipt,self.publisher_keys,issuer=ISSUER,nonce=NONCE,
            event_count=p["event_count"],seal_sha256=p["seal_sha256"]
        )

    def test_valid_first_publication(self):
        receipt=self.publish()
        self.assertIsNotNone(receipt)
        self.assertTrue(self.verify(receipt))
        self.assertTrue(self.audit())

    def test_identical_retry_returns_original_receipt(self):
        first=self.publish()
        self.assertEqual(first,self.publish())
        self.assertEqual(self.publisher.execute(
            "SELECT COUNT(*) FROM rio_archive_publication_history").fetchone()[0],1)

    def test_two_step_chain(self):
        first=self.publish()
        self.assertIsNotNone(first)
        next_seal=self.make_seal(2,"b"*64)
        second=self.publish(next_seal)
        self.assertIsNotNone(second)
        self.assertEqual(second["payload"]["previous_seal_sha256"],
                         first["payload"]["seal_sha256"])
        self.assertTrue(self.audit())

    def test_reject_skipped_first_stage(self):
        second=self.make_seal(2,"b"*64)
        self.assertIsNone(self.publish(second))

    def test_reject_old_after_advancement(self):
        self.assertIsNotNone(self.publish())
        self.assertIsNotNone(self.publish(self.make_seal(2,"b"*64)))
        self.assertIsNone(self.publish(self.first))

    def test_reject_fork_same_count(self):
        self.publish()
        alternate=dict(self.first)
        alternate["payload"]=dict(alternate["payload"])
        alternate["payload"]["checkpoint_sha256"]="f"*64
        self.assertIsNone(self.publish(alternate))

    def test_reject_corrupt_archive_signature(self):
        seal=dict(self.first)
        seal["signature"]="A"*86
        self.assertIsNone(self.publish(seal))

    def test_reject_wrong_archive_trust_key(self):
        other=Ed25519PrivateKey.generate()
        pub=other.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.assertIsNone(publish_archive_seal(
            self.publisher,self.first,{"archive-a":pub},self.publisher_key,"publisher-a"
        ))

    def test_reject_wrong_publisher_key(self):
        receipt=self.publish()
        other=Ed25519PrivateKey.generate()
        pub=other.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.assertFalse(verify_publication_receipt(
            receipt,{"publisher-a":pub},issuer=ISSUER,nonce=NONCE,
            event_count=1,seal_sha256=receipt["payload"]["seal_sha256"]
        ))

    def test_receipt_binds_exact_hash(self):
        receipt=self.publish()
        self.assertFalse(verify_publication_receipt(
            receipt,self.publisher_keys,issuer=ISSUER,nonce=NONCE,
            event_count=1,seal_sha256="f"*64
        ))

    def test_receipt_binds_issuer_and_nonce(self):
        receipt=self.publish()
        self.assertFalse(verify_publication_receipt(
            receipt,self.publisher_keys,issuer="other",nonce=NONCE,
            event_count=1,seal_sha256=receipt["payload"]["seal_sha256"]
        ))
        self.assertFalse(verify_publication_receipt(
            receipt,self.publisher_keys,issuer=ISSUER,nonce="other",
            event_count=1,seal_sha256=receipt["payload"]["seal_sha256"]
        ))

    def test_missing_history_fails_closed(self):
        self.publish()
        self.publisher.execute("DROP TRIGGER rio_publication_history_no_delete")
        self.publisher.execute("DELETE FROM rio_archive_publication_history")
        self.assertFalse(self.audit())
        self.assertIsNone(self.publish(self.make_seal(2,"b"*64)))

    def test_tampered_history_fails_closed(self):
        self.publish()
        self.publisher.execute("DROP TRIGGER rio_publication_history_no_update")
        self.publisher.execute(
            "UPDATE rio_archive_publication_history SET seal_sha256=?",("f"*64,)
        )
        self.assertFalse(self.audit())

    def test_rows_are_append_only_to_normal_sql(self):
        self.publish()
        with self.assertRaises(sqlite3.DatabaseError):
            self.publisher.execute("DELETE FROM rio_archive_publication_history")

    def test_outstanding_transaction_rejected(self):
        self.publisher.execute("BEGIN IMMEDIATE")
        try:
            self.assertIsNone(self.publish())
        finally:
            self.publisher.rollback()

    def test_no_authority_table(self):
        names={r[0] for r in self.publisher.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        self.assertNotIn("trusted_witness_keys",names)


if __name__=="__main__":
    unittest.main()
