"""RIO v6.8 restartable retention schedule, immutable history and missed checks."""
from datetime import datetime,timedelta,timezone
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from visitcard_v67_retention import RetentionReview,RetentionState
from visitcard_v68_retention_schedule import (
    GENESIS,AuditState,initialize_retention_schedule,
    inspect_retention_schedule,record_retention_check,execution_permitted,
)

ANCHOR=datetime(2026,11,26,12,tzinfo=timezone.utc)


class V68RetentionScheduleTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path=str(Path(self.tmp.name)/"retention.sqlite")
        self.db=sqlite3.connect(self.path)
        self.addCleanup(self.db.close)
        initialize_retention_schedule(
            self.db,anchor=ANCHOR,interval_seconds=3600,grace_seconds=300
        )
        self.seq=0
        self.head=GENESIS

    def valid(self,slot=1):
        return RetentionReview(RetentionState.VERIFIED_INFORMATIONAL,(),slot,"a"*64)

    def inspect(self,**kw):
        return inspect_retention_schedule(
            kw.get("db",self.db),
            independently_pinned_sequence=kw.get("seq",self.seq),
            independently_pinned_head_sha256=kw.get("head",self.head),
            now=kw.get("now",ANCHOR)
        )

    def record(self,**kw):
        return record_retention_check(
            kw.get("db",self.db),
            now=kw.get("now",ANCHOR),
            independently_pinned_sequence=kw.get("seq",self.seq),
            independently_pinned_head_sha256=kw.get("head",self.head),
            retention_review=kw.get("review",self.valid(self.seq+1)),
        )

    def saved(self,**kw):
        r=self.record(**kw)
        self.assertEqual(r.state,AuditState.RECORDED_QUARANTINED,r.blockers)
        self.seq=r.sequence
        self.head=r.latest_sha256
        return r

    def test_schedule_genesis_is_informational_hold(self):
        r=self.inspect()
        self.assertEqual(r.state,AuditState.SCHEDULED_HOLD)
        self.assertEqual(r.latest_sha256,GENESIS)

    def test_first_check_writes_hash_chained_history(self):
        r=self.saved()
        self.assertEqual(r.latest_outcome,"VERIFIED_INFORMATIONAL")
        self.assertNotEqual(r.latest_sha256,GENESIS)
        self.assertEqual(self.inspect().sequence,1)

    def test_second_check_links_the_previous_event(self):
        self.saved()
        r=self.saved(now=ANCHOR+timedelta(hours=1),review=self.valid(2))
        self.assertEqual(r.sequence,2)
        self.assertEqual(r.latest_outcome,"VERIFIED_INFORMATIONAL")

    def test_reopen_sqlite_reverifies_chain(self):
        self.saved()
        other=sqlite3.connect(self.path)
        try:
            self.assertEqual(self.inspect(db=other).state,AuditState.SCHEDULED_HOLD)
        finally:
            other.close()

    def test_missed_due_time_detected_without_writing(self):
        self.assertEqual(self.inspect(now=ANCHOR+timedelta(minutes=6)).state,
                         AuditState.OVERDUE_QUARANTINED)
        self.assertEqual(self.inspect().sequence,0)

    def test_late_success_is_recorded_missed_not_success(self):
        r=self.saved(now=ANCHOR+timedelta(minutes=6))
        self.assertEqual(r.latest_outcome,"MISSED_QUARANTINED")

    def test_missing_review_is_failed_quarantined(self):
        r=self.saved(review=None)
        self.assertEqual(r.latest_outcome,"FAILED_QUARANTINED")

    def test_incomplete_v67_review_is_failed(self):
        bad=RetentionReview(RetentionState.RETENTION_BLOCKED,())
        self.assertEqual(self.saved(review=bad).latest_outcome,"FAILED_QUARANTINED")

    def test_wrong_epoch_does_not_mark_success(self):
        self.assertEqual(self.saved(review=self.valid(2)).latest_outcome,
                         "FAILED_QUARANTINED")

    def test_cannot_skip_missed_slot_to_attest_later_slot(self):
        r=self.saved(now=ANCHOR+timedelta(hours=4),review=self.valid(5))
        self.assertEqual(r.sequence,1)
        self.assertEqual(r.latest_outcome,"MISSED_QUARANTINED")

    def test_duplicate_same_slot_rejected(self):
        self.saved()
        self.assertEqual(self.record(now=ANCHOR).state,AuditState.BLOCKED)

    def test_next_slot_cannot_run_early(self):
        self.saved()
        self.assertEqual(self.record(now=ANCHOR+timedelta(minutes=30)).state,
                         AuditState.BLOCKED)

    def test_wrong_external_head_blocks_audit(self):
        self.saved()
        self.assertEqual(self.inspect(head=GENESIS).state,AuditState.BLOCKED)

    def test_wrong_external_sequence_blocks_audit(self):
        self.saved()
        self.assertEqual(self.inspect(seq=0).state,AuditState.BLOCKED)

    def test_stale_writer_cannot_append(self):
        self.saved()
        self.assertEqual(self.record(seq=0,head=GENESIS,now=ANCHOR+timedelta(hours=1)).state,
                         AuditState.BLOCKED)

    def test_missing_external_latest_pin_blocks(self):
        self.assertEqual(self.inspect(head="").state,AuditState.BLOCKED)

    def test_immutable_history_update_trigger_blocks(self):
        self.saved()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE rio_v68_history SET event_json='{}'")
        self.db.rollback()

    def test_immutable_history_delete_trigger_blocks(self):
        self.saved()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM rio_v68_history")
        self.db.rollback()

    def test_tampered_history_detected_even_if_head_matches(self):
        self.saved()
        self.db.execute("DROP TRIGGER rio_v68_event_update")
        self.db.execute("UPDATE rio_v68_history SET event_json='{}'")
        self.db.commit()
        self.assertEqual(self.inspect().state,AuditState.BLOCKED)

    def test_deleted_history_is_detected_with_independent_latest_pin(self):
        self.saved()
        self.db.execute("DROP TRIGGER rio_v68_event_delete")
        self.db.execute("DELETE FROM rio_v68_history")
        self.db.commit()
        self.assertEqual(self.inspect().state,AuditState.BLOCKED)

    def test_reinitialization_same_policy_preserves_history(self):
        self.saved()
        initialize_retention_schedule(
            self.db,anchor=ANCHOR,interval_seconds=3600,grace_seconds=300
        )
        self.assertEqual(self.inspect().sequence,1)

    def test_changed_policy_reinitialization_rejected(self):
        with self.assertRaises(ValueError):
            initialize_retention_schedule(
                self.db,anchor=ANCHOR,interval_seconds=1800,grace_seconds=300
            )

    def test_policy_update_trigger_refuses_changes(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE rio_v68_schedule SET interval_seconds=1")
        self.db.rollback()

    def test_tampered_policy_without_trigger_is_detected(self):
        self.db.execute("DROP TRIGGER rio_v68_policy_update")
        self.db.execute("UPDATE rio_v68_schedule SET go13='GO'")
        self.db.commit()
        self.assertEqual(self.inspect().state,AuditState.BLOCKED)

    def test_uninitialized_database_fails_closed(self):
        db=sqlite3.connect(":memory:")
        try:
            self.assertEqual(self.inspect(db=db).state,AuditState.BLOCKED)
        finally:
            db.close()

    def test_active_transaction_rejects_new_record(self):
        self.db.execute("BEGIN")
        self.assertEqual(self.record().state,AuditState.BLOCKED)
        self.db.rollback()

    def test_boolean_sequence_fails_closed(self):
        self.assertEqual(self.inspect(seq=True).state,AuditState.BLOCKED)

    def test_naive_current_time_fails_closed(self):
        self.assertEqual(self.inspect(now=datetime(2026,11,26)).state,AuditState.BLOCKED)

    def test_no_outcome_ever_grants_execution(self):
        from visitcard_v68_retention_schedule import AuditReview
        for state in AuditState:
            value=AuditReview(state,())
            self.assertFalse(value.release_permitted)
            self.assertFalse(value.merge_permitted)
            self.assertFalse(value.activation_permitted)
            self.assertFalse(execution_permitted(value))
