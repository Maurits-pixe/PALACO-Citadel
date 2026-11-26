"""RIO v5.4 byte-for-byte CI job log acquisition regression tests."""
import base64
import copy
from datetime import timedelta
import hashlib
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from test_visitcard_v53_github_run import V53RunObservationTests,NOW,COMMIT
from visitcard_v54_log_custody import (
    DOMAIN,SCOPE,LogState,MAX_LOG,inspect_log_custody_packet,
    verify_acquisition_receipt,execution_permitted,
)


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class V54LogCustodyTests(unittest.TestCase):
    def setUp(self):
        self.f=V53RunObservationTests("test_signed_observation_is_informational_only")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.key=Ed25519PrivateKey.generate()
        self.keys={"collector":self.key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)}
        self.log=b"Run tests\nRan 1121 tests in 31.475s\nOK\nPASS: skipped=0\n"
        self.job="987654"
        self.receipt=self.sign()

    def sign(self,*,key=None,collector="collector",log=None,run="123456",
             attempt=1,job=None,repo=None,commit=COMMIT,workflow_sha=None,
             method="GITHUB_ACTIONS_JOB_LOGS_API",issued=NOW,
             expires=NOW+timedelta(minutes=10),hold="HOLD",size=None):
        data=self.log if log is None else log
        f=self.f
        p={"version":1,"scope":SCOPE,
           "repository":f.f.repository if repo is None else repo,
           "run_id":run,"run_attempt":attempt,
           "job_id":self.job if job is None else job,
           "workflow_sha":f.workflow_sha if workflow_sha is None else workflow_sha,
           "head_sha":commit,
           "log_sha256":hashlib.sha256(data).hexdigest(),
           "log_size_bytes":len(data) if size is None else size,
           "retrieval_method":method,
           "retrieved_at":issued.isoformat(),"expires_at":expires.isoformat(),
           "go13":hold}
        signed=(self.key if key is None else key).sign(
            DOMAIN+collector.encode()+b"\x00"+_canonical(p))
        return {"payload":p,"collector_id":collector,"signature":b64(signed)}

    def inspect(self,**kw):
        f=self.f
        p=f.f
        return inspect_log_custody_packet(
            p.f.sources.root,pinned_source_sha256=p.f.sources.pins,
            expected_commit_sha=COMMIT,
            attestations=p.f.attestations,evidence_bytes=p.f.evidence,
            pinned_attestor_keys=p.f.keys,
            expected_inventory_sha256=p.f.inventory,
            provenance_claims=p.claims,pinned_provenance_signers=p.keys,
            expected_repository=p.repository,expected_execution_context=p.context,
            observation=kw.get("observation",f.observation),
            pinned_run_observers=kw.get("observers",f.roots),
            expected_workflow_sha=f.workflow_sha,
            expected_branch=f.branch,expected_run_attempt=kw.get("attempt",1),
            acquisition_receipt=kw.get("receipt",self.receipt),
            pinned_collectors=kw.get("keys",self.keys),
            expected_job_id=kw.get("job",self.job),
            log_bytes=kw.get("log",self.log),now=kw.get("now",NOW),
        )

    def test_valid_synthetic_log_still_informational(self):
        result=self.inspect()
        self.assertEqual(result.state,LogState.REVIEWABLE_INFORMATIONAL)
        self.assertEqual(result.log_sha256,hashlib.sha256(self.log).hexdigest())
        self.assertFalse(result.release_permitted)
        self.assertFalse(result.activation_permitted)

    def test_changed_original_log_bytes_block(self):
        self.assertEqual(self.inspect(log=self.log+b"fake").state,
                         LogState.ACQUISITION_BLOCKED)

    def test_missing_log_bytes_block(self):
        self.assertEqual(self.inspect(log=b"").state,LogState.ACQUISITION_BLOCKED)

    def test_oversized_log_bytes_block(self):
        self.assertEqual(self.inspect(log=b"x"*(MAX_LOG+1)).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_forged_collector_signature_block(self):
        self.assertEqual(self.inspect(
            receipt=self.sign(key=Ed25519PrivateKey.generate())
        ).state,LogState.ACQUISITION_BLOCKED)

    def test_missing_collector_trust_root_block(self):
        self.assertEqual(self.inspect(keys={}).state,LogState.ACQUISITION_BLOCKED)

    def test_reused_observer_key_as_collector_block(self):
        same_key=self.f.key
        receipt=self.sign(key=same_key)
        roots={"collector":self.f.roots["observer"]}
        self.assertEqual(self.inspect(receipt=receipt,keys=roots).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_wrong_run_id_block(self):
        self.assertEqual(self.inspect(receipt=self.sign(run="123457")).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_wrong_run_attempt_block(self):
        self.assertEqual(self.inspect(receipt=self.sign(attempt=2)).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_wrong_job_id_block(self):
        self.assertEqual(self.inspect(receipt=self.sign(job="111")).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_wrong_workflow_sha_block(self):
        self.assertEqual(self.inspect(receipt=self.sign(workflow_sha="c"*40)).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_wrong_head_sha_block(self):
        self.assertEqual(self.inspect(receipt=self.sign(commit="c"*40)).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_wrong_repository_block(self):
        self.assertEqual(self.inspect(receipt=self.sign(repo="else/else")).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_wrong_log_size_block(self):
        self.assertEqual(self.inspect(receipt=self.sign(size=1)).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_wrong_retrieval_method_block(self):
        self.assertEqual(self.inspect(receipt=self.sign(method="LOCAL_SELF_REPORT")).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_expired_upstream_observation_blocks_before_acquisition(self):
        self.assertEqual(self.inspect(now=NOW+timedelta(minutes=20)).state,
                         LogState.RUN_BLOCKED)

    def test_expired_acquisition_receipt_rejected_directly(self):
        receipt=self.sign(expires=NOW+timedelta(minutes=2))
        verified=verify_acquisition_receipt(
            receipt,self.keys,expected_repository=self.f.f.repository,
            expected_run_id="123456",expected_run_attempt=1,
            expected_job_id=self.job,expected_workflow_sha=self.f.workflow_sha,
            expected_commit_sha=COMMIT,log_bytes=self.log,
            now=NOW+timedelta(minutes=3),
        )
        self.assertIsNone(verified)

    def test_future_acquisition_block(self):
        self.assertEqual(self.inspect(
            receipt=self.sign(issued=NOW+timedelta(minutes=1))
        ).state,LogState.ACQUISITION_BLOCKED)

    def test_noncanonical_signature_block(self):
        forged=copy.deepcopy(self.receipt)
        forged["signature"]="A"*86
        self.assertEqual(self.inspect(receipt=forged).state,LogState.ACQUISITION_BLOCKED)

    def test_broken_upstream_run_blocks(self):
        bad=copy.deepcopy(self.f.observation)
        bad["signature"]="A"*86
        self.assertEqual(self.inspect(observation=bad).state,LogState.RUN_BLOCKED)

    def test_go13_change_blocks(self):
        self.assertEqual(self.inspect(receipt=self.sign(hold="GO")).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_bool_log_size_rejected(self):
        self.assertEqual(self.inspect(receipt=self.sign(size=True)).state,
                         LogState.ACQUISITION_BLOCKED)

    def test_output_never_grants_authority(self):
        from visitcard_v54_log_custody import LogReview
        for state in LogState:
            result=LogReview(state,(),None,None,None)
            self.assertFalse(result.release_permitted)
            self.assertFalse(result.merge_permitted)
            self.assertFalse(result.activation_permitted)
            self.assertFalse(execution_permitted(result))
