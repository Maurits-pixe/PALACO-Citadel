import importlib.util
import json
import pathlib
import tempfile
import unittest
import hashlib

P = pathlib.Path(__file__).with_name("earth-120-source-admission.py")
spec = importlib.util.spec_from_file_location("earth120", P)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class SourceGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.archive = self.root / "ne_110m_land.zip"
        self.archive.write_bytes(b"synthetic test bytes")
        self.manifest = self.root / "manifest.json"
        self.record = {"source":"Natural Earth 1:110m land","archive":"ne_110m_land.zip","status":"REVIEWED_PIN","sha256":hashlib.sha256(self.archive.read_bytes()).hexdigest()}
    def check(self, record=None):
        self.manifest.write_text(json.dumps(self.record if record is None else record),encoding="utf-8")
        return mod.verify(self.archive,self.manifest)
    def test_match_only(self):
        self.assertEqual(self.check(),"SOURCE_PIN_MATCH_ONLY_NOT_RENDER_ADMITTED")
    def test_pending(self):
        with self.assertRaisesRegex(ValueError,"SOURCE_PIN_NOT_APPROVED"):
            self.check({**self.record,"status":"PENDING_INDEPENDENT_REVIEW"})
    def test_hash_mismatch(self):
        with self.assertRaisesRegex(ValueError,"SOURCE_HASH_MISMATCH"):
            self.check({**self.record,"sha256":"0"*64})
    def test_invalid_digest(self):
        with self.assertRaisesRegex(ValueError,"INVALID_PIN"):
            self.check({**self.record,"sha256":"not-a-hash"})
    def test_wrong_source(self):
        with self.assertRaisesRegex(ValueError,"SOURCE_PIN_NOT_APPROVED"):
            self.check({**self.record,"source":"untrusted"})
    def test_real_manifest_pending(self):
        real=pathlib.Path(__file__).with_name("earth-120-source-manifest.json")
        with self.assertRaisesRegex(ValueError,"SOURCE_PIN_NOT_APPROVED"):
            mod.verify(self.archive,real)

if __name__=="__main__":
    unittest.main()
