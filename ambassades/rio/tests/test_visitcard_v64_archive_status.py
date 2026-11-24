"""RIO v6.4 dual signed storage-status checks on a finalized local handoff."""
import base64
from datetime import timedelta
import hashlib
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_visitcard_v62_handoff import V62HandoffTests,NOW
from visitcard_witness_enrollment import _canonical
from visitcard_v64_archive_status import (
    DOMAIN,SCOPE,StorageState,verify_storage_status,
    inspect_archive_storage,execution_permitted,
)

CHALLENGE=base64.urlsafe_b64encode(b"PALACO-v64-challenge-for-testing!").rstrip(b"=").decode()


class V64StorageStatusTests(unittest.TestCase):
    def setUp(self):
        self.f=V62HandoffTests("test_finalization_uses_v61_signed_receipt_cas")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.assertEqual(self.f.prep().state.value,"PREPARED_QUARANTINED")
        self.assertEqual(self.f.deliver().acknowledged,2)
        self.final=self.f.finalize()
        self.assertEqual(self.final.state.value,"FINALIZED_QUARANTINED")
        self.db=self.f.f.f.one
        self.incident=self.f.incident
        self.ids=self.f.f.ids
        self.keys=self.f.f.keys
        self.secret=self.f.f.private
        evidence=self.db.execute(
            "SELECT evidence_json FROM rio_v60_incident_events WHERE sequence=1"
        ).fetchone()[0].encode()
        self.digest=hashlib.sha256(evidence).hexdigest()
        self.chal=CHALLENGE
        self.replies={name:self.sign(i) for i,name in enumerate(self.ids)}
        self.requests=[]

    def make_request(self,i):
        from visitcard_v62_handoff import _request,_id
        name=self.ids[i]
        req=_request(1,self.incident.head_sha256,self.incident.conflict_sha256,name)
        return _id(req)

    def sign(self,i,*,key=None,challenge=None,handoff=None,evidence=None,
             incident=None,head=None,conflict=None,state="STORAGE_VERIFIED",
             issued=NOW,expires=NOW+timedelta(minutes=4),hold="HOLD"):
        name=self.ids[i]
        p={
            "version":1,"scope":SCOPE,"archive_id":name,
            "challenge":self.chal if challenge is None else challenge,
            "handoff_id":self.make_request(i) if handoff is None else handoff,
            "incident_sequence":1 if incident is None else incident,
            "incident_head_sha256":self.incident.head_sha256 if head is None else head,
            "conflict_sha256":self.incident.conflict_sha256 if conflict is None else conflict,
            "evidence_sha256":self.digest if evidence is None else evidence,
            "storage_state":state,"verified_at":issued.isoformat(),
            "expires_at":expires.isoformat(),"go13":hold,
        }
        private=self.secret[i] if key is None else key
        signed=private.sign(DOMAIN+name.encode()+b"\x00"+_canonical(p))
        return {
            "payload":p,"signer_id":name,
            "signature":base64.urlsafe_b64encode(signed).rstrip(b"=").decode(),
        }

    def inspect(self,**kw):
        def fetch(req):
            self.requests.append(req)
            if req["archive_id"] in kw.get("offline",()):
                raise ConnectionError("unreachable")
            return kw.get("replies",self.replies)[req["archive_id"]]
        return inspect_archive_storage(
            kw.get("db",self.db),
            pinned_custodian_keys=kw.get("custodians",self.f.f.f.f.keys),
            pinned_archive_keys=kw.get("keys",self.keys),
            archive_ids=kw.get("ids",self.ids),
            incident_sequence=1,
            independently_pinned_incident_head_sha256=kw.get(
                "incident_head",self.incident.head_sha256),
            expected_receipt_sequence=kw.get("receipt_seq",1),
            independently_pinned_receipt_head_sha256=kw.get(
                "receipt_head",self.final.receipt_head_sha256),
            challenge=kw.get("challenge",self.chal),fetch_status=fetch,
            now=kw.get("now",NOW),
        )

    def test_two_fresh_signed_statuses_are_informational(self):
        r=self.inspect()
        self.assertEqual(r.state,StorageState.VERIFIED_INFORMATIONAL)
        self.assertEqual(r.verified_archives,2)
        self.assertFalse(r.release_permitted)

    def test_deterministic_verification_digest(self):
        self.assertEqual(self.inspect().verification_sha256,
                         self.inspect().verification_sha256)

    def test_queries_two_independent_archives(self):
        self.inspect()
        self.assertEqual({x["archive_id"] for x in self.requests},set(self.ids))

    def test_challenge_altered_blocks(self):
        self.assertEqual(self.inspect(challenge="A"*43).state,
                         StorageState.PARTIAL_QUARANTINED)

    def test_wrong_archive_identity_blocks(self):
        self.assertEqual(self.inspect(replies={
            self.ids[0]:self.replies[self.ids[1]],
            self.ids[1]:self.replies[self.ids[1]]
        }).verified_archives,1)

    def test_status_absent_on_second_archive_remains_partial(self):
        self.assertEqual(self.inspect(offline=(self.ids[1],)).state,
                         StorageState.PARTIAL_QUARANTINED)

    def test_both_unreachable_remain_partial(self):
        self.assertEqual(self.inspect(offline=self.ids).verified_archives,0)

    def test_wrong_storage_evidence_digest_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=self.sign(1,evidence="f"*64)
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_wrong_original_incident_head_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=self.sign(1,head="f"*64)
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_wrong_conflict_digest_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=self.sign(1,conflict="f"*64)
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_wrong_handoff_id_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=self.sign(1,handoff="f"*64)
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_wrong_sequence_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=self.sign(1,incident=2)
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_status_missing_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=None
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_status_not_verified_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=self.sign(1,state="STORAGE_MISSING")
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_expired_status_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=self.sign(1,expires=NOW+timedelta(seconds=1))
        self.assertEqual(self.inspect(replies=notes,now=NOW+timedelta(seconds=2)).verified_archives,1)

    def test_future_status_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=self.sign(1,issued=NOW+timedelta(minutes=1))
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_go13_changed_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]=self.sign(1,hold="ALLOW")
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_malformed_signature_blocks(self):
        notes=dict(self.replies)
        notes[self.ids[1]]={**self.replies[self.ids[1]],"signature":"A"*86}
        self.assertEqual(self.inspect(replies=notes).verified_archives,1)

    def test_unknown_root_blocks_before_fetch(self):
        self.assertEqual(self.inspect(keys={}).state,StorageState.BLOCKED)

    def test_same_public_key_disallowed(self):
        roots={name:self.keys[self.ids[0]] for name in self.ids}
        self.assertEqual(self.inspect(keys=roots).state,StorageState.BLOCKED)

    def test_wrong_incident_pin_blocks(self):
        self.assertEqual(self.inspect(incident_head="f"*64).state,StorageState.BLOCKED)

    def test_wrong_receipt_pin_blocks(self):
        self.assertEqual(self.inspect(receipt_head="f"*64).state,StorageState.BLOCKED)

    def test_wrong_receipt_sequence_blocks(self):
        self.assertEqual(self.inspect(receipt_seq=2).state,StorageState.BLOCKED)

    def test_no_archive_outbox_blocks(self):
        self.db.execute("DROP TRIGGER rio_v62_outbox_no_delete")
        self.db.execute("DELETE FROM rio_v62_outbox")
        self.db.commit()
        self.assertEqual(self.inspect().state,StorageState.BLOCKED)

    def test_tampered_evidence_blocks(self):
        self.db.execute("DROP TRIGGER rio_v60_immutable_update")
        self.db.execute("UPDATE rio_v60_incident_events SET evidence_json='{}'")
        self.db.commit()
        self.assertEqual(self.inspect().state,StorageState.BLOCKED)

    def test_archive_ledger_rollback_blocks(self):
        self.db.execute("DROP TRIGGER rio_v61_archive_no_delete")
        self.db.execute("DELETE FROM rio_v61_archive_receipts")
        self.db.commit()
        self.assertEqual(self.inspect().state,StorageState.BLOCKED)

    def test_restart_reverifies_saved_evidence_and_archive_receipts(self):
        db=sqlite3.connect(self.f.f.f.path)
        try:
            self.assertEqual(self.inspect(db=db).state,
                             StorageState.VERIFIED_INFORMATIONAL)
        finally:
            db.close()

    def test_boolean_sequence_does_not_pass_direct_verifier(self):
        note=self.sign(0,incident=True)
        self.assertFalse(verify_storage_status(
            note,self.keys,expected_archive_id=self.ids[0],
            expected_challenge=self.chal,expected_handoff_id=self.make_request(0),
            expected_incident_sequence=1,
            expected_incident_head_sha256=self.incident.head_sha256,
            expected_conflict_sha256=self.incident.conflict_sha256,
            expected_evidence_sha256=self.digest,now=NOW
        ))

    def test_no_storage_result_can_grant_authority(self):
        from visitcard_v64_archive_status import StorageReview
        for state in StorageState:
            r=StorageReview(state,())
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
