"""RIO v4.8 combined recovery, signed audit and shared-CAS integration tests."""
import hashlib
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_witness_enrollment import _canonical
from visitcard_shared_replay_cas import (
    GENESIS,initialize_shared_replay,read_shared_head,
)
from visitcard_shared_audit_bridge import (
    BridgeState,verify_and_reserve_shared,confirm_shared_handoff,execution_permitted
)
from test_visitcard_replay_recovery import ReplayRecoveryTests,NOW,COMMIT
from test_visitcard_shared_replay_cas import SharedReplayCASTests,b64


class SharedAuditBridgeTests(unittest.TestCase):
    def setUp(self):
        self.local=ReplayRecoveryTests("test_first_signed_genesis_head_matches_informational")
        self.local.setUp()
        self.addCleanup(self.local.doCleanups)
        self.remote=SharedReplayCASTests("test_genesis_matches_across_two_connections")
        self.remote.setUp()
        self.addCleanup(self.remote.doCleanups)

    def run_bridge(self,**kw):
        f=self.local.f
        audit=f.fixture
        return verify_and_reserve_shared(
            kw.get("local_db",f.db),
            kw.get("shared_db",self.remote.one),
            recovery_snapshot=kw.get("snapshot",self.local.snapshot),
            pinned_recovery_custodians=kw.get("recovery_roots",self.local.roots),
            independently_pinned_recovery_snapshot_sha256=kw.get("snapshot_pin",self.local.pin),
            recovery_scope=kw.get("scope",self.local.scope),
            dossier_manifest=kw.get("manifest",audit.bundle.manifest),
            dossier_manifest_sha256=kw.get("dossier_pin",audit.bundle.manifest_sha256),
            evidence_bytes=kw.get("evidence",audit.dossier.evidence),
            pinned_review_keys=kw.get("review_roots",audit.dossier.fixture.keys),
            receipts=kw.get("receipts",audit.receipts),
            pinned_transfer_custodians=kw.get("transfer_roots",audit.handoff.trust),
            independently_pinned_latest_receipt_sha256=kw.get("latest",audit.latest),
            expected_commit_sha=kw.get("commit",COMMIT),
            audit_checkpoint=kw.get("checkpoint",f.checkpoint),
            pinned_auditor_keys=kw.get("auditor_roots",f.roots),
            expected_challenge=kw.get("challenge",f.challenge),
            independently_pinned_checkpoint_sha256=kw.get("checkpoint_pin",f.pin),
            expected_shared_sequence=kw.get("sequence",0),
            expected_shared_head_sha256=kw.get("head",GENESIS),
            independently_pinned_shared_head_sha256=kw.get("head_pin",GENESIS),
            now=kw.get("now",NOW),
        )

    def confirm(self,result,**kw):
        receipt=kw.get("receipt",self.remote.receipt(result.sequence,result.shared_head_sha256))
        return confirm_shared_handoff(
            kw.get("db",self.remote.two),
            receipt=receipt,
            pinned_custodians=kw.get("roots",self.remote.roots),
            independently_pinned_receipt_sha256=kw.get(
                "pin",hashlib.sha256(_canonical(receipt)).hexdigest()
            ),
        )

    def test_combined_verified_audit_ends_pending_not_authorized(self):
        r=self.run_bridge()
        self.assertEqual(r.state,BridgeState.PENDING_EXTERNAL_ACK)
        self.assertEqual(r.sequence,1)
        self.assertEqual(read_shared_head(self.remote.two)[0],1)
        self.assertFalse(r.release_permitted)

    def test_external_signed_receipt_moves_to_informational(self):
        r=self.run_bridge()
        ack=self.confirm(r)
        self.assertEqual(ack.state,BridgeState.ACKNOWLEDGED_INFORMATIONAL)
        self.assertFalse(ack.merge_permitted)
        self.assertFalse(ack.activation_permitted)

    def test_retry_same_challenge_cannot_reserve_again(self):
        self.assertEqual(self.run_bridge().state,BridgeState.PENDING_EXTERNAL_ACK)
        self.assertEqual(self.run_bridge().state,BridgeState.SHARED_REPLAY_BLOCKED)
        self.assertEqual(read_shared_head(self.remote.one)[0],1)

    def test_failed_audit_never_reserves_shared_challenge(self):
        bad=dict(self.local.f.fixture.dossier.evidence)
        bad["CI_ZERO_SKIP"]=b"tampered"
        self.assertEqual(self.run_bridge(evidence=bad).state,BridgeState.AUDIT_BLOCKED)
        self.assertEqual(read_shared_head(self.remote.one)[0],0)

    def test_invalid_recovery_snapshot_never_reserves(self):
        self.assertEqual(self.run_bridge(snapshot_pin="f"*64).state,
                         BridgeState.RECOVERY_BLOCKED)
        self.assertEqual(read_shared_head(self.remote.one)[0],0)

    def test_invalid_audit_checkpoint_never_reserves(self):
        self.assertEqual(self.run_bridge(checkpoint_pin="f"*64).state,
                         BridgeState.CHECKPOINT_BLOCKED)
        self.assertEqual(read_shared_head(self.remote.one)[0],0)

    def test_stale_shared_head_pin_denied_after_full_audit(self):
        self.assertEqual(self.run_bridge(head_pin="f"*64).state,
                         BridgeState.SHARED_REPLAY_BLOCKED)
        self.assertEqual(read_shared_head(self.remote.one)[0],0)

    def test_both_processes_cannot_commit_same_shared_head(self):
        self.assertEqual(self.run_bridge().state,BridgeState.PENDING_EXTERNAL_ACK)
        self.assertEqual(self.run_bridge(shared_db=self.remote.two).state,
                         BridgeState.SHARED_REPLAY_BLOCKED)

    def test_stopped_before_reservation_does_not_advance_ledger(self):
        self.assertEqual(self.run_bridge(checkpoint=None).state,
                         BridgeState.CHECKPOINT_BLOCKED)
        self.assertEqual(read_shared_head(self.remote.one)[0],0)

    def test_stopped_after_reservation_requires_ack(self):
        self.assertEqual(self.run_bridge().state,BridgeState.PENDING_EXTERNAL_ACK)
        h=read_shared_head(self.remote.two)
        self.assertEqual(h[0],1)
        self.assertEqual(h[2],0)
        self.assertEqual(self.run_bridge().state,BridgeState.SHARED_REPLAY_BLOCKED)

    def test_invalid_external_ack_keeps_pending(self):
        r=self.run_bridge()
        self.assertEqual(self.confirm(r,pin="f"*64).state,
                         BridgeState.SHARED_REPLAY_BLOCKED)
        self.assertEqual(read_shared_head(self.remote.one)[2],0)

    def test_ack_recovery_is_idempotent(self):
        r=self.run_bridge()
        first=self.confirm(r)
        second=self.confirm(r)
        self.assertEqual(first.state,BridgeState.ACKNOWLEDGED_INFORMATIONAL)
        self.assertEqual(second.state,BridgeState.ACKNOWLEDGED_INFORMATIONAL)
        self.assertEqual(read_shared_head(self.remote.one)[0],1)

    def test_rogue_external_signer_does_not_ack(self):
        r=self.run_bridge()
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        fake=self.remote.receipt(r.sequence,r.shared_head_sha256,
                                 key=Ed25519PrivateKey.generate())
        self.assertEqual(self.confirm(r,receipt=fake).state,BridgeState.SHARED_REPLAY_BLOCKED)

    def test_malformed_challenge_rejected_before_shared_cas(self):
        self.assertEqual(self.run_bridge(challenge="abc").state,
                         BridgeState.CHECKPOINT_BLOCKED)

    def test_local_database_remains_unconsumed_after_shared_reservation(self):
        self.run_bridge()
        from visitcard_replay_recovery import replay_log_head
        self.assertEqual(replay_log_head(self.local.f.db)[0],0)
        self.assertEqual(read_shared_head(self.remote.one)[0],1)

    def test_shared_transaction_lock_blocks_without_replay(self):
        self.remote.one.execute("BEGIN IMMEDIATE")
        try:
            self.assertEqual(self.run_bridge(shared_db=self.remote.two).state,
                             BridgeState.SHARED_REPLAY_BLOCKED)
        finally:
            self.remote.one.rollback()
        self.assertEqual(read_shared_head(self.remote.one)[0],0)

    def test_shared_cas_requires_matching_canonical_checkpoint_hash(self):
        r=self.run_bridge()
        record=self.remote.one.execute(
            "SELECT checkpoint_sha256 FROM rio_shared_replay_events WHERE sequence=1"
        ).fetchone()
        self.assertEqual(record[0],self.local.f.pin)

    def test_all_bridge_outcomes_never_authorize(self):
        for outcome in (self.run_bridge(),self.run_bridge(),
                        self.confirm(self.remote_result())):
            self.assertFalse(outcome.release_permitted)
            self.assertFalse(outcome.merge_permitted)
            self.assertFalse(outcome.activation_permitted)
            self.assertFalse(execution_permitted(outcome))

    def remote_result(self):
        class Pending:
            sequence=1
            shared_head_sha256="f"*64
        return Pending()
