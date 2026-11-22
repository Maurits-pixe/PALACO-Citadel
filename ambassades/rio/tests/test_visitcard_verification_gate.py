"""Cryptographic v0.7 gate tests; synthetic fixtures and in-memory checkpoint."""
import base64
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_trust_policy import DisplayStatus
from visitcard_ed25519_verifier import DOMAIN_CARD, DOMAIN_REVOCATION, _canonical
from visitcard_verification_gate import (
    GateConfiguration, KeyWindow, SnapshotCheckpoint, evaluate_visitcard, snapshot_checkpoint
)
try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
except ImportError:
    Ed25519PrivateKey = None

NOW = datetime(2026, 11, 22, 12, tzinfo=timezone.utc)
ISSUER = "palaco.example"


@unittest.skipUnless(Ed25519PrivateKey is not None, "cryptography required")
class GateTests(unittest.TestCase):
    def setUp(self):
        self.card_key = Ed25519PrivateKey.generate()
        self.rev_key = Ed25519PrivateKey.generate()
        self.card_payload = {
            "version": 1, "credential_id": "c-001", "issuer": ISSUER,
            "subject": "person-01", "audience": "rio-visitcard-preview",
            "issued_at": (NOW - timedelta(minutes=1)).isoformat(),
            "expires_at": (NOW + timedelta(hours=1)).isoformat(),
        }
        self.rev_payload = {
            "version": 1, "issuer": ISSUER,
            "checked_at": NOW.isoformat(), "revoked_ids": [],
        }
        self.config = GateConfiguration(
            (self.window(self.card_key),), (self.window(self.rev_key),)
        )

    def window(self, key, start=NOW - timedelta(days=1), end=NOW + timedelta(days=1)):
        return KeyWindow(ISSUER, key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw), start, end)

    def signed(self, payload, key, domain):
        signature = key.sign(domain + _canonical(payload))
        return {"payload": payload, "key_id": ISSUER,
                "signature": base64.urlsafe_b64encode(signature).rstrip(b"=").decode()}

    def inputs(self):
        return (self.signed(self.card_payload, self.card_key, DOMAIN_CARD),
                self.signed(self.rev_payload, self.rev_key, DOMAIN_REVOCATION))

    def status(self, checkpoint=None, config=None, card=None, snap=None, now=NOW):
        valid_card, valid_snap = self.inputs()
        return evaluate_visitcard(
            card if card is not None else valid_card,
            snap if snap is not None else valid_snap,
            self.config if config is None else config,
            checkpoint,
            expected_issuer=ISSUER, expected_subject="person-01",
            expected_audience="rio-visitcard-preview", now=now,
        )

    def test_valid_checkpoint_and_keys(self):
        _, snapshot = self.inputs()
        self.assertEqual(self.status(checkpoint=snapshot_checkpoint(snapshot)), DisplayStatus.VERIFIED)

    def test_missing_checkpoint_fails_closed(self):
        self.assertEqual(self.status(), DisplayStatus.UNKNOWN)

    def test_snapshot_rollback_rejected(self):
        _, snapshot = self.inputs()
        recent = replace(snapshot_checkpoint(snapshot), checked_at=NOW + timedelta(minutes=1))
        self.assertEqual(self.status(checkpoint=recent), DisplayStatus.UNKNOWN)

    def test_same_timestamp_different_snapshot_rejected(self):
        _, snapshot = self.inputs()
        different = replace(snapshot_checkpoint(snapshot), digest_hex="0" * 64)
        self.assertEqual(self.status(checkpoint=different), DisplayStatus.UNKNOWN)

    def test_key_gap_rejected(self):
        _, snapshot = self.inputs()
        bad = replace(self.config, issuer_windows=(
            self.window(self.card_key, NOW + timedelta(minutes=1), NOW + timedelta(hours=1)),))
        self.assertEqual(self.status(checkpoint=snapshot_checkpoint(snapshot), config=bad), DisplayStatus.UNKNOWN)

    def test_overlapping_keys_rejected(self):
        _, snapshot = self.inputs()
        other = Ed25519PrivateKey.generate()
        bad = replace(self.config, issuer_windows=(self.window(self.card_key), self.window(other)))
        self.assertEqual(self.status(checkpoint=snapshot_checkpoint(snapshot), config=bad), DisplayStatus.UNKNOWN)

    def test_revoked_status_preserved(self):
        self.rev_payload["revoked_ids"] = ["c-001"]
        _, snapshot = self.inputs()
        self.assertEqual(self.status(checkpoint=snapshot_checkpoint(snapshot)), DisplayStatus.REVOKED)

    def test_tampering_fails_closed(self):
        card, snapshot = self.inputs()
        card["payload"] = dict(card["payload"], subject="hijacked")
        self.assertEqual(self.status(card=card, checkpoint=snapshot_checkpoint(snapshot)), DisplayStatus.UNKNOWN)

    def test_rotation_retires_old_signature(self):
        _, snapshot = self.inputs()
        other = Ed25519PrivateKey.generate()
        rotated = replace(self.config, issuer_windows=(self.window(other),))
        self.assertEqual(self.status(checkpoint=snapshot_checkpoint(snapshot), config=rotated), DisplayStatus.UNKNOWN)

    def test_naive_checkpoint_rejected(self):
        _, snapshot = self.inputs()
        naive = replace(snapshot_checkpoint(snapshot), checked_at=NOW.replace(tzinfo=None))
        self.assertEqual(self.status(checkpoint=naive), DisplayStatus.UNKNOWN)


if __name__ == "__main__":
    unittest.main()
