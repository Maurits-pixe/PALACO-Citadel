"""RIO v5.1 independent-source and signed evidence packet regression tests."""
import copy
from datetime import timedelta
import hashlib
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from test_visitcard_v5_security_review import V5SecurityReviewTests
from test_visitcard_release_review import ReleaseReviewTests,NOW,COMMIT
from visitcard_v5_security_review import review_sources,MODULES,EXTERNAL_BLOCKERS
from visitcard_v51_review_packet import (
    SCOPE,DOMAINS,MAX_EVIDENCE,PacketState,inspect_security_packet,
    release_permitted,
)


def public(key):
    return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)


class V51PacketTests(unittest.TestCase):
    def setUp(self):
        self.sources=V5SecurityReviewTests("test_deterministic_inventory_hash")
        self.sources.setUp()
        self.addCleanup(self.sources.doCleanups)
        self.signer=ReleaseReviewTests("test_complete_independently_signed_pack_is_reviewable_not_releasable")
        self.signer.setUp()
        self.keys={}
        self.attestations=[]
        self.evidence={}
        for i,domain in enumerate(DOMAINS):
            secret=Ed25519PrivateKey.generate()
            ident=f"independent-{i}"
            self.keys[ident]=public(secret)
            self.evidence[domain]=("synthetic-"+domain).encode()
            self.attestations.append(self.signer.sign(
                secret,ident,domain,hashlib.sha256(self.evidence[domain]).hexdigest(),
                commit=COMMIT,scope=SCOPE
            ))
        self.inventory=self.sources.scan().inventory_sha256

    def inspect(self,**override):
        return inspect_security_packet(
            self.sources.root,
            pinned_source_sha256=override.get("source_pins",self.sources.pins),
            expected_commit_sha=override.get("commit",COMMIT),
            attestations=override.get("attestations",self.attestations),
            evidence_bytes=override.get("evidence",self.evidence),
            pinned_attestor_keys=override.get("keys",self.keys),
            expected_inventory_sha256=override.get("inventory",self.inventory),
            now=override.get("now",NOW),
        )

    def test_valid_synthetic_packet_remains_informational(self):
        result=self.inspect()
        self.assertEqual(result.state,PacketState.REVIEWABLE_INFORMATIONAL)
        self.assertEqual(result.blockers,EXTERNAL_BLOCKERS)
        self.assertIsNotNone(result.packet_sha256)
        self.assertFalse(result.release_permitted)
        self.assertFalse(result.merge_permitted)
        self.assertFalse(result.activation_permitted)

    def test_repeat_deterministic_packet_hash(self):
        self.assertEqual(self.inspect().packet_sha256,self.inspect().packet_sha256)

    def test_missing_source_inventory_pin_blocks(self):
        result=self.inspect(inventory="")
        self.assertEqual(result.state,PacketState.SOURCE_BLOCKED)
        self.assertIn("SOURCE_INVENTORY_PIN_MISMATCH",result.blockers)

    def test_wrong_source_inventory_pin_blocks(self):
        self.assertEqual(self.inspect(inventory="f"*64).state,PacketState.SOURCE_BLOCKED)

    def test_one_modified_source_blocks_even_if_signed_evidence_unchanged(self):
        (self.sources.root/MODULES[0]).write_text("def malicious(): return True\n")
        self.assertEqual(self.inspect().state,PacketState.SOURCE_BLOCKED)

    def test_wrong_commit_blocks_all_attestations(self):
        self.assertEqual(self.inspect(commit="b"*40).state,PacketState.ATTESTATIONS_BLOCKED)

    def test_missing_ci_attestation_blocks(self):
        self.assertEqual(self.inspect(attestations=self.attestations[1:]).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_missing_external_review_attestation_blocks(self):
        self.assertEqual(self.inspect(attestations=self.attestations[:1]).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_changed_ci_bytes_blocks(self):
        changed=dict(self.evidence)
        changed["CI_ZERO_SKIP"]=b"different output"
        self.assertEqual(self.inspect(evidence=changed).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_changed_external_review_bytes_blocks(self):
        changed=dict(self.evidence)
        changed["SECURITY_REVIEW"]=b"different independent report"
        self.assertEqual(self.inspect(evidence=changed).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_missing_ci_bytes_blocks(self):
        changed=dict(self.evidence)
        changed.pop("CI_ZERO_SKIP")
        self.assertEqual(self.inspect(evidence=changed).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_forged_signature_blocks_even_when_evidence_unchanged(self):
        copied=copy.deepcopy(self.attestations)
        copied[1]["signature"]="A"*86
        self.assertEqual(self.inspect(attestations=copied).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_unpinned_review_key_blocks(self):
        self.assertEqual(self.inspect(keys={}).state,PacketState.ATTESTATIONS_BLOCKED)

    def test_reused_signing_key_different_names_blocks(self):
        secret=Ed25519PrivateKey.generate()
        roots={"a":public(secret),"b":public(secret)}
        signed=[
            self.signer.sign(secret,"a",DOMAINS[0],hashlib.sha256(self.evidence[DOMAINS[0]]).hexdigest(),
                             commit=COMMIT,scope=SCOPE),
            self.signer.sign(secret,"b",DOMAINS[1],hashlib.sha256(self.evidence[DOMAINS[1]]).hexdigest(),
                             commit=COMMIT,scope=SCOPE),
        ]
        self.assertIn("INDEPENDENT_ATTESTOR_CONFLICT",
                      self.inspect(attestations=signed,keys=roots).blockers)

    def test_signatures_wrong_scope_block(self):
        secret=Ed25519PrivateKey.generate()
        other=self.signer.sign(secret,"other",DOMAINS[0],
                               hashlib.sha256(self.evidence[DOMAINS[0]]).hexdigest(),
                               commit=COMMIT,scope="RIO-VISITCARD-V4.1")
        copied=[other,self.attestations[1]]
        self.assertEqual(self.inspect(attestations=copied,keys={**self.keys,"other":public(secret)}).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_expired_attestations_block(self):
        self.assertEqual(self.inspect(now=NOW+timedelta(days=2)).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_oversized_ci_evidence_blocks(self):
        changed=dict(self.evidence)
        changed["CI_ZERO_SKIP"]=b"x"*(MAX_EVIDENCE+1)
        self.assertEqual(self.inspect(evidence=changed).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_duplicate_domain_attestation_blocks(self):
        self.assertEqual(self.inspect(attestations=[self.attestations[0]]*2).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_unknown_domain_blocks(self):
        changed=dict(self.evidence)
        changed["UNKNOWN"]=b"unrequested"
        self.assertEqual(self.inspect(evidence=changed).state,
                         PacketState.ATTESTATIONS_BLOCKED)

    def test_no_packet_can_grant_release_even_without_blockers(self):
        from visitcard_v51_review_packet import PacketResult
        for state in PacketState:
            result=PacketResult(state,(),None,None)
            self.assertFalse(result.release_permitted)
            self.assertFalse(result.merge_permitted)
            self.assertFalse(result.activation_permitted)
            self.assertFalse(release_permitted(result))
