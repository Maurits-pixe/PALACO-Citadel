"""RIO v1.9 independent enrollment signatures never mutate the trust store."""
import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from visitcard_witness_enrollment import (
    ADMIN_DOMAIN, POSSESSION_DOMAIN, _canonical, verify_enrollment_evidence
)

NOW = datetime(2026, 11, 22, 12, tzinfo=timezone.utc)
ISSUER = "issuer.example"


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


class EnrollmentTests(unittest.TestCase):
    def setUp(self):
        self.admin = Ed25519PrivateKey.generate()
        self.candidate = Ed25519PrivateKey.generate()
        self.trust = {"authority-01": self.admin.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)}

    def envelope(self, **changes):
        payload = {
            "version": 1,
            "issuer": ISSUER,
            "witness_id": "witness-new",
            "public_key": b64(self.candidate.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)),
            "nonce": b64(b"a"*32),
            "requested_at": NOW.isoformat(),
            "expires_at": (NOW+timedelta(minutes=5)).isoformat(),
        }
        payload.update(changes)
        content = _canonical(payload)
        return {
            "payload": payload,
            "authority_id": "authority-01",
            "authority_signature": b64(self.admin.sign(
                ADMIN_DOMAIN + b"authority-01\x00" + content
            )),
            "candidate_signature": b64(self.candidate.sign(POSSESSION_DOMAIN + content)),
        }

    def verify(self, envelope=None, **kwargs):
        return verify_enrollment_evidence(
            self.envelope() if envelope is None else envelope,
            self.trust, expected_issuer=kwargs.get("issuer", ISSUER),
            now=kwargs.get("now", NOW),
        )

    def test_valid_dual_signature_is_evidence_only(self):
        result = self.verify()
        self.assertEqual(result.witness_id, "witness-new")
        self.assertEqual(result.issuer, ISSUER)
        self.assertNotIn("witness-new", self.trust)

    def test_wrong_issuer_is_rejected(self):
        self.assertIsNone(self.verify(issuer="different.example"))

    def test_tampered_public_key_is_rejected(self):
        value = self.envelope()
        value["payload"]["public_key"] = b64(b"b"*32)
        self.assertIsNone(self.verify(value))

    def test_tampered_candidate_signature_is_rejected(self):
        value = self.envelope()
        value["candidate_signature"] = b64(b"b"*64)
        self.assertIsNone(self.verify(value))

    def test_tampered_authority_signature_is_rejected(self):
        value = self.envelope()
        value["authority_signature"] = b64(b"b"*64)
        self.assertIsNone(self.verify(value))

    def test_unknown_authority_is_rejected(self):
        value = self.envelope()
        value["authority_id"] = "unknown"
        self.assertIsNone(self.verify(value))

    def test_expired_enrollment_is_rejected(self):
        self.assertIsNone(self.verify(now=NOW+timedelta(minutes=6)))

    def test_future_enrollment_is_rejected(self):
        self.assertIsNone(self.verify(now=NOW-timedelta(seconds=1)))

    def test_long_enrollment_window_is_rejected(self):
        self.assertIsNone(self.verify(self.envelope(
            expires_at=(NOW+timedelta(hours=1)).isoformat()
        )))

    def test_nonce_replacement_is_rejected(self):
        value = self.envelope()
        value["payload"]["nonce"] = b64(b"c"*32)
        self.assertIsNone(self.verify(value))

    def test_missing_candidate_proof_rejected(self):
        value = self.envelope()
        del value["candidate_signature"]
        self.assertIsNone(self.verify(value))

    def test_evidence_cannot_authorize_access(self):
        result = self.verify()
        self.assertFalse(hasattr(result, "authorized"))
