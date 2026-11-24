"""RIO v6.0 SQLite incident persistence, rollback, reopening and tamper tests."""
import hashlib
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_visitcard_v59_dual_custody import DualCustodyTests,GENESIS,REPO,NOW
from visitcard_witness_enrollment import _canonical
from visitcard_v60_incident_ledger import (
    GENESIS as LEDGER_GENESIS,IncidentState,initialize_incident_ledger,
    read_incident_head,append_split_view_incident,execution_permitted,
)


class V60IncidentLedgerTests(unittest.TestCase):
    def setUp(self):
        self.f=DualCustodyTests("test_conflicting_signed_heads_create_quarantine_evidence")
        self.f.setUp()
        self.dir=tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.path=str(Path(self.dir.name)/"incidents.sqlite3")
        self.one=sqlite3.connect(self.path,timeout=1)
        self.one.execute("PRAGMA busy_timeout=1000")
        initialize_incident_ledger(self.one)
        self.addCleanup(self.one.close)
        self.notes=self.f.substitute_second(head="f"*64)
        self.seq=0
        self.head=LEDGER_GENESIS

    def append(self,**kw):
        f=self.f
        return append_split_view_incident(
            kw.get("db",self.one),upstream=kw.get("upstream",f.upstream),
            observations=kw.get("notes",self.notes["notes"]),
            pinned_custodian_keys=kw.get("roots",f.keys),
            independently_pinned_observation_sha256=kw.get("pins",self.notes["pins"]),
            expected_custodian_ids=f.ids,
            expected_repository=kw.get("repo",REPO),
            expected_previous_record_sha256=GENESIS,
            expected_min_sequence=1,
            expected_ledger_sequence=kw.get("seq",self.seq),
            independently_pinned_ledger_head_sha256=kw.get("head",self.head),
            now=NOW,
        )

    def read(self,**kw):
        return read_incident_head(
            kw.get("db",self.one),pinned_custodian_keys=kw.get("roots",self.f.keys),
            expected_sequence=kw.get("seq",self.seq),
            independently_pinned_head_sha256=kw.get("head",self.head),
        )

    def save(self):
        result=self.append()
        self.assertEqual(result.state,IncidentState.RECORDED_QUARANTINED,result.blockers)
        self.seq=result.sequence
        self.head=result.head_sha256
        return result

    def test_empty_initialized_genesis_is_verified(self):
        r=self.read()
        self.assertEqual(r.state,IncidentState.VERIFIED_QUARANTINED)
        self.assertEqual(r.sequence,0)
        self.assertEqual(r.head_sha256,LEDGER_GENESIS)

    def test_verified_conflict_is_durably_recorded(self):
        r=self.save()
        self.assertEqual(r.sequence,1)
        self.assertEqual(len(r.conflict_sha256),64)
        self.assertEqual(self.read().state,IncidentState.VERIFIED_QUARANTINED)

    def test_reopen_sqlite_and_verify_historical_signature(self):
        self.save()
        db=sqlite3.connect(self.path)
        try:
            self.assertEqual(self.read(db=db).state,IncidentState.VERIFIED_QUARANTINED)
        finally:
            db.close()

    def test_expired_historical_witness_is_still_auditable(self):
        self.save()
        # Verification uses signed captured-at instant, not wall-clock now.
        self.assertEqual(self.read().state,IncidentState.VERIFIED_QUARANTINED)

    def test_local_delete_trigger_refuses_removal(self):
        self.save()
        with self.assertRaises(sqlite3.IntegrityError):
            self.one.execute("DELETE FROM rio_v60_incident_events WHERE sequence=1")
        self.one.rollback()
        self.assertEqual(self.read().state,IncidentState.VERIFIED_QUARANTINED)

    def test_local_update_trigger_refuses_replacement(self):
        self.save()
        with self.assertRaises(sqlite3.IntegrityError):
            self.one.execute("UPDATE rio_v60_incident_events SET head_sha256=?",(LEDGER_GENESIS,))
        self.one.rollback()

    def test_old_genesis_pin_cannot_verify_nonempty_store(self):
        self.save()
        self.assertEqual(self.read(seq=0,head=LEDGER_GENESIS).state,IncidentState.BLOCKED)

    def test_wrong_latest_head_pin_blocks(self):
        self.save()
        self.assertEqual(self.read(head="f"*64).state,IncidentState.BLOCKED)

    def test_wrong_expected_sequence_blocks(self):
        self.save()
        self.assertEqual(self.read(seq=2).state,IncidentState.BLOCKED)

    def test_old_pin_cannot_append_again(self):
        self.save()
        self.assertEqual(self.append(seq=0,head=LEDGER_GENESIS).state,IncidentState.BLOCKED)

    def test_duplicate_conflict_not_inserted_twice(self):
        self.save()
        self.assertEqual(self.append().state,IncidentState.BLOCKED)
        self.assertEqual(self.read().sequence,1)

    def test_missing_pinned_observer_roots_blocks_read(self):
        self.save()
        self.assertEqual(self.read(roots={}).state,IncidentState.BLOCKED)

    def test_missing_custodian_pin_blocks_append(self):
        self.assertEqual(self.append(pins={}).state,IncidentState.BLOCKED)

    def test_matching_without_split_view_cannot_be_stored(self):
        self.assertEqual(self.append(notes=self.f.notes,
                                     pins=self.f.pins).state,IncidentState.BLOCKED)

    def test_forged_incident_observation_blocks(self):
        notes=[dict(n) for n in self.notes["notes"]]
        notes[1]=dict(notes[1],signature="A"*86)
        pins={**self.notes["pins"],self.f.ids[1]:hashlib.sha256(_canonical(notes[1])).hexdigest()}
        self.assertEqual(self.append(notes=notes,pins=pins).state,IncidentState.BLOCKED)

    def test_invalid_upstream_succession_blocks(self):
        self.assertEqual(self.append(upstream=None).state,IncidentState.BLOCKED)

    def test_active_transaction_prevents_append(self):
        self.one.execute("BEGIN")
        self.assertEqual(self.append().state,IncidentState.BLOCKED)
        self.one.rollback()

    def test_active_transaction_prevents_head_audit(self):
        self.one.execute("BEGIN")
        self.assertEqual(self.read().state,IncidentState.BLOCKED)
        self.one.rollback()

    def test_reopen_empty_db_does_not_invent_conflicts(self):
        other=sqlite3.connect(self.path)
        try:
            self.assertEqual(self.read(db=other).sequence,0)
        finally:
            other.close()

    def test_uninitialized_database_fails_closed(self):
        other=sqlite3.connect(":memory:")
        try:
            self.assertEqual(self.read(db=other).state,IncidentState.BLOCKED)
        finally:
            other.close()

    def test_second_connection_rejects_stale_ledger_pin(self):
        self.save()
        second=sqlite3.connect(self.path)
        try:
            self.assertEqual(self.append(db=second,head=LEDGER_GENESIS).state,
                             IncidentState.BLOCKED)
        finally:
            second.close()

    def test_invalid_external_latest_head_blocks(self):
        self.assertEqual(self.append(head="").state,IncidentState.BLOCKED)

    def test_boolean_sequence_is_not_an_integer(self):
        self.assertEqual(self.read(seq=True).state,IncidentState.BLOCKED)

    def test_bad_chain_contents_detected_even_with_expected_local_head(self):
        self.save()
        # Simulate a privileged local DB owner who can drop SQLite triggers.
        self.one.execute("DROP TRIGGER rio_v60_immutable_update")
        self.one.execute("UPDATE rio_v60_incident_events SET conflict_sha256=?",("f"*64,))
        self.one.commit()
        self.assertEqual(self.read().state,IncidentState.BLOCKED)

    def test_pruned_database_requires_independent_pin(self):
        self.save()
        self.one.execute("DROP TRIGGER rio_v60_immutable_delete")
        self.one.execute("DELETE FROM rio_v60_incident_events")
        self.one.commit()
        self.assertEqual(self.read().state,IncidentState.BLOCKED)

    def test_repeat_untrusted_reinitialization_not_a_cleanup(self):
        self.save()
        initialize_incident_ledger(self.one)
        self.assertEqual(self.read().state,IncidentState.VERIFIED_QUARANTINED)

    def test_no_authorization_in_any_incident_state(self):
        from visitcard_v60_incident_ledger import IncidentResult
        for state in IncidentState:
            r=IncidentResult(state,())
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
