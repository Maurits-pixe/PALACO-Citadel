"""RIO v4.4 byte-verified dossier and handoff unified audit regression tests."""
import copy
from datetime import timedelta
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_release_transfer_audit import (
    AuditState,audit_release_transfer,execution_permitted
)
from visitcard_dossier_handoff import ZERO,transfer_receipt_digest
from test_visitcard_release_dossier import ReleaseDossierTests,NOW,COMMIT
from test_visitcard_dossier_handoff import DossierHandoffTests


class IntegratedReleaseTransferTests(unittest.TestCase):
    def setUp(self):
        self.dossier=ReleaseDossierTests("test_complete_dossier_is_reviewable_but_never_releasable")
        self.dossier.setUp()
        self.handoff=DossierHandoffTests("test_two_receipts_and_pinned_head_match_informational")
        self.handoff.setUp()
        self.bundle=self.dossier.build()
        self.assertIsNotNone(self.bundle.manifest_sha256)
        digest=self.bundle.manifest_sha256
        self.first=self.handoff.sign(1,ZERO,"receiver-a",self.handoff.key_a,dossier=digest,time=NOW)
        self.second=self.handoff.sign(
            2,transfer_receipt_digest(self.first),"receiver-b",self.handoff.key_b,dossier=digest,time=NOW)
        self.receipts=[self.first,self.second]
        self.latest=transfer_receipt_digest(self.second)

    def check(self,**changes):
        return audit_release_transfer(
            dossier_manifest=changes.get("manifest",self.bundle.manifest),
            dossier_manifest_sha256=changes.get("dossier_pin",self.bundle.manifest_sha256),
            evidence_bytes=changes.get("evidence",self.dossier.evidence),
            pinned_review_keys=changes.get("review_keys",self.dossier.fixture.keys),
            receipts=changes.get("receipts",self.receipts),
            pinned_custodians=changes.get("custodian_keys",self.handoff.trust),
            independently_pinned_latest_receipt_sha256=changes.get("latest",self.latest),
            expected_commit_sha=changes.get("commit",COMMIT),
            now=changes.get("now",NOW),
        )

    def test_full_signed_bytes_and_chain_match_informational(self):
        result=self.check()
        self.assertEqual(result.state,AuditState.MATCHED_INFORMATIONAL)
        self.assertEqual(result.blockers,())
        self.assertEqual(result.dossier_sha256,self.bundle.manifest_sha256)
        self.assertEqual(result.latest_receipt_sha256,self.latest)
        self.assertFalse(result.release_permitted)
        self.assertFalse(result.merge_permitted)
        self.assertFalse(result.activation_permitted)
        self.assertFalse(execution_permitted(result))

    def test_dossier_tampering_blocks_before_transfer(self):
        forged=copy.deepcopy(self.bundle.manifest)
        forged["go13"]="GO"
        result=self.check(manifest=forged)
        self.assertEqual(result.state,AuditState.DOSSIER_BLOCKED)
        self.assertIsNone(result.latest_receipt_sha256)

    def test_wrong_dossier_pin_blocks(self):
        self.assertEqual(self.check(dossier_pin="f"*64).state,AuditState.DOSSIER_BLOCKED)

    def test_missing_evidence_bytes_blocks(self):
        evidence=dict(self.dossier.evidence)
        evidence.pop("SECURITY_REVIEW")
        self.assertEqual(self.check(evidence=evidence).state,AuditState.DOSSIER_BLOCKED)

    def test_changed_evidence_bytes_blocks(self):
        evidence=dict(self.dossier.evidence)
        evidence["CI_ZERO_SKIP"]=b"forged"
        self.assertEqual(self.check(evidence=evidence).state,AuditState.DOSSIER_BLOCKED)

    def test_wrong_review_roots_blocks(self):
        self.assertEqual(self.check(review_keys={}).state,AuditState.DOSSIER_BLOCKED)

    def test_wrong_expected_commit_blocks(self):
        self.assertEqual(self.check(commit="c"*40).state,AuditState.DOSSIER_BLOCKED)

    def test_invalid_transfer_signature_blocks(self):
        changed=copy.deepcopy(self.receipts)
        changed[1]["signature"]="A"*86
        self.assertEqual(self.check(receipts=changed).state,AuditState.TRANSFER_BLOCKED)

    def test_old_but_signed_receipt_chain_blocks_with_newer_pin(self):
        result=self.check(receipts=[self.first])
        self.assertEqual(result.state,AuditState.TRANSFER_BLOCKED)
        self.assertIn("STALE_OR_SUBSTITUTED_LATEST_HEAD",result.blockers)

    def test_missing_independent_latest_pin_blocks(self):
        self.assertEqual(self.check(latest="").state,AuditState.TRANSFER_BLOCKED)

    def test_reordered_transfer_blocks(self):
        self.assertEqual(self.check(receipts=list(reversed(self.receipts))).state,
                         AuditState.TRANSFER_BLOCKED)

    def test_reused_custodian_key_blocks(self):
        self.assertEqual(self.check(custodian_keys={
            "receiver-a":self.handoff.trust["receiver-a"],
            "receiver-b":self.handoff.trust["receiver-a"],
        }).state,AuditState.TRANSFER_BLOCKED)

    def test_other_dossier_receipt_even_validly_signed_blocks(self):
        first=self.handoff.sign(1,ZERO,"receiver-a",self.handoff.key_a,dossier="c"*64,time=NOW)
        second=self.handoff.sign(
            2,transfer_receipt_digest(first),"receiver-b",self.handoff.key_b,dossier="c"*64,time=NOW)
        self.assertEqual(self.check(receipts=[first,second],latest=transfer_receipt_digest(second)).state,
                         AuditState.TRANSFER_BLOCKED)

    def test_empty_receipt_chain_blocks(self):
        self.assertEqual(self.check(receipts=[]).state,AuditState.TRANSFER_BLOCKED)

    def test_future_receipt_blocks(self):
        first=self.handoff.sign(
            1,ZERO,"receiver-a",self.handoff.key_a,
            dossier=self.bundle.manifest_sha256,time=NOW+timedelta(hours=1))
        self.assertEqual(self.check(receipts=[first],latest=transfer_receipt_digest(first)).state,
                         AuditState.TRANSFER_BLOCKED)

    def test_expired_review_evidence_blocks(self):
        self.assertEqual(self.check(now=NOW+timedelta(hours=2)).state,AuditState.DOSSIER_BLOCKED)

    def test_all_outcomes_never_grant_release(self):
        for outcome in (
            self.check(),
            self.check(evidence={}),
            self.check(receipts=[]),
        ):
            self.assertFalse(outcome.release_permitted)
            self.assertFalse(outcome.merge_permitted)
            self.assertFalse(outcome.activation_permitted)
            self.assertFalse(execution_permitted(outcome))
