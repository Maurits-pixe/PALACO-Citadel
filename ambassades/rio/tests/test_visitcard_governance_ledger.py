"""RIO v3.4 governance lifecycle regression tests — signed ledger, DRAFT/HOLD."""
import base64
from pathlib import Path
from datetime import timedelta
import hashlib
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from visitcard_witness_enrollment import _canonical
from visitcard_governance_ledger import (
    DOMAIN,ZERO,initialize_governance_ledger,apply_governance_event,
    signer_is_current
)
from visitcard_dual_witness_verification import (
    verify_lifecycle_governed_chain,IntegratedState
)
from test_visitcard_governance_attestation import GovernedWitnessTests,NOW,ISSUER,pub,b64


class GovernanceLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_governance_ledger(self.db)
        self.root=Ed25519PrivateKey.generate()
        self.roots={"root":pub(self.root)}
        self.key=Ed25519PrivateKey.generate()
        self.fp=hashlib.sha256(pub(self.key)).hexdigest()

    def event(self,seq,kind,new,old=ZERO,prev=ZERO,signer="fresh-a",
              issuer=ISSUER,key=None,root_id="root",root=None):
        payload={
            "version":1,"issuer":issuer,"signer_id":signer,"sequence":seq,
            "kind":kind,"old_fingerprint":old,"fingerprint":new,
            "previous_event_sha256":prev
        }
        private=self.root if root is None else root
        sig=private.sign(DOMAIN+root_id.encode()+b"\x00"+_canonical(payload))
        return {"payload":payload,"authority_id":root_id,"signature":b64(sig)}

    def accept(self,event):
        return apply_governance_event(self.db,event,self.roots)

    def head(self,signer="fresh-a"):
        return self.db.execute(
            "SELECT sequence,fingerprint,revoked,event_sha256 FROM rio_governance_heads WHERE issuer=? AND signer_id=?",
            (ISSUER,signer)
        ).fetchone()

    def register(self):
        result=self.accept(self.event(1,"REGISTER",self.fp))
        self.assertTrue(result)

    def test_signed_registration_and_current_key(self):
        self.register()
        self.assertTrue(signer_is_current(self.db,ISSUER,"fresh-a",pub(self.key),self.roots))

    def test_missing_genesis_rejected(self):
        self.assertFalse(self.accept(self.event(2,"ROTATE",self.fp)))

    def test_wrong_root_rejected(self):
        self.assertFalse(apply_governance_event(self.db,self.event(1,"REGISTER",self.fp),{}))

    def test_idempotent_exact_replay(self):
        entry=self.event(1,"REGISTER",self.fp)
        self.assertTrue(self.accept(entry))
        self.assertTrue(self.accept(entry))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM rio_governance_events").fetchone()[0],1)

    def test_forged_same_sequence_rejected(self):
        self.register()
        other=hashlib.sha256(b"other").hexdigest()
        self.assertFalse(self.accept(self.event(1,"REGISTER",other)))

    def test_rotation_invalidates_old_fingerprint(self):
        self.register()
        new_key=Ed25519PrivateKey.generate()
        newfp=hashlib.sha256(pub(new_key)).hexdigest()
        seq,old,_,previous=self.head()
        self.assertTrue(self.accept(self.event(2,"ROTATE",newfp,old,previous)))
        self.assertFalse(signer_is_current(self.db,ISSUER,"fresh-a",pub(self.key),self.roots))
        self.assertTrue(signer_is_current(self.db,ISSUER,"fresh-a",pub(new_key),self.roots))

    def test_revocation_denies_current_key(self):
        self.register()
        seq,old,_,previous=self.head()
        self.assertTrue(self.accept(self.event(2,"REVOKE",old,old,previous)))
        self.assertFalse(signer_is_current(self.db,ISSUER,"fresh-a",pub(self.key),self.roots))

    def test_revocation_is_terminal(self):
        self.register()
        _,old,_,previous=self.head()
        self.assertTrue(self.accept(self.event(2,"REVOKE",old,old,previous)))
        self.assertFalse(self.accept(self.event(3,"ROTATE",hashlib.sha256(b"x").hexdigest(),old,self.head()[3])))

    def test_wrong_predecessor_rejected(self):
        self.register()
        self.assertFalse(self.accept(self.event(2,"REVOKE",self.fp,self.fp,"f"*64)))

    def test_skip_sequence_rejected(self):
        self.register()
        self.assertFalse(self.accept(self.event(3,"REVOKE",self.fp,self.fp,self.head()[3])))

    def test_same_fingerprint_rotation_rejected(self):
        self.register()
        self.assertFalse(self.accept(self.event(2,"ROTATE",self.fp,self.fp,self.head()[3])))

    def test_tampered_history_denies_current(self):
        self.register()
        self.db.execute("DROP TRIGGER rio_governance_events_no_update")
        self.db.execute("UPDATE rio_governance_events SET fingerprint=?",("f"*64,))
        self.assertFalse(signer_is_current(self.db,ISSUER,"fresh-a",pub(self.key),self.roots))

    def test_history_is_append_only_for_normal_sql(self):
        self.register()
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("DELETE FROM rio_governance_events")

    def test_no_open_transaction_verification(self):
        self.register()
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.assertFalse(signer_is_current(self.db,ISSUER,"fresh-a",pub(self.key),self.roots))
        finally:
            self.db.rollback()

    def test_corrupt_head_fails_closed(self):
        self.register()
        # Privileged tampering can disable SQLite triggers; audit must still fail.
        self.db.execute("DROP TRIGGER rio_governance_heads_monotone")
        self.db.execute("UPDATE rio_governance_heads SET fingerprint=?",("f"*64,))
        self.assertFalse(signer_is_current(self.db,ISSUER,"fresh-a",pub(self.key),self.roots))


