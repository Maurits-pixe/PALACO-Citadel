"""RIO v6.9 signed historical archive retention proof revalidation tests."""
import json
from datetime import timedelta
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_visitcard_v67_retention import V67RetentionTests,NOW
from test_visitcard_v68_retention_schedule import V68RetentionScheduleTests,ANCHOR
from visitcard_v65_exact_readback import ReadbackReview,ReadbackState
from visitcard_v67_retention import RetentionReview,RetentionState,GENESIS as RETENTION_GENESIS
from visitcard_v68_retention_schedule import AuditState
from visitcard_v69_historical_proofs import (
    GENESIS,HistoricalState,initialize_historical_proofs,
    append_historical_proof,inspect_historical_proofs,execution_permitted,
)


class V69HistoricalTests(unittest.TestCase):
    def setUp(self):
        self.schedule=V68RetentionScheduleTests(
            "test_first_check_writes_hash_chained_history"
        )
        self.schedule.setUp()
        self.addCleanup(self.schedule.doCleanups)
        self.retention=V67RetentionTests(
            "test_valid_synthetic_dual_retention_is_informational"
        )
        self.retention.setUp()
        self.addCleanup(self.retention.doCleanups)
        initialize_historical_proofs(self.schedule.db)
        self.seq=0
        self.head=GENESIS

    def audit_success(self):
        r=self.schedule.saved(review=RetentionReview(
            RetentionState.VERIFIED_INFORMATIONAL,(),1,self.retention.pin
        ))
        self.assertEqual(r.latest_outcome,"VERIFIED_INFORMATIONAL")

    def append(self,**kw):
        return append_historical_proof(
            kw.get("db",self.schedule.db),
            audit_slot=kw.get("slot",1),
            statements=kw.get("notes",self.retention.notes),
            readback=kw.get("readback",self.retention.upstream),
            expected_retention_until=kw.get("minimum",self.retention.minimum),
            pinned_archive_keys=kw.get("keys",self.retention.keys),
            expected_archive_ids=kw.get("ids",self.retention.ids),
            independently_pinned_audit_sequence=kw.get("audit_seq",self.schedule.seq),
            independently_pinned_audit_head_sha256=kw.get("audit_head",self.schedule.head),
            independently_pinned_proof_sequence=kw.get("seq",self.seq),
            independently_pinned_proof_head_sha256=kw.get("head",self.head),
        )

    def read(self,**kw):
        return inspect_historical_proofs(
            kw.get("db",self.schedule.db),
            pinned_archive_keys=kw.get("keys",self.retention.keys),
            expected_archive_ids=kw.get("ids",self.retention.ids),
            independently_pinned_audit_sequence=kw.get("audit_seq",self.schedule.seq),
            independently_pinned_audit_head_sha256=kw.get("audit_head",self.schedule.head),
            independently_pinned_proof_sequence=kw.get("seq",self.seq),
            independently_pinned_proof_head_sha256=kw.get("head",self.head),
        )

    def saved(self,**kw):
        r=self.append(**kw)
        self.assertEqual(r.state,HistoricalState.HISTORICAL_QUARANTINE,r.blockers)
        self.seq=r.evidence_count
        self.head=r.evidence_head_sha256
        return r

    def test_empty_audit_with_genesis_pins_is_informational(self):
        self.assertEqual(self.read().state,HistoricalState.VERIFIED_INFORMATIONAL)

    def test_success_without_signed_proof_fails_closed(self):
        self.audit_success()
        self.assertEqual(self.read().state,HistoricalState.BLOCKED)

    def test_original_two_signatures_saved_and_reverified(self):
        self.audit_success()
        self.saved()
        r=self.read()
        self.assertEqual(r.state,HistoricalState.VERIFIED_INFORMATIONAL)
        self.assertEqual(r.evidence_count,1)
        self.assertFalse(r.release_permitted)

    def test_restart_reverifies_two_original_signatures(self):
        self.audit_success()
        self.saved()
        other=sqlite3.connect(self.schedule.path)
        try:
            self.assertEqual(self.read(db=other).state,HistoricalState.VERIFIED_INFORMATIONAL)
        finally:
            other.close()

    def test_same_proof_cannot_append_twice(self):
        self.audit_success()
        self.saved()
        self.assertEqual(self.append().state,HistoricalState.BLOCKED)

    def test_old_proof_head_cannot_append(self):
        self.audit_success()
        self.saved()
        self.assertEqual(self.append(seq=0,head=GENESIS).state,HistoricalState.BLOCKED)

    def test_old_proof_head_cannot_verify_history(self):
        self.audit_success()
        self.saved()
        self.assertEqual(self.read(seq=0,head=GENESIS).state,HistoricalState.BLOCKED)

    def test_wrong_audit_head_blocks_proof(self):
        self.audit_success()
        self.assertEqual(self.append(audit_head="f"*64).state,HistoricalState.BLOCKED)

    def test_wrong_signed_retention_checkpoint_blocks(self):
        self.audit_success()
        wrong=RetentionReview(RetentionState.VERIFIED_INFORMATIONAL,(),1,"f"*64)
        self.assertNotEqual(wrong.checkpoint_sha256,self.retention.pin)
        self.assertEqual(self.append(notes=self.retention.notes[:1]).state,HistoricalState.BLOCKED)

    def test_forged_signature_is_refused(self):
        self.audit_success()
        notes=[self.retention.notes[0],
               {**self.retention.notes[1],"signature":"A"*86}]
        self.assertEqual(self.append(notes=notes).state,HistoricalState.BLOCKED)

    def test_untrusted_archive_keys_refused(self):
        self.audit_success()
        self.assertEqual(self.append(keys={}).state,HistoricalState.BLOCKED)

    def test_retention_minimum_must_be_verified(self):
        self.audit_success()
        self.assertEqual(
            self.append(minimum=NOW+timedelta(days=40)).state,
            HistoricalState.BLOCKED
        )

    def test_unverified_upstream_readback_metadata_refused(self):
        self.audit_success()
        rb=ReadbackReview(ReadbackState.READBACK_INCOMPLETE,(),"a"*64,1,"b"*64)
        self.assertEqual(self.append(readback=rb).state,HistoricalState.BLOCKED)

    def test_cannot_attach_proof_to_failed_event(self):
        self.schedule.saved(review=None)
        self.assertEqual(self.append().state,HistoricalState.BLOCKED)

    def test_failed_event_quarantine_cannot_be_erased(self):
        self.schedule.saved(review=None)
        self.assertEqual(self.read().state,HistoricalState.HISTORICAL_QUARANTINE)

    def test_missed_event_quarantine_cannot_be_erased(self):
        self.schedule.saved(now=ANCHOR+timedelta(minutes=6))
        self.assertEqual(self.read().state,HistoricalState.HISTORICAL_QUARANTINE)

    def test_change_in_original_signed_claim_detected_on_restart(self):
        self.audit_success()
        self.saved()
        self.schedule.db.execute("DROP TRIGGER rio_v69_no_update")
        raw=self.schedule.db.execute(
            "SELECT evidence_json FROM rio_v69_historical_proofs"
        ).fetchone()[0]
        item=json.loads(raw)
        item["statements"][0]["signature"]="A"*86
        self.schedule.db.execute(
            "UPDATE rio_v69_historical_proofs SET evidence_json=?",
            (json.dumps(item,separators=(",",":")),)
        )
        self.schedule.db.commit()
        self.assertEqual(self.read().state,HistoricalState.BLOCKED)

    def test_delete_immutable_signed_proof_rejected(self):
        self.audit_success()
        self.saved()
        with self.assertRaises(sqlite3.IntegrityError):
            self.schedule.db.execute("DELETE FROM rio_v69_historical_proofs")
        self.schedule.db.rollback()

    def test_overwrite_immutable_signed_proof_rejected(self):
        self.audit_success()
        self.saved()
        with self.assertRaises(sqlite3.IntegrityError):
            self.schedule.db.execute(
                "UPDATE rio_v69_historical_proofs SET head_sha256=?",("f"*64,)
            )
        self.schedule.db.rollback()

    def test_removed_proofs_detected_after_trigger_drop(self):
        self.audit_success()
        self.saved()
        self.schedule.db.execute("DROP TRIGGER rio_v69_no_delete")
        self.schedule.db.execute("DELETE FROM rio_v69_historical_proofs")
        self.schedule.db.commit()
        self.assertEqual(self.read().state,HistoricalState.BLOCKED)

    def test_prior_audit_row_tamper_detected(self):
        self.audit_success()
        self.saved()
        self.schedule.db.execute("DROP TRIGGER rio_v68_event_update")
        self.schedule.db.execute(
            "UPDATE rio_v68_history SET event_json='{}'"
        )
        self.schedule.db.commit()
        self.assertEqual(self.read().state,HistoricalState.BLOCKED)

    def test_independent_audit_pin_required(self):
        self.assertEqual(self.read(audit_head="").state,HistoricalState.BLOCKED)

    def test_all_historical_states_still_deny_execution(self):
        from visitcard_v69_historical_proofs import HistoricalReview
        for state in HistoricalState:
            r=HistoricalReview(state,())
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
