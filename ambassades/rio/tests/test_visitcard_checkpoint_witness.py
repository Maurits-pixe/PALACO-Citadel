"""RIO v2.5 third-party checkpoint witness regression tests (offline only)."""
import json
from pathlib import Path
import sqlite3
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_admission_anchor import VerifiedAnchor
from visitcard_anchor_custody import _receipt
from visitcard_anchor_highwater import initialize_highwater,store_confirmed_receipt
from visitcard_checkpoint_witness import (
    initialize_checkpoint_witness,attest_checkpoint,
    verify_checkpoint,compare_checkpoint,CheckpointState,
    audit_checkpoint_history,compare_checkpoint_history
)

NOW=datetime(2026,11,22,12,tzinfo=timezone.utc)
ISSUER="issuer.example"
NONCE="nonce-test"


class CheckpointWitnessTests(unittest.TestCase):
    def setUp(self):
        self.third=sqlite3.connect(":memory:",isolation_level=None)
        self.high=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.third.close)
        self.addCleanup(self.high.close)
        initialize_checkpoint_witness(self.third)
        initialize_highwater(self.high)
        self.custody_key=Ed25519PrivateKey.generate()
        self.witness_key=Ed25519PrivateKey.generate()
        pub=lambda key:key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.custody_keys={"custody-a":pub(self.custody_key)}
        self.witness_keys={"third-a":pub(self.witness_key)}
        self.first=self.receipt(1,"a"*64)
        self.second=self.receipt(2,"b"*64)

    def receipt(self,count,digest):
        return _receipt(VerifiedAnchor(ISSUER,NONCE,count,digest,"producer-a"),
                        self.custody_key,"custody-a",NOW)

    def attest(self,receipt=None):
        return attest_checkpoint(
            self.third,self.first if receipt is None else receipt,
            self.custody_keys,self.witness_key,"third-a",now=NOW
        )

    def verify(self,checkpoint):
        return verify_checkpoint(checkpoint,self.witness_keys,issuer=ISSUER,nonce=NONCE)

    def state(self,checkpoint):
        return compare_checkpoint(self.high,checkpoint,self.witness_keys,issuer=ISSUER,nonce=NONCE)

    def test_first_signed_checkpoint(self):
        result=self.attest()
        self.assertIsNotNone(result)
        self.assertEqual(self.verify(result)[:2],(1,"a"*64))

    def test_identical_retry_reuses_exact_checkpoint(self):
        first=self.attest()
        self.assertEqual(self.attest(),first)
        self.assertEqual(self.third.execute(
            "SELECT count(*) FROM rio_checkpoint_witness_history").fetchone()[0],1)

    def test_two_steps_advance_monotonically(self):
        self.assertIsNotNone(self.attest())
        final=self.attest(self.second)
        self.assertIsNotNone(final)
        self.assertEqual(self.verify(final)[:2],(2,"b"*64))

    def test_fork_at_same_sequence_rejected(self):
        self.assertIsNotNone(self.attest())
        self.assertIsNone(self.attest(self.receipt(1,"f"*64)))

    def test_genesis_is_required(self):
        self.assertIsNone(self.attest(self.second))

    def test_old_receipt_after_new_checkpoint_rejected(self):
        self.attest()
        self.attest(self.second)
        self.assertIsNone(self.attest(self.first))

    def test_invalid_custody_signature_rejected(self):
        other=Ed25519PrivateKey.generate()
        forged=_receipt(VerifiedAnchor(ISSUER,NONCE,1,"a"*64,"producer"),
                        other,"custody-a",NOW)
        self.assertIsNone(self.attest(forged))

    def test_forged_checkpoint_signature_rejected(self):
        cp=self.attest()
        cp["payload"]["events_sha256"]="f"*64
        self.assertIsNone(self.verify(cp))

    def test_wrong_trust_anchor_rejected(self):
        cp=self.attest()
        other=Ed25519PrivateKey.generate()
        pub=other.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.assertIsNone(verify_checkpoint(cp,{"third-a":pub},
                         issuer=ISSUER,nonce=NONCE))

    def test_matching_independent_highwater(self):
        self.assertTrue(store_confirmed_receipt(self.high,self.first,self.custody_keys))
        cp=self.attest()
        self.assertEqual(self.state(cp),CheckpointState.MATCHED)

    def test_highwater_rollback_detected(self):
        self.assertTrue(store_confirmed_receipt(self.high,self.first,self.custody_keys))
        self.assertTrue(store_confirmed_receipt(self.high,self.second,self.custody_keys))
        self.assertIsNotNone(self.attest())
        cp=self.attest(self.second)
        # Restore a prior consistent state in a *different* highwater database.
        old=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(old.close)
        initialize_highwater(old)
        self.assertTrue(store_confirmed_receipt(old,self.first,self.custody_keys))
        result=compare_checkpoint(old,cp,self.witness_keys,issuer=ISSUER,nonce=NONCE)
        self.assertEqual(result,CheckpointState.BEHIND)

    def test_different_signed_hash_is_fork(self):
        self.assertTrue(store_confirmed_receipt(self.high,self.receipt(1,"f"*64),self.custody_keys))
        cp=self.attest(self.first)
        self.assertEqual(self.state(cp),CheckpointState.FORK)

    def test_missing_local_highwater_is_behind(self):
        cp=self.attest()
        self.assertEqual(self.state(cp),CheckpointState.BEHIND)

    def test_local_highwater_ahead_is_unconfirmed(self):
        self.assertTrue(store_confirmed_receipt(self.high,self.first,self.custody_keys))
        self.assertTrue(store_confirmed_receipt(self.high,self.second,self.custody_keys))
        cp=self.attest()
        self.assertEqual(self.state(cp),CheckpointState.AHEAD_UNCONFIRMED)

    def test_history_rows_cannot_be_deleted(self):
        self.attest()
        with self.assertRaises(sqlite3.DatabaseError):
            self.third.execute("DELETE FROM rio_checkpoint_witness_history")

    def test_full_history_valid_after_two_steps(self):
        self.assertIsNotNone(self.attest())
        self.assertIsNotNone(self.attest(self.second))
        self.assertTrue(audit_checkpoint_history(
            self.third,ISSUER,NONCE,self.witness_keys))

    def test_removed_history_entry_blocks_advancement(self):
        self.assertIsNotNone(self.attest())
        self.third.execute("DROP TRIGGER rio_checkpoint_history_no_delete")
        self.third.execute("DELETE FROM rio_checkpoint_witness_history")
        self.assertFalse(audit_checkpoint_history(
            self.third,ISSUER,NONCE,self.witness_keys))
        self.assertIsNone(self.attest(self.second))

    def test_forged_history_checkpoint_is_detected(self):
        self.assertIsNotNone(self.attest())
        self.third.execute("DROP TRIGGER rio_checkpoint_history_no_update")
        self.third.execute(
            "UPDATE rio_checkpoint_witness_history SET events_sha256=?",
            ("f"*64,)
        )
        self.assertFalse(audit_checkpoint_history(
            self.third,ISSUER,NONCE,self.witness_keys))
        self.assertIsNone(self.attest(self.second))

    def test_history_requires_independently_pinned_key(self):
        self.assertIsNotNone(self.attest())
        self.assertFalse(audit_checkpoint_history(
            self.third,ISSUER,NONCE,{}))

    def test_matching_external_checkpoint_history(self):
        external=self.attest()
        self.assertEqual(compare_checkpoint_history(
            self.third,external,self.witness_keys,issuer=ISSUER,nonce=NONCE
        ),CheckpointState.MATCHED)

    def test_external_head_detects_older_restored_witness(self):
        self.assertIsNotNone(self.attest())
        external=self.attest(self.second)
        old=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(old.close)
        initialize_checkpoint_witness(old)
        earlier=self.third.execute(
            "SELECT checkpoint_json FROM rio_checkpoint_witness_history WHERE event_count=1"
        ).fetchone()[0]
        previous=json.loads(earlier)
        payload=previous["payload"]
        old.execute(
            "INSERT INTO rio_checkpoint_witness_history VALUES (?,?,?,?,?,?)",
            (ISSUER,NONCE,1,payload["events_sha256"],payload["custody_receipt_sha256"],earlier)
        )
        old.execute(
            "INSERT INTO rio_checkpoint_witness VALUES (?,?,?,?,?,?)",
            (ISSUER,NONCE,1,payload["events_sha256"],payload["custody_receipt_sha256"],earlier)
        )
        self.assertEqual(compare_checkpoint_history(
            old,external,self.witness_keys,issuer=ISSUER,nonce=NONCE
        ),CheckpointState.BEHIND)

    def test_external_head_detects_same_count_fork(self):
        external=self.attest()
        other=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(other.close)
        initialize_checkpoint_witness(other)
        another_custody=self.receipt(1,"f"*64)
        forged_local=attest_checkpoint(
            other,another_custody,self.custody_keys,self.witness_key,"third-a",now=NOW
        )
        self.assertIsNotNone(forged_local)
        self.assertEqual(compare_checkpoint_history(
            other,external,self.witness_keys,issuer=ISSUER,nonce=NONCE
        ),CheckpointState.FORK)

    def test_tampered_external_checkpoint_is_unknown(self):
        external=self.attest()
        external["payload"]["events_sha256"]="f"*64
        self.assertEqual(compare_checkpoint_history(
            self.third,external,self.witness_keys,issuer=ISSUER,nonce=NONCE
        ),CheckpointState.UNKNOWN)

    def test_no_trust_issuance_or_authority(self):
        self.assertNotIn("AUTHORIZED",CheckpointState.__members__)
        self.assertNotIn("trusted_witness_keys",{
            x[0] for x in self.third.execute("SELECT name FROM sqlite_master WHERE type='table'")
        })


if __name__=="__main__":
    unittest.main()
