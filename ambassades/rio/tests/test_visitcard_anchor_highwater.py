"""RIO v2.4 high-water restore regression tests. Independent SQLite handles."""
import json
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_anchor_custody import _receipt,initialize_custody,_packed
from visitcard_admission_anchor import VerifiedAnchor
from visitcard_anchor_highwater import (
    RestoreState,initialize_highwater,store_confirmed_receipt,
    compare_restored_custody,audit_highwater
)
from datetime import datetime,timezone

NOW=datetime(2026,11,22,12,tzinfo=timezone.utc)
ISSUER="issuer.example"
NONCE="nonce-test"


class HighwaterTests(unittest.TestCase):
    def setUp(self):
        self.custody=sqlite3.connect(":memory:",isolation_level=None)
        self.high=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.custody.close)
        self.addCleanup(self.high.close)
        initialize_custody(self.custody)
        initialize_highwater(self.high)
        self.key=Ed25519PrivateKey.generate()
        self.keys={"custody-a":self.key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)}
        self.first=self.receipt(1,"a"*64)
        self.second=self.receipt(2,"b"*64)

    def receipt(self,count,digest):
        anchor=VerifiedAnchor(ISSUER,NONCE,count,digest,"producer-a")
        return _receipt(anchor,self.key,"custody-a",NOW)

    def local(self,receipt):
        p=receipt["payload"]
        self.custody.execute(
            """INSERT INTO rio_anchor_custody
               (issuer,nonce,event_count,events_sha256,anchor_id,anchor_json,receipt_json)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(issuer,nonce) DO UPDATE SET
               event_count=excluded.event_count,events_sha256=excluded.events_sha256,
               receipt_json=excluded.receipt_json""",
            (ISSUER,NONCE,p["event_count"],p["events_sha256"],
             "producer-a","{}",_packed(receipt)),
        )

    def store(self,receipt):
        return store_confirmed_receipt(self.high,receipt,self.keys)

    def state(self):
        return compare_restored_custody(self.custody,self.high,ISSUER,NONCE,self.keys)

    def test_genesis_receipt_accepted(self):
        self.assertTrue(self.store(self.first))
        self.assertTrue(audit_highwater(self.high,ISSUER,NONCE,self.keys))

    def test_identical_retry_idempotent(self):
        self.assertTrue(self.store(self.first))
        self.assertTrue(self.store(self.first))
        self.assertEqual(self.high.execute("SELECT count(*) FROM rio_anchor_highwater_history").fetchone()[0],1)

    def test_matching_custody_is_verified(self):
        self.assertTrue(self.store(self.first))
        self.local(self.first)
        self.assertEqual(self.state(),RestoreState.MATCHED)

    def test_missing_custody_detects_restore_loss(self):
        self.assertTrue(self.store(self.first))
        self.assertEqual(self.state(),RestoreState.CUSTODY_BEHIND)

    def test_restored_older_custody_detected(self):
        self.assertTrue(self.store(self.first))
        self.assertTrue(self.store(self.second))
        self.local(self.first)
        self.assertEqual(self.state(),RestoreState.CUSTODY_BEHIND)

    def test_custody_ahead_is_not_trusted(self):
        self.assertTrue(self.store(self.first))
        self.local(self.second)
        self.assertEqual(self.state(),RestoreState.CUSTODY_AHEAD_UNCONFIRMED)

    def test_same_sequence_fork_is_rejected(self):
        self.assertTrue(self.store(self.first))
        self.assertFalse(self.store(self.receipt(1,"f"*64)))

    def test_skipped_genesis_rejected(self):
        self.assertFalse(self.store(self.second))

    def test_regression_after_advance_rejected(self):
        self.assertTrue(self.store(self.first))
        self.assertTrue(self.store(self.second))
        self.assertFalse(self.store(self.first))

    def test_forged_custody_key_rejected(self):
        other=Ed25519PrivateKey.generate()
        signed=_receipt(VerifiedAnchor(ISSUER,NONCE,1,"a"*64,"producer"),
                        other,"custody-a",NOW)
        self.assertFalse(self.store(signed))

    def test_corrupted_highwater_history_fails_closed(self):
        self.assertTrue(self.store(self.first))
        self.high.execute("DROP TRIGGER rio_highwater_history_no_delete")
        self.high.execute("DELETE FROM rio_anchor_highwater_history")
        self.assertFalse(audit_highwater(self.high,ISSUER,NONCE,self.keys))
        self.local(self.first)
        self.assertEqual(self.state(),RestoreState.UNKNOWN)
        self.assertFalse(self.store(self.second))

    def test_unverified_custody_head_is_unknown(self):
        self.assertTrue(self.store(self.first))
        forged=_receipt(VerifiedAnchor(ISSUER,NONCE,1,"a"*64,"producer"),
                        Ed25519PrivateKey.generate(),"custody-a",NOW)
        self.local(forged)
        self.assertEqual(self.state(),RestoreState.UNKNOWN)

    def test_highwater_history_rows_immutable(self):
        self.assertTrue(self.store(self.first))
        with self.assertRaises(sqlite3.DatabaseError):
            self.high.execute("DELETE FROM rio_anchor_highwater_history")
        with self.assertRaises(sqlite3.DatabaseError):
            self.high.execute("UPDATE rio_anchor_highwater_history SET events_sha256=?",("f"*64,))

    def test_database_handles_must_be_separate(self):
        self.assertTrue(self.store(self.first))
        self.assertEqual(compare_restored_custody(
            self.high,self.high,ISSUER,NONCE,self.keys),RestoreState.UNKNOWN)

    def test_missing_trust_key_fails_closed(self):
        self.assertFalse(store_confirmed_receipt(self.high,self.first,{}))
        self.assertFalse(audit_highwater(self.high,ISSUER,NONCE,{}))

    def test_uncommitted_highwater_transaction_fails_closed(self):
        self.high.execute("BEGIN IMMEDIATE")
        try:
            self.assertFalse(self.store(self.first))
        finally:
            self.high.rollback()

    def test_no_authorization_status(self):
        self.assertNotIn("AUTHORIZED",RestoreState.__members__)
