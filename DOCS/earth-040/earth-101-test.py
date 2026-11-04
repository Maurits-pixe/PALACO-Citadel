import importlib.util
from pathlib import Path
import unittest

p = Path(__file__).with_name("earth-101-verify.py")
spec = importlib.util.spec_from_file_location("earth101", p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class TestEarth101(unittest.TestCase):
    def setUp(self):
        self.head = "a" * 64
        self.receipt = {"event": "review", "scope": "earth"}
        self.record = m.make_record(1, self.head, self.receipt)

    def test_valid(self):
        self.assertEqual(m.verify_batch(1, self.head, [self.record]), self.record["recordHash"])

    def test_tampered_receipt(self):
        r = dict(self.record, receipt={"event": "forged"})
        with self.assertRaises(m.AuditVerificationError):
            m.verify_batch(1, self.head, [r])

    def test_forged_record_hash(self):
        with self.assertRaises(m.AuditVerificationError):
            m.verify_batch(1, self.head, [dict(self.record, recordHash="f" * 64)])

    def test_stale_link(self):
        with self.assertRaises(m.AuditVerificationError):
            m.verify_batch(2, self.head, [self.record])

    def test_extra_field(self):
        with self.assertRaises(m.AuditVerificationError):
            m.verify_batch(1, self.head, [dict(self.record, injected=True)])

    def test_empty_batch(self):
        with self.assertRaises(m.AuditVerificationError):
            m.verify_batch(1, self.head, [])

    def test_float_rejected(self):
        with self.assertRaises(m.AuditVerificationError):
            m.make_record(1, self.head, {"x": 1.5})

    def test_two_records(self):
        second = m.make_record(2, self.record["recordHash"], {"event": "next"})
        self.assertEqual(m.verify_batch(1, self.head, [self.record, second]), second["recordHash"])


if __name__ == "__main__":
    unittest.main()