class LifecycleIntegratedTests(GovernedWitnessTests):
    def setUp(self):
        super().setUp()
        self.registry=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.registry.close)
        initialize_governance_ledger(self.registry)
        self.lifecycle_root=Ed25519PrivateKey.generate()
        self.lifecycle_roots={"lifecycle":pub(self.lifecycle_root)}
        self.register("fresh-a",self.fixture.key_a)
        self.register("fresh-b",self.fixture.key_b)

    def command(self,signer,seq,kind,new,old=ZERO,prev=ZERO):
        p={"version":1,"issuer":ISSUER,"signer_id":signer,"sequence":seq,
           "kind":kind,"fingerprint":new,"old_fingerprint":old,
           "previous_event_sha256":prev}
        sig=self.lifecycle_root.sign(DOMAIN+b"lifecycle\x00"+_canonical(p))
        return {"payload":p,"authority_id":"lifecycle","signature":b64(sig)}

    def register(self,signer,key):
        fingerprint=hashlib.sha256(pub(key)).hexdigest()
        self.assertTrue(apply_governance_event(
            self.registry,self.command(signer,1,"REGISTER",fingerprint),self.lifecycle_roots
        ))

    def gate(self):
        f=self.fixture
        return verify_lifecycle_governed_chain(
            f.archive,self.registry,f.published,
            f.response_a(),f.challenge_a,f.response_b(),f.challenge_b,
            self.evidence_a,self.evidence_b,issuer=ISSUER,nonce=f.published["payload"]["nonce"],
            witness_keys=f.witness_keys,archive_keys=f.archive_keys,
            publisher_keys=f.publisher_keys,primary_signer_keys=f.keys_a,
            secondary_signer_keys=f.keys_b,
            primary_authorities=self.authorities_a,secondary_authorities=self.authorities_b,
            lifecycle_roots=self.lifecycle_roots,now=NOW
        )

    def test_current_signers_match_only_informational(self):
        self.assertEqual(self.gate(),IntegratedState.MATCHED_INFORMATIONAL)

    def test_revoked_secondary_blocks_chain(self):
        fp=hashlib.sha256(pub(self.fixture.key_b)).hexdigest()
        prev=self.registry.execute(
            "SELECT event_sha256 FROM rio_governance_heads WHERE signer_id='fresh-b'"
        ).fetchone()[0]
        event=self.command("fresh-b",2,"REVOKE",fp,fp,prev)
        self.assertTrue(apply_governance_event(self.registry,event,self.lifecycle_roots))
        self.assertEqual(self.gate(),IntegratedState.UNKNOWN_BLOCKED)

    def test_missing_secondary_registry_blocks_chain(self):
        # Simulate administrator-level tampering by removing the trigger.
        self.registry.execute("DROP TRIGGER rio_governance_heads_no_delete")
        self.registry.execute("DELETE FROM rio_governance_heads WHERE signer_id='fresh-b'")
        self.assertEqual(self.gate(),IntegratedState.UNKNOWN_BLOCKED)

    def test_rotated_primary_blocks_old_challenge_key(self):
        fp=hashlib.sha256(pub(self.fixture.key_a)).hexdigest()
        nextfp=hashlib.sha256(pub(Ed25519PrivateKey.generate())).hexdigest()
        prev=self.registry.execute(
            "SELECT event_sha256 FROM rio_governance_heads WHERE signer_id='fresh-a'"
        ).fetchone()[0]
        self.assertTrue(apply_governance_event(
            self.registry,self.command("fresh-a",2,"ROTATE",nextfp,fp,prev),self.lifecycle_roots
        ))
        self.assertEqual(self.gate(),IntegratedState.UNKNOWN_BLOCKED)
