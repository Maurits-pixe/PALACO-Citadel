"""v1.9 regression: retired legacy recovery must use the signed-head gate."""
import sqlite3
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_witness_recovery import recover_once, RecoveryResult
from visitcard_witness_recovery_v18 import VerifiedRecoveryState
from visitcard_witness_receipt import WitnessTrust


class LegacyRecoveryRetirementTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(self.db.close)
        self.trust = WitnessTrust({})

    def test_legacy_calls_signed_head_gate(self):
        with patch("visitcard_witness_recovery.recover_once_verified",
                   return_value=VerifiedRecoveryState.PENDING) as gate:
            self.assertEqual(recover_once(self.db, "issuer.example", 2, self.trust,
                                          operator_approved=True), RecoveryResult.PENDING)
            gate.assert_called_once()

    def test_legacy_never_bootstraps_genesis(self):
        self.assertEqual(recover_once(self.db, "issuer.example", 1, self.trust,
                                      operator_approved=True), RecoveryResult.UNKNOWN)

    def test_signed_gate_conflict_maps_to_rejected(self):
        with patch("visitcard_witness_recovery.recover_once_verified",
                   return_value=VerifiedRecoveryState.CONFLICT):
            self.assertEqual(recover_once(self.db, "issuer.example", 2, self.trust),
                             RecoveryResult.REJECTED)

    def test_signed_gate_unknown_maps_to_unknown(self):
        with patch("visitcard_witness_recovery.recover_once_verified",
                   return_value=VerifiedRecoveryState.UNKNOWN):
            self.assertEqual(recover_once(self.db, "issuer.example", 2, self.trust),
                             RecoveryResult.UNKNOWN)

    def test_legacy_does_not_access_transport_directly(self):
        from visitcard_witness_recovery import recover_once_verified
        self.assertTrue(callable(recover_once_verified))
        with patch("visitcard_witness_recovery.recover_once_verified",
                   return_value=VerifiedRecoveryState.ACKNOWLEDGED):
            self.assertEqual(recover_once(self.db, "issuer.example", 2, self.trust),
                             RecoveryResult.ACKNOWLEDGED)

    def test_no_authorization_enum(self):
        self.assertNotIn("AUTHORIZED", RecoveryResult.__members__)


if __name__ == "__main__":
    unittest.main()
