import importlib.util
import unittest
from pathlib import Path
p=Path(__file__).with_name("earth-104-legacy.py")
spec=importlib.util.spec_from_file_location("legacy",p)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_genesis_and_tamper(self):
  payload={"index":0,"previousHash":None,"receiptSHA256":"a"*64,"status":"HOLD","stage":"REVIEW"}
  record={**payload,"recordHash":m.sha(payload)}
  self.assertEqual(m.verify_chain([record]),record["recordHash"])
  with self.assertRaises(m.LegacyError): m.verify_chain([{**record,"status":"PASS"}])
 def test_receipt(self):
  payload=dict(zip(m.FIELDS_RECEIPT,["EARTH-084-v1",None,None,"reviewer",1,0,"HOLD","REVIEW",["blocked"]]))
  m.verify_receipt({**payload,"receiptSHA256":m.sha(payload)})
 def test_float_rejected(self):
  with self.assertRaises(m.LegacyError): m.sha({"x":1.25})
if __name__=="__main__": unittest.main()
