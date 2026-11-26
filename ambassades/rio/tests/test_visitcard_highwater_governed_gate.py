"""RIO v3.6 end-to-end signed-high-water integration regression tests."""
from datetime import timedelta
from pathlib import Path
import copy
import hashlib
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from visitcard_governance_ledger import apply_governance_event
from visitcard_governance_highwater import (
    initialize_highwater_custodian, retain_governance_head,
)
from visitcard_highwater_governed_gate import (
    verify_highwater_governed_chain, IntegratedState, execution_permitted
)
from test_visitcard_governance_ledger import LifecycleIntegratedTests,NOW,ISSUER,pub


class HighwaterGovernedGateTests(unittest.TestCase):
    def setUp(self):
        self.fixture=LifecycleIntegratedTests("test_current_signers_match_only_informational")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.custodian=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.custodian.close)
        initialize_highwater_custodian(self.custodian)
        self.root_a=Ed25519PrivateKey.generate()
        self.root_b=Ed25519PrivateKey.generate()
        self.custodians_a={"custodian-a":pub(self.root_a)}
        self.custodians_b={"custodian-b":pub(self.root_b)}
        self.checkpoint_a=self.retain("fresh-a",self.root_a,"custodian-a")
        self.checkpoint_b=self.retain("fresh-b",self.root_b,"custodian-b")
        self.assertIsNotNone(self.checkpoint_a)
        self.assertIsNotNone(self.checkpoint_b)

    def retain(self,signer,key,key_id):
        f=self.fixture
        return retain_governance_head(
            self.custodian,f.registry,ISSUER,signer,
            f.lifecycle_roots,key,key_id
        )

    def check(self,**kw):
        f=self.fixture
        w=f.fixture
        return verify_highwater_governed_chain(
            kw.get("archive_db",w.archive),
            kw.get("governance_db",f.registry),
            kw.get("custodian_db",self.custodian),
            w.published,
            kw.get("response_a",w.response_a()),
            w.challenge_a,
            kw.get("response_b",w.response_b()),
            w.challenge_b,
            f.evidence_a,f.evidence_b,
            kw.get("checkpoint_a",self.checkpoint_a),
            kw.get("checkpoint_b",self.checkpoint_b),
            issuer=ISSUER,nonce=w.published["payload"]["nonce"],
            witness_keys=w.witness_keys,archive_keys=w.archive_keys,
            publisher_keys=w.publisher_keys,
            primary_signer_keys=w.keys_a,secondary_signer_keys=w.keys_b,
            primary_authorities=f.authorities_a,
            secondary_authorities=f.authorities_b,
            lifecycle_roots=f.lifecycle_roots,
            primary_custodians=kw.get("custodians_a",self.custodians_a),
            secondary_custodians=kw.get("custodians_b",self.custodians_b),
            now=kw.get("now",NOW),
        )

    def advance(self,signer,kind):
        f=self.fixture
        head=f.registry.execute(
            """SELECT sequence,fingerprint,event_sha256 FROM rio_governance_heads
               WHERE issuer=? AND signer_id=?""",
            (ISSUER,signer),
        ).fetchone()
        count,old,previous=head
        new=old if kind=="REVOKE" else hashlib.sha256(b"replacement-key").hexdigest()
        event=f.command(signer,count+1,kind,new,old,previous)
        self.assertTrue(apply_governance_event(f.registry,event,f.lifecycle_roots))
        return self.retain(
            signer,
            self.root_a if signer=="fresh-a" else self.root_b,
            "custodian-a" if signer=="fresh-a" else "custodian-b",
        )

    def snapshot(self):
        restored=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(restored.close)
        self.fixture.registry.backup(restored)
        return restored

    def test_matching_full_proof_is_informational_only(self):
        self.assertEqual(self.check(),IntegratedState.MATCHED_INFORMATIONAL)

    def test_no_evidence_state_authorizes_execution(self):
        for status in IntegratedState:
            self.assertFalse(execution_permitted(status))

    def test_missing_primary_checkpoint_fails_closed(self):
        self.assertEqual(self.check(checkpoint_a={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_missing_secondary_checkpoint_fails_closed(self):
        self.assertEqual(self.check(checkpoint_b={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_pinned_custodian_key_fails_closed(self):
        self.assertEqual(self.check(custodians_b={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_same_custodian_key_not_independent(self):
        self.assertEqual(self.check(
            custodians_b={"custodian-b":pub(self.root_a)}
        ),IntegratedState.UNKNOWN_BLOCKED)

    def test_tampered_checkpoint_signature_denied(self):
        tampered=copy.deepcopy(self.checkpoint_b)
        tampered["signature"]="A"*86
        self.assertEqual(self.check(checkpoint_b=tampered),IntegratedState.UNKNOWN_BLOCKED)

    def test_missing_custodian_history_denied(self):
        self.custodian.execute("DROP TRIGGER rio_governance_highwater_history_no_delete")
        self.custodian.execute(
            "DELETE FROM rio_governance_highwater_history WHERE signer_id='fresh-b'"
        )
        self.assertEqual(self.check(),IntegratedState.UNKNOWN_BLOCKED)

    def test_ahead_custodian_checkpoint_rejects_stale_input(self):
        old=self.checkpoint_b
        self.assertIsNotNone(self.advance("fresh-b","REVOKE"))
        self.assertEqual(self.check(checkpoint_b=old),IntegratedState.UNKNOWN_BLOCKED)

    def test_revoked_secondary_never_matches_even_latest(self):
        revoked=self.advance("fresh-b","REVOKE")
        self.assertIsNotNone(revoked)
        self.assertEqual(self.check(checkpoint_b=revoked),IntegratedState.UNKNOWN_BLOCKED)

    def test_restored_revoked_secondary_denied_with_new_checkpoint(self):
        older=self.snapshot()
        revoked=self.advance("fresh-b","REVOKE")
        self.assertIsNotNone(revoked)
        self.assertEqual(self.check(governance_db=older,checkpoint_b=revoked),
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_restored_rotated_primary_denied_with_new_checkpoint(self):
        older=self.snapshot()
        rotated=self.advance("fresh-a","ROTATE")
        self.assertIsNotNone(rotated)
        self.assertEqual(self.check(governance_db=older,checkpoint_a=rotated),
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_local_rotation_blocks_old_fresh_signer_key(self):
        rotated=self.advance("fresh-a","ROTATE")
        self.assertIsNotNone(rotated)
        self.assertEqual(self.check(checkpoint_a=rotated),IntegratedState.UNKNOWN_BLOCKED)

    def test_same_sqlite_connection_cannot_be_both_stores(self):
        self.assertEqual(self.check(custodian_db=self.fixture.registry),
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_pending_custodian_transaction_blocks_verification(self):
        self.custodian.execute("BEGIN IMMEDIATE")
        try:
            self.assertEqual(self.check(),IntegratedState.UNKNOWN_BLOCKED)
        finally:
            self.custodian.rollback()

    def test_missing_governance_ledger_denied(self):
        blank=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(blank.close)
        from visitcard_governance_ledger import initialize_governance_ledger
        initialize_governance_ledger(blank)
        self.assertEqual(self.check(governance_db=blank),IntegratedState.UNKNOWN_BLOCKED)
