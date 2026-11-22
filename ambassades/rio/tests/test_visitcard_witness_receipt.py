"""Tests for independently signed witness receipts and recovery classification."""
import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_audit_journal import append_checkpoint, inspect_journal, WitnessHead
from visitcard_checkpoint_ledger import initialize_schema, provision_trusted_checkpoint
from visitcard_verification_gate import SnapshotCheckpoint
from visitcard_witness_receipt import (
    DOMAIN, RecoveryState, WitnessTrust, _canonical,
    reconcile_witness, verify_witness_receipt, verify_and_reconcile
)

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
except ImportError:
    Ed25519PrivateKey = None

NOW = datetime(2026, 11, 22, 12, 0, tzinfo=timezone.utc)
ISSUER = "palaco.example"


@unittest.skipUnless(Ed25519PrivateKey is not None, "cryptography required")
class WitnessReceiptTests(unittest.TestCase):
    def setUp(self):
        self.key = Ed25519PrivateKey.generate()
        self.trust = WitnessTrust({"witness-01": self.key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)})
        self.db = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_schema(self.db)
        provision_trusted_checkpoint(
            self.db, SnapshotCheckpoint(ISSUER, NOW, "a"*64)
        )

    def signed(self, head=None, observed=NOW, key=None):
        head = head or inspect_journal(self.db, ISSUER)
        payload = {
            "version": 1, "issuer": head.issuer, "sequence": head.sequence,
            "entry_hash": head.entry_hash, "observed_at": observed.isoformat()
        }
        private = key or self.key
        signature = private.sign(DOMAIN + _canonical(payload))
        return {"payload": payload, "witness_id": "witness-01",
                "signature": base64.urlsafe_b64encode(signature).rstrip(b"=").decode()}

    def verified(self, envelope=None):
        return verify_witness_receipt(
            envelope if envelope is not None else self.signed(), self.trust,
            expected_issuer=ISSUER, now=NOW
        )

    def advance(self):
        self.db.execute("BEGIN IMMEDIATE")
        self.db.execute(
            "UPDATE rio_revocation_checkpoint SET checked_at=?,digest_hex=?,revision=2 WHERE issuer=?",
            ((NOW+timedelta(seconds=5)).isoformat(), "b"*64, ISSUER)
        )
        append_checkpoint(self.db, ISSUER, 2, (NOW+timedelta(seconds=5)).isoformat(), "b"*64)
        self.db.commit()

    def test_valid_signature_and_matching_head(self):
        self.assertEqual(reconcile_witness(self.db, self.verified(), expected_issuer=ISSUER), RecoveryState.MATCHED)

    def test_bad_signature_rejected(self):
        forged = self.signed()
        forged["payload"]["entry_hash"] = "b"*64
        self.assertIsNone(self.verified(forged))

    def test_unknown_witness_is_untrusted(self):
        forged = self.signed()
        forged["witness_id"] = "unknown"
        self.assertIsNone(self.verified(forged))

    def test_other_private_key_rejected(self):
        other = Ed25519PrivateKey.generate()
        self.assertIsNone(self.verified(self.signed(key=other)))

    def test_stale_or_future_receipt_denied(self):
        self.assertIsNone(self.verified(self.signed(observed=NOW-timedelta(days=8))))
        self.assertIsNone(self.verified(self.signed(observed=NOW+timedelta(seconds=1))))

    def test_wrong_issuer_and_replay_audience_denied(self):
        data = self.signed()
        self.assertIsNone(verify_witness_receipt(data, self.trust, expected_issuer="other.example", now=NOW))

    def test_no_receipt_is_unknown(self):
        self.assertEqual(reconcile_witness(self.db, None, expected_issuer=ISSUER), RecoveryState.UNKNOWN)

    def test_local_ahead_requires_witness_publication(self):
        old_receipt = self.verified()
        self.advance()
        self.assertEqual(reconcile_witness(self.db, old_receipt, expected_issuer=ISSUER),
                         RecoveryState.LOCAL_AHEAD_PENDING_WITNESS)

    def test_local_behind_detected(self):
        head = inspect_journal(self.db, ISSUER)
        future = WitnessHead(ISSUER, head.sequence+1, "f"*64)
        receipt = self.verified(self.signed(future))
        self.assertEqual(reconcile_witness(self.db, receipt, expected_issuer=ISSUER),
                         RecoveryState.LOCAL_BEHIND_ROLLBACK_SUSPECTED)

    def test_same_sequence_fork_detected(self):
        head = inspect_journal(self.db, ISSUER)
        fork = WitnessHead(ISSUER, head.sequence, "f"*64)
        receipt = self.verified(self.signed(fork))
        self.assertEqual(reconcile_witness(self.db, receipt, expected_issuer=ISSUER), RecoveryState.FORK_CONFLICT)

    def test_different_prefix_fork_detected(self):
        self.advance()
        head = inspect_journal(self.db, ISSUER)
        fake_old = WitnessHead(ISSUER, 1, "f"*64)
        receipt = self.verified(self.signed(fake_old))
        self.assertEqual(reconcile_witness(self.db, receipt, expected_issuer=ISSUER), RecoveryState.FORK_CONFLICT)

    def test_public_entrypoint_checks_signature_first(self):
        valid = self.signed()
        self.assertEqual(
            verify_and_reconcile(self.db, valid, self.trust, expected_issuer=ISSUER, now=NOW),
            RecoveryState.MATCHED
        )
        valid["payload"]["entry_hash"] = "f"*64
        self.assertEqual(
            verify_and_reconcile(self.db, valid, self.trust, expected_issuer=ISSUER, now=NOW),
            RecoveryState.UNKNOWN
        )

    def test_receipt_does_not_grant_authority(self):
        self.assertNotIn("AUTHORIZED", RecoveryState.__members__)
