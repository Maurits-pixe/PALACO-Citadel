"""RIO v4.9 pending session replay recovery tests — DRAFT/HOLD."""
import copy
import hashlib
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_witness_enrollment import _canonical
from visitcard_shared_replay_cas import GENESIS,read_shared_head
from visitcard_pending_recovery import (
    PendingState,inspect_pending_session,resume_signed_acknowledgement,
    execution_permitted,
)
from test_visitcard_shared_replay_cas import SharedReplayCASTests,b64


class PendingRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.f=SharedReplayCASTests("test_first_cas_creates_pending_receipt_not_authority")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.pending=self.f.reserve()
        self.path=self.f.one.execute("PRAGMA database_list").fetchone()[2]
        self.expect={
            "independently_pinned_acknowledged_head_sha256":GENESIS,
            "expected_sequence":self.pending.sequence,
            "expected_challenge":self.f.challenge,
            "expected_checkpoint_sha256":self.f.checkpoint,
            "expected_pending_head_sha256":self.pending.head_sha256,
        }

    def inspect(self,db=None,**changes):
        expected=dict(self.expect)
        expected.update(changes)
        return inspect_pending_session(self.f.two if db is None else db,**expected)

    def resume(self,db=None,receipt=None,pin=None,roots=None,**changes):
        expected=dict(self.expect)
        expected.update(changes)
        note=self.f.receipt(self.pending.sequence,self.pending.head_sha256) if receipt is None else receipt
        return resume_signed_acknowledgement(
            self.f.two if db is None else db,**expected,
            signed_receipt=note,
            pinned_custodians=self.f.roots if roots is None else roots,
            independently_pinned_receipt_sha256=(
                hashlib.sha256(_canonical(note)).hexdigest() if pin is None else pin
            ),
        )

    def test_pending_detected_read_only(self):
        result=self.inspect()
        self.assertEqual(result.state,PendingState.PENDING_EXTERNAL_ACK)
        self.assertEqual(result.sequence,1)
        self.assertEqual(read_shared_head(self.f.one)[2],0)

    def test_process_restart_finds_same_pending(self):
        restarted=sqlite3.connect(self.path,isolation_level=None)
        self.addCleanup(restarted.close)
        self.assertEqual(self.inspect(db=restarted).state,PendingState.PENDING_EXTERNAL_ACK)

    def test_restart_does_not_reregister_challenge(self):
        restarted=sqlite3.connect(self.path,isolation_level=None)
        self.addCleanup(restarted.close)
        self.inspect(db=restarted)
        self.inspect(db=restarted)
        self.assertEqual(read_shared_head(restarted)[0],1)

    def test_signed_receipt_resolves_pending(self):
        result=self.resume()
        self.assertEqual(result.state,PendingState.ACKNOWLEDGED_INFORMATIONAL)
        self.assertEqual(read_shared_head(self.f.two)[2],1)
        self.assertFalse(result.release_permitted)

    def test_acknowledged_restart_requires_updated_independent_ack_pin(self):
        self.resume()
        self.assertEqual(self.inspect().state,PendingState.BLOCKED)
        self.assertEqual(self.inspect(
            independently_pinned_acknowledged_head_sha256=self.pending.head_sha256
        ).state,PendingState.ACKNOWLEDGED_INFORMATIONAL)

    def test_repeated_identical_receipt_after_pin_update_is_idempotent(self):
        self.assertEqual(self.resume().state,PendingState.ACKNOWLEDGED_INFORMATIONAL)
        self.assertEqual(self.resume(
            independently_pinned_acknowledged_head_sha256=self.pending.head_sha256
        ).state,PendingState.ACKNOWLEDGED_INFORMATIONAL)
        self.assertEqual(read_shared_head(self.f.one)[0],1)

    def test_unsigned_ack_never_resolves_pending(self):
        self.assertEqual(self.resume(receipt={}).state,PendingState.BLOCKED)
        self.assertEqual(read_shared_head(self.f.one)[2],0)

    def test_wrong_receipt_pin_does_not_resolve(self):
        self.assertEqual(self.resume(pin="f"*64).state,PendingState.BLOCKED)
        self.assertEqual(read_shared_head(self.f.one)[2],0)

    def test_unknown_custodian_does_not_resolve(self):
        self.assertEqual(self.resume(roots={}).state,PendingState.BLOCKED)

    def test_forged_signature_does_not_resolve(self):
        changed=self.f.receipt(self.pending.sequence,self.pending.head_sha256)
        changed["signature"]="A"*86
        self.assertEqual(self.resume(receipt=changed).state,PendingState.BLOCKED)

    def test_wrong_pending_checkpoint_blocks(self):
        self.assertEqual(self.inspect(expected_checkpoint_sha256="b"*64).state,
                         PendingState.BLOCKED)

    def test_wrong_pending_challenge_blocks(self):
        self.assertEqual(self.inspect(expected_challenge=b64(bytes(range(32,64)))).state,
                         PendingState.BLOCKED)

    def test_wrong_sequence_blocks(self):
        self.assertEqual(self.inspect(expected_sequence=2).state,PendingState.BLOCKED)

    def test_wrong_pending_head_blocks(self):
        self.assertEqual(self.inspect(expected_pending_head_sha256="f"*64).state,
                         PendingState.BLOCKED)

    def test_wrong_independent_ack_head_blocks(self):
        self.assertEqual(self.inspect(
            independently_pinned_acknowledged_head_sha256="f"*64
        ).state,PendingState.BLOCKED)

    def test_missing_external_expectations_block(self):
        self.assertEqual(self.inspect(
            independently_pinned_acknowledged_head_sha256=""
        ).state,PendingState.BLOCKED)

    def test_corrupt_event_blocks_recovery(self):
        self.f.one.execute("DROP TRIGGER rio_shared_no_update")
        self.f.one.execute(
            "UPDATE rio_shared_replay_events SET checkpoint_sha256=? WHERE sequence=1",
            ("b"*64,),
        )
        self.assertEqual(self.inspect().state,PendingState.BLOCKED)

    def test_lost_event_blocks_recovery(self):
        self.f.one.execute("DROP TRIGGER rio_shared_no_delete")
        self.f.one.execute("DELETE FROM rio_shared_replay_events")
        self.assertEqual(self.inspect().state,PendingState.BLOCKED)

    def test_open_transaction_blocks_inspection(self):
        self.f.two.execute("BEGIN")
        try:
            self.assertEqual(self.inspect().state,PendingState.BLOCKED)
        finally:
            self.f.two.rollback()

    def test_no_receipt_does_not_autocomplete_after_restart(self):
        restarted=sqlite3.connect(self.path,isolation_level=None)
        self.addCleanup(restarted.close)
        self.assertEqual(self.inspect(db=restarted).state,PendingState.PENDING_EXTERNAL_ACK)
        self.assertEqual(read_shared_head(restarted)[2],0)

    def test_recovery_cannot_authorize(self):
        for outcome in (self.inspect(),self.resume(),self.inspect()):
            self.assertFalse(outcome.release_permitted)
            self.assertFalse(outcome.merge_permitted)
            self.assertFalse(outcome.activation_permitted)
            self.assertFalse(execution_permitted(outcome))
