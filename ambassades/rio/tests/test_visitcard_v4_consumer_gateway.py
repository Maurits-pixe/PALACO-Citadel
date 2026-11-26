"""RIO v4.0 required trust provenance consumer regressions — HOLD."""
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
import hashlib
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_witness_enrollment import _canonical
from visitcard_consumer_adapter import inspect_visitcard
from visitcard_verification_entrypoint import IntegratedState
from visitcard_consumer_policy import audit_consumer_source
from test_visitcard_trust_provenance import TrustProvenanceTests,NOW


class ConsumerV4Tests(unittest.TestCase):
    def setUp(self):
        self.fixture=TrustProvenanceTests("test_valid_manifest_with_full_chain_only_informational")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def check(self,**overrides):
        f=self.fixture.fixture
        g=f.fixture.fixture
        return inspect_visitcard(
            g.fixture.archive,g.registry,f.fixture.custodian,
            overrides.get("proof",f.proof),
            overrides.get("trust",f.trust),
            manifest=overrides.get("manifest",self.fixture.manifest),
            independently_pinned_roots=overrides.get("roots",self.fixture.roots),
            externally_pinned_manifest_sha256=overrides.get("pin",self.fixture.pin),
            now=overrides.get("now",NOW)
        )

    def test_full_approved_chain_only_informational(self):
        result=self.check()
        self.assertEqual(result.state,IntegratedState.MATCHED_INFORMATIONAL)
        self.assertFalse(result.can_authorize)
        self.assertEqual(result.policy,"RIO-VISITCARD-V3.9-GO13-HOLD")

    def test_cannot_call_adapter_without_manifest(self):
        f=self.fixture.fixture
        g=f.fixture.fixture
        with self.assertRaises(TypeError):
            inspect_visitcard(
                g.fixture.archive,g.registry,f.fixture.custodian,
                f.proof,f.trust,now=NOW
            )

    def test_missing_manifest_fails_closed(self):
        self.assertEqual(self.check(manifest=None).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_missing_out_of_band_pin_fails_closed(self):
        self.assertEqual(self.check(pin="").state,IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_external_pin_fails_closed(self):
        self.assertEqual(self.check(pin="f"*64).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_untrusted_roots_fails_closed(self):
        self.assertEqual(self.check(roots={}).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_expired_manifest_fails_closed(self):
        self.assertEqual(self.check(now=NOW+timedelta(hours=2)).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_proof_must_be_complete_even_with_valid_manifest(self):
        f=self.fixture.fixture
        invalid=replace(f.proof,secondary_checkpoint={})
        self.assertEqual(self.check(proof=invalid).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_trust_key_does_not_inherit_signed_manifest(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
        f=self.fixture.fixture
        forged=Ed25519PrivateKey.generate().public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        candidate=replace(f.trust,witness_keys={"witness":forged})
        self.assertEqual(self.check(trust=candidate).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_old_signed_manifest_rejected_after_pin_rotation(self):
        newer=self.fixture.make_manifest(epoch=2)
        newest_pin=hashlib.sha256(_canonical(newer)).hexdigest()
        self.assertEqual(self.check(pin=newest_pin).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_source_rejects_direct_v37_entrypoint(self):
        candidate=(
            "from visitcard_verification_entrypoint import ProofPackage,verify_visitcard\n"
            "from visitcard_trust_provenance import verify_with_trust_provenance\n"
            "def run(a,b,c,p,t): return verify_visitcard(a,b,c,proof=p,trust=t)\n"
        )
        errors=audit_consumer_source(Path(__file__).resolve().parents[1],candidate,
                                     "visitcard_consumer_fake.py")
        self.assertTrue(any("legacy" in s for s in errors))

    def test_source_rejects_provenance_omission(self):
        candidate=(
            "from visitcard_verification_entrypoint import ProofPackage\n"
            "def unused(): return None\n"
        )
        errors=audit_consumer_source(Path(__file__).resolve().parents[1],candidate,
                                     "visitcard_consumer_fake.py")
        self.assertTrue(any("provenance gateway" in s for s in errors))
