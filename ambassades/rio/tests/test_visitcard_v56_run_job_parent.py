"""RIO v5.6 signed parent-run job association regressions (synthetic)."""
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
from test_visitcard_v55_job_dossier import V55JobDossierTests,NOW,COMMIT,b64
from visitcard_v56_run_job_parent import (
    DOMAIN,SCOPE,ParentState,inspect_parent_evidence,verify_parent_link,
    execution_permitted
)


class V56ParentTests(unittest.TestCase):
    def setUp(self):
        self.f=V55JobDossierTests("test_valid_synthetic_dossier_still_informational")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.key=Ed25519PrivateKey.generate()
        self.roots={"parent":self.key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)}
        self.run_meta={"id":123456,"run_attempt":1,"head_sha":COMMIT,
                       "status":"completed","conclusion":"success",
                       "repository":self.f.f.f.f.repository}
        self.job_meta={"id":987654,"run_id":123456,"run_attempt":1,
                       "status":"completed","conclusion":"success"}
        self.signed=self.sign()

    def sign(self,*,key=None,observer="parent",run=None,job=None,
             run_id="123456",job_id="987654",attempt=1,
             child_run_id=None,child_attempt=None,
             commit=COMMIT,workflow=None,loghash=None,dossierhash=None,
             status="completed",conclusion="success",
             issued=NOW,expires=NOW+timedelta(minutes=10),hold="HOLD"):
        f=self.f
        run=self.run_meta if run is None else run
        job=self.job_meta if job is None else job
        p={"version":1,"scope":SCOPE,"repository":f.f.f.f.repository,
           "workflow_path":f.f.f.f.context["CI_ZERO_SKIP"][0],
           "branch":f.f.f.branch,"run_id":run_id,
           "run_attempt":attempt,"head_sha":commit,
           "workflow_sha":f.f.f.workflow_sha if workflow is None else workflow,
           "job_id":job_id,"job_run_id":run_id if child_run_id is None else child_run_id,
           "job_run_attempt":attempt if child_attempt is None else child_attempt,
           "job_status":status,"job_conclusion":conclusion,
           "job_dossier_sha256":hashlib.sha256(_canonical(f.dossier)).hexdigest()
                if dossierhash is None else dossierhash,
           "log_sha256":hashlib.sha256(f.f.log).hexdigest() if loghash is None else loghash,
           "run_metadata_sha256":hashlib.sha256(_canonical(run)).hexdigest(),
           "job_metadata_sha256":hashlib.sha256(_canonical(job)).hexdigest(),
           "retrieved_at":issued.isoformat(),"expires_at":expires.isoformat(),
           "go13":hold}
        signature=(self.key if key is None else key).sign(
            DOMAIN+observer.encode()+b"\x00"+_canonical(p))
        return {"payload":p,"observer_id":observer,"signature":b64(signature)}

    def verify(self,**kw):
        f=self.f
        log=f.f
        run=log.f
        proven=run.f
        return inspect_parent_evidence(
            proven.f.sources.root,pinned_source_sha256=proven.f.sources.pins,
            expected_commit_sha=COMMIT,attestations=proven.f.attestations,
            evidence_bytes=proven.f.evidence,
            pinned_attestor_keys=proven.f.keys,
            expected_inventory_sha256=proven.f.inventory,
            provenance_claims=proven.claims,
            pinned_provenance_signers=proven.keys,
            expected_repository=proven.repository,
            expected_execution_context=proven.context,
            observation=run.observation,pinned_run_observers=run.roots,
            expected_workflow_sha=run.workflow_sha,
            expected_branch=run.branch,expected_run_attempt=1,
            acquisition_receipt=log.receipt,pinned_collectors=log.keys,
            expected_job_id=log.job,log_bytes=log.log,
            job_dossier=f.dossier,pinned_job_observers=f.keys,
            parent_link=kw.get("signed",self.signed),
            pinned_parent_observers=kw.get("roots",self.roots),
            run_metadata=kw.get("run",self.run_meta),
            job_metadata=kw.get("job",self.job_meta),
            now=kw.get("now",NOW)
        )

    def test_valid_synthetic_parent_stays_informational(self):
        r=self.verify()
        self.assertEqual(r.state,ParentState.REVIEWABLE_INFORMATIONAL)
        self.assertFalse(r.release_permitted)
        self.assertFalse(r.merge_permitted)
        self.assertFalse(r.activation_permitted)

    def test_deterministic_parent_hash(self):
        self.assertEqual(self.verify().relationship_sha256,self.verify().relationship_sha256)

    def test_missing_link_denied(self):
        self.assertEqual(self.verify(signed=None).state,ParentState.PARENT_LINK_BLOCKED)

    def test_rogue_signature_denied(self):
        self.assertEqual(self.verify(signed=self.sign(key=Ed25519PrivateKey.generate())).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_unknown_root_denied(self):
        self.assertEqual(self.verify(roots={}).state,ParentState.PARENT_LINK_BLOCKED)

    def test_wrong_parent_run_denied(self):
        self.assertEqual(self.verify(signed=self.sign(run_id="123457")).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_wrong_job_id_denied(self):
        self.assertEqual(self.verify(signed=self.sign(job_id="987655")).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_job_reassigned_to_another_run_denied(self):
        job=dict(self.job_meta,run_id=123457)
        self.assertEqual(self.verify(job=job,signed=self.sign(job=job)).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_job_attempt_diverges_denied(self):
        job=dict(self.job_meta,run_attempt=2)
        self.assertEqual(self.verify(job=job,signed=self.sign(job=job)).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_signed_child_run_id_diverges(self):
        self.assertEqual(self.verify(signed=self.sign(child_run_id="123457")).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_signed_child_attempt_diverges(self):
        self.assertEqual(self.verify(signed=self.sign(child_attempt=2)).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_changed_run_metadata_bytes_denied(self):
        run=dict(self.run_meta,conclusion="failure")
        self.assertEqual(self.verify(run=run).state,ParentState.PARENT_LINK_BLOCKED)

    def test_rehashed_wrong_run_conclusion_denied(self):
        run=dict(self.run_meta,conclusion="failure")
        self.assertEqual(self.verify(run=run,signed=self.sign(run=run)).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_signed_failed_job_denied(self):
        self.assertEqual(self.verify(signed=self.sign(conclusion="failure")).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_wrong_commit_denied(self):
        self.assertEqual(self.verify(signed=self.sign(commit="c"*40)).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_wrong_workflow_denied(self):
        self.assertEqual(self.verify(signed=self.sign(workflow="c"*40)).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_wrong_dossier_digest_denied(self):
        self.assertEqual(self.verify(signed=self.sign(dossierhash="f"*64)).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_wrong_log_digest_denied(self):
        self.assertEqual(self.verify(signed=self.sign(loghash="f"*64)).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_expired_parent_direct_verifier_rejects(self):
        item=self.sign(expires=NOW+timedelta(minutes=2))
        self.assertIsNone(verify_parent_link(
            item,self.roots,expected_repository=self.f.f.f.f.repository,
            expected_workflow_path=self.f.f.f.f.context["CI_ZERO_SKIP"][0],
            expected_branch=self.f.f.f.branch,
            expected_run_id="123456",expected_run_attempt=1,
            expected_job_id="987654",expected_commit_sha=COMMIT,
            expected_workflow_sha=self.f.f.f.workflow_sha,
            expected_job_dossier_sha256=hashlib.sha256(_canonical(self.f.dossier)).hexdigest(),
            expected_log_sha256=hashlib.sha256(self.f.f.log).hexdigest(),
            run_metadata=self.run_meta,job_metadata=self.job_meta,
            now=NOW+timedelta(minutes=3)
        ))

    def test_future_observation_denied(self):
        self.assertEqual(self.verify(signed=self.sign(issued=NOW+timedelta(minutes=1))).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_parent_signer_key_reused_denied(self):
        same=self.f.key
        s=self.sign(key=same)
        roots={"parent":self.f.keys["job-observer"]}
        self.assertEqual(self.verify(signed=s,roots=roots).state,ParentState.PARENT_LINK_BLOCKED)

    def test_go13_tampering_denied(self):
        self.assertEqual(self.verify(signed=self.sign(hold="GO")).state,
                         ParentState.PARENT_LINK_BLOCKED)

    def test_upstream_invalid_denied(self):
        changed=dict(self.f.dossier)
        changed["signature"]="A"*86
        old=self.f.dossier
        try:
            self.f.dossier=changed
            self.assertEqual(self.verify().state,ParentState.UPSTREAM_BLOCKED)
        finally:
            self.f.dossier=old

    def test_no_authority_from_any_state(self):
        from visitcard_v56_run_job_parent import ParentReview
        for state in ParentState:
            r=ParentReview(state,(),None,None)
            self.assertFalse(execution_permitted(r))
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
