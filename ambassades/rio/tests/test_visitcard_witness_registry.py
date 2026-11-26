"""RIO isolated witness registry tests; cryptographic dependencies mandatory."""
import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_audit_journal import ZERO_HASH
from visitcard_witness_receipt import WitnessTrust, verify_witness_receipt
from visitcard_witness_registry import (
    PROPOSAL_DOMAIN, _canonical, initialize_witness, publish, audit_witness,
)

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
except ImportError:
    Ed25519PrivateKey = None

NOW = datetime(2026, 11, 22, 12, tzinfo=timezone.utc)
ISSUER = "palaco.example"


@unittest.skipUnless(Ed25519PrivateKey is not None, "cryptography required")
class WitnessRegistryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.dbpath = str(Path(self.temporary.name) / "witness.sqlite")
        self.db = sqlite3.connect(self.dbpath, isolation_level=None, timeout=1)
        self.addCleanup(self.db.close)
        initialize_witness(self.db)
        self.producer = Ed25519PrivateKey.generate()
        self.signer = Ed25519PrivateKey.generate()
        self.producers = {
            ISSUER: self.producer.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw),
        }
        self.trust = WitnessTrust({
            "witness-01": self.signer.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw),
        })

    def claim(self, sequence, head, previous, producer=None):
        payload = {
            "version": 1, "issuer": ISSUER, "sequence": sequence,
            "entry_hash": head, "predecessor_hash": previous,
        }
        sig = (producer or self.producer).sign(PROPOSAL_DOMAIN + _canonical(payload))
        return {"payload": payload, "signature": base64.urlsafe_b64encode(sig).rstrip(b"=").decode()}

    def submit(self, claim):
        return publish(self.db, claim, self.producers, self.signer, witness_id="witness-01", now=NOW)

    def first(self):
        return self.submit(self.claim(1, "a"*64, ZERO_HASH))

    def test_signed_genesis_is_receipted_and_verifiable(self):
        receipt = self.first()
        self.assertIsNotNone(receipt)
        self.assertIsNotNone(verify_witness_receipt(receipt, self.trust, expected_issuer=ISSUER, now=NOW))
        self.assertTrue(audit_witness(self.db, ISSUER))

    def test_unsigned_or_untrusted_genesis_rejected(self):
        invalid = self.claim(1, "a"*64, ZERO_HASH)
        invalid["signature"] = "x"*86
        self.assertIsNone(self.submit(invalid))
        unknown = self.claim(1, "a"*64, ZERO_HASH, producer=Ed25519PrivateKey.generate())
        self.assertIsNone(self.submit(unknown))
        self.assertEqual(self.db.execute("SELECT count(*) FROM witness_heads").fetchone()[0], 0)

    def test_idempotent_retry_is_bitwise_identical(self):
        original = self.first()
        again = self.submit(self.claim(1, "a"*64, ZERO_HASH))
        self.assertEqual(original, again)
        self.assertEqual(self.db.execute("SELECT count(*) FROM witness_entries").fetchone()[0], 1)

    def test_incremental_publication(self):
        self.first()
        next_receipt = self.submit(self.claim(2, "b"*64, "a"*64))
        self.assertEqual(next_receipt["payload"]["sequence"], 2)
        self.assertTrue(audit_witness(self.db, ISSUER))

    def test_skipped_or_repeated_conflicting_sequence_rejected(self):
        self.first()
        self.assertIsNone(self.submit(self.claim(3, "c"*64, "a"*64)))
        self.assertIsNone(self.submit(self.claim(1, "b"*64, ZERO_HASH)))

    def test_wrong_predecessor_rejected(self):
        self.first()
        self.assertIsNone(self.submit(self.claim(2, "b"*64, "f"*64)))

    def test_forged_claim_rejected(self):
        claim = self.claim(1, "a"*64, ZERO_HASH)
        claim["payload"]["entry_hash"] = "b"*64
        self.assertIsNone(self.submit(claim))

    def test_durable_reopen_preserves_high_water(self):
        self.first()
        other = sqlite3.connect(self.dbpath, isolation_level=None)
        try:
            self.assertTrue(audit_witness(other, ISSUER))
            self.assertEqual(other.execute("SELECT sequence FROM witness_heads").fetchone()[0], 1)
        finally:
            other.close()

    def test_transaction_lock_fails_closed(self):
        self.first()
        other = sqlite3.connect(self.dbpath, isolation_level=None, timeout=0)
        try:
            other.execute("BEGIN IMMEDIATE")
            self.assertIsNone(self.submit(self.claim(2, "b"*64, "a"*64)))
            other.rollback()
            self.assertTrue(audit_witness(self.db, ISSUER))
        finally:
            other.close()

    def test_append_only_journal_blocks_mutation(self):
        self.first()
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("DELETE FROM witness_entries")
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("UPDATE witness_entries SET entry_hash=? WHERE sequence=1", ("f"*64,))

    def test_corrupt_high_water_denies_next_publication(self):
        self.first()
        self.db.execute(
            "UPDATE witness_heads SET entry_hash=? WHERE issuer=?", ("f"*64, ISSUER)
        )
        self.assertIsNone(self.submit(self.claim(2, "b"*64, "a"*64)))

    def test_orphaned_entries_block_genesis_reinitialization(self):
        self.first()
        self.db.execute("DELETE FROM witness_heads WHERE issuer=?", (ISSUER,))
        self.assertIsNone(self.submit(self.claim(1, "a"*64, ZERO_HASH)))

    def test_in_transaction_rejected(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.assertIsNone(self.submit(self.claim(1, "a"*64, ZERO_HASH)))
        finally:
            self.db.rollback()
