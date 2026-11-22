"""Policy tests with synthetic evidence. Not cryptographic certification."""
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visitcard_trust_policy import DisplayStatus, ValidationEvidence, assess

NOW = datetime(2026, 11, 22, 12, 0, tzinfo=timezone.utc)


def complete():
    return ValidationEvidence(
        signature_valid=True, issuer_trusted=True, subject_bound=True,
        audience_bound=True, revocation_checked=True, revoked=False,
        expires_at=NOW + timedelta(minutes=5)
    )


class TrustPolicyTests(unittest.TestCase):
    def test_no_evidence_is_unknown(self):
        self.assertEqual(assess(None, now=NOW), DisplayStatus.UNKNOWN)

    def test_complete_synthetic_evidence_is_verified_display_only(self):
        self.assertEqual(assess(complete(), now=NOW), DisplayStatus.VERIFIED)

    def test_verified_does_not_imply_authorization(self):
        self.assertNotIn("AUTHORIZED", DisplayStatus.__members__)

    def test_revoked_requires_complete_evidence(self):
        self.assertEqual(assess(replace(complete(), revoked=True), now=NOW), DisplayStatus.REVOKED)
        self.assertEqual(assess(replace(complete(), revoked=True, signature_valid=False), now=NOW), DisplayStatus.UNKNOWN)

    def test_all_missing_gates_fail_closed(self):
        for field in ("signature_valid", "issuer_trusted", "subject_bound",
                      "audience_bound", "revocation_checked"):
            with self.subTest(field=field):
                self.assertEqual(assess(replace(complete(), **{field: False}), now=NOW), DisplayStatus.UNKNOWN)

    def test_expired_or_missing_time_fail_closed(self):
        self.assertEqual(assess(replace(complete(), expires_at=NOW), now=NOW), DisplayStatus.UNKNOWN)
        self.assertEqual(assess(replace(complete(), expires_at=None), now=NOW), DisplayStatus.UNKNOWN)
        self.assertEqual(assess(replace(complete(), expires_at=NOW.replace(tzinfo=None)), now=NOW), DisplayStatus.UNKNOWN)
        self.assertEqual(assess(complete(), now=NOW.replace(tzinfo=None)), DisplayStatus.UNKNOWN)

    def test_untrusted_payloads_fail_closed(self):
        self.assertEqual(assess({"signature_valid": True}, now=NOW), DisplayStatus.UNKNOWN)
        self.assertEqual(assess("VERIFIED", now=NOW), DisplayStatus.UNKNOWN)


if __name__ == "__main__":
    unittest.main()
