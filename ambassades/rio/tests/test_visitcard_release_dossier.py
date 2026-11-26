"""RIO v4.2 deterministic signed release dossier regression tests."""
from pathlib import Path
import copy
import hashlib
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_release_review import REQUIRED
from visitcard_release_dossier import (
    DossierState,build_release_dossier,validate_release_dossier,
    execution_permitted,MAX_ARTIFACT_SIZE
)
from test_visitcard_release_review import ReleaseReviewTests,NOW,COMMIT,SCOPE


class ReleaseDossierTests(unittest.TestCase):
    def setUp(self):
        self.fixture=ReleaseReviewTests("test_complete_independently_signed_pack_is_reviewable_not_releasable")
        self.fixture.setUp()
        self.evidence={category:category.encode() for category in REQUIRED}

    def build(self,items=None,evidence=None,keys=None,commit=COMMIT,now=NOW):
        return build_release_dossier(
            commit_sha=commit,
            attestations=self.fixture.items if items is None else items,
            evidence_bytes=self.evidence if evidence is None else evidence,
            pinned_review_keys=self.fixture.keys if keys is None else keys,
            scope=SCOPE,now=now
        )

    def validate(self,outcome,evidence=None,keys=None,commit=COMMIT,now=NOW):
        return validate_release_dossier(
            outcome.manifest,outcome.manifest_sha256,
            self.evidence if evidence is None else evidence,
            self.fixture.keys if keys is None else keys,
            expected_commit=commit,now=now
        )

    def test_complete_dossier_is_reviewable_but_never_releasable(self):
        outcome=self.build()
        self.assertEqual(outcome.state,DossierState.READY_FOR_HUMAN_REVIEW)
        self.assertEqual(outcome.blockers,())
        self.assertFalse(outcome.release_permitted)
        self.assertFalse(outcome.merge_permitted)
        self.assertFalse(outcome.activation_permitted)
        self.assertFalse(execution_permitted(outcome))

    def test_reproducible_canonical_hash(self):
        first=self.build()
        second=self.build(evidence=dict(reversed(list(self.evidence.items()))))
        self.assertEqual(first.manifest_sha256,second.manifest_sha256)
        self.assertEqual(first.manifest,second.manifest)

    def test_manifest_revalidates_with_original_bytes(self):
        outcome=self.build()
        self.assertEqual(self.validate(outcome).state,DossierState.READY_FOR_HUMAN_REVIEW)

    def test_evidence_reference_is_content_addressed(self):
        outcome=self.build()
        for entry in outcome.manifest["artifacts"]:
            digest=hashlib.sha256(self.evidence[entry["category"]]).hexdigest()
            self.assertEqual(entry["uri"],"sha256:"+digest)
            self.assertEqual(entry["size_bytes"],len(self.evidence[entry["category"]]))

    def test_missing_evidence_blocks_with_specific_category(self):
        altered=dict(self.evidence)
        altered.pop("SECURITY_REVIEW")
        outcome=self.build(evidence=altered)
        self.assertEqual(outcome.state,DossierState.INCOMPLETE_BLOCKED)
        self.assertIn("EVIDENCE_MISSING_OR_INVALID:SECURITY_REVIEW",outcome.blockers)

    def test_missing_signed_attestation_blocks(self):
        outcome=self.build(items=self.fixture.items[:-1])
        self.assertEqual(outcome.state,DossierState.INCOMPLETE_BLOCKED)
        self.assertTrue(any("ATTESTATION_MISSING" in s for s in outcome.blockers))

    def test_changed_evidence_bytes_detected(self):
        altered=dict(self.evidence)
        altered["CI_ZERO_SKIP"]=b"test suite did not pass"
        outcome=self.build(evidence=altered)
        self.assertEqual(outcome.state,DossierState.INCOMPLETE_BLOCKED)
        self.assertIn("EVIDENCE_DIGEST_MISMATCH:CI_ZERO_SKIP",outcome.blockers)

    def test_late_evidence_mutation_revalidation_fails(self):
        outcome=self.build()
        altered=dict(self.evidence)
        altered["SECURITY_REVIEW"]=b"other content"
        self.assertEqual(self.validate(outcome,evidence=altered).state,
                         DossierState.INCOMPLETE_BLOCKED)

    def test_modified_manifest_fails_even_with_new_hash_without_new_attestation(self):
        outcome=self.build()
        forged=copy.deepcopy(outcome.manifest)
        forged["artifacts"][0]["size_bytes"]=1024
        from visitcard_witness_enrollment import _canonical
        forged_hash=hashlib.sha256(_canonical(forged)).hexdigest()
        result=validate_release_dossier(
            forged,forged_hash,self.evidence,self.fixture.keys,
            expected_commit=COMMIT,now=NOW
        )
        self.assertEqual(result.state,DossierState.INCOMPLETE_BLOCKED)

    def test_manifest_go13_hold_cannot_be_rewritten_as_go(self):
        outcome=self.build()
        forged=copy.deepcopy(outcome.manifest)
        forged["go13"]="GO"
        self.assertEqual(validate_release_dossier(
            forged,outcome.manifest_sha256,self.evidence,self.fixture.keys,
            expected_commit=COMMIT,now=NOW
        ).state,DossierState.INCOMPLETE_BLOCKED)

    def test_manifest_cannot_grant_release_even_if_resigned_index(self):
        outcome=self.build()
        forged=copy.deepcopy(outcome.manifest)
        forged["release_permitted"]=True
        from visitcard_witness_enrollment import _canonical
        new_hash=hashlib.sha256(_canonical(forged)).hexdigest()
        self.assertEqual(validate_release_dossier(
            forged,new_hash,self.evidence,self.fixture.keys,
            expected_commit=COMMIT,now=NOW
        ).state,DossierState.INCOMPLETE_BLOCKED)

    def test_wrong_commit_blocks_build_and_validation(self):
        self.assertEqual(self.build(commit="b"*40).state,DossierState.INCOMPLETE_BLOCKED)
        outcome=self.build()
        self.assertEqual(self.validate(outcome,commit="b"*40).state,
                         DossierState.INCOMPLETE_BLOCKED)

    def test_forged_attestation_signature_blocks(self):
        forged=copy.deepcopy(self.fixture.items)
        forged[0]["signature"]="A"*86
        self.assertEqual(self.build(items=forged).state,DossierState.INCOMPLETE_BLOCKED)

    def test_expired_attestations_block(self):
        from datetime import timedelta
        self.assertEqual(self.build(now=NOW+timedelta(hours=2)).state,
                         DossierState.INCOMPLETE_BLOCKED)

    def test_unpinned_review_keys_block(self):
        self.assertEqual(self.build(keys={}).state,DossierState.INCOMPLETE_BLOCKED)

    def test_extra_evidence_category_blocks(self):
        altered=dict(self.evidence)
        altered["UNSOLICITED"]=b"extra"
        self.assertIn("EVIDENCE_CATEGORY_MISMATCH",self.build(evidence=altered).blockers)

    def test_oversized_evidence_blocks(self):
        altered=dict(self.evidence)
        altered["SECURITY_REVIEW"]=b"x"*(MAX_ARTIFACT_SIZE+1)
        self.assertIn("EVIDENCE_MISSING_OR_INVALID:SECURITY_REVIEW",
                      self.build(evidence=altered).blockers)

    def test_empty_evidence_blocks(self):
        altered=dict(self.evidence)
        altered["SECURITY_REVIEW"]=b""
        self.assertEqual(self.build(evidence=altered).state,DossierState.INCOMPLETE_BLOCKED)

    def test_duplicate_review_category_blocks(self):
        items=list(self.fixture.items)
        items[-1]=items[0]
        self.assertEqual(self.build(items=items).state,DossierState.INCOMPLETE_BLOCKED)

    def test_invalid_dossier_structure_fails_closed(self):
        outcome=self.build()
        modified=dict(outcome.manifest)
        modified["unexpected"]=1
        self.assertEqual(validate_release_dossier(
            modified,outcome.manifest_sha256,self.evidence,self.fixture.keys,
            expected_commit=COMMIT,now=NOW
        ).state,DossierState.INCOMPLETE_BLOCKED)
