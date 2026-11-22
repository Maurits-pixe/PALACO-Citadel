"""RIO witness client loopback integration tests. Development-only socket."""
import base64
from http.server import ThreadingHTTPServer
import sqlite3
import sys
import tempfile
import threading
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_audit_journal import ZERO_HASH
from visitcard_witness_registry import initialize_witness, PROPOSAL_DOMAIN, _canonical
from visitcard_witness_http import make_handler
from visitcard_witness_client import DeliveryState, submit_local_witness
from visitcard_witness_receipt import WitnessTrust
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


class WitnessClientTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = str(Path(self.temp.name) / "witness.sqlite")
        with sqlite3.connect(self.database, isolation_level=None) as conn:
            initialize_witness(conn)
        self.producer = Ed25519PrivateKey.generate()
        self.witness = Ed25519PrivateKey.generate()
        producers = {"issuer.example": self.producer.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)}
        self.trust = WitnessTrust({"witness-1": self.witness.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)})
        self.server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            make_handler(self.database, producers, self.witness, "witness-1")
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.thread.join, 3)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def claim(self, seq=1, head="a"*64, prev=ZERO_HASH):
        payload = {"version": 1, "issuer": "issuer.example", "sequence": seq,
                   "entry_hash": head, "predecessor_hash": prev}
        signature = self.producer.sign(PROPOSAL_DOMAIN + _canonical(payload))
        return {"payload": payload, "signature": base64.urlsafe_b64encode(signature).rstrip(b"=").decode()}

    def send(self, claim=None, **kwargs):
        return submit_local_witness(
            self.claim() if claim is None else claim, self.trust,
            expected_issuer="issuer.example", port=self.server.server_port, **kwargs
        )

    def test_valid_receipt_is_verified_and_matches_claim(self):
        result = self.send()
        self.assertEqual(result.state, DeliveryState.ACKNOWLEDGED)
        self.assertEqual(result.receipt.head.sequence, 1)
        self.assertEqual(result.receipt.head.entry_hash, "a"*64)

    def test_idempotent_same_claim_retry(self):
        first = self.send()
        second = self.send()
        self.assertEqual(first.state, DeliveryState.ACKNOWLEDGED)
        self.assertEqual(second.state, DeliveryState.ACKNOWLEDGED)
        self.assertEqual(first.receipt, second.receipt)

    def test_invalid_signature_rejected(self):
        claim = self.claim()
        claim["payload"]["entry_hash"] = "b"*64
        self.assertEqual(self.send(claim).state, DeliveryState.REJECTED)

    def test_conflicting_retry_rejected(self):
        self.send()
        self.assertEqual(self.send(self.claim(1, "f"*64, ZERO_HASH)).state, DeliveryState.REJECTED)

    def test_wrong_trust_anchor_rejected(self):
        other = Ed25519PrivateKey.generate()
        wrong = WitnessTrust({"witness-1": other.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)})
        result = submit_local_witness(self.claim(), wrong, expected_issuer="issuer.example",
                                      port=self.server.server_port)
        self.assertEqual(result.state, DeliveryState.REJECTED)

    def test_invalid_network_destination_rejected(self):
        self.assertEqual(self.send(host="example.com").state, DeliveryState.REJECTED)
        self.assertEqual(self.send(host="0.0.0.0").state, DeliveryState.REJECTED)
        self.assertEqual(self.send(port=0).state, DeliveryState.REJECTED)

    def test_unavailable_server_is_pending_not_success(self):
        self.server.shutdown()
        self.server.server_close()
        result = self.send(timeout_seconds=0.2)
        self.assertEqual(result.state, DeliveryState.PENDING)
        self.assertIsNone(result.receipt)

    def test_malformed_claim_rejected(self):
        self.assertEqual(self.send({"payload": {}}).state, DeliveryState.REJECTED)

    def test_explicit_head_binding_blocks_wrong_response(self):
        self.send()
        self.assertEqual(self.send(self.claim(seq=2, head="b"*64, prev="f"*64)).state, DeliveryState.REJECTED)

    def test_receipt_never_grants_access(self):
        self.assertNotIn("AUTHORIZED", DeliveryState.__members__)
