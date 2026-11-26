"""RIO v1.7 freshness-bound head query and recovery classification tests."""
import base64
from datetime import datetime,timedelta,timezone
from http.server import ThreadingHTTPServer
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_audit_journal import ZERO_HASH
from visitcard_witness_registry import initialize_witness,publish,PROPOSAL_DOMAIN,_canonical
from visitcard_witness_http import make_handler
from visitcard_witness_head import new_challenge,sign_current_head,verify_current_head
from visitcard_witness_head_client import read_current_head,assess_current_head,HeadDecision
from visitcard_witness_receipt import WitnessTrust
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat


class CurrentHeadTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path=str(Path(self.tmp.name)/"witness.sqlite")
        self.producer=Ed25519PrivateKey.generate()
        self.witness=Ed25519PrivateKey.generate()
        self.producer_keys={"issuer.example":self.producer.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)}
        self.trust=WitnessTrust({"witness-1":self.witness.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)})
        with sqlite3.connect(self.path,isolation_level=None) as db:
            initialize_witness(db)
            self.assertIsNotNone(publish(db,self.proposal(),self.producer_keys,self.witness,witness_id="witness-1"))
        self.server=ThreadingHTTPServer(("127.0.0.1",0),make_handler(
            self.path,self.producer_keys,self.witness,"witness-1"))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.addCleanup(self.thread.join,2)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def proposal(self,sequence=1,head="a"*64,prev=ZERO_HASH):
        payload={"version":1,"issuer":"issuer.example","sequence":sequence,
                 "entry_hash":head,"predecessor_hash":prev}
        signature=self.producer.sign(PROPOSAL_DOMAIN+_canonical(payload))
        return {"payload":payload,"signature":base64.urlsafe_b64encode(signature).rstrip(b"=").decode()}

    def signed_head(self,challenge=None,now=None):
        with sqlite3.connect(self.path,isolation_level=None) as db:
            return sign_current_head(db,"issuer.example",challenge or new_challenge(),
                                     self.witness,"witness-1",now=now)

    def test_valid_head_signature(self):
        challenge=new_challenge()
        answer=self.signed_head(challenge)
        self.assertEqual(verify_current_head(answer,self.trust,issuer="issuer.example",challenge=challenge),
                         (1,"a"*64))

    def test_different_challenge_rejected(self):
        answer=self.signed_head()
        self.assertIsNone(verify_current_head(answer,self.trust,issuer="issuer.example",challenge=new_challenge()))

    def test_tampered_head_rejected(self):
        challenge=new_challenge()
        answer=self.signed_head(challenge)
        answer["payload"]["entry_hash"]="f"*64
        self.assertIsNone(verify_current_head(answer,self.trust,issuer="issuer.example",challenge=challenge))

    def test_wrong_issuer_rejected(self):
        challenge=new_challenge()
        self.assertIsNone(verify_current_head(self.signed_head(challenge),self.trust,
                                             issuer="other.example",challenge=challenge))

    def test_old_head_rejected(self):
        challenge=new_challenge()
        old=datetime.now(timezone.utc)-timedelta(minutes=5)
        answer=self.signed_head(challenge,now=old)
        self.assertIsNone(verify_current_head(answer,self.trust,issuer="issuer.example",challenge=challenge))

    def test_fresh_loopback_query(self):
        self.assertEqual(read_current_head(self.trust,issuer="issuer.example",
                                            port=self.server.server_port),(1,"a"*64))

    def test_wrong_witness_key_rejected(self):
        other=Ed25519PrivateKey.generate()
        trust=WitnessTrust({"witness-1":other.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)})
        self.assertIsNone(read_current_head(trust,issuer="issuer.example",port=self.server.server_port))

    def test_remote_host_rejected(self):
        self.assertIsNone(read_current_head(self.trust,issuer="issuer.example",host="example.com"))

    def test_matching_head_is_witnessed(self):
        self.assertEqual(assess_current_head(self.proposal(),(1,"a"*64)),HeadDecision.ALREADY_WITNESSED)

    def test_next_head_requires_matching_predecessor(self):
        self.assertEqual(assess_current_head(self.proposal(2,"b"*64,"a"*64),(1,"a"*64)),
                         HeadDecision.NEXT_PUBLICATION)
        self.assertEqual(assess_current_head(self.proposal(2,"b"*64,"f"*64),(1,"a"*64)),
                         HeadDecision.CONFLICT)

    def test_wrong_or_future_history_is_conflict(self):
        self.assertEqual(assess_current_head(self.proposal(),(2,"b"*64)),HeadDecision.CONFLICT)
        self.assertEqual(assess_current_head(self.proposal(),(1,"f"*64)),HeadDecision.CONFLICT)

    def test_missing_head_fails_closed(self):
        self.assertEqual(assess_current_head(self.proposal(),None),HeadDecision.UNKNOWN)

    def test_no_genesis_auto_approval(self):
        self.assertEqual(assess_current_head(self.proposal(),(0,ZERO_HASH)),HeadDecision.UNKNOWN)

    def test_head_attestation_is_not_access_grant(self):
        self.assertNotIn("AUTHORIZED",HeadDecision.__members__)
