"""RIO v6.5 exact archive byte readback and source-chain regressions."""
import sqlite3
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_visitcard_v64_archive_status import V64StorageStatusTests,NOW
from visitcard_v65_exact_readback import (
    MAX_READBACK,ReadbackState,inspect_exact_archive_readback,execution_permitted
)


class V65ExactReadbackTests(unittest.TestCase):
    def setUp(self):
        self.f=V64StorageStatusTests("test_two_fresh_signed_statuses_are_informational")
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.original=self.f.db.execute(
            "SELECT evidence_json FROM rio_v60_incident_events WHERE sequence=1"
        ).fetchone()[0].encode()
        self.read_requests=[]
        self.status_requests=[]

    def check(self,**kw):
        def fetch_status(request):
            self.status_requests.append(request)
            if request["archive_id"] in kw.get("status_offline",()):
                raise ConnectionError("status offline")
            return kw.get("statuses",self.f.replies)[request["archive_id"]]
        def fetch_evidence(request):
            self.read_requests.append(request)
            if request["archive_id"] in kw.get("readback_offline",()):
                raise ConnectionError("readback offline")
            return kw.get("evidence",{
                name:self.original for name in self.f.ids
            })[request["archive_id"]]
        return inspect_exact_archive_readback(
            kw.get("db",self.f.db),
            pinned_custodian_keys=kw.get("custodians",self.f.f.f.f.f.keys),
            pinned_archive_keys=kw.get("keys",self.f.keys),
            archive_ids=kw.get("ids",self.f.ids),
            incident_sequence=kw.get("incident",1),
            independently_pinned_incident_head_sha256=kw.get(
                "incident_head",self.f.incident.head_sha256),
            expected_receipt_sequence=kw.get("receipt_seq",1),
            independently_pinned_receipt_head_sha256=kw.get(
                "receipt_head",self.f.final.receipt_head_sha256),
            challenge=kw.get("challenge",self.f.chal),
            fetch_status=fetch_status,fetch_evidence=fetch_evidence,
            now=kw.get("now",NOW),
        )

    def test_exact_two_archive_bytes_are_information_only(self):
        r=self.check()
        self.assertEqual(r.state,ReadbackState.VERIFIED_INFORMATIONAL)
        self.assertEqual(r.archive_count,2)
        self.assertEqual(r.evidence_sha256,self.f.digest)
        self.assertFalse(r.activation_permitted)

    def test_comparison_digest_reproducible(self):
        self.assertEqual(self.check().verification_sha256,
                         self.check().verification_sha256)

    def test_two_archive_callbacks_after_two_signed_statuses(self):
        self.check()
        self.assertEqual({x["archive_id"] for x in self.read_requests},
                         set(self.f.ids))
        self.assertEqual(len(self.status_requests),2)

    def test_missing_one_archive_bytes_blocks(self):
        data={name:self.original for name in self.f.ids}
        data[self.f.ids[1]]=None
        r=self.check(evidence=data)
        self.assertEqual(r.state,ReadbackState.READBACK_INCOMPLETE)
        self.assertEqual(r.archive_count,1)

    def test_empty_bytes_blocks(self):
        data={name:self.original for name in self.f.ids}
        data[self.f.ids[1]]=b""
        self.assertEqual(self.check(evidence=data).state,
                         ReadbackState.READBACK_INCOMPLETE)

    def test_modified_byte_is_quarantined(self):
        data={name:self.original for name in self.f.ids}
        data[self.f.ids[1]]=self.original[:-1]+b"X"
        self.assertEqual(self.check(evidence=data).state,
                         ReadbackState.READBACK_CONFLICT_QUARANTINED)

    def test_truncated_archive_bytes_quarantined(self):
        data={name:self.original for name in self.f.ids}
        data[self.f.ids[1]]=self.original[:-1]
        self.assertEqual(self.check(evidence=data).state,
                         ReadbackState.READBACK_CONFLICT_QUARANTINED)

    def test_appended_bytes_quarantined(self):
        data={name:self.original for name in self.f.ids}
        data[self.f.ids[1]]=self.original+b"extra"
        self.assertEqual(self.check(evidence=data).state,
                         ReadbackState.READBACK_CONFLICT_QUARANTINED)

    def test_too_large_response_is_rejected(self):
        data={name:self.original for name in self.f.ids}
        data[self.f.ids[1]]=b"x"*(MAX_READBACK+1)
        self.assertEqual(self.check(evidence=data).state,
                         ReadbackState.READBACK_INCOMPLETE)

    def test_string_is_not_raw_bytes(self):
        data={name:self.original for name in self.f.ids}
        data[self.f.ids[1]]=self.original.decode()
        self.assertEqual(self.check(evidence=data).state,
                         ReadbackState.READBACK_INCOMPLETE)

    def test_archive_unreachable_is_pending(self):
        self.assertEqual(self.check(readback_offline=(self.f.ids[1],)).state,
                         ReadbackState.READBACK_INCOMPLETE)

    def test_no_readback_if_one_status_is_unverified(self):
        r=self.check(status_offline=(self.f.ids[1],))
        self.assertEqual(r.state,ReadbackState.UPSTREAM_BLOCKED)
        self.assertEqual(self.read_requests,[])

    def test_changed_incident_pin_blocks_before_readback(self):
        self.assertEqual(self.check(incident_head="f"*64).state,
                         ReadbackState.UPSTREAM_BLOCKED)
        self.assertEqual(self.read_requests,[])

    def test_changed_receipt_pin_blocks_before_readback(self):
        self.assertEqual(self.check(receipt_head="f"*64).state,
                         ReadbackState.UPSTREAM_BLOCKED)

    def test_two_retrieved_copies_differing_between_them_conflict(self):
        data={self.f.ids[0]:self.original+b"corrupt",self.f.ids[1]:self.original}
        self.assertEqual(self.check(evidence=data).state,
                         ReadbackState.READBACK_CONFLICT_QUARANTINED)

    def test_archive_reply_swapped_to_unrelated_json_detected(self):
        data={name:b'{"irrelevant":true}' for name in self.f.ids}
        self.assertEqual(self.check(evidence=data).state,
                         ReadbackState.READBACK_CONFLICT_QUARANTINED)

    def test_reopened_database_still_verifies_full_source_chain(self):
        db=sqlite3.connect(self.f.f.f.f.path)
        try:
            self.assertEqual(self.check(db=db).state,
                             ReadbackState.VERIFIED_INFORMATIONAL)
        finally:
            db.close()

    def test_invalid_challenge_fails_without_readback(self):
        self.assertEqual(self.check(challenge="invalid").state,
                         ReadbackState.UPSTREAM_BLOCKED)
        self.assertEqual(self.read_requests,[])

    def test_bad_archive_keys_block_before_readback(self):
        self.assertEqual(self.check(keys={}).state,ReadbackState.UPSTREAM_BLOCKED)
        self.assertEqual(self.read_requests,[])

    def test_modified_incident_evidence_blocks(self):
        self.f.db.execute("DROP TRIGGER rio_v60_immutable_update")
        self.f.db.execute(
            "UPDATE rio_v60_incident_events SET evidence_json='{}'"
        )
        self.f.db.commit()
        self.assertEqual(self.check().state,ReadbackState.UPSTREAM_BLOCKED)

    def test_no_permission_for_any_readback_state(self):
        from visitcard_v65_exact_readback import ReadbackReview
        for state in ReadbackState:
            r=ReadbackReview(state,())
            self.assertFalse(execution_permitted(r))
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
