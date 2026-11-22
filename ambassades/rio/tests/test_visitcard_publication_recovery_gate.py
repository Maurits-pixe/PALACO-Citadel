"""RIO v2.9 read-only fail-closed publication recovery tests."""
from datetime import datetime, timezone
from pathlib import Path
import copy
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from visitcard_admission_anchor import VerifiedAnchor
from visitcard_anchor_custody import _receipt
from visitcard_checkpoint_witness import initialize_checkpoint_witness, attest_checkpoint
from visitcard_checkpoint_archive import initialize_archive, archive_checkpoint
from visitcard_archive_publication import initialize_publication, publish_archive_seal
from visitcard_publication_recovery_gate import (
    RecoveryGate, assess_publication_recovery, recovery_permitted
)

NOW = datetime(2026, 11, 22, 12, tzinfo=timezone.utc)
ISSUER = "issuer.example"
NONCE = "nonce-test"


class PublicationRecoveryGateTests(unittest.TestCase):
    def setUp(self):
        self.witness = sqlite3.connect(":memory:", isolation_level=None)
        self.archive = sqlite3.connect(":memory:", isolation_level=None)
        self.publisher = sqlite3.connect(":memory:", isolation_level=None)
        for db in (self.witness, self.archive, self.publisher):
            self.addCleanup(db.close)
        initialize_checkpoint_witness(self.witness)
        initialize_archive(self.archive)
        initialize_publication(self.publisher)
        self.custody_key = Ed25519PrivateKey.generate()
        self.witness_key = Ed25519PrivateKey.generate()
        self.archive_key = Ed25519PrivateKey.generate()
        self.publisher_key = Ed25519PrivateKey.generate()
        pub = lambda key: key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        self.custody_keys = {"custody-a": pub(self.custody_key)}
        self.witness_keys = {"witness-a": pub(self.witness_key)}
        self.archive_keys = {"archive-a": pub(self.archive_key)}
        self.publisher_keys = {"publisher-a": pub(self.publisher_key)}
        self.first_seal = self.seal(1, "a"*64)
        self.first_receipt = self.publish(self.first_seal)

    def seal(self, count, digest):
        signed = _receipt(VerifiedAnchor(ISSUER, NONCE, count, digest, "producer"),
                          self.custody_key, "custody-a", NOW)
        cp = attest_checkpoint(self.witness, signed, self.custody_keys,
                               self.witness_key, "witness-a", now=NOW)
        self.assertIsNotNone(cp)
        seal = archive_checkpoint(self.archive, cp, self.witness_keys,
                                  self.archive_key, "archive-a")
        self.assertIsNotNone(seal)
        return seal

    def publish(self, seal):
        receipt = publish_archive_seal(self.publisher, seal, self.archive_keys,
                                       self.publisher_key, "publisher-a")
        self.assertIsNotNone(receipt)
        return receipt

    def assess(self, receipt=None, **kwargs):
        return assess_publication_recovery(
            self.archive, self.first_receipt if receipt is None else receipt,
            issuer=kwargs.get("issuer", ISSUER), nonce=kwargs.get("nonce", NONCE),
            witness_keys=kwargs.get("witness_keys", self.witness_keys),
            archive_keys=kwargs.get("archive_keys", self.archive_keys),
            publisher_keys=kwargs.get("publisher_keys", self.publisher_keys),
        )

    def test_identical_receipt_is_only_informational(self):
        self.assertEqual(self.assess(), RecoveryGate.MATCHED_INFORMATIONAL)

    def test_match_never_authorizes_recovery(self):
        self.assertFalse(recovery_permitted(self.assess()))

    def test_unknown_receipt_fails_closed(self):
        self.assertEqual(self.assess({}), RecoveryGate.UNKNOWN_BLOCKED)

    def test_forged_receipt_signature_fails_closed(self):
        receipt = copy.deepcopy(self.first_receipt)
        receipt["signature"] = "A"*86
        self.assertEqual(self.assess(receipt), RecoveryGate.UNKNOWN_BLOCKED)

    def test_wrong_publisher_key_fails_closed(self):
        self.assertEqual(self.assess(publisher_keys={}), RecoveryGate.UNKNOWN_BLOCKED)

    def test_wrong_archive_key_fails_closed(self):
        self.assertEqual(self.assess(archive_keys={}), RecoveryGate.UNKNOWN_BLOCKED)

    def test_wrong_witness_key_fails_closed(self):
        self.assertEqual(self.assess(witness_keys={}), RecoveryGate.UNKNOWN_BLOCKED)

    def test_wrong_issuer_fails_closed(self):
        self.assertEqual(self.assess(issuer="other"), RecoveryGate.UNKNOWN_BLOCKED)

    def test_wrong_nonce_fails_closed(self):
        self.assertEqual(self.assess(nonce="other"), RecoveryGate.UNKNOWN_BLOCKED)

    def test_local_ahead_unconfirmed(self):
        self.seal(2, "b"*64)
        self.assertEqual(self.assess(), RecoveryGate.LOCAL_AHEAD_UNCONFIRMED)

    def test_signed_external_head_detects_local_rollback(self):
        newer = self.publish(self.seal(2, "b"*64))
        # Older consistent database is reconstructed from the first stage.
        old = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(old.close)
        initialize_archive(old)
        row = self.archive.execute(
            """SELECT event_count,checkpoint_json,seal_json
               FROM rio_checkpoint_archive_history WHERE event_count=1"""
        ).fetchone()
        old.execute(
            "INSERT INTO rio_checkpoint_archive_history VALUES (?,?,?,?,?)",
            (ISSUER, NONCE, *row)
        )
        from visitcard_checkpoint_archive import _digest
        old.execute(
            "INSERT INTO rio_checkpoint_archive_head VALUES (?,?,?,?,?)",
            (ISSUER, NONCE, 1, _digest(row[1]), _digest(row[2]))
        )
        result = assess_publication_recovery(
            old, newer, issuer=ISSUER, nonce=NONCE,
            witness_keys=self.witness_keys, archive_keys=self.archive_keys,
            publisher_keys=self.publisher_keys
        )
        self.assertEqual(result, RecoveryGate.LOCAL_BEHIND_BLOCKED)

    def test_missing_local_history_fails_closed(self):
        self.archive.execute("DROP TRIGGER rio_archive_history_immutable_delete")
        self.archive.execute("DELETE FROM rio_checkpoint_archive_history")
        self.assertEqual(self.assess(), RecoveryGate.UNKNOWN_BLOCKED)

    def test_mismatched_signed_publication_is_fork(self):
        other = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(other.close)
        initialize_archive(other)
        # A distinct valid archive history is made using another independently
        # signed checkpoint for the same issuer/nonce and event count.
        custody = _receipt(VerifiedAnchor(ISSUER, NONCE, 1, "f"*64, "producer"),
                           self.custody_key, "custody-a", NOW)
        other_witness = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(other_witness.close)
        initialize_checkpoint_witness(other_witness)
        cp = attest_checkpoint(other_witness, custody, self.custody_keys,
                               self.witness_key, "witness-a", now=NOW)
        self.assertIsNotNone(cp)
        seal = archive_checkpoint(other, cp, self.witness_keys, self.archive_key, "archive-a")
        self.assertIsNotNone(seal)
        self.assertEqual(assess_publication_recovery(
            other, self.first_receipt, issuer=ISSUER, nonce=NONCE,
            witness_keys=self.witness_keys, archive_keys=self.archive_keys,
            publisher_keys=self.publisher_keys
        ), RecoveryGate.FORK_BLOCKED)

    def test_uncommitted_archive_transaction_is_unknown(self):
        self.archive.execute("BEGIN IMMEDIATE")
        try:
            self.assertEqual(self.assess(), RecoveryGate.UNKNOWN_BLOCKED)
        finally:
            self.archive.rollback()

    def test_all_states_block_execution(self):
        for state in RecoveryGate:
            self.assertFalse(recovery_permitted(state))
