"""RIO v3.5 independent signed governance head and revoked rollback tests."""
from pathlib import Path
import hashlib
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from visitcard_governance_ledger import (
    initialize_governance_ledger,apply_governance_event,ZERO
)
from visitcard_governance_highwater import (
    initialize_highwater_custodian,retain_governance_head,
    verify_governance_checkpoint,audit_highwater_custodian,
    compare_restored_governance,GovernanceRestore,execution_permitted
)
from test_visitcard_governance_ledger import GovernanceLifecycleTests,ISSUER,pub


class GovernanceHighwaterTests(unittest.TestCase):
    def setUp(self):
        self.fixture=GovernanceLifecycleTests("test_signed_registration_and_current_key")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.ledger=self.fixture.db
        self.high=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.high.close)
        initialize_highwater_custodian(self.high)
        self.custodian=Ed25519PrivateKey.generate()
        self.custodian_keys={"highwater":pub(self.custodian)}
        self.fixture.register()

    def store(self,db=None):
        return retain_governance_head(
            self.high,self.ledger if db is None else db,ISSUER,"fresh-a",
            self.fixture.roots,self.custodian,"highwater"
        )

    def revoke(self):
        _,old,_,prev=self.fixture.head()
        event=self.fixture.event(2,"REVOKE",old,old,prev)
        self.assertTrue(self.fixture.accept(event))

    def rotate(self):
        _,old,_,prev=self.fixture.head()
        new=hashlib.sha256(b"new").hexdigest()
        self.assertTrue(self.fixture.accept(self.fixture.event(2,"ROTATE",new,old,prev)))

    def compare(self,db,checkpoint):
        return compare_restored_governance(
            db,checkpoint,self.custodian_keys,self.fixture.roots,
            issuer=ISSUER,signer_id="fresh-a"
        )

    def old_snapshot(self):
        old=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(old.close)
        initialize_governance_ledger(old)
        row=self.ledger.execute(
            "SELECT * FROM rio_governance_events WHERE sequence=1"
        ).fetchone()
        head=self.ledger.execute(
            "SELECT * FROM rio_governance_heads WHERE issuer=? AND signer_id=?",
            (ISSUER,"fresh-a")
        ).fetchone()
        old.execute("INSERT INTO rio_governance_events VALUES (?,?,?,?,?,?,?,?)",row)
        # If the active ledger is already advanced, reconstruct stage-1 head.
        initial=(1,row[5],0,row[7])
        old.execute(
            "INSERT INTO rio_governance_heads VALUES (?,?,?,?,?,?)",
            (ISSUER,"fresh-a",*initial)
        )
        return old

    def test_signed_first_checkpoint(self):
        cp=self.store()
        self.assertIsNotNone(cp)
        self.assertEqual(verify_governance_checkpoint(
            cp,self.custodian_keys,issuer=ISSUER,signer_id="fresh-a"
        )[0],1)
        self.assertTrue(audit_highwater_custodian(
            self.high,ISSUER,"fresh-a",self.custodian_keys))

    def test_same_signed_head_idempotent(self):
        one=self.store()
        self.assertEqual(one,self.store())
        self.assertEqual(self.high.execute(
            "SELECT COUNT(*) FROM rio_governance_highwater_history"
        ).fetchone()[0],1)

    def test_revoked_head_checkpoint(self):
        self.assertIsNotNone(self.store())
        self.revoke()
        last=self.store()
        self.assertEqual(last["payload"]["revoked"],1)
        self.assertTrue(audit_highwater_custodian(
            self.high,ISSUER,"fresh-a",self.custodian_keys))

    def test_revoked_key_rollback_is_blocked(self):
        self.assertIsNotNone(self.store())
        self.revoke()
        confirmed=self.store()
        old=self.old_snapshot()
        self.assertEqual(self.compare(old,confirmed),GovernanceRestore.REVOKED_ROLLBACK_BLOCKED)

    def test_rotation_rollback_is_behind(self):
        self.assertIsNotNone(self.store())
        self.rotate()
        confirmed=self.store()
        self.assertEqual(self.compare(self.old_snapshot(),confirmed),
                         GovernanceRestore.LOCAL_BEHIND_BLOCKED)

    def test_matching_revoked_head_is_informational(self):
        self.store()
        self.revoke()
        confirmed=self.store()
        self.assertEqual(self.compare(self.ledger,confirmed),
                         GovernanceRestore.MATCHED_INFORMATIONAL)

    def test_untrusted_checkpoint_fails_closed(self):
        cp=self.store()
        self.assertEqual(compare_restored_governance(
            self.ledger,cp,{},self.fixture.roots,
            issuer=ISSUER,signer_id="fresh-a"
        ),GovernanceRestore.UNKNOWN_BLOCKED)

    def test_tampered_checkpoint_fails_closed(self):
        cp=self.store()
        cp["payload"]["revoked"]=1
        self.assertEqual(self.compare(self.ledger,cp),GovernanceRestore.UNKNOWN_BLOCKED)

    def test_cannot_bootstrap_at_second_sequence(self):
        self.revoke()
        self.assertIsNone(self.store())

    def test_same_count_different_source_denied(self):
        self.store()
        self.ledger.execute("DROP TRIGGER rio_governance_heads_monotone")
        self.ledger.execute(
            "UPDATE rio_governance_heads SET fingerprint=?",("f"*64,)
        )
        self.assertIsNone(self.store())

    def test_missing_highwater_history_blocks_advance(self):
        self.store()
        self.high.execute("DROP TRIGGER rio_governance_highwater_history_no_delete")
        self.high.execute("DELETE FROM rio_governance_highwater_history")
        self.revoke()
        self.assertIsNone(self.store())

    def test_two_connections_are_required(self):
        self.assertIsNone(retain_governance_head(
            self.ledger,self.ledger,ISSUER,"fresh-a",
            self.fixture.roots,self.custodian,"highwater"
        ))

    def test_unknown_local_ledger_is_blocked(self):
        cp=self.store()
        empty=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(empty.close)
        initialize_governance_ledger(empty)
        self.assertEqual(self.compare(empty,cp),GovernanceRestore.LOCAL_BEHIND_BLOCKED)

    def test_no_state_grants_execution(self):
        for status in GovernanceRestore:
            self.assertFalse(execution_permitted(status))
