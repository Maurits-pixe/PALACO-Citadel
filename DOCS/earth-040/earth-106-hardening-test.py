import importlib.util
from pathlib import Path
import unittest
p=Path(__file__).with_name("earth-104-legacy.py")
spec=importlib.util.spec_from_file_location("legacy",p)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class Hardening(unittest.TestCase):
 def test_duplicate_keys(self):
  with self.assertRaises(m.LegacyError):m.strict_json_loads('{"status":"HOLD","status":"PASS"}')
 def test_nested_duplicate_keys(self):
  with self.assertRaises(m.LegacyError):m.strict_json_loads('{"receipt":{"x":1,"x":2}}')
 def test_numeric_key_order_denied(self):
  with self.assertRaises(m.LegacyError):m.sha({"2":"a","1":"b"})
 def test_surrogate_denied(self):
  with self.assertRaises(m.LegacyError):m.strict_json_loads('"\\ud800"')
 def test_nonfinite_denied(self):
  with self.assertRaises(m.LegacyError):m.strict_json_loads('{"x":NaN}')
 def test_bad_receipt_hash(self):
  p={k:None for k in m.FIELDS_RECEIPT}
  with self.assertRaises(m.LegacyError):m.verify_receipt({**p,"receiptSHA256":"Z"*64})
 def test_bad_record_hash(self):
  r={"index":0,"previousHash":None,"receiptSHA256":"a"*64,"status":"HOLD","stage":"REVIEW","recordHash":"Z"*64}
  with self.assertRaises(m.LegacyError):m.verify_chain([r])
if __name__=="__main__":unittest.main()
