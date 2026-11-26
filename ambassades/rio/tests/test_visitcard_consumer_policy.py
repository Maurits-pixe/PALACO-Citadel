"""RIO v3.8 consumer import policy bypass regressions."""
import tempfile
from pathlib import Path
import sys
import unittest

RIO=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(RIO))
from visitcard_consumer_policy import audit_consumer_tree,audit_consumer_source


class ConsumerPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)

    def write(self,name,source):
        (self.root/(name+".py")).write_text(source,encoding="utf-8")

    def check(self,source):
        self.write("visitcard_consumer_candidate",source)
        return audit_consumer_tree(self.root)

    def test_real_adapter_passes(self):
        self.assertEqual(audit_consumer_tree(RIO),())

    def test_provenance_only_candidate_passes(self):
        self.assertEqual(self.check(
            "from visitcard_verification_entrypoint import ProofPackage,VerifiedContext\n"
            "from visitcard_trust_provenance import verify_with_trust_provenance\n"
            "def run(a,b,c,p,t,m,r,h): return verify_with_trust_provenance(a,b,c,proof=p,trust=t,manifest=m,independently_pinned_roots=r,externally_pinned_manifest_sha256=h)\n"
        ),())

    def test_legacy_direct_import_rejected(self):
        errors=self.check(
            "from visitcard_verification_entrypoint import verify_visitcard\n"
            "from visitcard_dual_witness_verification import verify_dual_witness_chain\n"
        )
        self.assertTrue(any("forbidden import-from" in x for x in errors))

    def test_legacy_import_alias_rejected(self):
        errors=self.check(
            "import visitcard_verification_entrypoint as main\n"
            "import visitcard_integrated_verification as bypass\n"
        )
        self.assertTrue(any("forbidden import" in x for x in errors))

    def test_indirect_legacy_import_in_helper_rejected(self):
        self.write("visitcard_consumer_helper",
            "from visitcard_verification_entrypoint import verify_visitcard\n"
            "from visitcard_governance_ledger import signer_is_current\n")
        errors=self.check(
            "from visitcard_verification_entrypoint import verify_visitcard\n"
            "from visitcard_consumer_helper import do_work\n"
        )
        self.assertTrue(any("visitcard_consumer_helper" in x and "forbidden" in x for x in errors))

    def test_unlisted_local_helper_rejected(self):
        self.write("unrestricted_helper",
            "from visitcard_dual_witness_verification import verify_dual_witness_chain\n")
        errors=self.check(
            "from visitcard_verification_entrypoint import verify_visitcard\n"
            "from unrestricted_helper import do_work\n"
        )
        self.assertTrue(any("forbidden" in x for x in errors))

    def test_unknown_consumer_helper_rejected(self):
        errors=self.check(
            "from visitcard_verification_entrypoint import verify_visitcard\n"
            "from visitcard_consumer_missing import bypass\n"
        )
        self.assertTrue(any("not found" in x for x in errors))

    def test_dynamic_import_rejected(self):
        errors=self.check(
            "import visitcard_verification_entrypoint\n"
            "x=__import__('visitcard_dual_witness_verification')\n"
        )
        self.assertTrue(any("dynamic call" in x for x in errors))

    def test_builtin_eval_rejected(self):
        errors=self.check(
            "import visitcard_verification_entrypoint\n"
            "x=eval('1+1')\n"
        )
        self.assertTrue(any("dynamic call" in x for x in errors))

    def test_reflection_getattr_rejected(self):
        errors=self.check(
            "import visitcard_verification_entrypoint as gate\n"
            "x=getattr(gate,'verify_visitcard')\n"
        )
        self.assertTrue(any("dynamic call" in x for x in errors))

    def test_importlib_rejected(self):
        errors=self.check(
            "import visitcard_verification_entrypoint\n"
            "import importlib\n"
        )
        self.assertTrue(any("importlib" in x for x in errors))

    def test_local_trust_construction_rejected(self):
        errors=self.check(
            "from visitcard_verification_entrypoint import VerifiedContext\n"
            "keys=VerifiedContext(issuer='untrusted')\n"
        )
        self.assertTrue(any("trust/proof constructor" in x for x in errors))

    def test_indirect_constructor_rejected(self):
        errors=self.check(
            "import visitcard_verification_entrypoint as gate\n"
            "keys=gate.VerifiedContext(issuer='untrusted')\n"
        )
        self.assertTrue(any("indirect trust/proof constructor" in x for x in errors))

    def test_reflection_dunder_rejected(self):
        errors=self.check(
            "import visitcard_verification_entrypoint as gate\n"
            "x=gate.__dict__\n"
        )
        self.assertTrue(any("reflection" in x for x in errors))

    def test_wildcard_import_rejected(self):
        errors=self.check(
            "from visitcard_verification_entrypoint import *\n"
        )
        self.assertTrue(any("wildcard" in x for x in errors))

    def test_relative_import_rejected(self):
        errors=self.check(
            "from visitcard_verification_entrypoint import verify_visitcard\n"
            "from .other import anything\n"
        )
        self.assertTrue(any("relative" in x for x in errors))

    def test_syntax_error_denied(self):
        errors=self.check("from visitcard_verification_entrypoint import\n")
        self.assertTrue(any("invalid Python syntax" in x for x in errors))

    def test_missing_facade_rejected(self):
        errors=self.check("import sqlite3\n")
        self.assertTrue(any("facade import required" in x for x in errors))

    def test_only_stdlib_allowed(self):
        errors=self.check(
            "from visitcard_verification_entrypoint import verify_visitcard\n"
            "import os\n"
        )
        self.assertTrue(any("forbidden import" in x for x in errors))

    def test_no_consumer_files_is_failure(self):
        self.assertTrue(audit_consumer_tree(self.root))
