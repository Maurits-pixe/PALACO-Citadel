"""RIO v5.9 dual-custodian checkpoint split-view and rollback tests."""
import base64
import copy
from datetime import timedelta
import hashlib
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from test_visitcard_v58_api_succession import ApiSuccessionTests,NOW,REPO,GENESIS
from visitcard_v59_dual_custody import (
    DOMAIN,SCOPE,CustodyState,compare_custodian_checkpoints,execution_permitted
)


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


class DualCustodyTests(unittest.TestCase):
    def setUp(self):
        self.fixture=ApiSuccessionTests(
            "test_signed_independently_pinned_synthetic_record_is_informational"
        )
        self.fixture.setUp()
        self.upstream=self.fixture.verify()
        self.a=Ed25519PrivateKey.generate()
        self.b=Ed25519PrivateKey.generate()
        self.ids=("archive-west","archive-east")
        self.keys={
            self.ids[0]:self.a.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw),
            self.ids[1]:self.b.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw),
        }
        self.notes=[self.sign(self.a,self.ids[0]),self.sign(self.b,self.ids[1])]
        self.pins={x["custodian_id"]:hashlib.sha256(_canonical(x)).hexdigest()
                   for x in self.notes}

    def sign(self,key,ident,*,seq=1,head=None,previous=GENESIS,
             repo=REPO,issued=NOW,expires=NOW+timedelta(minutes=10),
             hold="HOLD"):
        p={
            "version":1,"scope":SCOPE,"repository":repo,
            "sequence":seq,
            "record_sha256":self.fixture.pin if head is None else head,
            "previous_sha256":previous,
            "observed_at":issued.isoformat(),
            "expires_at":expires.isoformat(),"go13":hold,
        }
        signature=key.sign(DOMAIN+ident.encode()+b"\x00"+_canonical(p))
        return {"payload":p,"custodian_id":ident,"signature":b64(signature)}

    def review(self,**kw):
        return compare_custodian_checkpoints(
            kw.get("upstream",self.upstream),
            observations=kw.get("notes",self.notes),
            pinned_custodian_keys=kw.get("keys",self.keys),
            independently_pinned_observation_sha256=kw.get("pins",self.pins),
            expected_custodian_ids=kw.get("ids",self.ids),
            expected_repository=kw.get("repo",REPO),
            expected_previous_sha256=kw.get("previous",GENESIS),
            expected_min_sequence=kw.get("min_seq",1),
            now=kw.get("now",NOW),
        )

    def substitute_second(self,**kw):
        other=self.sign(self.b,self.ids[1],**kw)
        return {"notes":[self.notes[0],other],
                "pins":{**self.pins,self.ids[1]:hashlib.sha256(_canonical(other)).hexdigest()}}

    def test_two_pinned_custodians_match_without_authority(self):
        r=self.review()
        self.assertEqual(r.state,CustodyState.MATCHED_INFORMATIONAL)
        self.assertEqual(r.sequence,1)
        self.assertIsNone(r.conflict_sha256)
        self.assertFalse(r.activation_permitted)

    def test_comparison_digest_is_deterministic(self):
        self.assertEqual(self.review().comparison_sha256,self.review().comparison_sha256)

    def test_conflicting_signed_heads_create_quarantine_evidence(self):
        r=self.review(**self.substitute_second(head="f"*64))
        self.assertEqual(r.state,CustodyState.SPLIT_VIEW_QUARANTINED)
        self.assertEqual(len(r.conflict_sha256),64)
        self.assertFalse(r.release_permitted)

    def test_conflicting_sequence_quarantined(self):
        self.assertEqual(self.review(**self.substitute_second(seq=2)).state,
                         CustodyState.SPLIT_VIEW_QUARANTINED)

    def test_conflicting_previous_head_quarantined(self):
        self.assertEqual(self.review(**self.substitute_second(previous="f"*64)).state,
                         CustodyState.SPLIT_VIEW_QUARANTINED)

    def test_split_view_digest_deterministic(self):
        case=self.substitute_second(head="f"*64)
        self.assertEqual(self.review(**case).conflict_sha256,
                         self.review(**case).conflict_sha256)

    def test_replacement_with_old_pin_blocks(self):
        altered=self.sign(self.b,self.ids[1],head="f"*64)
        self.assertEqual(self.review(notes=[self.notes[0],altered]).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_missing_external_pin_blocks(self):
        self.assertEqual(self.review(pins={}).state,CustodyState.CUSTODY_BLOCKED)

    def test_forged_signature_with_new_matching_pin_blocks(self):
        notes=copy.deepcopy(self.notes)
        notes[1]["signature"]="A"*86
        pins={**self.pins,self.ids[1]:hashlib.sha256(_canonical(notes[1])).hexdigest()}
        self.assertEqual(self.review(notes=notes,pins=pins).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_unknown_public_key_blocks(self):
        self.assertEqual(self.review(keys={}).state,CustodyState.CUSTODY_BLOCKED)

    def test_reused_public_key_blocks_even_different_labels(self):
        note=self.sign(self.a,self.ids[1])
        keys={**self.keys,self.ids[1]:self.keys[self.ids[0]]}
        pins={**self.pins,self.ids[1]:hashlib.sha256(_canonical(note)).hexdigest()}
        self.assertEqual(self.review(notes=[self.notes[0],note],keys=keys,pins=pins).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_reversed_custodian_order_without_matching_expected_ids_blocks(self):
        self.assertEqual(self.review(notes=list(reversed(self.notes))).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_single_observation_blocks(self):
        self.assertEqual(self.review(notes=self.notes[:1]).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_repeated_custodian_identity_blocks(self):
        self.assertEqual(self.review(ids=(self.ids[0],self.ids[0])).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_local_rollback_below_independent_min_sequence_blocks(self):
        self.assertEqual(self.review(min_seq=2).state,CustodyState.CUSTODY_BLOCKED)

    def test_wrong_independent_predecessor_blocks(self):
        self.assertEqual(self.review(previous="f"*64).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_agreed_signed_stale_head_blocks_against_upstream(self):
        head="f"*64
        notes=[self.sign(self.a,self.ids[0],head=head),
               self.sign(self.b,self.ids[1],head=head)]
        pins={n["custodian_id"]:hashlib.sha256(_canonical(n)).hexdigest() for n in notes}
        self.assertEqual(self.review(notes=notes,pins=pins).state,CustodyState.CUSTODY_BLOCKED)

    def test_expired_observation_blocks(self):
        self.assertEqual(self.review(now=NOW+timedelta(minutes=20)).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_future_signed_observation_blocks(self):
        case=self.substitute_second(issued=NOW+timedelta(minutes=1))
        self.assertEqual(self.review(**case).state,CustodyState.CUSTODY_BLOCKED)

    def test_changed_go13_signed_observation_blocks(self):
        self.assertEqual(self.review(**self.substitute_second(hold="GO")).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_upstream_missing_blocks_first(self):
        self.assertEqual(self.review(upstream=None).state,CustodyState.UPSTREAM_BLOCKED)

    def test_wrong_repository_blocks(self):
        self.assertEqual(self.review(repo="other/repo").state,CustodyState.CUSTODY_BLOCKED)

    def test_boolean_sequence_blocks(self):
        self.assertEqual(self.review(**self.substitute_second(seq=True)).state,
                         CustodyState.CUSTODY_BLOCKED)

    def test_no_quarantine_result_grants_authority(self):
        from visitcard_v59_dual_custody import CustodyReview
        for state in CustodyState:
            r=CustodyReview(state,())
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
