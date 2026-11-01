"""EARTH-107: verify canonicalization boundary refuses unsupported values."""
import importlib.util
import unittest
from pathlib import Path
p=Path(__file__).with_name("earth-104-legacy.py")
spec=importlib.util.spec_from_file_location("legacy",p)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class Boundary(unittest.TestCase):
 def test_max_safe_integer(self):
  self.assertEqual(m.strict_json_loads('{"epoch":9007199254740991}')["epoch"],m.MAX_SAFE)
  with self.assertRaises(m.LegacyError):m.strict_json_loads('{"epoch":9007199254740992}')
 def test_float_denied(self):
  with self.assertRaises(m.LegacyError):m.strict_json_loads('{"epoch":1.0}')
 def test_nested_numeric_key_denied(self):
  with self.assertRaises(m.LegacyError):m.strict_json_loads('{"outer":{"0":"x"}}')
 def test_unpaired_surrogate_denied(self):
  with self.assertRaises(m.LegacyError):m.strict_json_loads('"\\udfff"')
 def test_escaped_control(self):
  self.assertEqual(m.strict_json_loads('{"note":"a\\nb"}'),{"note":"a\nb"})
if __name__=="__main__":unittest.main()
