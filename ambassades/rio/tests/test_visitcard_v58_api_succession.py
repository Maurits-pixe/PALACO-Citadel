"""RIO v5.8 independent-pin API evidence succession negative tests."""
import base64
import copy
from datetime import datetime,timedelta,timezone
import hashlib
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from test_visitcard_v57_github_api import ApiAcquisitionTests,REPO,RUN,JOB,SHA,WORKFLOW
from visitcard_v58_api_succession import (
    DOMAIN,SCOPE,GENESIS,SuccessionState,verify_succession_record,
    execution_permitted,
)

NOW=datetime(2026,11,24,6,tzinfo=timezone.utc)


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


class ApiSuccessionTests(unittest.TestCase):
    def setUp(self):
        self.api=ApiAcquisitionTests("test_synthetic_metadata_is_only_informational")
        self.api.setUp()
        self.review=self.api.check()
        self.key=Ed25519PrivateKey.generate()
        self.roots={"independent-custodian":self.key.public_key().public_bytes(
            Encoding.Raw,PublicFormat.Raw
        )}
        self.record=self.sign()
        self.pin=hashlib.sha256(_canonical(self.record)).hexdigest()

    def sign(self,*,key=None,custodian="independent-custodian",
             sequence=1,previous=GENESIS,review=None,
             run=RUN,attempt=1,job=JOB,repo=REPO,sha=SHA,workflow=WORKFLOW,
             issued=NOW,expires=NOW+timedelta(minutes=10),hold="HOLD"):
        rev=self.review if review is None else review
        p={
            "version":1,"scope":SCOPE,"repository":repo,
            "run_id":run,"run_attempt":attempt,"job_id":job,
            "head_sha":sha,"workflow_path":workflow,
            "sequence":sequence,"previous_sha256":previous,
            "run_metadata_sha256":rev.run_metadata_sha256,
            "job_metadata_sha256":rev.job_metadata_sha256,
            "relationship_sha256":rev.relationship_sha256,
            "observed_at":issued.isoformat(),"expires_at":expires.isoformat(),
            "go13":hold,
        }
        signature=(self.key if key is None else key).sign(
            DOMAIN+custodian.encode()+b"\x00"+_canonical(p)
        )
        return {"payload":p,"custodian_id":custodian,"signature":b64(signature)}

    def verify(self,**change):
        return verify_succession_record(
            change.get("record",self.record),change.get("roots",self.roots),
            api_review=change.get("review",self.review),
            expected_repository=change.get("repo",REPO),
            expected_run_id=change.get("run",RUN),
            expected_run_attempt=change.get("attempt",1),
            expected_job_id=change.get("job",JOB),
            expected_commit_sha=change.get("sha",SHA),
            expected_workflow_path=change.get("workflow",WORKFLOW),
            independently_pinned_previous_sha256=change.get("previous",GENESIS),
            expected_sequence=change.get("sequence",1),
            independently_pinned_record_sha256=change.get("pin",self.pin),
            now=change.get("now",NOW),
        )

    def test_signed_independently_pinned_synthetic_record_is_informational(self):
        r=self.verify()
        self.assertEqual(r.state,SuccessionState.PINNED_INFORMATIONAL)
        self.assertEqual(r.sequence,1)
        self.assertEqual(r.record_sha256,self.pin)
        self.assertFalse(r.release_permitted)

    def test_deterministic_record_hash(self):
        self.assertEqual(self.verify().record_sha256,self.verify().record_sha256)

    def test_missing_latest_record_pin_blocks(self):
        self.assertEqual(self.verify(pin="").state,SuccessionState.EVIDENCE_BLOCKED)

    def test_wrong_latest_record_pin_blocks(self):
        self.assertIn("LATEST_RECORD_PIN_MISMATCH",self.verify(pin="f"*64).blockers)

    def test_rollback_sequence_blocks(self):
        self.assertEqual(self.verify(sequence=2).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_replayed_old_record_with_new_predecessor_blocks(self):
        self.assertEqual(self.verify(previous="f"*64).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_forged_signature_rejected_even_if_new_pin_supplied(self):
        fake=copy.deepcopy(self.record)
        fake["signature"]="A"*86
        pin=hashlib.sha256(_canonical(fake)).hexdigest()
        self.assertEqual(self.verify(record=fake,pin=pin).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_unknown_custodian_blocks(self):
        self.assertEqual(self.verify(roots={}).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_alternate_custodian_key_does_not_verify(self):
        wrong=Ed25519PrivateKey.generate().public_key().public_bytes(
            Encoding.Raw,PublicFormat.Raw
        )
        self.assertEqual(self.verify(roots={"independent-custodian":wrong}).state,
                         SuccessionState.EVIDENCE_BLOCKED)

    def test_conflicting_signed_replacement_cannot_reuse_old_pin(self):
        newer=self.sign(issued=NOW-timedelta(minutes=1))
        self.assertEqual(self.verify(record=newer).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_changed_run_metadata_hash_blocks(self):
        changed=copy.deepcopy(self.api.run)
        changed["head_sha"]="b"*40
        self.api.run=changed
        bad=self.api.check()
        self.assertEqual(self.verify(review=bad).state,SuccessionState.API_BLOCKED)

    def test_synthetic_substitute_api_evidence_blocks(self):
        self.api.jobs["jobs"][0]["id"]=555
        self.assertEqual(self.verify(review=self.api.check()).state,SuccessionState.API_BLOCKED)

    def test_mismatched_review_digests_block(self):
        from visitcard_v57_github_api import ApiReview,ApiState
        changed=ApiReview(ApiState.API_OBSERVED_INFORMATIONAL,(),
                          self.review.run_metadata_sha256,"f"*64,
                          self.review.relationship_sha256)
        self.assertEqual(self.verify(review=changed).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_wrong_run_id_blocks(self):
        self.assertEqual(self.verify(run=RUN+1).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_wrong_job_id_blocks(self):
        self.assertEqual(self.verify(job=JOB+1).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_wrong_attempt_blocks(self):
        self.assertEqual(self.verify(attempt=2).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_wrong_commit_blocks(self):
        self.assertEqual(self.verify(sha="b"*40).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_wrong_workflow_blocks(self):
        self.assertEqual(self.verify(workflow=".github/workflows/other.yml").state,
                         SuccessionState.EVIDENCE_BLOCKED)

    def test_wrong_repository_blocks(self):
        self.assertEqual(self.verify(repo="another/repo").state,SuccessionState.EVIDENCE_BLOCKED)

    def test_expired_pin_record_blocks(self):
        note=self.sign(expires=NOW+timedelta(minutes=1))
        self.assertEqual(self.verify(
            record=note,pin=hashlib.sha256(_canonical(note)).hexdigest(),
            now=NOW+timedelta(minutes=2)
        ).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_future_observation_blocks(self):
        note=self.sign(issued=NOW+timedelta(minutes=1))
        self.assertEqual(self.verify(
            record=note,pin=hashlib.sha256(_canonical(note)).hexdigest()
        ).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_go13_changed_blocks_even_signed(self):
        note=self.sign(hold="GO")
        self.assertEqual(self.verify(
            record=note,pin=hashlib.sha256(_canonical(note)).hexdigest()
        ).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_boolean_sequence_blocks(self):
        note=self.sign(sequence=True)
        self.assertEqual(self.verify(
            record=note,pin=hashlib.sha256(_canonical(note)).hexdigest()
        ).state,SuccessionState.EVIDENCE_BLOCKED)

    def test_next_sequence_with_independently_pinned_previous_works(self):
        follow=self.sign(sequence=2,previous=self.pin)
        second=verify_succession_record(
            follow,self.roots,api_review=self.review,expected_repository=REPO,
            expected_run_id=RUN,expected_run_attempt=1,expected_job_id=JOB,
            expected_commit_sha=SHA,expected_workflow_path=WORKFLOW,
            independently_pinned_previous_sha256=self.pin,expected_sequence=2,
            independently_pinned_record_sha256=hashlib.sha256(_canonical(follow)).hexdigest(),
            now=NOW
        )
        self.assertEqual(second.state,SuccessionState.PINNED_INFORMATIONAL)
        self.assertFalse(second.activation_permitted)

    def test_no_result_grants_authority(self):
        from visitcard_v58_api_succession import SuccessionReview
        for state in SuccessionState:
            r=SuccessionReview(state,())
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
