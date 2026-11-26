"""RIO v4.5 signed audit checkpoint and replay rejection regression tests."""
import base64
import copy
from datetime import timedelta
import hashlib
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from visitcard_audit_checkpoint import (
    DOMAIN,CheckpointState,initialize_challenge_log,
    verify_checkpoint,verify_checkpointed_audit,execution_permitted
)
from test_visitcard_release_transfer_audit import IntegratedReleaseTransferTests,NOW,COMMIT


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def public(key):
    return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)


class AuditCheckpointTests(unittest.TestCase):
    def setUp(self):
        self.fixture=IntegratedReleaseTransferTests(
            "test_full_signed_bytes_and_chain_match_informational"
        )
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.db=sqlite3.connect(":memory:",isolation_level=None)
        self.addCleanup(self.db.close)
        initialize_challenge_log(self.db)
        self.key=Ed25519PrivateKey.generate()
        self.roots={"auditor":public(self.key)}
        self.challenge=b64(bytes(range(32)))
        self.checkpoint=self.sign()
        self.pin=hashlib.sha256(_canonical(self.checkpoint)).hexdigest()

    def sign(self,*,challenge=None,dossier=None,latest=None,commit=COMMIT,
             issued=NOW,expires=NOW+timedelta(minutes=3),
             key=None,auditor="auditor",state="MATCHED_INFORMATIONAL",hold="HOLD"):
        f=self.fixture
        payload={
            "version":1,"commit_sha":commit,
            "dossier_sha256":f.bundle.manifest_sha256 if dossier is None else dossier,
            "latest_receipt_sha256":f.latest if latest is None else latest,
            "challenge":self.challenge if challenge is None else challenge,
            "issued_at":issued.isoformat(),"expires_at":expires.isoformat(),
            "audit_state":state,"go13":hold
        }
        signature=(self.key if key is None else key).sign(
            DOMAIN+auditor.encode()+b"\x00"+_canonical(payload)
        )
        return {"payload":payload,"auditor_id":auditor,"signature":b64(signature)}

    def run_gate(self,**kw):
        f=self.fixture
        return verify_checkpointed_audit(
            kw.get("db",self.db),
            dossier_manifest=kw.get("manifest",f.bundle.manifest),
            dossier_manifest_sha256=kw.get("dossier_pin",f.bundle.manifest_sha256),
            evidence_bytes=kw.get("evidence",f.dossier.evidence),
            pinned_review_keys=kw.get("review_keys",f.dossier.fixture.keys),
            receipts=kw.get("receipts",f.receipts),
            pinned_custodians=kw.get("custodians",f.handoff.trust),
            independently_pinned_latest_receipt_sha256=kw.get("latest",f.latest),
            expected_commit_sha=kw.get("commit",COMMIT),
            checkpoint=kw.get("checkpoint",self.checkpoint),
            pinned_auditor_keys=kw.get("roots",self.roots),
            expected_challenge=kw.get("challenge",self.challenge),
            independently_pinned_checkpoint_sha256=kw.get("pin",self.pin),
            now=kw.get("now",NOW)
        )

    def test_first_complete_audit_match_is_informational(self):
        result=self.run_gate()
        self.assertEqual(result.state,CheckpointState.MATCHED_INFORMATIONAL)
        self.assertEqual(result.checkpoint_sha256,self.pin)
        self.assertFalse(result.release_permitted)
        self.assertFalse(result.merge_permitted)
        self.assertFalse(result.activation_permitted)

    def test_second_use_of_same_challenge_is_rejected(self):
        self.assertEqual(self.run_gate().state,CheckpointState.MATCHED_INFORMATIONAL)
        self.assertEqual(self.run_gate().state,CheckpointState.REPLAY_BLOCKED)

    def test_two_different_challenges_can_be_used(self):
        self.assertEqual(self.run_gate().state,CheckpointState.MATCHED_INFORMATIONAL)
        fresh=b64(bytes(range(32,64)))
        next_cp=self.sign(challenge=fresh)
        self.assertEqual(self.run_gate(
            checkpoint=next_cp,challenge=fresh,
            pin=hashlib.sha256(_canonical(next_cp)).hexdigest()
        ).state,CheckpointState.MATCHED_INFORMATIONAL)

    def test_wrong_independent_checkpoint_pin_rejected(self):
        self.assertEqual(self.run_gate(pin="f"*64).state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_missing_independent_checkpoint_pin_rejected(self):
        self.assertEqual(self.run_gate(pin="").state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_rogue_auditor_rejected(self):
        forged=self.sign(key=Ed25519PrivateKey.generate())
        self.assertEqual(self.run_gate(
            checkpoint=forged,pin=hashlib.sha256(_canonical(forged)).hexdigest()
        ).state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_unpinned_auditor_rejected(self):
        self.assertEqual(self.run_gate(roots={}).state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_mismatched_challenge_rejected(self):
        self.assertEqual(self.run_gate(challenge=b64(bytes(range(32,64)))).state,
                         CheckpointState.CHECKPOINT_BLOCKED)

    def test_malformed_challenge_rejected(self):
        self.assertEqual(self.run_gate(challenge="abc").state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_expired_checkpoint_rejected(self):
        self.assertEqual(self.run_gate(now=NOW+timedelta(minutes=6)).state,
                         CheckpointState.CHECKPOINT_BLOCKED)

    def test_future_checkpoint_rejected(self):
        future=self.sign(issued=NOW+timedelta(seconds=10))
        self.assertEqual(self.run_gate(
            checkpoint=future,pin=hashlib.sha256(_canonical(future)).hexdigest()
        ).state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_bad_signature_rejected_even_if_pin_recomputed(self):
        fake=copy.deepcopy(self.checkpoint)
        fake["signature"]="A"*86
        self.assertEqual(self.run_gate(
            checkpoint=fake,pin=hashlib.sha256(_canonical(fake)).hexdigest()
        ).state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_different_commit_rejected(self):
        self.assertEqual(self.run_gate(commit="c"*40).state,CheckpointState.AUDIT_BLOCKED)

    def test_checkpoint_bound_to_wrong_dossier_rejected(self):
        fake=self.sign(dossier="c"*64)
        self.assertEqual(self.run_gate(
            checkpoint=fake,pin=hashlib.sha256(_canonical(fake)).hexdigest()
        ).state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_checkpoint_bound_to_wrong_latest_receipt_rejected(self):
        fake=self.sign(latest="c"*64)
        self.assertEqual(self.run_gate(
            checkpoint=fake,pin=hashlib.sha256(_canonical(fake)).hexdigest()
        ).state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_changed_original_evidence_blocks_before_checkpoint(self):
        changed=dict(self.fixture.dossier.evidence)
        changed["CI_ZERO_SKIP"]=b"fake"
        self.assertEqual(self.run_gate(evidence=changed).state,CheckpointState.AUDIT_BLOCKED)

    def test_older_receipt_chain_blocks_before_checkpoint(self):
        self.assertEqual(self.run_gate(receipts=[self.fixture.first]).state,
                         CheckpointState.AUDIT_BLOCKED)

    def test_broken_store_schema_fails_closed(self):
        self.db.execute("DROP TABLE rio_audit_consumed_challenges")
        self.assertEqual(self.run_gate().state,CheckpointState.REPLAY_BLOCKED)

    def test_active_store_transaction_fails_closed(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.assertEqual(self.run_gate().state,CheckpointState.REPLAY_BLOCKED)
        finally:
            self.db.rollback()

    def test_invalid_go13_or_audit_state_rejected(self):
        for key,val in (("hold","GO"),("state","RELEASE_APPROVED")):
            new=self.sign(**{key:val})
            self.assertEqual(self.run_gate(
                checkpoint=new,pin=hashlib.sha256(_canonical(new)).hexdigest()
            ).state,CheckpointState.CHECKPOINT_BLOCKED)

    def test_challenge_log_append_only_triggers(self):
        self.assertEqual(self.run_gate().state,CheckpointState.MATCHED_INFORMATIONAL)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM rio_audit_consumed_challenges")

    def test_no_audit_checkpoint_result_grants_execution(self):
        for state in CheckpointState:
            from visitcard_audit_checkpoint import CheckpointResult
            self.assertFalse(execution_permitted(CheckpointResult(state,(),None)))
