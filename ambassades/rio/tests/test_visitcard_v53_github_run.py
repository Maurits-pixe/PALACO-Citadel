"""RIO v5.3 signed GitHub run observations — negative provenance regressions."""
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
from visitcard_v53_github_run import (
    DOMAIN,SCOPE,RunState,verify_signed_run_observation,
    inspect_run_bound_provenance,execution_permitted,
)
from test_visitcard_v52_provenance import V52ProvenanceTests,NOW,COMMIT


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


class V53RunObservationTests(unittest.TestCase):
    def setUp(self):
        self.f=V52ProvenanceTests(
            "test_signed_provenance_reviewable_informational_not_releasable"
        )
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.key=Ed25519PrivateKey.generate()
        self.roots={"observer":self.key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)}
        self.workflow_sha="b"*40
        self.branch="rio-visitcard-share-preview-20261122"
        self.observation=self.sign()

    def sign(self,*,key=None,observer="observer",repo=None,workflow=None,
             run_id="123456",attempt=1,branch=None,commit=COMMIT,
             workflow_sha=None,artifact_sha=None,conclusion="success",
             status="completed",event="push",issued=NOW,
             expires=NOW+timedelta(minutes=10),hold="HOLD",url=None):
        repo=self.f.repository if repo is None else repo
        work=self.f.context["CI_ZERO_SKIP"][0] if workflow is None else workflow
        digest=(hashlib.sha256(self.f.f.evidence["CI_ZERO_SKIP"]).hexdigest()
                if artifact_sha is None else artifact_sha)
        p={
            "version":1,"scope":SCOPE,"repository":repo,"workflow_path":work,
            "event":event,"head_branch":self.branch if branch is None else branch,
            "run_id":run_id,"run_attempt":attempt,
            "run_status":status,"run_conclusion":conclusion,
            "head_sha":commit,
            "workflow_sha":self.workflow_sha if workflow_sha is None else workflow_sha,
            "run_url":("https://github.com/"+repo+"/actions/runs/"+run_id)
                if url is None else url,
            "artifact_sha256":digest,"checked_at":issued.isoformat(),
            "expires_at":expires.isoformat(),"go13":hold
        }
        signed=(self.key if key is None else key).sign(
            DOMAIN+observer.encode()+b"\x00"+_canonical(p)
        )
        return {"payload":p,"observer_id":observer,"signature":b64(signed)}

    def inspect(self,**kw):
        f=self.f
        return inspect_run_bound_provenance(
            f.f.sources.root,pinned_source_sha256=f.f.sources.pins,
            expected_commit_sha=kw.get("commit",COMMIT),
            attestations=f.f.attestations,
            evidence_bytes=kw.get("evidence",f.f.evidence),
            pinned_attestor_keys=f.f.keys,
            expected_inventory_sha256=f.f.inventory,
            provenance_claims=kw.get("claims",f.claims),
            pinned_provenance_signers=f.keys,
            expected_repository=f.repository,
            expected_execution_context=f.context,
            observation=kw.get("observation",self.observation),
            pinned_run_observers=kw.get("roots",self.roots),
            expected_workflow_sha=kw.get("workflow_sha",self.workflow_sha),
            expected_branch=kw.get("branch",self.branch),
            expected_run_attempt=kw.get("attempt",1),
            now=kw.get("now",NOW),
        )

    def test_signed_observation_is_informational_only(self):
        r=self.inspect()
        self.assertEqual(r.state,RunState.REVIEWABLE_INFORMATIONAL)
        self.assertIsNotNone(r.verified_observation_sha256)
        self.assertFalse(r.release_permitted)
        self.assertFalse(r.activation_permitted)

    def test_deterministic_observation_digest(self):
        self.assertEqual(self.inspect().verified_observation_sha256,
                         self.inspect().verified_observation_sha256)

    def test_missing_observation_blocks(self):
        self.assertEqual(self.inspect(observation=None).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_rogue_observer_signature_blocks(self):
        note=self.sign(key=Ed25519PrivateKey.generate())
        self.assertEqual(self.inspect(observation=note).state,RunState.RUN_OBSERVATION_BLOCKED)

    def test_unpinned_observer_blocks(self):
        self.assertEqual(self.inspect(roots={}).state,RunState.RUN_OBSERVATION_BLOCKED)

    def test_forged_signature_blocks(self):
        note=copy.deepcopy(self.observation)
        note["signature"]="A"*86
        self.assertEqual(self.inspect(observation=note).state,RunState.RUN_OBSERVATION_BLOCKED)

    def test_changed_workflow_path_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(workflow=".github/workflows/other.yml")).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_changed_commit_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(commit="c"*40)).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_wrong_repository_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(repo="other/other")).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_changed_branch_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(branch="main")).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_wrong_attempt_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(attempt=2)).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_expected_attempt_different_from_signed_provenance_blocks(self):
        self.assertEqual(self.inspect(attempt=2).state,RunState.RUN_OBSERVATION_BLOCKED)

    def test_wrong_workflow_sha_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(workflow_sha="c"*40)).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_changed_artifact_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(artifact_sha="f"*64)).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_failed_run_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(conclusion="failure")).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_queued_run_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(status="queued")).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_wrong_run_url_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(url="https://example.org/run")).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_wrong_run_id_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(run_id="123457")).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_expired_observation_blocks(self):
        self.assertEqual(self.inspect(now=NOW+timedelta(minutes=20)).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_future_observation_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(issued=NOW+timedelta(minutes=1))).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_changed_go13_blocks(self):
        self.assertEqual(self.inspect(observation=self.sign(hold="GO")).state,
                         RunState.RUN_OBSERVATION_BLOCKED)

    def test_prior_provenance_tampering_blocks_before_run(self):
        claims=copy.deepcopy(self.f.claims)
        claims[0]["signature"]="A"*86
        self.assertEqual(self.inspect(claims=claims).state,RunState.PROVENANCE_BLOCKED)

    def test_no_run_review_can_grant_execution(self):
        from visitcard_v53_github_run import RunReview
        for state in RunState:
            r=RunReview(state,(),None,None)
            self.assertFalse(execution_permitted(r))
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
