"""RIO v5.2 CI / security provenance binding regression tests."""
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
from test_visitcard_v51_review_packet import V51PacketTests,NOW,COMMIT
from visitcard_v51_review_packet import DOMAINS
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_v52_provenance import (
    DOMAIN,SCOPE,ProvenanceState,inspect_provenance_packet,
    verify_provenance_claim,release_permitted,
)


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def pub(key):
    return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)


class V52ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.f=V51PacketTests("test_valid_synthetic_packet_remains_informational")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.keys={}
        self.private={}
        self.context={
            "CI_ZERO_SKIP":(".github/workflows/rio-visitcard-draft-verification.yml",
                            "github-actions:runner-ephemeral"),
            "SECURITY_REVIEW":("independent-review:case-001","external-auditor:reviewer-1"),
        }
        self.repository="Maurits-pixe/PALACO-Citadel"
        self.claims=[]
        for i,cat in enumerate(DOMAINS):
            secret=Ed25519PrivateKey.generate()
            self.private[cat]=secret
            self.keys[f"provenance-{cat}"]=pub(secret)
            self.claims.append(self.sign(
                cat,secret,signer=f"provenance-{cat}"
            ))

    def sign(self,cat,key,*,signer=None,commit=COMMIT,inventory=None,
             evidence_sha=None,repository=None,reference=None,identity=None,
             execution_id=None,attempt=1,issued=NOW,
             expires=NOW+timedelta(hours=1),hold="HOLD"):
        digest=hashlib.sha256(self.f.evidence[cat]).hexdigest() if evidence_sha is None else evidence_sha
        ref,executor=self.context[cat]
        payload={
            "version":1,"scope":SCOPE,"category":cat,
            "repository":self.repository if repository is None else repository,
            "execution_ref":ref if reference is None else reference,
            "execution_id":("123456" if cat=="CI_ZERO_SKIP" else "review-case-001")
                if execution_id is None else execution_id,
            "execution_attempt":attempt,
            "executor_identity":executor if identity is None else identity,
            "commit_sha":commit,
            "inventory_sha256":self.f.inventory if inventory is None else inventory,
            "artifact_sha256":digest,"artifact_uri":"sha256:"+digest,
            "issued_at":issued.isoformat(),"expires_at":expires.isoformat(),
            "go13":hold,
        }
        label=f"provenance-{cat}" if signer is None else signer
        signature=key.sign(DOMAIN+label.encode()+b"\x00"+_canonical(payload))
        return {"payload":payload,"signer_id":label,"signature":b64(signature)}

    def verify(self,**kw):
        return inspect_provenance_packet(
            self.f.sources.root,
            pinned_source_sha256=kw.get("source_pins",self.f.sources.pins),
            expected_commit_sha=kw.get("commit",COMMIT),
            attestations=kw.get("attestations",self.f.attestations),
            evidence_bytes=kw.get("evidence",self.f.evidence),
            pinned_attestor_keys=kw.get("attestor_keys",self.f.keys),
            expected_inventory_sha256=kw.get("inventory",self.f.inventory),
            provenance_claims=kw.get("claims",self.claims),
            pinned_provenance_signers=kw.get("keys",self.keys),
            expected_repository=kw.get("repository",self.repository),
            expected_execution_context=kw.get("context",self.context),
            now=kw.get("now",NOW),
        )

    def test_signed_provenance_reviewable_informational_not_releasable(self):
        r=self.verify()
        self.assertEqual(r.state,ProvenanceState.REVIEWABLE_INFORMATIONAL)
        self.assertEqual(r.blockers,EXTERNAL_BLOCKERS)
        self.assertIsNotNone(r.provenance_sha256)
        self.assertFalse(r.release_permitted)
        self.assertFalse(r.merge_permitted)
        self.assertFalse(r.activation_permitted)
        self.assertFalse(release_permitted(r))

    def test_deterministic_digest(self):
        self.assertEqual(self.verify().provenance_sha256,self.verify().provenance_sha256)

    def test_changed_ci_bytes_blocks_existing_packet(self):
        changed=dict(self.f.evidence)
        changed["CI_ZERO_SKIP"]=b"edited"
        self.assertEqual(self.verify(evidence=changed).state,ProvenanceState.PACKET_BLOCKED)

    def test_wrong_inventory_blocks_packet(self):
        self.assertEqual(self.verify(inventory="f"*64).state,ProvenanceState.PACKET_BLOCKED)

    def test_wrong_commit_blocks_underlying_attestation(self):
        self.assertEqual(self.verify(commit="b"*40).state,ProvenanceState.PACKET_BLOCKED)

    def test_missing_claim_blocks(self):
        self.assertEqual(self.verify(claims=self.claims[:1]).state,ProvenanceState.PROVENANCE_BLOCKED)

    def test_duplicate_domain_blocks(self):
        self.assertEqual(self.verify(claims=[self.claims[0]]*2).state,ProvenanceState.PROVENANCE_BLOCKED)

    def test_forged_claim_signature_rejected_with_recomputed_digest(self):
        copied=copy.deepcopy(self.claims)
        copied[0]["signature"]="A"*86
        self.assertEqual(self.verify(claims=copied).state,ProvenanceState.PROVENANCE_BLOCKED)

    def test_unpinned_claim_signer_blocks(self):
        self.assertEqual(self.verify(keys={}).state,ProvenanceState.PROVENANCE_BLOCKED)

    def test_changed_repository_blocks(self):
        changed=dict(self.claims[0]["payload"])
        wrong=self.sign("CI_ZERO_SKIP",self.private["CI_ZERO_SKIP"],
                        repository="somebody-else/elsewhere")
        self.assertEqual(self.verify(claims=[wrong,self.claims[1]]).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_changed_workflow_ref_blocks(self):
        wrong=self.sign("CI_ZERO_SKIP",self.private["CI_ZERO_SKIP"],
                        reference=".github/workflows/other.yml")
        self.assertEqual(self.verify(claims=[wrong,self.claims[1]]).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_wrong_runner_identity_blocks(self):
        wrong=self.sign("CI_ZERO_SKIP",self.private["CI_ZERO_SKIP"],
                        identity="untrusted-runner")
        self.assertEqual(self.verify(claims=[wrong,self.claims[1]]).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_changed_execution_attempt_alters_packet_digest(self):
        changed=self.sign("CI_ZERO_SKIP",self.private["CI_ZERO_SKIP"],attempt=2)
        r=self.verify(claims=[changed,self.claims[1]])
        self.assertEqual(r.state,ProvenanceState.REVIEWABLE_INFORMATIONAL)
        self.assertNotEqual(r.provenance_sha256,self.verify().provenance_sha256)

    def test_boolean_execution_attempt_fails(self):
        wrong=self.sign("CI_ZERO_SKIP",self.private["CI_ZERO_SKIP"],attempt=True)
        self.assertEqual(self.verify(claims=[wrong,self.claims[1]]).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_non_decimal_ci_run_id_fails(self):
        wrong=self.sign("CI_ZERO_SKIP",self.private["CI_ZERO_SKIP"],execution_id="run-alpha")
        self.assertEqual(self.verify(claims=[wrong,self.claims[1]]).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_changed_artifact_digest_fails(self):
        wrong=self.sign("CI_ZERO_SKIP",self.private["CI_ZERO_SKIP"],evidence_sha="f"*64)
        self.assertEqual(self.verify(claims=[wrong,self.claims[1]]).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_mismatched_review_claim_fails(self):
        wrong=self.sign("SECURITY_REVIEW",self.private["SECURITY_REVIEW"],
                        identity="forged-auditor")
        self.assertEqual(self.verify(claims=[self.claims[0],wrong]).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_expired_provenance_fails(self):
        self.assertEqual(self.verify(now=NOW+timedelta(days=2)).state,
                         ProvenanceState.PACKET_BLOCKED)

    def test_future_provenance_fails(self):
        wrong=self.sign("CI_ZERO_SKIP",self.private["CI_ZERO_SKIP"],
                        issued=NOW+timedelta(minutes=1))
        self.assertEqual(self.verify(claims=[wrong,self.claims[1]]).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_reused_signing_key_under_different_labels_fails(self):
        same=Ed25519PrivateKey.generate()
        altered=[
            self.sign("CI_ZERO_SKIP",same,signer="one"),
            self.sign("SECURITY_REVIEW",same,signer="two"),
        ]
        roots={"one":pub(same),"two":pub(same)}
        self.assertEqual(self.verify(claims=altered,keys=roots).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_missing_expected_execution_context_fails(self):
        self.assertEqual(self.verify(context={}).state,ProvenanceState.PROVENANCE_BLOCKED)

    def test_go13_change_in_signed_claim_fails(self):
        wrong=self.sign("CI_ZERO_SKIP",self.private["CI_ZERO_SKIP"],hold="GO")
        self.assertEqual(self.verify(claims=[wrong,self.claims[1]]).state,
                         ProvenanceState.PROVENANCE_BLOCKED)

    def test_wrong_scope_in_signed_claim_fails(self):
        wrong=copy.deepcopy(self.claims)
        wrong[0]["payload"]["scope"]="OTHER"
        self.assertEqual(self.verify(claims=wrong).state,ProvenanceState.PROVENANCE_BLOCKED)
