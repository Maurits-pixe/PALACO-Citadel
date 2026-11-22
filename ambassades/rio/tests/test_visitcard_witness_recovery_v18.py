"""RIO v1.8 signed-head recovery integration tests on loopback only."""
import base64
from http.server import ThreadingHTTPServer
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_audit_journal import ZERO_HASH
from visitcard_witness_registry import PROPOSAL_DOMAIN,_canonical,initialize_witness,publish
from visitcard_witness_http import make_handler
from visitcard_witness_outbox import initialize_outbox,enqueue,outbox_status
from visitcard_recovery_claims import initialize_recovery_claims,claim_recovery,release_recovery
from visitcard_witness_receipt import WitnessTrust
from visitcard_witness_recovery_v18 import recover_once_verified,VerifiedRecoveryState
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat


class VerifiedRecoveryIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.outpath=str(Path(self.tmp.name)/"outbox.sqlite")
        self.witpath=str(Path(self.tmp.name)/"witness.sqlite")
        self.outbox=sqlite3.connect(self.outpath,isolation_level=None)
        self.addCleanup(self.outbox.close)
        initialize_outbox(self.outbox)
        initialize_recovery_claims(self.outbox)
        self.producer=Ed25519PrivateKey.generate()
        self.witness=Ed25519PrivateKey.generate()
        self.producers={"issuer.example":self.producer.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)}
        self.trust=WitnessTrust({"witness-1":self.witness.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)})
        with sqlite3.connect(self.witpath,isolation_level=None) as db:
            initialize_witness(db)
            # Genesis is pre-provisioned via a separate trusted ceremony.
            self.assertIsNotNone(publish(db,self.claim(1,"a"*64,ZERO_HASH),
                                         self.producers,self.witness,witness_id="witness-1"))
        self.server=ThreadingHTTPServer(("127.0.0.1",0),make_handler(self.witpath,self.producers,self.witness,"witness-1"))
        self.worker=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.worker.start()
        self.addCleanup(self.worker.join,2)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def claim(self,seq=2,head="b"*64,previous="a"*64):
        payload={"version":1,"issuer":"issuer.example","sequence":seq,
                 "entry_hash":head,"predecessor_hash":previous}
        signature=self.producer.sign(PROPOSAL_DOMAIN+_canonical(payload))
        return {"payload":payload,"signature":base64.urlsafe_b64encode(signature).rstrip(b"=").decode()}

    def recovery(self,seq=2,approved=True,trust=None,port=None):
        return recover_once_verified(self.outbox,"issuer.example",seq,
             self.trust if trust is None else trust,operator_approved=approved,
             port=self.server.server_port if port is None else port)

    def test_valid_next_publication(self):
        self.assertTrue(enqueue(self.outbox,self.claim()))
        self.assertEqual(self.recovery(),VerifiedRecoveryState.ACKNOWLEDGED)
        self.assertEqual(outbox_status(self.outbox,"issuer.example",2),"ACKNOWLEDGED")

    def test_replay_receipt_after_lost_response(self):
        self.assertTrue(enqueue(self.outbox,self.claim()))
        # Simulate witness commit, but no receipt recorded in local outbox.
        with sqlite3.connect(self.witpath,isolation_level=None) as db:
            self.assertIsNotNone(publish(db,self.claim(),self.producers,self.witness,witness_id="witness-1"))
        self.assertEqual(self.recovery(),VerifiedRecoveryState.ACKNOWLEDGED)

    def test_wrong_predecessor_rejected_without_publication(self):
        self.assertTrue(enqueue(self.outbox,self.claim(previous="f"*64)))
        self.assertEqual(self.recovery(),VerifiedRecoveryState.CONFLICT)
        with sqlite3.connect(self.witpath) as db:
            self.assertEqual(db.execute("SELECT sequence FROM witness_heads").fetchone()[0],1)

    def test_same_sequence_fork_rejected(self):
        self.assertTrue(enqueue(self.outbox,self.claim()))
        with sqlite3.connect(self.witpath,isolation_level=None) as db:
            other=self.claim(head="f"*64)
            self.assertIsNotNone(publish(db,other,self.producers,self.witness,witness_id="witness-1"))
        self.assertEqual(self.recovery(),VerifiedRecoveryState.CONFLICT)

    def test_missing_trusted_head_fails_closed(self):
        self.assertTrue(enqueue(self.outbox,self.claim()))
        bad=Ed25519PrivateKey.generate()
        wrong=WitnessTrust({"witness-1":bad.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)})
        self.assertEqual(self.recovery(trust=wrong),VerifiedRecoveryState.PENDING)
        self.assertEqual(outbox_status(self.outbox,"issuer.example",2),"PENDING")

    def test_unavailable_server_fails_closed(self):
        self.assertTrue(enqueue(self.outbox,self.claim()))
        self.server.shutdown()
        self.server.server_close()
        self.assertEqual(self.recovery(),VerifiedRecoveryState.PENDING)

    def test_no_operator_approval(self):
        self.assertTrue(enqueue(self.outbox,self.claim()))
        self.assertEqual(self.recovery(approved=False),VerifiedRecoveryState.UNKNOWN)

    def test_no_implicit_genesis(self):
        self.assertTrue(enqueue(self.outbox,self.claim(1,"a"*64,ZERO_HASH)))
        self.assertEqual(self.recovery(seq=1),VerifiedRecoveryState.UNKNOWN)

    def test_concurrent_claim_denies(self):
        self.assertTrue(enqueue(self.outbox,self.claim()))
        token=claim_recovery(self.outbox,"issuer.example",2)
        self.assertIsNotNone(token)
        self.assertEqual(self.recovery(),VerifiedRecoveryState.UNKNOWN)
        self.assertTrue(release_recovery(self.outbox,"issuer.example",2,token))

    def test_existing_ack_is_idempotent(self):
        self.assertTrue(enqueue(self.outbox,self.claim()))
        self.assertEqual(self.recovery(),VerifiedRecoveryState.ACKNOWLEDGED)
        self.assertEqual(self.recovery(),VerifiedRecoveryState.ACKNOWLEDGED)

    def test_outbox_remains_immutable_after_conflict(self):
        proposal=self.claim(previous="f"*64)
        self.assertTrue(enqueue(self.outbox,proposal))
        self.assertEqual(self.recovery(),VerifiedRecoveryState.CONFLICT)
        from visitcard_witness_outbox import pending_request
        self.assertEqual(pending_request(self.outbox,"issuer.example",2),proposal)

    def test_recovery_never_grants_authority(self):
        self.assertNotIn("AUTHORIZED",VerifiedRecoveryState.__members__)
