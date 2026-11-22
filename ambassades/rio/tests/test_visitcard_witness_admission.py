"""RIO v2.0 admission ledger tests — evidence only, no automatic trust."""
import base64
from datetime import datetime,timedelta,timezone
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import ADMIN_DOMAIN,POSSESSION_DOMAIN,_canonical
from visitcard_witness_admission import (
    REVIEW_DOMAIN,initialize_admission,submit_admission,review_admission,audit_admission
)

NOW=datetime(2026,11,22,12,tzinfo=timezone.utc)

def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_admission(self.db)
        self.admin=Ed25519PrivateKey.generate()
        self.candidate=Ed25519PrivateKey.generate()
        self.reviewer=Ed25519PrivateKey.generate()
        pub=lambda k:k.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.authorities={"admin-01":pub(self.admin)}
        self.reviewers={"reviewer-01":pub(self.reviewer)}
        self.nonce=b64(b"a"*32)

    def envelope(self,nonce=None,witness_id="witness-new"):
        payload={"version":1,"issuer":"issuer.example","witness_id":witness_id,
                 "public_key":b64(self.candidate.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)),
                 "nonce":nonce or self.nonce,"requested_at":NOW.isoformat(),
                 "expires_at":(NOW+timedelta(minutes=5)).isoformat()}
        message=_canonical(payload)
        return {"payload":payload,"authority_id":"admin-01",
                "authority_signature":b64(self.admin.sign(ADMIN_DOMAIN+b"admin-01\x00"+message)),
                "candidate_signature":b64(self.candidate.sign(POSSESSION_DOMAIN+message))}

    def submit(self,envelope=None):
        return submit_admission(self.db,self.envelope() if envelope is None else envelope,
                                self.authorities,issuer="issuer.example",now=NOW)

    def review(self,decision="REVIEWED",reviewer="reviewer-01",key=None,digest=None):
        record=self.db.execute(
            "SELECT envelope_sha256 FROM rio_witness_admission WHERE issuer=? AND nonce=?",
            ("issuer.example",self.nonce)
        ).fetchone()
        payload={"version":1,"issuer":"issuer.example","nonce":self.nonce,
                 "envelope_sha256":digest or record[0],"reviewer_id":reviewer,
                 "decision":decision}
        sig=(key or self.reviewer).sign(REVIEW_DOMAIN+_canonical(payload))
        return {"payload":payload,"signature":b64(sig)}

    def test_intake_writes_pending_and_event(self):
        self.assertTrue(self.submit())
        self.assertTrue(audit_admission(self.db,"issuer.example",self.nonce))

    def test_nonce_replay_fails_closed(self):
        self.assertTrue(self.submit())
        self.assertFalse(self.submit())

    def test_same_nonce_different_candidate_rejected(self):
        self.assertTrue(self.submit())
        self.assertFalse(self.submit(self.envelope(witness_id="other")))

    def test_same_witness_id_second_pending_rejected(self):
        self.assertTrue(self.submit())
        self.assertFalse(self.submit(self.envelope(nonce=b64(b"b"*32))))

    def test_invalid_signature_not_recorded(self):
        val=self.envelope()
        val["candidate_signature"]=b64(b"0"*64)
        self.assertFalse(self.submit(val))
        self.assertEqual(self.db.execute("SELECT count(*) FROM rio_witness_admission").fetchone()[0],0)

    def test_reviewed_is_not_trusted_key_installation(self):
        self.assertTrue(self.submit())
        self.assertTrue(review_admission(self.db,self.review(),self.reviewers))
        self.assertTrue(audit_admission(self.db,"issuer.example",self.nonce))
        self.assertEqual(self.db.execute("SELECT status FROM rio_witness_admission").fetchone()[0],"REVIEWED")
        self.assertNotIn("witness-new",self.reviewers)

    def test_rejected_is_recorded(self):
        self.assertTrue(self.submit())
        self.assertTrue(review_admission(self.db,self.review("REJECTED"),self.reviewers))
        self.assertTrue(audit_admission(self.db,"issuer.example",self.nonce))

    def test_second_review_denied(self):
        self.assertTrue(self.submit())
        self.assertTrue(review_admission(self.db,self.review(),self.reviewers))
        self.assertFalse(review_admission(self.db,self.review(),self.reviewers))

    def test_unknown_reviewer_denied(self):
        self.assertTrue(self.submit())
        self.assertFalse(review_admission(self.db,self.review(reviewer="unknown"),self.reviewers))

    def test_wrong_reviewer_signature_denied(self):
        self.assertTrue(self.submit())
        self.assertFalse(review_admission(self.db,self.review(key=Ed25519PrivateKey.generate()),self.reviewers))

    def test_wrong_envelope_digest_denied(self):
        self.assertTrue(self.submit())
        self.assertFalse(review_admission(self.db,self.review(digest="f"*64),self.reviewers))

    def test_database_rows_not_deletable(self):
        self.assertTrue(self.submit())
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("DELETE FROM rio_witness_admission")
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("DELETE FROM rio_witness_admission_events")

    def test_audit_detects_missing_event(self):
        self.assertTrue(self.submit())
        self.db.execute("DROP TRIGGER rio_admission_event_no_delete")
        self.db.execute("DELETE FROM rio_witness_admission_events")
        self.assertFalse(audit_admission(self.db,"issuer.example",self.nonce))

    def test_no_authorization_tables_created(self):
        names={x[0] for x in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertNotIn("trusted_witness_keys",names)

    def test_review_without_intake_denied(self):
        payload={"version":1,"issuer":"issuer.example","nonce":self.nonce,
                 "envelope_sha256":"a"*64,"reviewer_id":"reviewer-01","decision":"REVIEWED"}
        raw=b64(self.reviewer.sign(REVIEW_DOMAIN+_canonical(payload)))
        self.assertFalse(review_admission(self.db,{"payload":payload,"signature":raw},self.reviewers))
