"""RIO v2.1 cryptographic anchor and local audit comparison tests."""
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
from visitcard_witness_admission import REVIEW_DOMAIN,initialize_admission,submit_admission,review_admission
from visitcard_admission_anchor import (
    sign_admission_anchor,verify_admission_anchor,matches_admission_anchor
)

NOW=datetime(2026,11,22,12,tzinfo=timezone.utc)
def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class AnchorTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_admission(self.db)
        self.admin=Ed25519PrivateKey.generate()
        self.candidate=Ed25519PrivateKey.generate()
        self.reviewer=Ed25519PrivateKey.generate()
        self.anchor_key=Ed25519PrivateKey.generate()
        pub=lambda k:k.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.anchors={"anchor-a":pub(self.anchor_key)}
        payload={"version":1,"issuer":"issuer.example","witness_id":"candidate-01",
                 "public_key":b64(pub(self.candidate)),"nonce":b64(b"n"*32),
                 "requested_at":NOW.isoformat(),"expires_at":(NOW+timedelta(minutes=5)).isoformat()}
        canon=_canonical(payload)
        envelope={"payload":payload,"authority_id":"intake-01",
                  "authority_signature":b64(self.admin.sign(ADMIN_DOMAIN+b"intake-01\x00"+canon)),
                  "candidate_signature":b64(self.candidate.sign(POSSESSION_DOMAIN+canon))}
        self.issuer=payload["issuer"]
        self.nonce=payload["nonce"]
        self.assertTrue(submit_admission(self.db,envelope,{"intake-01":pub(self.admin)},issuer=self.issuer,now=NOW))

    def anchor(self,**kwargs):
        return sign_admission_anchor(self.db,self.issuer,self.nonce,
                                     self.anchor_key,"anchor-a",now=kwargs.get("now",NOW))

    def verified(self,envelope=None,**kwargs):
        return verify_admission_anchor(self.anchor() if envelope is None else envelope,
                self.anchors,expected_issuer=kwargs.get("issuer",self.issuer),
                expected_nonce=kwargs.get("nonce",self.nonce),now=kwargs.get("now",NOW))

    def finish_review(self):
        digest=self.db.execute("SELECT envelope_sha256 FROM rio_witness_admission").fetchone()[0]
        payload={"version":1,"issuer":self.issuer,"nonce":self.nonce,
                 "envelope_sha256":digest,"reviewer_id":"reviewer-01","decision":"REVIEWED"}
        envelope={"payload":payload,"signature":b64(self.reviewer.sign(REVIEW_DOMAIN+_canonical(payload)))}
        pub=self.reviewer.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.assertTrue(review_admission(self.db,envelope,{"reviewer-01":pub}))

    def test_pending_anchor_is_verified(self):
        anchor=self.verified()
        self.assertEqual(anchor.event_count,1)
        self.assertTrue(matches_admission_anchor(self.db,anchor))

    def test_reviewed_anchor_includes_second_event(self):
        self.finish_review()
        anchor=self.verified()
        self.assertEqual(anchor.event_count,2)
        self.assertTrue(matches_admission_anchor(self.db,anchor))

    def test_pending_anchor_does_not_match_reviewed_state(self):
        earlier=self.verified()
        self.finish_review()
        self.assertFalse(matches_admission_anchor(self.db,earlier))

    def test_tampered_hash_signature_rejected(self):
        data=self.anchor()
        data["payload"]["events_sha256"]="f"*64
        self.assertIsNone(self.verified(data))

    def test_wrong_anchor_key_rejected(self):
        data=self.anchor()
        other=Ed25519PrivateKey.generate()
        pub=other.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.assertIsNone(verify_admission_anchor(data,{"anchor-a":pub},
                      expected_issuer=self.issuer,expected_nonce=self.nonce,now=NOW))

    def test_unknown_anchor_id_rejected(self):
        data=self.anchor()
        data["anchor_id"]="unknown"
        self.assertIsNone(self.verified(data))

    def test_wrong_issuer_rejected(self):
        self.assertIsNone(self.verified(issuer="other.example"))

    def test_wrong_nonce_rejected(self):
        self.assertIsNone(self.verified(nonce=b64(b"x"*32)))

    def test_expired_anchor_rejected(self):
        self.assertIsNone(self.verified(now=NOW+timedelta(minutes=6)))

    def test_future_anchor_rejected(self):
        self.assertIsNone(self.verified(now=NOW-timedelta(seconds=1)))

    def test_missing_audit_event_fails_closed(self):
        anchor=self.verified()
        self.db.execute("DROP TRIGGER rio_admission_event_no_delete")
        self.db.execute("DELETE FROM rio_witness_admission_events")
        self.assertFalse(matches_admission_anchor(self.db,anchor))

    def test_local_database_change_is_detected(self):
        anchor=self.verified()
        self.db.execute("DROP TRIGGER rio_admission_immutable")
        self.db.execute("UPDATE rio_witness_admission SET public_key_hex=?",("f"*64,))
        self.assertFalse(matches_admission_anchor(self.db,anchor))

    def test_no_key_activation_capability(self):
        anchor=self.verified()
        self.assertFalse(hasattr(anchor,"authorized"))
        tables={x[0] for x in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertNotIn("trusted_witness_keys",tables)
