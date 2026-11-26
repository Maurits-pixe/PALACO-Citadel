"""RIO v2.2 independent custody ledger regression tests, offline only."""
import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from visitcard_admission_anchor import DOMAIN as ANCHOR_DOMAIN
from visitcard_witness_enrollment import _canonical
from visitcard_anchor_custody import initialize_custody, archive_anchor, verify_custody_receipt
from visitcard_admission_continuity import snapshot_digest, verify_continuity_proof

NOW = datetime(2026,11,22,12,tzinfo=timezone.utc)

def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


class AnchorCustodyTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_custody(self.db)
        self.producer = Ed25519PrivateKey.generate()
        self.custody = Ed25519PrivateKey.generate()
        pub = lambda key: key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        self.producer_keys = {"anchor-01": pub(self.producer)}
        self.custody_keys = {"custody-01": pub(self.custody)}
        self.issuer = "issuer.example"
        self.nonce = b64(b"n"*32)

    def anchor(self, count=1, digest="a"*64, *, key=None, nonce=None, when=None):
        payload = {"version":1,"issuer":self.issuer,"nonce":nonce or self.nonce,
                   "event_count":count,"events_sha256":digest,
                   "observed_at":(when or NOW).isoformat()}
        sig = (key or self.producer).sign(ANCHOR_DOMAIN + b"anchor-01\x00" + _canonical(payload))
        return {"payload":payload,"anchor_id":"anchor-01","signature":b64(sig)}

    def archive(self, envelope=None, nonce=None):
        return archive_anchor(self.db, self.anchor() if envelope is None else envelope,
                              self.producer_keys,self.custody,"custody-01",
                              expected_issuer=self.issuer,expected_nonce=nonce or self.nonce,now=NOW)

    def good_receipt(self, receipt, count=1, digest="a"*64):
        return verify_custody_receipt(receipt,self.custody_keys,
                       expected_issuer=self.issuer,expected_nonce=self.nonce,
                       expected_count=count,expected_hash=digest)

    def transition_evidence(self):
        """Real pair of hashes from a single shared audit-event prefix."""
        row=[self.issuer,self.nonce,"witness-new","a"*64,"intake-01","b"*64,
             "REVIEWED","reviewer-01","review-signature"]
        first=[1,self.issuer,self.nonce,"SUBMITTED","b"*64,None,None]
        second=[2,self.issuer,self.nonce,"REVIEWED","b"*64,"reviewer-01","review-signature"]
        proof={"version":1,"admission":row,"events":[first,second]}
        prior=list(row)
        prior[6:9]=["PENDING",None,None]
        return snapshot_digest(prior,[first]),snapshot_digest(row,[first,second]),proof

    def test_signed_initial_receipt(self):
        receipt = self.archive()
        self.assertIsNotNone(receipt)
        self.assertTrue(self.good_receipt(receipt))

    def test_duplicate_returns_exact_same_receipt(self):
        original = self.archive()
        self.assertEqual(self.archive(),original)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM rio_anchor_custody_history").fetchone()[0],1)

    def test_review_extension_advances_monotonically(self):
        previous_hash, final_hash, proof=self.transition_evidence()
        first=self.archive(self.anchor(1,previous_hash))
        second=archive_anchor(
            self.db,self.anchor(2,final_hash),self.producer_keys,
            self.custody,"custody-01",expected_issuer=self.issuer,
            expected_nonce=self.nonce,now=NOW,continuity_proof=proof)
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertTrue(self.good_receipt(second,2,final_hash))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM rio_anchor_custody_history").fetchone()[0],2)

    def test_different_hash_same_count_rejected(self):
        self.assertIsNotNone(self.archive())
        self.assertIsNone(self.archive(self.anchor(1,"f"*64)))

    def test_regression_after_advance_rejected(self):
        previous_hash, final_hash, proof=self.transition_evidence()
        self.assertIsNotNone(self.archive(self.anchor(1,previous_hash)))
        self.assertIsNotNone(archive_anchor(
            self.db,self.anchor(2,final_hash),self.producer_keys,self.custody,
            "custody-01",expected_issuer=self.issuer,expected_nonce=self.nonce,
            now=NOW,continuity_proof=proof))
        self.assertIsNone(self.archive(self.anchor(1,previous_hash)))

    def test_skipped_initial_stage_rejected(self):
        self.assertIsNone(self.archive(self.anchor(2,"b"*64)))

    def test_forged_producer_signature_rejected(self):
        self.assertIsNone(self.archive(self.anchor(key=Ed25519PrivateKey.generate())))

    def test_wrong_nonce_rejected(self):
        self.assertIsNone(self.archive(self.anchor(nonce=b64(b"x"*32))))

    def test_stale_anchor_rejected(self):
        self.assertIsNone(self.archive(self.anchor(when=NOW-timedelta(minutes=6))))

    def test_wrong_receipt_signing_key_fails(self):
        receipt=self.archive()
        other=Ed25519PrivateKey.generate()
        pub=other.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.assertFalse(verify_custody_receipt(receipt,{"custody-01":pub},
                            expected_issuer=self.issuer,expected_nonce=self.nonce,
                            expected_count=1,expected_hash="a"*64))

    def test_receipt_hash_binding(self):
        receipt=self.archive()
        self.assertFalse(self.good_receipt(receipt,1,"f"*64))

    def test_local_audit_history_immutable_for_normal_sql(self):
        self.archive()
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("DELETE FROM rio_anchor_custody_history")

    def test_uncommitted_transaction_fails_closed(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.assertIsNone(self.archive())
        finally:
            self.db.rollback()

    def test_receipt_survives_database_reopen(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as temporary:
            path=str(Path(temporary)/"custody.sqlite")
            with sqlite3.connect(path,isolation_level=None) as db:
                initialize_custody(db)
                receipt=archive_anchor(db,self.anchor(),self.producer_keys,self.custody,
                      "custody-01",expected_issuer=self.issuer,expected_nonce=self.nonce,now=NOW)
                self.assertIsNotNone(receipt)
            with sqlite3.connect(path,isolation_level=None) as reopened:
                saved=reopened.execute("SELECT receipt_json FROM rio_anchor_custody").fetchone()[0]
                import json
                self.assertEqual(json.loads(saved),receipt)

    def test_transition_without_proof_rejected(self):
        previous_hash, final_hash, proof=self.transition_evidence()
        self.assertIsNotNone(self.archive(self.anchor(1,previous_hash)))
        self.assertIsNone(self.archive(self.anchor(2,final_hash)))

    def test_transition_with_tampered_prefix_rejected(self):
        previous_hash, final_hash, proof=self.transition_evidence()
        self.assertIsNotNone(self.archive(self.anchor(1,previous_hash)))
        proof["events"][0][4]="f"*64
        self.assertIsNone(archive_anchor(
            self.db,self.anchor(2,final_hash),self.producer_keys,self.custody,
            "custody-01",expected_issuer=self.issuer,expected_nonce=self.nonce,
            now=NOW,continuity_proof=proof))

    def test_transition_with_wrong_prior_hash_rejected(self):
        previous_hash, final_hash, proof=self.transition_evidence()
        self.assertIsNotNone(self.archive(self.anchor(1,"f"*64)))
        self.assertIsNone(archive_anchor(
            self.db,self.anchor(2,final_hash),self.producer_keys,self.custody,
            "custody-01",expected_issuer=self.issuer,expected_nonce=self.nonce,
            now=NOW,continuity_proof=proof))

    def test_proof_rejects_rewritten_first_event(self):
        previous_hash, final_hash, proof=self.transition_evidence()
        proof["events"][0][3]="REVIEWED"
        self.assertFalse(verify_continuity_proof(
            proof,issuer=self.issuer,nonce=self.nonce,
            previous_hash=previous_hash,final_hash=final_hash))

    def test_no_trusted_key_installation(self):
        self.archive()
        names={row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertNotIn("trusted_witness_keys",names)
