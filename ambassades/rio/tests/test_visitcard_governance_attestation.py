"""RIO v3.3 signed governance independence regression tests — DRAFT/HOLD."""
import base64
from datetime import datetime,timedelta,timezone
import hashlib
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from visitcard_governance_attestation import (
    DOMAIN,verify_governance_claim,verify_governance_separation
)
from visitcard_dual_witness_verification import (
    verify_governed_dual_witness_chain,IntegratedState
)
from test_visitcard_dual_witness_verification import DualWitnessTests,NOW,ISSUER,NONCE,pub,b64


class GovernedWitnessTests(unittest.TestCase):
    def setUp(self):
        # Reuse the established full cryptographic custody-to-publisher fixture.
        self.fixture=DualWitnessTests("test_two_independent_keys_match_informational")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.admin_a=Ed25519PrivateKey.generate()
        self.admin_b=Ed25519PrivateKey.generate()
        self.authorities_a={"authority-a":pub(self.admin_a)}
        self.authorities_b={"authority-b":pub(self.admin_b)}
        self.evidence_a=self.evidence("fresh-a",self.fixture.key_a,
                                      "operator-a","custody-a","failure-a",
                                      "authority-a",self.admin_a)
        self.evidence_b=self.evidence("fresh-b",self.fixture.key_b,
                                      "operator-b","custody-b","failure-b",
                                      "authority-b",self.admin_b)

    def evidence(self,signer_id,signer_key,operator,custody,failure,aid,admin,
                 issued=NOW,expires=NOW+timedelta(hours=1)):
        payload={
            "version":1,"issuer":ISSUER,"signer_id":signer_id,
            "signer_key_sha256":hashlib.sha256(pub(signer_key)).hexdigest(),
            "operator_id":operator,"custody_domain":custody,
            "failure_domain":failure,
            "issued_at":issued.isoformat(),"expires_at":expires.isoformat()
        }
        signed=admin.sign(DOMAIN+aid.encode()+b"\x00"+_canonical(payload))
        return {"payload":payload,"authority_id":aid,"signature":b64(signed)}

    def govern(self,evidence_a=None,evidence_b=None,**kwargs):
        f=self.fixture
        return verify_governed_dual_witness_chain(
            f.archive,f.published,
            f.response_a(),f.challenge_a,f.response_b(),f.challenge_b,
            self.evidence_a if evidence_a is None else evidence_a,
            self.evidence_b if evidence_b is None else evidence_b,
            issuer=ISSUER,nonce=NONCE,witness_keys=f.witness_keys,
            archive_keys=f.archive_keys,publisher_keys=f.publisher_keys,
            primary_signer_keys=f.keys_a,secondary_signer_keys=f.keys_b,
            primary_authorities=kwargs.get("authorities_a",self.authorities_a),
            secondary_authorities=kwargs.get("authorities_b",self.authorities_b),
            now=kwargs.get("now",NOW)
        )

    def new_b(self,**changes):
        payload=self.evidence_b["payload"]
        return self.evidence(
            "fresh-b",self.fixture.key_b,
            changes.get("operator",payload["operator_id"]),
            changes.get("custody",payload["custody_domain"]),
            changes.get("failure",payload["failure_domain"]),
            changes.get("aid","authority-b"),
            changes.get("admin",self.admin_b),
            issued=changes.get("issued",NOW),
            expires=changes.get("expires",NOW+timedelta(hours=1)),
        )

    def test_distinct_signed_domains_match_informational(self):
        self.assertEqual(self.govern(),IntegratedState.MATCHED_INFORMATIONAL)

    def test_governance_never_authorizes_execution(self):
        from visitcard_dual_witness_verification import execution_permitted
        for state in IntegratedState:
            self.assertFalse(execution_permitted(state))

    def test_missing_evidence_fails_closed(self):
        self.assertEqual(self.govern(evidence_b={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_administrator_key_fails_closed(self):
        self.assertEqual(self.govern(authorities_b={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_same_administrator_key_under_two_names_rejected(self):
        ev=self.new_b(admin=self.admin_a)
        self.assertEqual(self.govern(evidence_b=ev,authorities_b={"authority-b":pub(self.admin_a)}),
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_same_admin_identifier_rejected(self):
        ev=self.new_b(aid="authority-a",admin=self.admin_b)
        self.assertEqual(self.govern(evidence_b=ev,authorities_b={"authority-a":pub(self.admin_b)}),
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_same_operator_claim_rejected(self):
        self.assertEqual(self.govern(evidence_b=self.new_b(operator="operator-a")),
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_same_key_custody_claim_rejected(self):
        self.assertEqual(self.govern(evidence_b=self.new_b(custody="custody-a")),
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_same_failure_domain_claim_rejected(self):
        self.assertEqual(self.govern(evidence_b=self.new_b(failure="failure-a")),
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_expired_governance_claim_rejected(self):
        ev=self.new_b(issued=NOW-timedelta(hours=2),expires=NOW-timedelta(hours=1))
        self.assertEqual(self.govern(evidence_b=ev),IntegratedState.UNKNOWN_BLOCKED)

    def test_future_governance_claim_rejected(self):
        ev=self.new_b(issued=NOW+timedelta(minutes=1),expires=NOW+timedelta(hours=2))
        self.assertEqual(self.govern(evidence_b=ev),IntegratedState.UNKNOWN_BLOCKED)

    def test_long_lived_claim_rejected(self):
        ev=self.new_b(expires=NOW+timedelta(days=2))
        self.assertEqual(self.govern(evidence_b=ev),IntegratedState.UNKNOWN_BLOCKED)

    def test_signer_public_key_fingerprint_mismatch(self):
        ev=self.evidence("fresh-b",self.fixture.key_a,"operator-b","custody-b",
                         "failure-b","authority-b",self.admin_b)
        self.assertEqual(self.govern(evidence_b=ev),IntegratedState.UNKNOWN_BLOCKED)

    def test_tampered_governance_claim_rejected(self):
        import copy
        ev=copy.deepcopy(self.evidence_b)
        ev["payload"]["operator_id"]="operator-changed"
        self.assertEqual(self.govern(evidence_b=ev),IntegratedState.UNKNOWN_BLOCKED)

    def test_governance_claim_is_not_trust_registration(self):
        result=verify_governance_claim(
            self.evidence_a,self.authorities_a,expected_issuer=ISSUER,
            signer_id="fresh-a",signer_public_key=pub(self.fixture.key_a),now=NOW
        )
        self.assertEqual(result.operator_id,"operator-a")
        self.assertFalse(hasattr(result,"authorized"))
