"""RIO v4.3 signed offline release dossier handoff regression tests."""
import base64
import copy
from datetime import datetime,timedelta,timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from visitcard_dossier_handoff import (
    DOMAIN,ZERO,MAX_CHAIN,transfer_receipt_digest,
    verify_dossier_handoff,verify_transfer_receipt,execution_permitted,
)

NOW=datetime(2026,11,23,8,tzinfo=timezone.utc)
COMMIT="a"*40
DOSSIER="b"*64


def public(key):
    return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class DossierHandoffTests(unittest.TestCase):
    def setUp(self):
        self.key_a=Ed25519PrivateKey.generate()
        self.key_b=Ed25519PrivateKey.generate()
        self.trust={"receiver-a":public(self.key_a),"receiver-b":public(self.key_b)}
        self.first=self.sign(1,ZERO,"receiver-a",self.key_a)
        self.second=self.sign(2,transfer_receipt_digest(self.first),"receiver-b",self.key_b)
        self.pin=transfer_receipt_digest(self.second)

    def sign(self,sequence,previous,cid,key,*,dossier=DOSSIER,commit=COMMIT,time=NOW,go13="HOLD"):
        payload={
            "version":1,"commit_sha":commit,"dossier_sha256":dossier,
            "sequence":sequence,"previous_receipt_sha256":previous,
            "received_at":time.isoformat(),"go13":go13
        }
        signed=key.sign(DOMAIN+cid.encode()+b"\x00"+_canonical(payload))
        return {"payload":payload,"custodian_id":cid,"signature":b64(signed)}

    def verify(self,receipts=None,roots=None,pin=None,commit=COMMIT,dossier=DOSSIER,now=NOW):
        return verify_dossier_handoff(
            [self.first,self.second] if receipts is None else receipts,
            self.trust if roots is None else roots,
            expected_dossier_sha256=dossier,expected_commit_sha=commit,
            independently_pinned_latest_receipt_sha256=self.pin if pin is None else pin,
            now=now,
        )

    def test_two_receipts_and_pinned_head_match_informational(self):
        result=self.verify()
        self.assertEqual(result.state,"CHAIN_MATCHED_INFORMATIONAL")
        self.assertEqual(result.last_receipt_sha256,self.pin)
        self.assertFalse(result.release_permitted)
        self.assertFalse(result.merge_permitted)
        self.assertFalse(result.activation_permitted)

    def test_no_state_authorizes_any_execution(self):
        self.assertFalse(execution_permitted(self.verify()))
        self.assertFalse(execution_permitted(self.verify(receipts=[])))

    def test_single_receipt_allowed_with_exact_external_pin(self):
        result=self.verify(receipts=[self.first],pin=transfer_receipt_digest(self.first))
        self.assertEqual(result.state,"CHAIN_MATCHED_INFORMATIONAL")

    def test_missing_latest_head_blocks(self):
        self.assertIn("LATEST_HEAD_NOT_INDEPENDENTLY_PINNED",self.verify(pin="").blockers)

    def test_earlier_signed_head_detected_as_rollback(self):
        result=self.verify(receipts=[self.first])
        self.assertIn("STALE_OR_SUBSTITUTED_LATEST_HEAD",result.blockers)

    def test_reversed_chain_fails(self):
        self.assertEqual(self.verify(receipts=[self.second,self.first]).state,"BLOCKED")

    def test_missing_intermediate_receipt_fails(self):
        self.assertEqual(self.verify(receipts=[self.second]).state,"BLOCKED")

    def test_different_dossier_fails(self):
        self.assertEqual(self.verify(dossier="c"*64).state,"BLOCKED")

    def test_different_commit_fails(self):
        self.assertEqual(self.verify(commit="c"*40).state,"BLOCKED")

    def test_untrusted_receiver_key_fails(self):
        self.assertEqual(self.verify(roots={}).state,"BLOCKED")

    def test_malformed_signature_fails_even_if_head_rehashed(self):
        receipts=copy.deepcopy([self.first,self.second])
        receipts[1]["signature"]="A"*86
        self.assertEqual(self.verify(receipts=receipts,pin=transfer_receipt_digest(receipts[1])).state,"BLOCKED")

    def test_receipt_payload_changed_fails_even_if_head_rehashed(self):
        receipts=copy.deepcopy([self.first,self.second])
        receipts[1]["payload"]["go13"]="GO"
        self.assertEqual(self.verify(receipts=receipts,pin=transfer_receipt_digest(receipts[1])).state,"BLOCKED")

    def test_reused_custodian_key_under_other_label_is_blocked(self):
        second=self.sign(2,transfer_receipt_digest(self.first),"receiver-b",self.key_a)
        self.assertEqual(self.verify(receipts=[self.first,second],
                         roots={"receiver-a":public(self.key_a),"receiver-b":public(self.key_a)},
                         pin=transfer_receipt_digest(second)).state,"BLOCKED")

    def test_reused_custodian_id_fails(self):
        second=self.sign(2,transfer_receipt_digest(self.first),"receiver-a",self.key_a)
        self.assertEqual(self.verify(receipts=[self.first,second],pin=transfer_receipt_digest(second)).state,"BLOCKED")

    def test_future_receipt_fails(self):
        first=self.sign(1,ZERO,"receiver-a",self.key_a,time=NOW+timedelta(hours=1))
        self.assertEqual(self.verify(receipts=[first],pin=transfer_receipt_digest(first)).state,"BLOCKED")

    def test_duplicate_receipt_fails(self):
        self.assertEqual(self.verify(receipts=[self.first,self.first]).state,"BLOCKED")

    def test_wrong_external_pin_fails(self):
        self.assertIn("STALE_OR_SUBSTITUTED_LATEST_HEAD",self.verify(pin="f"*64).blockers)

    def test_empty_chain_fails(self):
        self.assertEqual(self.verify(receipts=[]).state,"BLOCKED")

    def test_oversized_chain_fails(self):
        self.assertEqual(self.verify(receipts=[self.first]*(MAX_CHAIN+1)).state,"BLOCKED")

    def test_noncanonical_signature_fails(self):
        receipt=copy.deepcopy(self.first)
        receipt["signature"]+="="
        self.assertIsNone(verify_transfer_receipt(
            receipt,self.trust,expected_dossier_sha256=DOSSIER,
            expected_commit_sha=COMMIT,expected_sequence=1,
            expected_previous_sha256=ZERO,now=NOW
        ))
