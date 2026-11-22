"""RIO v3.0 signed fresh-head regression tests — isolated SQLite prototype."""
from datetime import datetime,timedelta,timezone
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_archive_publication import DOMAIN as PUBLICATION_DOMAIN
from visitcard_witness_enrollment import _canonical
from visitcard_fresh_publication_head import (
    initialize_fresh_head,retain_published_head,attest_fresh_head,
    verify_fresh_head,challenge,audit_fresh_head,classify_fresh_recovery,
    execution_permitted,FreshnessStatus
)
import base64

NOW=datetime(2026,11,22,12,tzinfo=timezone.utc)
ISSUER="issuer.example"
NONCE="nonce-test"

def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class FreshHeadTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_fresh_head(self.db)
        self.publisher=Ed25519PrivateKey.generate()
        self.signer=Ed25519PrivateKey.generate()
        pub=lambda k:k.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.publishers={"publisher-a":pub(self.publisher)}
        self.signers={"fresh-a":pub(self.signer)}
        self.challenge=b64(b"c"*32)
        self.first=self.receipt(1,"a"*64,"0"*64)
        self.second=self.receipt(2,"b"*64,"a"*64)

    def receipt(self,count,digest,previous):
        payload={"version":1,"issuer":ISSUER,"nonce":NONCE,
                 "event_count":count,"seal_sha256":digest,
                 "previous_seal_sha256":previous}
        signature=self.publisher.sign(PUBLICATION_DOMAIN+b"publisher-a\x00"+_canonical(payload))
        return {"payload":payload,"publisher_id":"publisher-a","signature":b64(signature)}

    def retain(self,receipt=None):
        return retain_published_head(self.db,self.first if receipt is None else receipt,self.publishers)

    def attest(self,**kwargs):
        return attest_fresh_head(
            self.db,ISSUER,NONCE,kwargs.get("challenge",self.challenge),
            self.publishers,self.signer,"fresh-a",now=kwargs.get("now",NOW)
        )

    def verify(self,response,**kwargs):
        return verify_fresh_head(
            response,self.signers,issuer=ISSUER,nonce=NONCE,
            expected_challenge=kwargs.get("challenge",self.challenge),
            now=kwargs.get("now",NOW)
        )

    def test_first_signed_head(self):
        self.assertTrue(self.retain())
        self.assertEqual(self.verify(self.attest()),(1,"a"*64))

    def test_second_monotone_head(self):
        self.assertTrue(self.retain())
        self.assertTrue(self.retain(self.second))
        self.assertEqual(self.verify(self.attest()),(2,"b"*64))

    def test_identical_receipt_idempotent(self):
        self.assertTrue(self.retain())
        self.assertTrue(self.retain())
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM rio_fresh_publication_history").fetchone()[0],1)

    def test_count_two_cannot_bootstrap(self):
        self.assertFalse(self.retain(self.second))

    def test_same_sequence_fork_rejected(self):
        self.assertTrue(self.retain())
        self.assertFalse(self.retain(self.receipt(1,"f"*64,"0"*64)))

    def test_nonzero_genesis_predecessor_rejected(self):
        self.assertFalse(self.retain(self.receipt(1,"a"*64,"f"*64)))

    def test_audit_detects_signed_but_broken_history_link(self):
        self.assertTrue(self.retain())
        self.assertTrue(self.retain(self.second))
        self.db.execute("DROP TRIGGER rio_fresh_history_immutable_update")
        # A forged second receipt is signed by the test publisher but does
        # not extend the first published seal.
        import json
        bogus=self.receipt(2,"b"*64,"f"*64)
        self.db.execute(
            "UPDATE rio_fresh_publication_history SET receipt_json=? WHERE event_count=2",
            (json.dumps(bogus,sort_keys=True,separators=(",",":")),)
        )
        self.assertFalse(audit_fresh_head(self.db,ISSUER,NONCE,self.publishers))
        self.assertIsNone(self.attest())

    def test_wrong_predecessor_rejected(self):
        self.assertTrue(self.retain())
        self.assertFalse(self.retain(self.receipt(2,"b"*64,"f"*64)))

    def test_rollback_rejected(self):
        self.assertTrue(self.retain())
        self.assertTrue(self.retain(self.second))
        self.assertFalse(self.retain(self.first))

    def test_forged_publisher_key_rejected(self):
        self.assertFalse(retain_published_head(self.db,self.first,{}))

    def test_fresh_response_has_challenge(self):
        self.assertTrue(self.retain())
        reply=self.attest()
        self.assertEqual(reply["payload"]["challenge"],self.challenge)

    def test_reused_response_wrong_challenge_rejected(self):
        self.assertTrue(self.retain())
        reply=self.attest()
        self.assertIsNone(self.verify(reply,challenge=b64(b"d"*32)))

    def test_expired_response_rejected(self):
        self.assertTrue(self.retain())
        self.assertIsNone(self.verify(self.attest(),now=NOW+timedelta(seconds=61)))

    def test_future_response_rejected(self):
        self.assertTrue(self.retain())
        self.assertIsNone(self.verify(self.attest(),now=NOW-timedelta(seconds=1)))

    def test_unknown_fresh_signer_rejected(self):
        self.assertTrue(self.retain())
        reply=self.attest()
        self.assertIsNone(verify_fresh_head(
            reply,{},issuer=ISSUER,nonce=NONCE,
            expected_challenge=self.challenge,now=NOW
        ))

    def test_tampered_response_rejected(self):
        self.assertTrue(self.retain())
        reply=self.attest()
        reply["payload"]["seal_sha256"]="f"*64
        self.assertIsNone(self.verify(reply))

    def test_missing_history_blocks_attestation(self):
        self.assertTrue(self.retain())
        self.db.execute("DROP TRIGGER rio_fresh_history_immutable_delete")
        self.db.execute("DELETE FROM rio_fresh_publication_history")
        self.assertFalse(audit_fresh_head(self.db,ISSUER,NONCE,self.publishers))
        self.assertIsNone(self.attest())

    def test_missing_genesis_blocks_attestation(self):
        self.assertIsNone(self.attest())

    def test_archive_behind_status(self):
        self.assertEqual(classify_fresh_recovery((2,"b"*64),1,"a"*64),
                         FreshnessStatus.LOCAL_BEHIND_BLOCKED)

    def test_ahead_status(self):
        self.assertEqual(classify_fresh_recovery((1,"a"*64),2,"b"*64),
                         FreshnessStatus.LOCAL_AHEAD_UNCONFIRMED)

    def test_fork_status(self):
        self.assertEqual(classify_fresh_recovery((1,"a"*64),1,"f"*64),
                         FreshnessStatus.FORK_BLOCKED)

    def test_match_informational_only(self):
        status=classify_fresh_recovery((1,"a"*64),1,"a"*64)
        self.assertEqual(status,FreshnessStatus.MATCHED_INFORMATIONAL)
        self.assertFalse(execution_permitted(status))

    def test_all_states_non_authorizing(self):
        for status in FreshnessStatus:
            self.assertFalse(execution_permitted(status))

    def test_missing_signed_head_unknown(self):
        self.assertEqual(classify_fresh_recovery(None,1,"a"*64),
                         FreshnessStatus.UNKNOWN_BLOCKED)

    def test_random_challenges_have_correct_size(self):
        self.assertEqual(len(base64.urlsafe_b64decode(challenge()+"==")),32)
        self.assertNotEqual(challenge(),challenge())
