"""RIO v6.2 durable handoff outbox, retries and exactly-once local ACK tests."""
import sqlite3
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_visitcard_v61_archive_receipts import V61ArchiveReceiptTests,NOW
from visitcard_v61_archive_receipts import GENESIS as RECEIPT_GENESIS,ArchiveState
from visitcard_v62_handoff import (
    HandoffState,initialize_handoff_outbox,prepare_handoffs,
    deliver_handoffs,finalize_handoffs,execution_permitted,
)


class V62HandoffTests(unittest.TestCase):
    def setUp(self):
        self.f=V61ArchiveReceiptTests("test_signed_double_archive_receipt_still_quarantined")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        initialize_handoff_outbox(self.f.f.one)
        self.incident=self.f.incident
        self.called=[]
        self.reply={receipt["payload"]["archive_id"]:receipt for receipt in self.f.receipts}

    def prep(self,**changes):
        return prepare_handoffs(
            changes.get("db",self.f.f.one),
            incident_sequence=changes.get("incident",self.incident.sequence),
            independently_pinned_incident_head_sha256=changes.get(
                "head",self.incident.head_sha256),
            pinned_custodian_keys=changes.get("custodians",self.f.f.f.keys),
            archive_ids=changes.get("ids",self.f.ids),
        )

    def deliver(self,**changes):
        def transport(req):
            self.called.append(req)
            if req["archive_id"] in changes.get("errors",()):
                raise ConnectionError("offline")
            return changes.get("replies",self.reply).get(req["archive_id"])
        return deliver_handoffs(
            changes.get("db",self.f.f.one),
            incident_sequence=self.incident.sequence,
            independently_pinned_incident_head_sha256=changes.get("head",self.incident.head_sha256),
            pinned_custodian_keys=self.f.f.f.keys,
            archive_ids=self.f.ids,pinned_archive_keys=changes.get("keys",self.f.keys),
            transport=transport,now=NOW,
        )

    def finalize(self,**changes):
        return finalize_handoffs(
            changes.get("db",self.f.f.one),
            incident_sequence=self.incident.sequence,
            independently_pinned_incident_head_sha256=self.incident.head_sha256,
            pinned_custodian_keys=self.f.f.f.keys,
            archive_ids=self.f.ids,pinned_archive_keys=self.f.keys,
            expected_receipt_sequence=changes.get("seq",0),
            independently_pinned_receipt_head_sha256=changes.get("head",RECEIPT_GENESIS),
            now=NOW,
        )

    def test_preparation_durable_and_quarantined(self):
        r=self.prep()
        self.assertEqual(r.state,HandoffState.PREPARED_QUARANTINED)
        self.assertEqual(len(r.handoff_id),64)
        self.assertFalse(r.activation_permitted)

    def test_prepare_is_idempotent(self):
        self.prep()
        self.assertEqual(self.prep().state,HandoffState.PREPARED_QUARANTINED)
        n=self.f.f.one.execute("SELECT count(*) FROM rio_v62_outbox").fetchone()[0]
        self.assertEqual(n,2)

    def test_preparation_invalid_ledger_head_denied(self):
        self.assertEqual(self.prep(head="f"*64).state,HandoffState.BLOCKED)

    def test_duplicate_archive_id_denied(self):
        self.assertEqual(self.prep(ids=("archive","archive")).state,HandoffState.BLOCKED)

    def test_uninitialized_outbox_denied(self):
        db=sqlite3.connect(":memory:")
        try:
            self.assertEqual(self.prep(db=db).state,HandoffState.BLOCKED)
        finally: db.close()

    def test_partial_delivery_remains_pending(self):
        self.prep()
        r=self.deliver(errors=(self.f.ids[1],))
        self.assertEqual(r.state,HandoffState.AWAITING_RECEIPTS)
        self.assertEqual(r.acknowledged,1)

    def test_retry_only_unacknowledged_archive(self):
        self.prep()
        self.deliver(errors=(self.f.ids[1],))
        self.called.clear()
        r=self.deliver()
        self.assertEqual(r.state,HandoffState.BOTH_RECEIPTS_QUARANTINED)
        self.assertEqual([x["archive_id"] for x in self.called],[self.f.ids[1]])

    def test_replay_after_both_acks_never_sends_again(self):
        self.prep()
        self.deliver()
        self.called.clear()
        self.assertEqual(self.deliver().acknowledged,2)
        self.assertEqual(self.called,[])

    def test_restart_retry_recovers_without_replaying_acked_party(self):
        self.prep()
        self.deliver(errors=(self.f.ids[1],))
        db=sqlite3.connect(self.f.f.path)
        try:
            r=self.deliver(db=db)
            self.assertEqual(r.state,HandoffState.BOTH_RECEIPTS_QUARANTINED)
            self.assertEqual(self.called[-1]["archive_id"],self.f.ids[1])
        finally: db.close()

    def test_forged_ack_not_persisted(self):
        self.prep()
        fake={self.f.ids[0]:{"payload":{},"signature":"x","signer_id":self.f.ids[0]}}
        r=self.deliver(replies=fake)
        self.assertEqual(r.state,HandoffState.AWAITING_RECEIPTS)
        self.assertEqual(r.acknowledged,0)

    def test_replayed_ack_for_wrong_archive_denied(self):
        self.prep()
        r=self.deliver(replies={self.f.ids[0]:self.f.receipts[1]})
        self.assertEqual(r.acknowledged,0)

    def test_missing_archive_keys_prevents_acceptance(self):
        self.prep()
        self.assertEqual(self.deliver(keys={}).acknowledged,0)

    def test_outbox_delete_trigger_refuses(self):
        self.prep()
        with self.assertRaises(sqlite3.IntegrityError):
            self.f.f.one.execute("DELETE FROM rio_v62_outbox")
        self.f.f.one.rollback()

    def test_outbox_update_trigger_refuses(self):
        self.prep()
        with self.assertRaises(sqlite3.IntegrityError):
            self.f.f.one.execute("UPDATE rio_v62_outbox SET request_json='{}'")
        self.f.f.one.rollback()

    def test_ack_update_trigger_refuses(self):
        self.prep();self.deliver()
        with self.assertRaises(sqlite3.IntegrityError):
            self.f.f.one.execute("UPDATE rio_v62_ack SET receipt_json='{}'")
        self.f.f.one.rollback()

    def test_ack_delete_trigger_refuses(self):
        self.prep();self.deliver()
        with self.assertRaises(sqlite3.IntegrityError):
            self.f.f.one.execute("DELETE FROM rio_v62_ack")
        self.f.f.one.rollback()

    def test_finalization_requires_both_receipts(self):
        self.prep();self.deliver(errors=(self.f.ids[1],))
        self.assertEqual(self.finalize().state,HandoffState.AWAITING_RECEIPTS)

    def test_finalization_uses_v61_signed_receipt_cas(self):
        self.prep();self.deliver()
        r=self.finalize()
        self.assertEqual(r.state,HandoffState.FINALIZED_QUARANTINED)
        self.assertEqual(len(r.receipt_head_sha256),64)
        self.assertFalse(r.release_permitted)

    def test_duplicate_finalization_cannot_insert_second_v61_record(self):
        self.prep();self.deliver()
        self.assertEqual(self.finalize().state,HandoffState.FINALIZED_QUARANTINED)
        self.assertEqual(self.finalize().state,HandoffState.BLOCKED)

    def test_wrong_v61_pin_denied(self):
        self.prep();self.deliver()
        self.assertEqual(self.finalize(head="f"*64).state,HandoffState.BLOCKED)

    def test_stored_signature_tampering_blocks_finalize(self):
        self.prep();self.deliver()
        self.f.f.one.execute("DROP TRIGGER rio_v62_ack_no_update")
        self.f.f.one.execute("UPDATE rio_v62_ack SET receipt_json='{}'")
        self.f.f.one.commit()
        self.assertEqual(self.finalize().state,HandoffState.BLOCKED)

    def test_outbox_tampering_detected(self):
        self.prep()
        self.f.f.one.execute("DROP TRIGGER rio_v62_outbox_no_update")
        self.f.f.one.execute("UPDATE rio_v62_outbox SET request_json='{}'")
        self.f.f.one.commit()
        self.assertEqual(self.deliver().state,HandoffState.BLOCKED)

    def test_no_prepared_requests_fails_closed(self):
        self.assertEqual(self.deliver().state,HandoffState.BLOCKED)

    def test_unverified_incident_keys_fail_closed(self):
        self.assertEqual(self.prep(custodians={}).state,HandoffState.BLOCKED)

    def test_no_permission_for_any_state(self):
        from visitcard_v62_handoff import HandoffResult
        for state in HandoffState:
            r=HandoffResult(state,())
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
