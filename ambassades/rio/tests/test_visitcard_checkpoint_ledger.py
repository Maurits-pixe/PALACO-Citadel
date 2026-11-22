"""SQLite transactional checkpoint tests with synthetic Ed25519 evidence."""
import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_trust_policy import DisplayStatus
from visitcard_ed25519_verifier import DOMAIN_CARD, DOMAIN_REVOCATION, _canonical
from visitcard_verification_gate import GateConfiguration, KeyWindow, snapshot_checkpoint
from visitcard_checkpoint_ledger import (
    initialize_schema, provision_trusted_checkpoint, evaluate_and_advance
)

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
except ImportError:
    Ed25519PrivateKey = None

NOW = datetime(2026, 11, 22, 12, tzinfo=timezone.utc)
ISSUER = "palaco.example"


@unittest.skipUnless(Ed25519PrivateKey is not None, "cryptography required")
class CheckpointLedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = str(Path(self.tmp.name) / "rio.sqlite3")
        self.db = sqlite3.connect(self.path, timeout=2, isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_schema(self.db)
        self.card_key = Ed25519PrivateKey.generate()
        self.rev_key = Ed25519PrivateKey.generate()
        def window(key):
            return KeyWindow(ISSUER, key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw),
                             NOW - timedelta(days=1), NOW + timedelta(days=1))
        self.config = GateConfiguration((window(self.card_key),), (window(self.rev_key),))
        self.card = {"version": 1, "credential_id": "card-001", "issuer": ISSUER,
                     "subject": "person-01", "audience": "rio-visitcard-preview",
                     "issued_at": (NOW - timedelta(minutes=1)).isoformat(),
                     "expires_at": (NOW + timedelta(hours=1)).isoformat()}
        self.revocation = {"version": 1, "issuer": ISSUER,
                           "checked_at": NOW.isoformat(), "revoked_ids": []}

    def sign(self, payload, key, domain):
        signature = base64.urlsafe_b64encode(key.sign(domain + _canonical(payload))).rstrip(b"=").decode()
        return {"payload": payload, "signature": signature, "key_id": ISSUER}

    def snapshot(self):
        return self.sign(self.revocation, self.rev_key, DOMAIN_REVOCATION)

    def bootstrap(self):
        provision_trusted_checkpoint(self.db, snapshot_checkpoint(self.snapshot()))

    def status(self, *, db=None, snap=None, now=NOW):
        return evaluate_and_advance(
            db or self.db,
            self.sign(self.card, self.card_key, DOMAIN_CARD),
            snap if snap is not None else self.snapshot(),
            self.config, expected_issuer=ISSUER,
            expected_subject="person-01", expected_audience="rio-visitcard-preview",
            now=now
        )

    def test_no_implicit_bootstrap(self):
        self.assertEqual(self.status(), DisplayStatus.UNKNOWN)
        self.assertEqual(self.db.execute("SELECT count(*) FROM rio_revocation_checkpoint").fetchone()[0], 0)

    def test_bootstrap_is_one_time(self):
        self.bootstrap()
        with self.assertRaises(sqlite3.IntegrityError):
            self.bootstrap()

    def test_verified_snapshot_commits(self):
        self.bootstrap()
        self.revocation["checked_at"] = (NOW + timedelta(seconds=30)).isoformat()
        self.assertEqual(self.status(now=NOW + timedelta(seconds=30)), DisplayStatus.VERIFIED)
        self.assertEqual(self.db.execute("SELECT revision FROM rio_revocation_checkpoint").fetchone()[0], 2)

    def test_revoked_snapshot_commits(self):
        self.bootstrap()
        self.revocation["revoked_ids"] = ["card-001"]
        self.revocation["checked_at"] = (NOW + timedelta(seconds=30)).isoformat()
        self.assertEqual(self.status(now=NOW + timedelta(seconds=30)), DisplayStatus.REVOKED)
        self.assertEqual(self.db.execute("SELECT revision FROM rio_revocation_checkpoint").fetchone()[0], 2)

    def test_older_snapshot_denied(self):
        self.bootstrap()
        self.revocation["checked_at"] = (NOW - timedelta(seconds=5)).isoformat()
        self.assertEqual(self.status(), DisplayStatus.UNKNOWN)

    def test_same_time_different_signed_snapshot_denied(self):
        self.bootstrap()
        self.revocation["revoked_ids"] = ["card-001"]
        self.assertEqual(self.status(), DisplayStatus.UNKNOWN)

    def test_reopening_database_retains_checkpoint(self):
        self.bootstrap()
        self.revocation["checked_at"] = (NOW + timedelta(seconds=20)).isoformat()
        self.assertEqual(self.status(now=NOW + timedelta(seconds=20)), DisplayStatus.VERIFIED)
        other = sqlite3.connect(self.path, timeout=2, isolation_level=None)
        try:
            self.assertEqual(other.execute("SELECT revision FROM rio_revocation_checkpoint").fetchone()[0], 2)
        finally:
            other.close()

    def test_second_connection_cannot_use_old_snapshot(self):
        self.bootstrap()
        old_snapshot = self.snapshot()
        self.revocation["checked_at"] = (NOW + timedelta(seconds=30)).isoformat()
        self.assertEqual(self.status(now=NOW + timedelta(seconds=30)), DisplayStatus.VERIFIED)
        other = sqlite3.connect(self.path, timeout=2, isolation_level=None)
        try:
            self.assertEqual(self.status(db=other, snap=old_snapshot, now=NOW + timedelta(seconds=30)), DisplayStatus.UNKNOWN)
        finally:
            other.close()

    def test_invalid_signature_does_not_advance(self):
        self.bootstrap()
        self.revocation["checked_at"] = (NOW + timedelta(seconds=30)).isoformat()
        bad = self.snapshot()
        bad["payload"] = dict(bad["payload"], issuer="attacker.example")
        self.assertEqual(self.status(snap=bad, now=NOW + timedelta(seconds=30)), DisplayStatus.UNKNOWN)
        self.assertEqual(self.db.execute("SELECT revision FROM rio_revocation_checkpoint").fetchone()[0], 1)

    def test_transaction_lock_denies_without_consuming(self):
        self.bootstrap()
        other = sqlite3.connect(self.path, timeout=0, isolation_level=None)
        try:
            other.execute("BEGIN IMMEDIATE")
            self.assertEqual(self.status(), DisplayStatus.UNKNOWN)
            other.rollback()
            self.assertEqual(self.db.execute("SELECT revision FROM rio_revocation_checkpoint").fetchone()[0], 1)
        finally:
            other.close()


if __name__ == "__main__":
    unittest.main()
