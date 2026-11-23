"""RIO v3.7 consumer entrypoint negative/positive and import-policy tests."""
import ast
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
import sqlite3
import sys
import unittest

RIO=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(RIO))
from test_visitcard_highwater_governed_gate import HighwaterGovernedGateTests,NOW,ISSUER
from visitcard_verification_entrypoint import (
    ProofPackage,VerifiedContext,VerificationResult,verify_visitcard,
    execution_permitted,IntegratedState,
)
from visitcard_consumer_adapter import inspect_visitcard


class EntryPointTests(unittest.TestCase):
    def setUp(self):
        self.fixture=HighwaterGovernedGateTests(
            "test_matching_full_proof_is_informational_only"
        )
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        g=self.fixture.fixture
        w=g.fixture
        self.proof=ProofPackage(
            publication_receipt=w.published,
            primary_response=w.response_a(),
            primary_challenge=w.challenge_a,
            secondary_response=w.response_b(),
            secondary_challenge=w.challenge_b,
            primary_governance=g.evidence_a,
            secondary_governance=g.evidence_b,
            primary_checkpoint=self.fixture.checkpoint_a,
            secondary_checkpoint=self.fixture.checkpoint_b,
        )
        self.trust=VerifiedContext(
            issuer=ISSUER,nonce=w.published["payload"]["nonce"],
            witness_keys=w.witness_keys,
            archive_keys=w.archive_keys,
            publisher_keys=w.publisher_keys,
            primary_signer_keys=w.keys_a,
            secondary_signer_keys=w.keys_b,
            primary_authorities=g.authorities_a,
            secondary_authorities=g.authorities_b,
            lifecycle_roots=g.lifecycle_roots,
            primary_custodians=self.fixture.custodians_a,
            secondary_custodians=self.fixture.custodians_b,
        )

    def check(self,proof=None,trust=None,archive=None,governance=None,custodian=None,now=NOW):
        g=self.fixture.fixture
        return inspect_visitcard(
            g.fixture.archive if archive is None else archive,
            g.registry if governance is None else governance,
            self.fixture.custodian if custodian is None else custodian,
            self.proof if proof is None else proof,
            self.trust if trust is None else trust,
            now=now,
        )

    def test_full_chain_matches_but_never_authorizes(self):
        outcome=self.check()
        self.assertEqual(outcome.state,IntegratedState.MATCHED_INFORMATIONAL)
        self.assertTrue(outcome.matched)
        self.assertFalse(outcome.can_authorize)
        self.assertFalse(execution_permitted(outcome))

    def test_public_api_matches_direct_facade(self):
        g=self.fixture.fixture
        direct=verify_visitcard(
            g.fixture.archive,g.registry,self.fixture.custodian,
            proof=self.proof,trust=self.trust,now=NOW,
        )
        self.assertEqual(self.check(),direct)

    def test_reject_untyped_legacy_dictionary(self):
        self.assertEqual(self.check(proof={"version": 1}).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_incomplete_structured_proof(self):
        self.assertEqual(self.check(proof=replace(self.proof,secondary_checkpoint={})).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_missing_second_fresh_response(self):
        self.assertEqual(self.check(proof=replace(self.proof,secondary_response={})).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_missing_governance_claim(self):
        self.assertEqual(self.check(proof=replace(self.proof,primary_governance={})).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_empty_custodian_keys(self):
        self.assertEqual(self.check(trust=replace(self.trust,secondary_custodians={})).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_empty_lifecycle_roots(self):
        self.assertEqual(self.check(trust=replace(self.trust,lifecycle_roots={})).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_empty_witness_keys(self):
        self.assertEqual(self.check(trust=replace(self.trust,witness_keys={})).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_wrong_expected_issuer(self):
        self.assertEqual(self.check(trust=replace(self.trust,issuer="wrong")).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_missing_secondary_challenge(self):
        self.assertEqual(self.check(proof=replace(self.proof,secondary_challenge="")).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_stale_primary_fresh_proof(self):
        self.assertEqual(self.check(now=NOW+timedelta(seconds=61)).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_invalid_database_handle(self):
        self.assertEqual(self.check(custodian="not-a-database").state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_reused_store_handle(self):
        g=self.fixture.fixture
        self.assertEqual(self.check(custodian=g.registry).state,
                         IntegratedState.UNKNOWN_BLOCKED)

    def test_reject_restored_revocation_bypass(self):
        g=self.fixture.fixture
        older=self.fixture.snapshot()
        revoked=self.fixture.advance("fresh-b","REVOKE")
        outcome=self.check(
            governance=older,proof=replace(self.proof,secondary_checkpoint=revoked)
        )
        self.assertEqual(outcome.state,IntegratedState.UNKNOWN_BLOCKED)
        self.assertFalse(outcome.can_authorize)

    def test_result_cannot_be_used_as_grant(self):
        for state in IntegratedState:
            outcome=VerificationResult(state)
            self.assertFalse(execution_permitted(outcome))
            self.assertFalse(outcome.can_authorize)

    def test_consumer_import_policy_disallows_legacy_verifiers(self):
        """Only new production adapters in this folder are subject to policy.

        Existing legacy prototypes and tests remain available under HOLD.
        New file names visitcard_consumer_*.py are required to import only
        the v3.7 facade, not lower-level verification modules.
        """
        consumers=sorted(RIO.glob("visitcard_consumer_*.py"))
        self.assertTrue(consumers, "at least one real consumer adapter")
        forbidden={
            "visitcard_integrated_verification",
            "visitcard_publication_recovery_gate",
            "visitcard_fresh_publication_head",
            "visitcard_dual_witness_verification",
            "visitcard_highwater_governed_gate",
            "visitcard_governance_highwater",
            "visitcard_governance_ledger",
        }
        for path in consumers:
            tree=ast.parse(path.read_text(encoding="utf-8"))
            imports=set()
            for node in ast.walk(tree):
                if isinstance(node,ast.ImportFrom) and node.module:
                    imports.add(node.module)
                elif isinstance(node,ast.Import):
                    imports.update(alias.name for alias in node.names)
            self.assertTrue(
                any(x=="visitcard_verification_entrypoint" for x in imports),
                str(path)
            )
            self.assertFalse(imports.intersection(forbidden),str(path))

    def test_no_legacy_route_flag_or_downgrade_in_proof_contract(self):
        self.assertEqual(
            set(ProofPackage.__dataclass_fields__),
            {"publication_receipt","primary_response","primary_challenge",
             "secondary_response","secondary_challenge","primary_governance",
             "secondary_governance","primary_checkpoint","secondary_checkpoint"},
        )
        self.assertNotIn("mode",ProofPackage.__dataclass_fields__)
        self.assertNotIn("fallback",ProofPackage.__dataclass_fields__)
