"""RIO v7.1 offline export and independent atomic audit-bundle verification."""
import hashlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_visitcard_v70_atomic_retention import V70AtomicRetentionTests,ANCHOR
from visitcard_v71_audit_bundle import (
    BundleState,export_atomic_audit_bundle,verify_atomic_audit_bundle,
    execution_permitted,
)
from visitcard_witness_enrollment import _canonical


class V71IndependentBundleTests(unittest.TestCase):
    def setUp(self):
        self.f=V70AtomicRetentionTests(
            "test_one_transaction_records_success_and_signed_proof"
        )
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.f.save()
        self.raw=self.export()
        self.digest=hashlib.sha256(self.raw).hexdigest()

    def export(self,**kw):
        return export_atomic_audit_bundle(
            kw.get("db",self.f.plan.db),
            pinned_archive_keys=kw.get("keys",self.f.signed.keys),
            expected_archive_ids=kw.get("ids",self.f.signed.ids),
            independently_pinned_audit_sequence=kw.get("audit_seq",self.f.audit_seq),
            independently_pinned_audit_head_sha256=kw.get("audit_head",self.f.audit_head),
            independently_pinned_proof_sequence=kw.get("proof_seq",self.f.proof_seq),
            independently_pinned_proof_head_sha256=kw.get("proof_head",self.f.proof_head),
        )

    def verify(self,**kw):
        raw=kw.get("raw",self.raw)
        return verify_atomic_audit_bundle(
            raw,pinned_archive_keys=kw.get("keys",self.f.signed.keys),
            expected_archive_ids=kw.get("ids",self.f.signed.ids),
            independently_pinned_audit_sequence=kw.get("audit_seq",self.f.audit_seq),
            independently_pinned_audit_head_sha256=kw.get("audit_head",self.f.audit_head),
            independently_pinned_proof_sequence=kw.get("proof_seq",self.f.proof_seq),
            independently_pinned_proof_head_sha256=kw.get("proof_head",self.f.proof_head),
            independently_pinned_bundle_sha256=kw.get(
                "pin",hashlib.sha256(raw).hexdigest() if type(raw) is bytes else self.digest
            ),
        )

    def altered(self,modifier):
        obj=json.loads(self.raw)
        modifier(obj)
        return _canonical(obj)

    def test_self_contained_offline_signed_bundle_verifies(self):
        r=self.verify()
        self.assertEqual(r.state,BundleState.VERIFIED_INFORMATIONAL)
        self.assertEqual(r.audit_count,1)
        self.assertEqual(r.proof_count,1)
        self.assertFalse(r.release_permitted)

    def test_bundle_is_canonical_and_reproducible(self):
        self.assertEqual(self.export(),self.raw)
        self.assertEqual(_canonical(json.loads(self.raw)),self.raw)

    def test_does_not_contain_secret_private_keys(self):
        b=self.raw.decode()
        self.assertNotIn("private_key",b)
        self.assertNotIn("BEGIN PRIVATE KEY",b)

    def test_external_bundle_hash_mismatch_blocks(self):
        self.assertEqual(self.verify(pin="f"*64).state,BundleState.BLOCKED)

    def test_wrong_archive_keys_blocks(self):
        self.assertEqual(self.verify(keys={}).state,BundleState.BLOCKED)

    def test_same_public_key_under_two_identities_blocks(self):
        root=self.f.signed.keys[self.f.signed.ids[0]]
        self.assertEqual(self.verify(keys={x:root for x in self.f.signed.ids}).state,
                         BundleState.BLOCKED)

    def test_reversed_archive_ids_blocks_signature_binding(self):
        self.assertEqual(self.verify(ids=tuple(reversed(self.f.signed.ids))).state,
                         BundleState.BLOCKED)

    def test_wrong_external_audit_head_blocks(self):
        self.assertEqual(self.verify(audit_head="f"*64).state,BundleState.BLOCKED)

    def test_wrong_external_proof_head_blocks(self):
        self.assertEqual(self.verify(proof_head="f"*64).state,BundleState.BLOCKED)

    def test_missing_original_signed_claim_fails_closed(self):
        raw=self.altered(lambda d:d["proofs"].clear())
        self.assertEqual(self.verify(raw=raw,proof_seq=0).state,BundleState.BLOCKED)

    def test_changed_signed_claim_even_with_fresh_bundle_pin_blocks(self):
        def change(d):
            evidence=json.loads(d["proofs"][0]["evidence_json"])
            evidence["statements"][0]["signature"]="A"*86
            d["proofs"][0]["evidence_json"]=_canonical(evidence).decode()
        self.assertEqual(self.verify(raw=self.altered(change)).state,BundleState.BLOCKED)

    def test_mutated_audit_event_blocks(self):
        raw=self.altered(lambda d:d["audit"][0].update({"event_json":"{}"}))
        self.assertEqual(self.verify(raw=raw).state,BundleState.BLOCKED)

    def test_wrong_bundle_schedule_blocks(self):
        raw=self.altered(lambda d:d["schedule"].update({"interval_seconds":1}))
        self.assertEqual(self.verify(raw=raw,pin=self.digest).state,BundleState.BLOCKED)

    def test_replaced_proof_prev_hash_blocks(self):
        raw=self.altered(lambda d:d["proofs"][0].update({"previous_sha256":"f"*64}))
        self.assertEqual(self.verify(raw=raw).state,BundleState.BLOCKED)

    def test_replaced_audit_row_head_blocks(self):
        raw=self.altered(lambda d:d["audit"][0].update({"head_sha256":"f"*64}))
        self.assertEqual(self.verify(raw=raw).state,BundleState.BLOCKED)

    def test_bundle_extra_field_blocks(self):
        raw=self.altered(lambda d:d.update({"activation":True}))
        self.assertEqual(self.verify(raw=raw).state,BundleState.BLOCKED)

    def test_noncanonical_whitespace_blocks(self):
        self.assertEqual(self.verify(raw=json.dumps(json.loads(self.raw)).encode()).state,
                         BundleState.BLOCKED)

    def test_duplicate_json_keys_blocks(self):
        raw=self.raw[:-1]+b',"version":1}'
        self.assertEqual(self.verify(raw=raw).state,BundleState.BLOCKED)

    def test_truncated_bundle_blocks(self):
        self.assertEqual(self.verify(raw=self.raw[:-1]).state,BundleState.BLOCKED)

    def test_non_byte_bundle_blocks(self):
        self.assertEqual(self.verify(raw=self.raw.decode(),pin=self.digest).state,
                         BundleState.BLOCKED)

    def test_export_rejects_stale_latest_audit_pin(self):
        with self.assertRaises(ValueError):
            self.export(audit_head="f"*64)

    def test_export_rejects_stale_latest_proof_pin(self):
        with self.assertRaises(ValueError):
            self.export(proof_head="f"*64)

    def test_export_rejects_untrusted_archive_keys(self):
        with self.assertRaises(ValueError):
            self.export(keys={})

    def test_export_rejects_open_transaction(self):
        self.f.plan.db.execute("BEGIN")
        try:
            with self.assertRaises(ValueError):
                self.export()
        finally:
            self.f.plan.db.rollback()

    def test_history_quarantine_stays_visible_in_bundle(self):
        from datetime import timedelta
        self.f.save(now=ANCHOR+timedelta(hours=1),notes=[])
        raw=self.export()
        r=self.verify(raw=raw)
        self.assertEqual(r.state,BundleState.HISTORICAL_QUARANTINE)
        self.assertEqual(r.audit_count,2)

    def test_reported_success_without_proof_never_exports(self):
        self.f.plan.db.execute("DROP TRIGGER rio_v69_no_delete")
        self.f.plan.db.execute("DELETE FROM rio_v69_historical_proofs")
        self.f.plan.db.commit()
        with self.assertRaises(ValueError):
            self.export()

    def test_invalid_archive_proof_after_tampering_never_exports(self):
        self.f.plan.db.execute("DROP TRIGGER rio_v69_no_update")
        self.f.plan.db.execute(
            "UPDATE rio_v69_historical_proofs SET evidence_json='{}'"
        )
        self.f.plan.db.commit()
        with self.assertRaises(ValueError):
            self.export()

    def test_independent_verifier_never_grants_authority(self):
        from visitcard_v71_audit_bundle import BundleReview
        for state in BundleState:
            r=BundleReview(state,())
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
