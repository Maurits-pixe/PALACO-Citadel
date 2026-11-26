"""RIO v7.0 atomic SQLite retention+signed-proof transaction regressions."""
from datetime import timedelta
import sqlite3
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_visitcard_v67_retention import V67RetentionTests,NOW
from test_visitcard_v68_retention_schedule import V68RetentionScheduleTests,ANCHOR
from visitcard_v67_retention import GENESIS as RETENTION_GENESIS
from visitcard_v68_retention_schedule import GENESIS as AUDIT_GENESIS
from visitcard_v69_historical_proofs import (
    GENESIS as PROOF_GENESIS,initialize_historical_proofs,
    inspect_historical_proofs,HistoricalState,
)
from visitcard_v70_atomic_retention import (
    AtomicState,record_atomic_retention_check,execution_permitted,
)


class V70AtomicRetentionTests(unittest.TestCase):
    def setUp(self):
        self.plan=V68RetentionScheduleTests(
            "test_first_check_writes_hash_chained_history"
        )
        self.plan.setUp()
        self.addCleanup(self.plan.doCleanups)
        self.signed=V67RetentionTests(
            "test_valid_synthetic_dual_retention_is_informational"
        )
        self.signed.setUp()
        self.addCleanup(self.signed.doCleanups)
        initialize_historical_proofs(self.plan.db)
        self.audit_seq=0
        self.audit_head=AUDIT_GENESIS
        self.proof_seq=0
        self.proof_head=PROOF_GENESIS

    def write(self,**kw):
        return record_atomic_retention_check(
            kw.get("db",self.plan.db),
            now=kw.get("now",ANCHOR),
            pinned_archive_keys=kw.get("keys",self.signed.keys),
            expected_archive_ids=kw.get("ids",self.signed.ids),
            independently_pinned_audit_sequence=kw.get("audit_seq",self.audit_seq),
            independently_pinned_audit_head_sha256=kw.get("audit_head",self.audit_head),
            independently_pinned_proof_sequence=kw.get("proof_seq",self.proof_seq),
            independently_pinned_proof_head_sha256=kw.get("proof_head",self.proof_head),
            expected_retention_until=kw.get("minimum",self.signed.minimum),
            readback=kw.get("readback",self.signed.upstream),
            signed_statements=kw.get("notes",self.signed.notes),
            independently_pinned_retention_checkpoint_sha256=kw.get("pin",self.signed.pin),
        )

    def save(self,**kw):
        r=self.write(**kw)
        self.assertEqual(r.state,AtomicState.RECORDED_QUARANTINED,r.blockers)
        self.audit_seq=r.audit_sequence
        self.audit_head=r.audit_head_sha256
        self.proof_seq=r.proof_sequence
        self.proof_head=r.proof_head_sha256
        return r

    def audit(self,**kw):
        return inspect_historical_proofs(
            kw.get("db",self.plan.db),
            pinned_archive_keys=kw.get("keys",self.signed.keys),
            expected_archive_ids=self.signed.ids,
            independently_pinned_audit_sequence=kw.get("audit_seq",self.audit_seq),
            independently_pinned_audit_head_sha256=kw.get("audit_head",self.audit_head),
            independently_pinned_proof_sequence=kw.get("proof_seq",self.proof_seq),
            independently_pinned_proof_head_sha256=kw.get("proof_head",self.proof_head),
        )

    def test_one_transaction_records_success_and_signed_proof(self):
        r=self.save()
        self.assertEqual(r.outcome,"VERIFIED_INFORMATIONAL")
        self.assertEqual(r.audit_sequence,1)
        self.assertEqual(r.proof_sequence,1)
        self.assertFalse(r.release_permitted)
        self.assertEqual(self.audit().state,HistoricalState.VERIFIED_INFORMATIONAL)

    def test_proof_row_is_bound_to_matching_audit_event(self):
        self.save()
        h=self.plan.db.execute(
            "SELECT head_sha256 FROM rio_v68_history WHERE slot=1"
        ).fetchone()[0]
        self.assertEqual(h,self.audit_head)
        self.assertEqual(self.audit().evidence_count,1)

    def test_restart_reverifies_both_tables(self):
        self.save()
        db=sqlite3.connect(self.plan.path)
        try:
            self.assertEqual(self.audit(db=db).state,HistoricalState.VERIFIED_INFORMATIONAL)
        finally:
            db.close()

    def test_missing_signed_statements_commit_failed_not_success(self):
        r=self.save(notes=[])
        self.assertEqual(r.outcome,"FAILED_QUARANTINED")
        self.assertEqual(r.proof_sequence,0)
        self.assertEqual(self.audit().state,HistoricalState.HISTORICAL_QUARANTINE)

    def test_one_signature_is_not_enough(self):
        r=self.save(notes=self.signed.notes[:1])
        self.assertEqual(r.outcome,"FAILED_QUARANTINED")
        self.assertEqual(r.proof_sequence,0)

    def test_forged_signature_is_not_success(self):
        forged=[self.signed.notes[0],
                {**self.signed.notes[1],"signature":"A"*86}]
        r=self.save(notes=forged)
        self.assertEqual(r.outcome,"FAILED_QUARANTINED")
        self.assertEqual(r.proof_sequence,0)

    def test_missing_archive_roots_blocks_existing_chain(self):
        self.assertEqual(self.write(keys={}).state,AtomicState.BLOCKED)

    def test_same_root_under_two_names_fails_success(self):
        reused={x:self.signed.keys[self.signed.ids[0]] for x in self.signed.ids}
        r=self.save(keys=reused)
        self.assertEqual(r.outcome,"FAILED_QUARANTINED")

    def test_wrong_expected_retention_pin_fails_success(self):
        r=self.save(pin="f"*64)
        self.assertEqual(r.outcome,"FAILED_QUARANTINED")

    def test_missing_current_retention_pin_fails_success(self):
        r=self.save(pin=None)
        self.assertEqual(r.outcome,"FAILED_QUARANTINED")

    def test_late_valid_proof_is_permanently_missed(self):
        r=self.save(now=ANCHOR+timedelta(minutes=6))
        self.assertEqual(r.outcome,"MISSED_QUARANTINED")
        self.assertEqual(r.proof_sequence,0)

    def test_missed_and_failed_events_keep_quarantine(self):
        self.save(notes=[])
        self.assertEqual(self.audit().state,HistoricalState.HISTORICAL_QUARANTINE)

    def test_not_due_writes_neither_table(self):
        r=self.write(now=ANCHOR-timedelta(seconds=1))
        self.assertEqual(r.state,AtomicState.BLOCKED)
        self.assertEqual(self.plan.db.execute("SELECT count(*) FROM rio_v68_history").fetchone()[0],0)
        self.assertEqual(self.plan.db.execute("SELECT count(*) FROM rio_v69_historical_proofs").fetchone()[0],0)

    def test_stale_audit_pin_writes_neither_table(self):
        self.save()
        r=self.write(audit_seq=0,audit_head=AUDIT_GENESIS,
                     now=ANCHOR+timedelta(hours=1))
        self.assertEqual(r.state,AtomicState.BLOCKED)
        self.assertEqual(self.plan.db.execute("SELECT count(*) FROM rio_v68_history").fetchone()[0],1)

    def test_stale_proof_pin_rejected(self):
        self.save()
        self.assertEqual(
            self.write(proof_seq=0,proof_head=PROOF_GENESIS,
                       now=ANCHOR+timedelta(hours=1)).state,
            AtomicState.BLOCKED
        )

    def test_duplicate_slot_rejected(self):
        self.save()
        self.assertEqual(self.write().state,AtomicState.BLOCKED)

    def test_trustless_upstream_is_not_marked_success(self):
        from visitcard_v65_exact_readback import ReadbackReview,ReadbackState
        bad=ReadbackReview(ReadbackState.READBACK_INCOMPLETE,(),"a"*64,1,"b"*64)
        self.assertEqual(self.save(readback=bad).outcome,"FAILED_QUARANTINED")

    def test_fail_closed_if_legacy_success_lacks_proof(self):
        self.plan.saved(review=self.signed.check())
        self.audit_seq=self.plan.seq
        self.audit_head=self.plan.head
        self.assertEqual(
            self.write(now=ANCHOR+timedelta(hours=1)).state,AtomicState.BLOCKED
        )

    def test_second_atomic_success_links_previous_signed_checkpoint(self):
        self.save()
        later=NOW+timedelta(hours=1)
        notes=[self.signed.sign(i,epoch=2,previous=self.signed.pin,
                               observed=later,expires=later+timedelta(minutes=10))
               for i in range(2)]
        pin=self.signed.digest(notes,2,self.signed.pin)
        r=self.save(now=later,notes=notes,pin=pin)
        self.assertEqual(r.outcome,"VERIFIED_INFORMATIONAL")
        self.assertEqual(r.audit_sequence,2)
        self.assertEqual(r.proof_sequence,2)
        self.assertEqual(self.audit().state,HistoricalState.VERIFIED_INFORMATIONAL)

    def test_prior_failed_history_remains_quarantined_after_success(self):
        self.save(notes=[])
        later=NOW+timedelta(hours=1)
        notes=[self.signed.sign(i,epoch=2,previous=RETENTION_GENESIS,
                               observed=later,expires=later+timedelta(minutes=10))
               for i in range(2)]
        pin=self.signed.digest(notes,2,RETENTION_GENESIS)
        r=self.save(now=later,notes=notes,pin=pin)
        self.assertEqual(r.outcome,"VERIFIED_INFORMATIONAL")
        self.assertEqual(self.audit().state,HistoricalState.HISTORICAL_QUARANTINE)

    def test_stored_audit_row_overwrite_prevented(self):
        self.save()
        with self.assertRaises(sqlite3.IntegrityError):
            self.plan.db.execute("UPDATE rio_v68_history SET event_json='{}'")
        self.plan.db.rollback()

    def test_stored_proof_row_overwrite_prevented(self):
        self.save()
        with self.assertRaises(sqlite3.IntegrityError):
            self.plan.db.execute("UPDATE rio_v69_historical_proofs SET evidence_json='{}'")
        self.plan.db.rollback()

    def test_boolean_audit_sequence_rejected(self):
        self.assertEqual(self.write(audit_seq=True).state,AtomicState.BLOCKED)

    def test_naive_clock_cannot_write(self):
        self.assertEqual(
            self.write(now=ANCHOR.replace(tzinfo=None)).state,AtomicState.BLOCKED
        )

    def test_active_transaction_cannot_start_nested_atomic_write(self):
        self.plan.db.execute("BEGIN")
        self.assertEqual(self.write().state,AtomicState.BLOCKED)
        self.plan.db.rollback()

    def test_two_draft_tables_missing_causes_fail_closed(self):
        other=sqlite3.connect(":memory:")
        try:
            self.assertEqual(self.write(db=other).state,AtomicState.BLOCKED)
        finally:
            other.close()

    def test_all_results_permanently_deny_authorization(self):
        from visitcard_v70_atomic_retention import AtomicReview
        for state in AtomicState:
            r=AtomicReview(state,())
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
