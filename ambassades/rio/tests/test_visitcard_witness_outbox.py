"""RIO v1.4 durable outbox: no automatic retries, no authorization."""
import base64
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_audit_journal import ZERO_HASH
from visitcard_witness_outbox import (
    initialize_outbox, enqueue, pending_request, acknowledge, outbox_status
)
from visitcard_witness_receipt import DOMAIN, WitnessTrust, _canonical
try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
except ImportError:
    Ed25519PrivateKey = None


@unittest.skipUnless(Ed25519PrivateKey is not None, "cryptography required")
class WitnessOutboxTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.path = str(Path(temporary.name) / "outbox.sqlite")
        self.db = sqlite3.connect(self.path, isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_outbox(self.db)
        self.key = Ed25519PrivateKey.generate()
        self.trust = WitnessTrust({
            "witness-test": self.key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        })
        self.request = {"payload": {
            "version": 1, "issuer": "palaco.example", "sequence": 1,
            "entry_hash": "a"*64, "predecessor_hash": ZERO_HASH
        }, "signature": "a"*86}

    def receipt(self, head="a"*64, sequence=1, key=None):
        payload = {
            "version": 1, "issuer": "palaco.example",
            "sequence": sequence, "entry_hash": head,
            "observed_at": datetime.now(timezone.utc).isoformat()
        }
        signature = (key or self.key).sign(DOMAIN + _canonical(payload))
        return {"payload": payload, "witness_id": "witness-test",
                "signature": base64.urlsafe_b64encode(signature).rstrip(b"=").decode()}

    def test_requires_explicit_enqueue(self):
        self.assertIsNone(pending_request(self.db, "palaco.example", 1))
        self.assertEqual(outbox_status(self.db, "palaco.example", 1), "UNKNOWN")

    def test_enqueue_is_durable_across_reopen(self):
        self.assertTrue(enqueue(self.db, self.request))
        with sqlite3.connect(self.path, isolation_level=None) as other:
            self.assertEqual(pending_request(other, "palaco.example", 1), self.request)

    def test_exact_retry_is_idempotent(self):
        self.assertTrue(enqueue(self.db, self.request))
        self.assertTrue(enqueue(self.db, self.request))
        self.assertEqual(self.db.execute("SELECT count(*) FROM rio_witness_outbox").fetchone()[0], 1)

    def test_conflicting_request_rejected(self):
        self.assertTrue(enqueue(self.db, self.request))
        changed = {"payload": dict(self.request["payload"], entry_hash="b"*64),
                   "signature": "b"*86}
        self.assertFalse(enqueue(self.db, changed))
        self.assertEqual(pending_request(self.db, "palaco.example", 1), self.request)

    def test_wrong_signature_receipt_rejected(self):
        self.assertTrue(enqueue(self.db, self.request))
        forged = self.receipt(key=Ed25519PrivateKey.generate())
        self.assertFalse(acknowledge(self.db, "palaco.example", 1, forged, self.trust))
        self.assertEqual(outbox_status(self.db, "palaco.example", 1), "PENDING")

    def test_wrong_head_receipt_rejected(self):
        self.assertTrue(enqueue(self.db, self.request))
        self.assertFalse(acknowledge(self.db, "palaco.example", 1, self.receipt(head="b"*64), self.trust))

    def test_wrong_sequence_receipt_rejected(self):
        self.assertTrue(enqueue(self.db, self.request))
        self.assertFalse(acknowledge(self.db, "palaco.example", 1, self.receipt(sequence=2), self.trust))

    def test_valid_receipt_advances_state(self):
        self.assertTrue(enqueue(self.db, self.request))
        signed = self.receipt()
        self.assertTrue(acknowledge(self.db, "palaco.example", 1, signed, self.trust))
        self.assertEqual(outbox_status(self.db, "palaco.example", 1), "ACKNOWLEDGED")
        self.assertIsNone(pending_request(self.db, "palaco.example", 1))

    def test_duplicate_receipt_idempotent(self):
        self.assertTrue(enqueue(self.db, self.request))
        signed = self.receipt()
        self.assertTrue(acknowledge(self.db, "palaco.example", 1, signed, self.trust))
        self.assertTrue(acknowledge(self.db, "palaco.example", 1, signed, self.trust))

    def test_different_receipt_after_acknowledgement_rejected(self):
        self.assertTrue(enqueue(self.db, self.request))
        self.assertTrue(acknowledge(self.db, "palaco.example", 1, self.receipt(), self.trust))
        self.assertFalse(acknowledge(self.db, "palaco.example", 1, self.receipt(), self.trust))

    def test_outbox_cannot_delete_or_replace_request(self):
        self.assertTrue(enqueue(self.db, self.request))
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("DELETE FROM rio_witness_outbox")
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("UPDATE rio_witness_outbox SET proposal_json='{}'")

    def test_malformed_proposal_not_persisted(self):
        self.assertFalse(enqueue(self.db, {"payload": {}}))
        self.assertEqual(self.db.execute("SELECT count(*) FROM rio_witness_outbox").fetchone()[0], 0)

    def test_untrusted_receipt_does_not_bootstrap(self):
        self.assertFalse(acknowledge(self.db, "palaco.example", 1, self.receipt(), self.trust))
        self.assertEqual(outbox_status(self.db, "palaco.example", 1), "UNKNOWN")

    def test_enqueue_during_existing_transaction_fails_closed(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.assertFalse(enqueue(self.db, self.request))
        finally:
            self.db.rollback()

    def test_acknowledgement_not_authorization(self):
        self.assertNotIn("AUTHORIZED", ("PENDING", "ACKNOWLEDGED", "UNKNOWN"))
