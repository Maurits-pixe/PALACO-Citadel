"""RIO v5.0 security inventory and permanent HOLD regression tests."""
import hashlib
from pathlib import Path
import tempfile
import unittest
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_v5_security_review import (
    MODULES,REQUIRED_ENTRYPOINTS,EXTERNAL_BLOCKERS,Readiness,
    review_sources,release_permitted,
)


class V5SecurityReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.pins={}
        for name in MODULES:
            funcs=REQUIRED_ENTRYPOINTS.get(name,())
            src='"""synthetic fixture only; not a PALACO production implementation"""\n'
            src+="\n".join("def "+f+"():\n    return None\n" for f in funcs)
            self.set_source(name,src)

    def set_source(self,name,src,pin=True):
        path=self.root/name
        path.write_text(src,encoding="utf-8")
        if pin:
            self.pins[name]=hashlib.sha256(path.read_bytes()).hexdigest()

    def scan(self,**kwargs):
        return review_sources(self.root,expected_source_sha256=kwargs.get("pins",self.pins),
                              test_count=kwargs.get("count",956))

    def test_all_synthetically_pinned_sources_still_require_external_evidence(self):
        report=self.scan()
        self.assertEqual(report.state,Readiness.EXTERNAL_EVIDENCE_REQUIRED)
        self.assertEqual(report.blockers,EXTERNAL_BLOCKERS)
        self.assertFalse(report.release_permitted)

    def test_deterministic_inventory_hash(self):
        self.assertEqual(self.scan().inventory_sha256,self.scan().inventory_sha256)

    def test_inventory_covers_every_consolidated_module(self):
        report=self.scan()
        self.assertEqual({name for name,_ in report.source_sha256},set(MODULES))

    def test_one_modified_source_fails_hash_verification(self):
        name=MODULES[0]
        (self.root/name).write_text("def forged(): return True\n")
        report=self.scan()
        self.assertEqual(report.state,Readiness.SOURCE_BLOCKED)
        self.assertIn("SOURCE_HASH_MISMATCH:"+name,report.blockers)

    def test_repinning_modified_source_does_not_override_external_blockers(self):
        name=MODULES[0]
        self.set_source(name,"def synthetic(): return None\n")
        self.assertEqual(self.scan().state,Readiness.EXTERNAL_EVIDENCE_REQUIRED)
        self.assertIn("INDEPENDENT_SECURITY_ASSESSMENT_UNVERIFIED",self.scan().blockers)

    def test_missing_file_blocks(self):
        (self.root/MODULES[0]).unlink()
        self.assertIn("SOURCE_MISSING_OR_LINK:"+MODULES[0],self.scan().blockers)

    def test_missing_expected_hash_blocks(self):
        expected=dict(self.pins)
        expected.pop(MODULES[0])
        report=self.scan(pins=expected)
        self.assertEqual(report.state,Readiness.SOURCE_BLOCKED)
        self.assertIn("EXPECTED_HASH_INVENTORY_INCOMPLETE",report.blockers)

    def test_malformed_hash_blocks(self):
        expected=dict(self.pins)
        expected[MODULES[0]]="wrong"
        self.assertIn("SOURCE_HASH_MISMATCH:"+MODULES[0],self.scan(pins=expected).blockers)

    def test_import_socket_blocks_even_when_independently_rehashed(self):
        name="visitcard_shared_replay_cas.py"
        src="import socket\n"+"def reserve_challenge():\n    return False\n"+"def acknowledge_head():\n    return False\n"
        self.set_source(name,src)
        self.assertIn("NETWORK_OR_SUBPROCESS_IMPORT:"+name,self.scan().blockers)

    def test_import_from_subprocess_blocks(self):
        name=MODULES[1]
        self.set_source(name,"from subprocess import run\ndef inspect_visitcard():\n    return None\n")
        self.assertIn("NETWORK_OR_SUBPROCESS_IMPORT:"+name,self.scan().blockers)

    def test_deleted_required_entrypoint_blocks_even_if_rehashed(self):
        name="visitcard_pending_recovery.py"
        self.set_source(name,"def inspect_pending_session():\n    return None\n")
        self.assertIn("EXPECTED_ENTRYPOINT_MISSING:"+name,self.scan().blockers)

    def test_authority_true_default_blocks_even_if_rehashed(self):
        name=MODULES[0]
        self.set_source(name,
            "class FakeResult:\n    release_permitted: bool=True\n")
        self.assertIn("AUTHORITY_DEFAULT_NOT_FALSE:"+name,self.scan().blockers)

    def test_authority_false_default_allowed(self):
        name=MODULES[0]
        self.set_source(name,
            "class FakeResult:\n    release_permitted: bool=False\n")
        self.assertEqual(self.scan().state,Readiness.EXTERNAL_EVIDENCE_REQUIRED)

    def test_invalid_python_blocks(self):
        name=MODULES[0]
        self.set_source(name,"def broken(\n")
        self.assertIn("SOURCE_UNREADABLE_OR_INVALID:"+name,self.scan().blockers)

    def test_missing_test_metadata_does_not_claim_tests_ran(self):
        report=self.scan(count=None)
        self.assertEqual(report.state,Readiness.SOURCE_BLOCKED)
        self.assertIsNone(report.test_count)
        self.assertIn("TEST_METADATA_NOT_VERIFIED",report.blockers)

    def test_boolean_test_count_is_rejected(self):
        self.assertIn("TEST_METADATA_NOT_VERIFIED",self.scan(count=True).blockers)

    def test_symlinked_source_not_accepted(self):
        name=MODULES[0]
        path=self.root/name
        path.unlink()
        path.symlink_to(self.root/MODULES[1])
        self.assertIn("SOURCE_MISSING_OR_LINK:"+name,self.scan().blockers)

    def test_all_external_controls_are_mandatory(self):
        report=self.scan()
        self.assertEqual(len(report.blockers),7)
        self.assertTrue(all("UNVERIFIED" in v for v in report.blockers))

    def test_no_result_grants_release_even_forged_report(self):
        from visitcard_v5_security_review import ReviewReport
        for state in Readiness:
            report=ReviewReport(state,(),None,(),999999)
            self.assertFalse(report.release_permitted)
            self.assertFalse(report.merge_permitted)
            self.assertFalse(report.activation_permitted)
            self.assertFalse(release_permitted(report))
