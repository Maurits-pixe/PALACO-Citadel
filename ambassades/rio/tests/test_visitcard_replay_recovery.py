"""RIO v4.6 signed recovery-head and transaction-bound replay tests."""
import base64
import copy
from pathlib import Path
import hashlib
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from visitcard_replay_recovery import (
    DOMAIN,RecoveryState,replay_log_head,verify_replay_highwater,
    verify_recovered_audit,execution_permitted
)
from test_visitcard_audit_checkpoint import AuditCheckpointTests,NOW,COMMIT,b64


def pub(key):
    return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)


class ReplayRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.f=AuditCheckpointTests("test_first_complete_audit_match_is_informational")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.key=Ed25519PrivateKey.generate()
        self.roots={"independent-recovery":pub(self.key)}
        self.scope="RIO-VISITCARD-V4.6"
        self.snapshot=self.sign()
        self.pin=hashlib.sha256(_canonical(self.snapshot)).hexdigest()

    def sign(self,*,head=None,commit=COMMIT,scope=None,key=None,custodian="independent-recovery",go13="HOLD"):
        count,digest=replay_log_head(self.f.db) if head is None else head
        p={"version":1,"scope":self.scope if scope is None else scope,
           "commit_sha":commit,"sequence":count,"log_sha256":digest,"go13":go13}
        signed=(self.key if key is None else key).sign(
            DOMAIN+custodian.encode()+b"\x00"+_canonical(p)
        )
        return {"payload":p,"custodian_id":custodian,"signature":b64(signed)}

    def run_gate(self,**kw):
        f=self.f
        audit=f.fixture
        return verify_recovered_audit(
            kw.get("db",f.db),
            snapshot=kw.get("snapshot",self.snapshot),
            pinned_recovery_custodians=kw.get("recovery_roots",self.roots),
            independently_pinned_snapshot_sha256=kw.get("snapshot_pin",self.pin),
            scope=kw.get("scope",self.scope),
            dossier_manifest=kw.get("manifest",audit.bundle.manifest),
            dossier_manifest_sha256=kw.get("dossier_pin",audit.bundle.manifest_sha256),
            evidence_bytes=kw.get("evidence",audit.dossier.evidence),
            pinned_review_keys=kw.get("review_keys",audit.dossier.fixture.keys),
            receipts=kw.get("receipts",audit.receipts),
            pinned_custodians=kw.get("transfer_roots",audit.handoff.trust),
            independently_pinned_latest_receipt_sha256=kw.get("latest",audit.latest),
            expected_commit_sha=kw.get("commit",COMMIT),
            checkpoint=kw.get("checkpoint",f.checkpoint),
            pinned_auditor_keys=kw.get("auditor_roots",f.roots),
            expected_challenge=kw.get("challenge",f.challenge),
            independently_pinned_checkpoint_sha256=kw.get("checkpoint_pin",f.pin),
            now=kw.get("now",NOW),
        )

    def test_first_signed_genesis_head_matches_informational(self):
        r=self.run_gate()
        self.assertEqual(r.state,RecoveryState.MATCHED_INFORMATIONAL)
        self.assertFalse(r.release_permitted)
        self.assertFalse(r.merge_permitted)
        self.assertFalse(r.activation_permitted)

    def test_next_request_requires_new_externally_signed_snapshot(self):
        self.assertEqual(self.run_gate().state,RecoveryState.MATCHED_INFORMATIONAL)
        self.assertEqual(self.run_gate().state,RecoveryState.RECOVERY_BLOCKED)

    def test_replayed_challenge_with_fresh_snapshot_is_denied(self):
        self.assertEqual(self.run_gate().state,RecoveryState.MATCHED_INFORMATIONAL)
        new=self.sign()
        result=self.run_gate(snapshot=new,snapshot_pin=hashlib.sha256(_canonical(new)).hexdigest())
        self.assertEqual(result.state,RecoveryState.REPLAY_BLOCKED)

    def test_second_challenge_with_updated_signed_snapshot_matches(self):
        self.assertEqual(self.run_gate().state,RecoveryState.MATCHED_INFORMATIONAL)
        new=self.sign()
        other=b64(bytes(range(32,64)))
        cp=self.f.sign(challenge=other)
        r=self.run_gate(snapshot=new,snapshot_pin=hashlib.sha256(_canonical(new)).hexdigest(),
                        challenge=other,checkpoint=cp,
                        checkpoint_pin=hashlib.sha256(_canonical(cp)).hexdigest())
        self.assertEqual(r.state,RecoveryState.MATCHED_INFORMATIONAL)

    def test_local_rollback_vs_independently_pinned_head_blocked(self):
        self.assertEqual(self.run_gate().state,RecoveryState.MATCHED_INFORMATIONAL)
        newer=self.sign()
        pin=hashlib.sha256(_canonical(newer)).hexdigest()
        rollback=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(rollback.close)
        from visitcard_audit_checkpoint import initialize_challenge_log
        initialize_challenge_log(rollback)
        r=self.run_gate(db=rollback,snapshot=newer,snapshot_pin=pin)
        self.assertEqual(r.state,RecoveryState.RECOVERY_BLOCKED)

    def test_missing_independent_head_pin_blocked(self):
        self.assertEqual(self.run_gate(snapshot_pin="").state,RecoveryState.RECOVERY_BLOCKED)

    def test_wrong_independent_head_pin_blocked(self):
        self.assertEqual(self.run_gate(snapshot_pin="f"*64).state,RecoveryState.RECOVERY_BLOCKED)

    def test_unknown_recovery_custodian_blocked(self):
        self.assertEqual(self.run_gate(recovery_roots={}).state,RecoveryState.RECOVERY_BLOCKED)

    def test_rogue_recovery_custodian_signature_blocked(self):
        fake=self.sign(key=Ed25519PrivateKey.generate())
        self.assertEqual(self.run_gate(
            snapshot=fake,snapshot_pin=hashlib.sha256(_canonical(fake)).hexdigest()
        ).state,RecoveryState.RECOVERY_BLOCKED)

    def test_forged_snapshot_hash_blocked_even_when_signed(self):
        fake=self.sign(head=(1,"a"*64))
        self.assertEqual(self.run_gate(
            snapshot=fake,snapshot_pin=hashlib.sha256(_canonical(fake)).hexdigest()
        ).state,RecoveryState.RECOVERY_BLOCKED)

    def test_wrong_commit_blocked(self):
        self.assertEqual(self.run_gate(commit="c"*40).state,RecoveryState.RECOVERY_BLOCKED)

    def test_wrong_scope_blocked(self):
        self.assertEqual(self.run_gate(scope="OTHER").state,RecoveryState.RECOVERY_BLOCKED)

    def test_mutated_snapshot_signature_blocked(self):
        fake=copy.deepcopy(self.snapshot)
        fake["signature"]="A"*86
        self.assertEqual(self.run_gate(
            snapshot=fake,snapshot_pin=hashlib.sha256(_canonical(fake)).hexdigest()
        ).state,RecoveryState.RECOVERY_BLOCKED)

    def test_rollback_claim_go13_change_blocked(self):
        fake=self.sign(go13="GO")
        self.assertEqual(self.run_gate(
            snapshot=fake,snapshot_pin=hashlib.sha256(_canonical(fake)).hexdigest()
        ).state,RecoveryState.RECOVERY_BLOCKED)

    def test_missing_local_log_schema_blocked(self):
        self.f.db.execute("DROP TABLE rio_audit_consumed_challenges")
        self.assertEqual(self.run_gate().state,RecoveryState.RECOVERY_BLOCKED)

    def test_active_local_transaction_blocked(self):
        self.f.db.execute("BEGIN IMMEDIATE")
        try:
            self.assertEqual(self.run_gate().state,RecoveryState.RECOVERY_BLOCKED)
        finally:
            self.f.db.rollback()

    def test_tampered_evidence_aborts_without_consuming(self):
        evidence=dict(self.f.fixture.dossier.evidence)
        evidence["CI_ZERO_SKIP"]=b"tampered"
        self.assertEqual(self.run_gate(evidence=evidence).state,RecoveryState.AUDIT_BLOCKED)
        self.assertEqual(replay_log_head(self.f.db)[0],0)

    def test_wrong_audit_checkpoint_aborts_without_consuming(self):
        self.assertEqual(self.run_gate(checkpoint_pin="f"*64).state,
                         RecoveryState.CHECKPOINT_BLOCKED)
        self.assertEqual(replay_log_head(self.f.db)[0],0)

    def test_malformed_challenge_does_not_consume(self):
        self.assertEqual(self.run_gate(challenge="invalid").state,
                         RecoveryState.CHECKPOINT_BLOCKED)
        self.assertEqual(replay_log_head(self.f.db)[0],0)

    def test_no_result_can_authorize_execution(self):
        from visitcard_replay_recovery import RecoveryResult
        for state in RecoveryState:
            self.assertFalse(execution_permitted(RecoveryResult(state,(),None)))
