"""Actual Ed25519 signature tests for draft RIO VisitCard verification."""
import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_trust_policy import DisplayStatus
from visitcard_ed25519_verifier import (
    DOMAIN_CARD, DOMAIN_REVOCATION, TrustedRegistry, _canonical, verify_visitcard
)

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
except ImportError:
    Ed25519PrivateKey = None

NOW = datetime(2026, 11, 22, 12, tzinfo=timezone.utc)


@unittest.skipUnless(Ed25519PrivateKey is not None, "cryptography required")
class VisitCardCryptographicTests(unittest.TestCase):
    def setUp(self):
        self.issuer = Ed25519PrivateKey.generate()
        self.revoke = Ed25519PrivateKey.generate()
        self.trust = TrustedRegistry(
            issuer_keys={"palaco.example": self.issuer.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)},
            revocation_keys={"palaco.example": self.revoke.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)}
        )
        self.card = {
            "version": 1, "credential_id": "example-card-01", "issuer": "palaco.example",
            "subject": "person-01", "audience": "rio-visitcard-preview",
            "issued_at": (NOW - timedelta(minutes=1)).isoformat(),
            "expires_at": (NOW + timedelta(hours=1)).isoformat()
        }
        self.snapshot = {
            "version": 1, "issuer": "palaco.example",
            "checked_at": NOW.isoformat(), "revoked_ids": []
        }

    def signed(self, payload, private_key, domain, key_id):
        sig = private_key.sign(domain + _canonical(payload))
        return {"payload": payload, "key_id": key_id,
                "signature": base64.urlsafe_b64encode(sig).rstrip(b"=").decode()}

    def verify(self, card=None, snapshot=None, trust=None, **kwargs):
        return verify_visitcard(
            card if card is not None else self.signed(self.card, self.issuer, DOMAIN_CARD, "palaco.example"),
            snapshot if snapshot is not None else self.signed(self.snapshot, self.revoke, DOMAIN_REVOCATION, "palaco.example"),
            self.trust if trust is None else trust,
            expected_subject=kwargs.get("subject", "person-01"),
            expected_audience=kwargs.get("audience", "rio-visitcard-preview"),
            now=kwargs.get("now", NOW),
        )

    def test_valid_signed_credential_and_snapshot(self):
        self.assertEqual(self.verify(), DisplayStatus.VERIFIED)

    def test_valid_signed_revocation(self):
        self.snapshot["revoked_ids"].append("example-card-01")
        self.assertEqual(self.verify(), DisplayStatus.REVOKED)

    def test_tampered_card_does_not_verify(self):
        card = self.signed(self.card, self.issuer, DOMAIN_CARD, "palaco.example")
        card["payload"] = dict(card["payload"], subject="impostor")
        self.assertEqual(self.verify(card=card), DisplayStatus.UNKNOWN)

    def test_tampered_snapshot_does_not_verify(self):
        snap = self.signed(self.snapshot, self.revoke, DOMAIN_REVOCATION, "palaco.example")
        snap["payload"] = dict(snap["payload"], revoked_ids=["example-card-01"])
        self.assertEqual(self.verify(snapshot=snap), DisplayStatus.UNKNOWN)

    def test_wrong_subject_or_audience(self):
        self.assertEqual(self.verify(subject="someone-else"), DisplayStatus.UNKNOWN)
        self.assertEqual(self.verify(audience="other-app"), DisplayStatus.UNKNOWN)

    def test_no_trust_anchor(self):
        self.assertEqual(self.verify(trust=TrustedRegistry({}, {})), DisplayStatus.UNKNOWN)

    def test_trusted_key_cannot_impersonate_another_issuer(self):
        self.card["issuer"] = "different.example"
        self.snapshot["issuer"] = "different.example"
        self.assertEqual(self.verify(), DisplayStatus.UNKNOWN)

    def test_missing_revocation_snapshot(self):
        self.assertEqual(self.verify(snapshot={}), DisplayStatus.UNKNOWN)

    def test_stale_or_future_snapshot(self):
        self.snapshot["checked_at"] = (NOW - timedelta(hours=2)).isoformat()
        self.assertEqual(self.verify(), DisplayStatus.UNKNOWN)
        self.snapshot["checked_at"] = (NOW + timedelta(minutes=1)).isoformat()
        self.assertEqual(self.verify(), DisplayStatus.UNKNOWN)

    def test_expiry_and_future_issue(self):
        self.card["expires_at"] = NOW.isoformat()
        self.assertEqual(self.verify(), DisplayStatus.UNKNOWN)
        self.card["expires_at"] = (NOW + timedelta(days=2)).isoformat()
        self.card["issued_at"] = (NOW + timedelta(minutes=1)).isoformat()
        self.assertEqual(self.verify(), DisplayStatus.UNKNOWN)

    def test_separated_signature_domains(self):
        wrong = self.signed(self.card, self.issuer, DOMAIN_REVOCATION, "palaco.example")
        self.assertEqual(self.verify(card=wrong), DisplayStatus.UNKNOWN)


if __name__ == "__main__":
    unittest.main()
