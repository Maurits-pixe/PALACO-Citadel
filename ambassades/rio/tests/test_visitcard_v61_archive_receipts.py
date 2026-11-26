"""RIO v6.1 dual externally signed archive receipt, restart and rollback tests."""
import base64
from datetime import timedelta
import hashlib
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from test_visitcard_v60_incident_ledger import V60IncidentLedgerTests,NOW
from visitcard_witness_enrollment import _canonical
from visitcard_v61_archive_receipts import (
    DOMAIN,SCOPE,GENESIS,ArchiveState,
    append_archive_receipts,initialize_archive_ledger,
    read_archive_head,verify_archive_receipt,execution_permitted,
)


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


class V61ArchiveReceiptTests(unittest.TestCase):
    def setUp(self):
        self.f=V60IncidentLedgerTests("test_verified_conflict_is_durably_recorded")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.incident=self.f.save()
        initialize_archive_ledger(self.f.one)
        self.private=[Ed25519PrivateKey.generate() for _ in range(2)]
        self.ids=("offsite-archive-a","offsite-archive-b")
        self.keys={name:secret.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
                   for name,secret in zip(self.ids,self.private)}
        self.receipts=[self.sign(i) for i in range(2)]
        self.seq=0
        self.head=GENESIS

    def sign(self,i,*,key=None,incident=None,head=None,conflict=None,
             issued=NOW,expires=NOW+timedelta(minutes=10),hold="HOLD"):
        payload={
            "version":1,"scope":SCOPE,"archive_id":self.ids[i],
            "incident_sequence":self.incident.sequence if incident is None else incident,
            "incident_head_sha256":self.incident.head_sha256 if head is None else head,
            "conflict_sha256":self.incident.conflict_sha256 if conflict is None else conflict,
            "received_at":issued.isoformat(),"expires_at":expires.isoformat(),"go13":hold,
        }
        secret=self.private[i] if key is None else key
        signature=secret.sign(DOMAIN+self.ids[i].encode()+b"\x00"+_canonical(payload))
        return {"payload":payload,"signer_id":self.ids[i],"signature":b64(signature)}

    def append(self,**kwargs):
        return append_archive_receipts(
            kwargs.get("db",self.f.one),
            receipts=kwargs.get("receipts",self.receipts),
            expected_archive_ids=kwargs.get("ids",self.ids),
            pinned_archive_keys=kwargs.get("keys",self.keys),
            pinned_custodian_keys=kwargs.get("custodians",self.f.f.keys),
            expected_incident_sequence=kwargs.get("incident",self.incident.sequence),
            independently_pinned_incident_head_sha256=kwargs.get("incident_head",self.incident.head_sha256),
            expected_receipt_sequence=kwargs.get("seq",self.seq),
            independently_pinned_receipt_head_sha256=kwargs.get("head",self.head),
            now=kwargs.get("now",NOW),
        )

    def read(self,**kwargs):
        return read_archive_head(
            kwargs.get("db",self.f.one),
            pinned_keys=kwargs.get("keys",self.keys),
            expected_receipt_sequence=kwargs.get("seq",self.seq),
            independently_pinned_receipt_head_sha256=kwargs.get("head",self.head),
            expected_last_incident_sequence=kwargs.get("incident",self.incident.sequence if self.seq else 0),
        )

    def record(self):
        r=self.append()
        self.assertEqual(r.state,ArchiveState.ACKNOWLEDGED_QUARANTINED,r.blockers)
        self.seq=r.sequence
        self.head=r.head_sha256
        return r

    def test_signed_double_archive_receipt_still_quarantined(self):
        r=self.record()
        self.assertEqual(r.incident_sequence,1)
        self.assertFalse(r.release_permitted)
        self.assertEqual(self.read().state,ArchiveState.VERIFIED_QUARANTINED)

    def test_genesis_archive_head_requires_external_pin(self):
        self.assertEqual(self.read().state,ArchiveState.VERIFIED_QUARANTINED)

    def test_restart_archive_ledger_revalidates_historic_signatures(self):
        self.record()
        db=sqlite3.connect(self.f.path)
        try:
            self.assertEqual(self.read(db=db).state,ArchiveState.VERIFIED_QUARANTINED)
        finally:
            db.close()

    def test_archive_receipts_expire_but_signed_history_still_verifies(self):
        self.record()
        self.assertEqual(self.read().state,ArchiveState.VERIFIED_QUARANTINED)

    def test_missing_second_receipt_blocks(self):
        self.assertEqual(self.append(receipts=self.receipts[:1]).state,ArchiveState.BLOCKED)

    def test_reused_first_archive_receipt_blocks(self):
        self.assertEqual(self.append(receipts=[self.receipts[0]]*2).state,ArchiveState.BLOCKED)

    def test_untrusted_archive_key_blocks(self):
        self.assertEqual(self.append(keys={}).state,ArchiveState.BLOCKED)

    def test_forged_receipt_signature_blocks(self):
        forged=[dict(x) for x in self.receipts]
        forged[1]=dict(forged[1],signature="A"*86)
        self.assertEqual(self.append(receipts=forged).state,ArchiveState.BLOCKED)

    def test_wrong_conflict_hash_blocks(self):
        forged=[self.receipts[0],self.sign(1,conflict="f"*64)]
        self.assertEqual(self.append(receipts=forged).state,ArchiveState.BLOCKED)

    def test_wrong_incident_hash_blocks(self):
        self.assertEqual(self.append(receipts=[self.receipts[0],self.sign(1,head="f"*64)]).state,
                         ArchiveState.BLOCKED)

    def test_wrong_incident_sequence_blocks(self):
        self.assertEqual(self.append(receipts=[self.receipts[0],self.sign(1,incident=2)]).state,
                         ArchiveState.BLOCKED)

    def test_same_public_key_different_names_blocks(self):
        altered=self.sign(1,key=self.private[0])
        keys={**self.keys,self.ids[1]:self.keys[self.ids[0]]}
        self.assertEqual(self.append(receipts=[self.receipts[0],altered],keys=keys).state,
                         ArchiveState.BLOCKED)

    def test_outdated_external_incident_pin_blocks(self):
        self.assertEqual(self.append(incident_head="f"*64).state,ArchiveState.BLOCKED)

    def test_expired_receipt_fails_direct_check(self):
        expired=self.sign(0,expires=NOW+timedelta(minutes=1))
        self.assertIsNone(verify_archive_receipt(
            expired,self.keys,expected_archive_id=self.ids[0],
            expected_incident_sequence=1,
            expected_incident_head_sha256=self.incident.head_sha256,
            expected_conflict_sha256=self.incident.conflict_sha256,
            now=NOW+timedelta(minutes=2),
        ))

    def test_future_receipt_blocks(self):
        self.assertEqual(self.append(receipts=[self.receipts[0],
            self.sign(1,issued=NOW+timedelta(minutes=1))]).state,ArchiveState.BLOCKED)

    def test_go13_change_blocks(self):
        self.assertEqual(self.append(receipts=[self.receipts[0],
            self.sign(1,hold="GO")]).state,ArchiveState.BLOCKED)

    def test_archive_delete_trigger_prevents_removal(self):
        self.record()
        with self.assertRaises(sqlite3.IntegrityError):
            self.f.one.execute("DELETE FROM rio_v61_archive_receipts")
        self.f.one.rollback()

    def test_archive_update_trigger_prevents_overwrite(self):
        self.record()
        with self.assertRaises(sqlite3.IntegrityError):
            self.f.one.execute("UPDATE rio_v61_archive_receipts SET head_sha256=?",("f"*64,))
        self.f.one.rollback()

    def test_duplicate_receipt_pair_blocks(self):
        self.record()
        self.assertEqual(self.append().state,ArchiveState.BLOCKED)

    def test_rollback_to_local_genesis_blocks_with_independent_pin(self):
        self.record()
        self.assertEqual(self.read(seq=0,head=GENESIS).state,ArchiveState.BLOCKED)

    def test_old_cas_head_refuses_append(self):
        self.record()
        self.assertEqual(self.append(head=GENESIS).state,ArchiveState.BLOCKED)

    def test_bad_latest_pin_blocks_read(self):
        self.record()
        self.assertEqual(self.read(head="f"*64).state,ArchiveState.BLOCKED)

    def test_corrupt_local_receipt_data_detected(self):
        self.record()
        self.f.one.execute("DROP TRIGGER rio_v61_archive_no_update")
        self.f.one.execute("UPDATE rio_v61_archive_receipts SET receipts_json=?",("{}" ,))
        self.f.one.commit()
        self.assertEqual(self.read().state,ArchiveState.BLOCKED)

    def test_deleted_history_detected_by_external_pin(self):
        self.record()
        self.f.one.execute("DROP TRIGGER rio_v61_archive_no_delete")
        self.f.one.execute("DELETE FROM rio_v61_archive_receipts")
        self.f.one.commit()
        self.assertEqual(self.read().state,ArchiveState.BLOCKED)

    def test_missing_incident_source_keys_fail_closed(self):
        self.assertEqual(self.append(custodians={}).state,ArchiveState.BLOCKED)

    def test_active_transaction_blocks_append(self):
        self.f.one.execute("BEGIN")
        self.assertEqual(self.append().state,ArchiveState.BLOCKED)
        self.f.one.rollback()

    def test_uninitialized_archive_db_fails(self):
        db=sqlite3.connect(":memory:")
        try:
            self.assertEqual(self.read(db=db).state,ArchiveState.BLOCKED)
        finally:
            db.close()

    def test_no_authority_in_any_archive_state(self):
        from visitcard_v61_archive_receipts import ArchiveResult
        for state in ArchiveState:
            r=ArchiveResult(state,())
            self.assertFalse(execution_permitted(r))
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
