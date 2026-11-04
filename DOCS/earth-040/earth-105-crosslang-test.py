"""EARTH-105: compare legacy JavaScript-produced vectors with Python verifier."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

root=Path(__file__).parent
spec=importlib.util.spec_from_file_location("legacy",root/"earth-104-legacy.py")
legacy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)

class Golden(unittest.TestCase):
 def test_javascript_vectors(self):
  raw=subprocess.check_output(["node",str(root/"earth-105-vectors.mjs")],text=True)
  data=json.loads(raw)
  self.assertEqual(legacy.verify_receipt(data["receipt"]),data["receipt"]["receiptSHA256"])
  self.assertEqual(legacy.verify_chain(data["chain"]),data["chain"][-1]["recordHash"])
 def test_altered_vector_denied(self):
  data=json.loads(subprocess.check_output(["node",str(root/"earth-105-vectors.mjs")],text=True))
  data["chain"][1]["stage"]="APPROVED"
  with self.assertRaises(legacy.LegacyError): legacy.verify_chain(data["chain"])
if __name__=="__main__":unittest.main()
