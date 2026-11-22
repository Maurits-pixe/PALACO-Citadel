"""Loopback HTTP adapter tests. No public socket or cloud infrastructure."""
import base64
from datetime import datetime, timezone
import http.client
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_audit_journal import ZERO_HASH
from visitcard_witness_registry import initialize_witness, PROPOSAL_DOMAIN, _canonical
from visitcard_witness_http import make_handler

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
except ImportError:
    Ed25519PrivateKey = None

from http.server import ThreadingHTTPServer


@unittest.skipUnless(Ed25519PrivateKey is not None, "cryptography required")
class WitnessHttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = str(Path(self.tmp.name) / "witness.sqlite")
        with sqlite3.connect(self.path, isolation_level=None) as connection:
            initialize_witness(connection)
        self.producer = Ed25519PrivateKey.generate()
        self.witness = Ed25519PrivateKey.generate()
        producer_keys = {
            "palaco.example": self.producer.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        }
        self.server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            make_handler(self.path, producer_keys, self.witness, "witness-01"),
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.thread.join, 2)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def proposal(self, sequence=1, head="a"*64, prev=ZERO_HASH):
        payload = {
            "version": 1, "issuer": "palaco.example", "sequence": sequence,
            "entry_hash": head, "predecessor_hash": prev
        }
        raw = self.producer.sign(PROPOSAL_DOMAIN + _canonical(payload))
        return {"payload": payload, "signature": base64.urlsafe_b64encode(raw).rstrip(b"=").decode()}

    def request(self, method="POST", path="/v1/witness/receipts", payload=None, headers=None, raw=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            body = raw if raw is not None else json.dumps(payload if payload is not None else self.proposal()).encode()
            meta = {"Content-Type": "application/json"}
            if headers:
                meta.update(headers)
            conn.request(method, path, body=body, headers=meta)
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), json.loads(response.read())
        finally:
            conn.close()

    def test_signed_receipt(self):
        status, headers, data = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(data["payload"]["sequence"], 1)
        self.assertEqual(headers.get("Cache-Control"), "no-store")

    def test_idempotent_retry(self):
        first = self.request()[2]
        second = self.request()[2]
        self.assertEqual(first, second)

    def test_signature_tampering_denied(self):
        invalid = self.proposal()
        invalid["payload"]["entry_hash"] = "b"*64
        self.assertEqual(self.request(payload=invalid)[0], 409)

    def test_oversized_payload_denied(self):
        self.assertEqual(self.request(raw=b"x"*4097)[0], 413)

    def test_invalid_json_denied(self):
        self.assertEqual(self.request(raw=b"{broken")[0], 400)

    def test_wrong_route_denied(self):
        self.assertEqual(self.request(path="/admin")[0], 404)

    def test_read_and_delete_denied(self):
        self.assertEqual(self.request(method="GET")[0], 405)
        self.assertEqual(self.request(method="DELETE")[0], 405)

    def test_wrong_content_type_denied(self):
        self.assertEqual(self.request(headers={"Content-Type": "text/plain"})[0], 400)

    def test_no_cors_wildcard(self):
        _, headers, _ = self.request()
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_no_authorization_response(self):
        _, _, data = self.request()
        self.assertNotIn("authorized", data)
        self.assertNotIn("access_token", data)


if __name__ == "__main__":
    unittest.main()
