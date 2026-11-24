"""RIO v5.5 signed job metadata + contiguous byte-log regressions."""
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
from visitcard_v55_job_dossier import (
    DOMAIN,SCOPE,ZERO,MAX_SEGMENTS,JobState,verify_job_dossier,
    inspect_job_evidence,execution_permitted,
)
from test_visitcard_v54_log_custody import V54LogCustodyTests,NOW,COMMIT


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


class V55JobDossierTests(unittest.TestCase):
    def setUp(self):
        self.f=V54LogCustodyTests("test_valid_synthetic_log_still_informational")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.key=Ed25519PrivateKey.generate()
        self.keys={"job-observer":self.key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)}
        self.dossier=self.sign()

    def sign(self,*,key=None,observer="job-observer",log=None,
             chunks=None,repo=None,run="123456",attempt=1,job=None,
             commit=COMMIT,workflow=None,status="completed",
             conclusion="success",issued=NOW,
             expires=NOW+timedelta(minutes=10),hold="HOLD"):
        data=self.f.log if log is None else log
        chunks=[len(data)//2,len(data)-len(data)//2] if chunks is None else chunks
        parts=[]
        previous=ZERO
        offset=0
        for index,length in enumerate(chunks):
            digest=hashlib.sha256(data[offset:offset+length]).hexdigest()
            parts.append({"index":index,"offset":offset,"size_bytes":length,
                          "sha256":digest,"previous_sha256":previous})
            previous=digest
            offset+=length
        p={"version":1,"scope":SCOPE,
           "repository":self.f.f.f.repository if repo is None else repo,
           "run_id":run,"run_attempt":attempt,
           "job_id":self.f.job if job is None else job,
           "head_sha":commit,
           "workflow_sha":self.f.f.workflow_sha if workflow is None else workflow,
           "job_status":status,"job_conclusion":conclusion,
           "log_sha256":hashlib.sha256(data).hexdigest(),
           "log_size_bytes":len(data),"segments":parts,
           "observed_at":issued.isoformat(),"expires_at":expires.isoformat(),
           "go13":hold}
        signature=(self.key if key is None else key).sign(
            DOMAIN+observer.encode()+b"\x00"+_canonical(p))
        return {"payload":p,"observer_id":observer,"signature":b64(signature)}

    def inspect(self,**kw):
        f=self.f
        run=f.f
        provenance=run.f
        return inspect_job_evidence(
            provenance.f.sources.root,
            pinned_source_sha256=provenance.f.sources.pins,
            expected_commit_sha=COMMIT,
            attestations=provenance.f.attestations,
            evidence_bytes=provenance.f.evidence,
            pinned_attestor_keys=provenance.f.keys,
            expected_inventory_sha256=provenance.f.inventory,
            provenance_claims=provenance.claims,
            pinned_provenance_signers=provenance.keys,
            expected_repository=provenance.repository,
            expected_execution_context=provenance.context,
            observation=run.observation,
            pinned_run_observers=run.roots,
            expected_workflow_sha=run.workflow_sha,
            expected_branch=run.branch,
            expected_run_attempt=kw.get("attempt",1),
            acquisition_receipt=kw.get("receipt",f.receipt),
            pinned_collectors=f.keys,
            expected_job_id=kw.get("job",f.job),
            log_bytes=kw.get("log",f.log),
            job_dossier=kw.get("dossier",self.dossier),
            pinned_job_observers=kw.get("keys",self.keys),
            now=kw.get("now",NOW),
        )

    def test_valid_synthetic_dossier_still_informational(self):
        r=self.inspect()
        self.assertEqual(r.state,JobState.REVIEWABLE_INFORMATIONAL)
        self.assertEqual(r.log_sha256,hashlib.sha256(self.f.log).hexdigest())
        self.assertFalse(r.release_permitted)
        self.assertFalse(r.merge_permitted)
        self.assertFalse(r.activation_permitted)

    def test_deterministic_job_dossier_digest(self):
        self.assertEqual(self.inspect().dossier_sha256,self.inspect().dossier_sha256)

    def test_missing_segment_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(chunks=[10])).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_overlapping_segments_fail(self):
        bad=copy.deepcopy(self.dossier)
        bad["payload"]["segments"][1]["offset"]=0
        self.assertEqual(self.inspect(dossier=bad).state,JobState.JOB_DOSSIER_BLOCKED)

    def test_empty_segment_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(chunks=[0,len(self.f.log)])).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_out_of_order_segments_fail(self):
        bad=copy.deepcopy(self.dossier)
        bad["payload"]["segments"].reverse()
        self.assertEqual(self.inspect(dossier=bad).state,JobState.JOB_DOSSIER_BLOCKED)

    def test_wrong_predecessor_hash_fails(self):
        bad=copy.deepcopy(self.dossier)
        bad["payload"]["segments"][1]["previous_sha256"]="f"*64
        self.assertEqual(self.inspect(dossier=bad).state,JobState.JOB_DOSSIER_BLOCKED)

    def test_altered_segment_hash_fails(self):
        bad=copy.deepcopy(self.dossier)
        bad["payload"]["segments"][0]["sha256"]="f"*64
        self.assertEqual(self.inspect(dossier=bad).state,JobState.JOB_DOSSIER_BLOCKED)

    def test_changed_log_bytes_fail_upstream(self):
        self.assertEqual(self.inspect(log=self.f.log+b"forged").state,
                         JobState.UPSTREAM_BLOCKED)

    def test_job_dossier_substitution_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(log=b"different")).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_wrong_job_id_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(job="999")).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_wrong_run_id_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(run="123457")).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_wrong_run_attempt_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(attempt=2)).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_wrong_commit_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(commit="c"*40)).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_wrong_workflow_sha_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(workflow="c"*40)).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_failed_job_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(conclusion="failure")).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_queued_job_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(status="queued")).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_rogue_signer_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(key=Ed25519PrivateKey.generate())).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_unpinned_signer_fails(self):
        self.assertEqual(self.inspect(keys={}).state,JobState.JOB_DOSSIER_BLOCKED)

    def test_signer_reusing_collector_key_fails(self):
        reused=self.sign(key=self.f.key)
        self.assertEqual(self.inspect(dossier=reused,
                         keys={"job-observer":self.f.keys["collector"]}).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_expired_dossier_direct_verifier_fails(self):
        note=self.sign(expires=NOW+timedelta(minutes=2))
        verified=verify_job_dossier(
            note,self.keys,
            expected_repository=self.f.f.f.repository,
            expected_run_id="123456",expected_run_attempt=1,
            expected_job_id=self.f.job,expected_commit_sha=COMMIT,
            expected_workflow_sha=self.f.f.workflow_sha,
            log_bytes=self.f.log,now=NOW+timedelta(minutes=3)
        )
        self.assertIsNone(verified)

    def test_future_dossier_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(issued=NOW+timedelta(minutes=1))).state,
                         JobState.JOB_DOSSIER_BLOCKED)

    def test_more_than_segment_bound_fails(self):
        self.assertEqual(self.inspect(dossier=self.sign(chunks=[1]*(
            MAX_SEGMENTS+1))).state,JobState.JOB_DOSSIER_BLOCKED)

    def test_no_dossier_result_can_authorize(self):
        from visitcard_v55_job_dossier import JobReview
        for state in JobState:
            result=JobReview(state,(),None,None)
            self.assertFalse(execution_permitted(result))
            self.assertFalse(result.release_permitted)
            self.assertFalse(result.merge_permitted)
            self.assertFalse(result.activation_permitted)
