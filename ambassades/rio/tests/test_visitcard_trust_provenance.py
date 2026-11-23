"""RIO v3.9 out-of-band trust-provenance regression tests."""
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
import base64
import hashlib
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from visitcard_trust_provenance import (
    DOMAIN,trust_fingerprint,freeze_trust,verify_trust_manifest,
    verify_with_trust_provenance,execution_permitted,IntegratedState
)
from test_visitcard_verification_entrypoint import EntryPointTests,NOW


def public(key):
    return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


class TrustProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.fixture=EntryPointTests("test_full_chain_matches_but_never_authorizes")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root=Ed25519PrivateKey.generate()
        self.roots={"root-a":public(self.root)}
        self.manifest=self.make_manifest()
        self.pin=hashlib.sha256(_canonical(self.manifest)).hexdigest()

    def make_manifest(self,*,epoch=1,issued=NOW,expires=NOW+timedelta(hours=1),trust=None,root=None):
        candidate=self.fixture.trust if trust is None else trust
        payload={
            "version":1,"issuer":candidate.issuer,"nonce":candidate.nonce,
            "epoch":epoch,"trust_sha256":trust_fingerprint(candidate),
            "issued_at":issued.isoformat(),"expires_at":expires.isoformat(),
        }
        key=self.root if root is None else root
        signature=key.sign(DOMAIN+b"root-a\x00"+_canonical(payload))
        return {"payload":payload,"root_id":"root-a","signature":b64(signature)}

    def check(self,**kw):
        f=self.fixture
        g=f.fixture.fixture
        return verify_with_trust_provenance(
            g.fixture.archive,g.registry,f.fixture.custodian,
            proof=kw.get("proof",f.proof),trust=kw.get("trust",f.trust),
            manifest=kw.get("manifest",self.manifest),
            independently_pinned_roots=kw.get("roots",self.roots),
            externally_pinned_manifest_sha256=kw.get("pin",self.pin),
            now=kw.get("now",NOW)
        )

    def test_valid_manifest_with_full_chain_only_informational(self):
        result=self.check()
        self.assertEqual(result.state,IntegratedState.MATCHED_INFORMATIONAL)
        self.assertEqual(result.policy,"RIO-VISITCARD-V3.9-GO13-HOLD")
        self.assertFalse(result.can_authorize)

    def test_verification_never_grants_execution(self):
        self.assertFalse(execution_permitted(self.check()))

    def test_no_independently_pinned_root_denied(self):
        self.assertEqual(self.check(roots={}).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_manifest_pin_denied(self):
        self.assertEqual(self.check(pin="f"*64).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_omitted_manifest_pin_denied(self):
        self.assertEqual(self.check(pin="").state,IntegratedState.UNKNOWN_BLOCKED)

    def test_expired_manifest_denied(self):
        self.assertEqual(self.check(now=NOW+timedelta(hours=2)).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_future_manifest_denied(self):
        manifest=self.make_manifest(issued=NOW+timedelta(minutes=1))
        self.assertEqual(self.check(manifest=manifest,pin=hashlib.sha256(_canonical(manifest)).hexdigest()).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_excessive_manifest_lifetime_denied(self):
        manifest=self.make_manifest(expires=NOW+timedelta(days=2))
        self.assertEqual(self.check(manifest=manifest,pin=hashlib.sha256(_canonical(manifest)).hexdigest()).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_stale_but_valid_old_manifest_rejected_by_new_pin(self):
        newer=self.make_manifest(epoch=2)
        latest_pin=hashlib.sha256(_canonical(newer)).hexdigest()
        self.assertEqual(self.check(manifest=self.manifest,pin=latest_pin).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_tampered_root_signature_denied(self):
        import copy
        changed=copy.deepcopy(self.manifest)
        changed["signature"]="A"*86
        self.assertEqual(self.check(manifest=changed,pin=hashlib.sha256(_canonical(changed)).hexdigest()).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_different_root_not_trusted(self):
        rogue=Ed25519PrivateKey.generate()
        changed=self.make_manifest(root=rogue)
        self.assertEqual(self.check(manifest=changed,pin=hashlib.sha256(_canonical(changed)).hexdigest()).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_replaced_publisher_key_fails_binding(self):
        replaced=replace(self.fixture.trust,publisher_keys={"publisher":public(Ed25519PrivateKey.generate())})
        self.assertEqual(self.check(trust=replaced).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_replaced_custodian_key_fails_binding(self):
        replaced=replace(self.fixture.trust,
                         secondary_custodians={"custodian-b":public(Ed25519PrivateKey.generate())})
        self.assertEqual(self.check(trust=replaced).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_relabelled_key_fails_binding(self):
        original=self.fixture.trust
        renamed=replace(original,archive_keys={"other-archive":next(iter(original.archive_keys.values()))})
        self.assertEqual(self.check(trust=renamed).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_empty_role_rejected(self):
        changed=replace(self.fixture.trust,witness_keys={})
        self.assertIsNone(trust_fingerprint(changed))
        self.assertEqual(self.check(trust=changed).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_mutating_original_mapping_does_not_mutate_snapshot(self):
        original=self.fixture.trust
        snapshot=freeze_trust(original)
        self.assertIsNotNone(snapshot)
        original.publisher_keys["injected"]=public(Ed25519PrivateKey.generate())
        self.assertNotIn("injected",snapshot.publisher_keys)

    def test_missing_proof_denied(self):
        self.assertEqual(self.check(proof={}).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_issuer_manifest_denied(self):
        changed=replace(self.fixture.trust,issuer="other")
        self.assertEqual(self.check(trust=changed).state,IntegratedState.UNKNOWN_BLOCKED)

    def test_forged_epoch_boolean_denied(self):
        import copy
        modified=copy.deepcopy(self.manifest)
        modified["payload"]["epoch"]=True
        self.assertEqual(self.check(manifest=modified,pin=hashlib.sha256(_canonical(modified)).hexdigest()).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_untrusted_manifest_not_supplied_as_key_root(self):
        self.assertFalse(verify_trust_manifest(
            self.manifest,self.fixture.trust,{},
            externally_pinned_manifest_sha256=self.pin,now=NOW
        ))
