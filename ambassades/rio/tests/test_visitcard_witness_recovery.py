"""RIO v1.5 explicit one-shot recovery tests (loopback-only)."""
import base64
from http.server import ThreadingHTTPServer
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_audit_journal import ZERO_HASH
from visitcard_witness_registry import PROPOSAL_DOMAIN, _canonical, initialize_witness
from visitcard_witness_http import make_handler
from visitcard_witness_outbox import initialize_outbox, enqueue, outbox_status, pending_request
from visitcard_witness_receipt import WitnessTrust
from visitcard_witness_recovery import RecoveryResult, recover_once
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


class WitnessRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.outbox_file = str(Path(self.tmp.name) / "outbox.sqlite")
        self.witness_file = str(Path(self.tmp.name) / "witness.sqlite")
        self.outbox = sqlite3.connect(self.outbox_file, isolation_level=None)
        self.addCleanup(self.outbox.close)
        initialize_outbox(self.outbox)
        with sqlite3.connect(self.witness_file, isolation_level=None) as db:
            initialize_witness(db)
        self.producer = Ed25519PrivateKey.generate()
        self.witness = Ed25519PrivateKey.generate()
        producers = {"issuer.example": self.producer.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)}
        self.trust = WitnessTrust({"witness-1": self.witness.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)})
        self.server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            make_handler(self.witness_file, producers, self.witness, "witness-1"),
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.thread.join, 3)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def claim(self, sequence=1, head="a"*64, prev=ZERO_HASH):
        payload = {"version": 1, "issuer": "issuer.example", "sequence": sequence,
                   "entry_hash": head, "predecessor_hash": prev}
        sig = self.producer.sign(PROPOSAL_DOMAIN + _canonical(payload))
        return {"payload": payload, "signature": base64.urlsafe_b64encode(sig).rstrip(b"=").decode()}

    def recover(self, *, db=None, sequence=1, approved=True, port=None):
        return recover_once(
            self.outbox if db is None else db,
            "issuer.example", sequence, self.trust,
            operator_approved=approved,
            port=self.server.server_port if port is None else port,
        )

    def test_no_approval_prevents_transmission(self):
        self.assertTrue(enqueue(self.outbox, self.claim()))
        self.assertEqual(self.recover(approved=False), RecoveryResult.UNKNOWN)
        with sqlite3.connect(self.witness_file) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM witness_heads").fetchone()[0], 0)

    def test_missing_outbox_never_synthesizes_request(self):
        self.assertEqual(self.recover(), RecoveryResult.UNKNOWN)

    def test_valid_recovery_persists_ack(self):
        self.assertTrue(enqueue(self.outbox, self.claim()))
        self.assertEqual(self.recover(), RecoveryResult.ACKNOWLEDGED)
        self.assertEqual(outbox_status(self.outbox, "issuer.example", 1), "ACKNOWLEDGED")

    def test_recover_twice_is_idempotent(self):
        self.assertTrue(enqueue(self.outbox, self.claim()))
        self.assertEqual(self.recover(), RecoveryResult.ACKNOWLEDGED)
        self.assertEqual(self.recover(), RecoveryResult.ACKNOWLEDGED)
        with sqlite3.connect(self.witness_file) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM witness_entries").fetchone()[0], 1)

    def test_reopen_outbox_preserves_pending_request(self):
        original = self.claim()
        self.assertTrue(enqueue(self.outbox, original))
        with sqlite3.connect(self.outbox_file, isolation_level=None) as other:
            self.assertEqual(pending_request(other, "issuer.example", 1), original)
            self.assertEqual(self.recover(db=other), RecoveryResult.ACKNOWLEDGED)

    def test_conflicting_proposal_retains_pending(self):
        self.assertTrue(enqueue(self.outbox, self.claim(1, "a"*64)))
        # Seed witness with different valid head independently.
        with sqlite3.connect(self.witness_file, isolation_level=None) as db:
            from visitcard_witness_registry import publish
            seeded = publish(db, self.claim(1, "f"*64), {"issuer.example":
                self.producer.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)},
                self.witness, witness_id="witness-1")
            self.assertIsNotNone(seeded)
        self.assertEqual(self.recover(), RecoveryResult.REJECTED)
        self.assertEqual(outbox_status(self.outbox, "issuer.example", 1), "PENDING")

    def test_unavailable_witness_stays_pending(self):
        self.assertTrue(enqueue(self.outbox, self.claim()))
        self.server.shutdown()
        self.server.server_close()
        self.assertEqual(self.recover(), RecoveryResult.PENDING)
        self.assertEqual(outbox_status(self.outbox, "issuer.example", 1), "PENDING")

    def test_tampered_outbox_never_transmits(self):
        self.assertTrue(enqueue(self.outbox, self.claim()))
        # UPDATE trigger prevents modifying the immutable request.
        with self.assertRaises(sqlite3.DatabaseError):
            self.outbox.execute("UPDATE rio_witness_outbox SET proposal_json='{}'")
        self.assertEqual(self.recover(), RecoveryResult.ACKNOWLEDGED)

    def test_invalid_port_rejected_without_acknowledgement(self):
        self.assertTrue(enqueue(self.outbox, self.claim()))
        self.assertEqual(self.recover(port=0), RecoveryResult.REJECTED)
        self.assertEqual(outbox_status(self.outbox, "issuer.example", 1), "PENDING")

    def test_recovery_never_grants_authorization(self):
        self.assertNotIn("AUTHORIZED", RecoveryResult.__members__)


if __name__ == "__main__":
    unittest.main()
