"""RIO v4.1 signed release-review evidence tests — GO-13 HOLD."""
from datetime import datetime,timedelta,timezone
from pathlib import Path
import base64
import copy
import hashlib
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from visitcard_release_review import (
    DOMAIN,REQUIRED,ReviewState,assess_release_review,
    verify_review_attestation,release_permitted
)

NOW=datetime(2026,11,23,7,tzinfo=timezone.utc)
COMMIT="a"*40
SCOPE="RIO-VISITCARD-V4.1"


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def public(key):
    return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)


class ReleaseReviewTests(unittest.TestCase):
    def setUp(self):
        self.keys={}
        self.items=[]
        for i,category in enumerate(sorted(REQUIRED)):
            key=Ed25519PrivateKey.generate()
            aid=f"review-{i}"
            self.keys[aid]=public(key)
            self.items.append(self.sign(
                key,aid,category,hashlib.sha256(category.encode()).hexdigest()
            ))

    def sign(self,key,aid,category,digest,*,commit=COMMIT,scope=SCOPE,
             issued=NOW,expires=NOW+timedelta(hours=1),result="PASS"):
        p={
            "version":1,"scope":scope,"commit_sha":commit,
            "category":category,"evidence_sha256":digest,"result":result,
            "issued_at":issued.isoformat(),"expires_at":expires.isoformat()
        }
        sig=key.sign(DOMAIN+aid.encode()+b"\x00"+_canonical(p))
        return {"payload":p,"authority_id":aid,"signature":b64(sig)}

    def review(self,items=None,keys=None,now=NOW):
        return assess_release_review(
            self.items if items is None else items,
            self.keys if keys is None else keys,
            expected_commit=COMMIT,expected_scope=SCOPE,now=now
        )

    def test_complete_independently_signed_pack_is_reviewable_not_releasable(self):
        result=self.review()
        self.assertEqual(result.state,ReviewState.READY_FOR_HUMAN_REVIEW)
        self.assertEqual(result.missing,())
        self.assertFalse(result.release_permitted)
        self.assertFalse(result.merge_permitted)
        self.assertFalse(result.activation_permitted)
        self.assertFalse(release_permitted(result))

    def test_missing_review_evidence_blocks(self):
        self.assertEqual(self.review(self.items[:-1]).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_empty_evidence_blocks(self):
        self.assertEqual(self.review([]).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_untrusted_authority_blocks(self):
        self.assertEqual(self.review(keys={}).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_reused_authority_identity_blocks(self):
        duplicated=copy.deepcopy(self.items)
        duplicated[1]["authority_id"]=duplicated[0]["authority_id"]
        self.assertEqual(self.review(duplicated).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_same_review_key_under_different_labels_blocks(self):
        duplicate=copy.deepcopy(self.items)
        key=Ed25519PrivateKey.generate()
        aid=duplicate[1]["authority_id"]
        duplicate[1]=self.sign(key,aid,duplicate[1]["payload"]["category"],
                               duplicate[1]["payload"]["evidence_sha256"])
        replaced=dict(self.keys)
        replaced[aid]=self.keys[duplicate[0]["authority_id"]]
        self.assertEqual(self.review(duplicate,replaced).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_same_evidence_hash_reuse_blocks(self):
        duplicate=copy.deepcopy(self.items)
        p=duplicate[1]["payload"]
        other=Ed25519PrivateKey.generate()
        aid=p["category"]
        newaid="unique-extra"
        duplicate[1]=self.sign(other,newaid,p["category"],duplicate[0]["payload"]["evidence_sha256"])
        roots=dict(self.keys)
        roots[newaid]=public(other)
        self.assertEqual(self.review(duplicate,roots).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_commit_mismatch_blocks(self):
        self.assertIsNone(verify_review_attestation(
            self.items[0],self.keys,expected_commit="b"*40,expected_scope=SCOPE,now=NOW
        ))

    def test_wrong_scope_blocks(self):
        self.assertEqual(assess_release_review(
            self.items,self.keys,expected_commit=COMMIT,expected_scope="OTHER",now=NOW
        ).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_forged_signature_blocks(self):
        fake=copy.deepcopy(self.items)
        fake[0]["signature"]="A"*86
        self.assertEqual(self.review(fake).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_unrecognized_review_domain_blocks(self):
        fake=copy.deepcopy(self.items)
        fake[0]["payload"]["category"]="UNKNOWN"
        self.assertEqual(self.review(fake).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_duplicate_review_domain_blocks(self):
        fake=list(self.items)
        fake[-1]=fake[0]
        self.assertEqual(self.review(fake).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_stale_attestation_blocks(self):
        self.assertEqual(self.review(now=NOW+timedelta(hours=2)).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_future_attestation_blocks(self):
        key=Ed25519PrivateKey.generate()
        fake=list(self.items)
        first=fake[0]
        fake[0]=self.sign(key,"fresh-root",first["payload"]["category"],
                          first["payload"]["evidence_sha256"],
                          issued=NOW+timedelta(minutes=1))
        roots=dict(self.keys)
        roots["fresh-root"]=public(key)
        self.assertEqual(self.review(fake,roots).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_overlong_attestation_blocks(self):
        key=Ed25519PrivateKey.generate()
        fake=list(self.items)
        first=fake[0]
        fake[0]=self.sign(key,"long-root",first["payload"]["category"],
                          first["payload"]["evidence_sha256"],
                          expires=NOW+timedelta(days=2))
        roots=dict(self.keys)
        roots["long-root"]=public(key)
        self.assertEqual(self.review(fake,roots).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_explicit_fail_evidence_blocks(self):
        key=Ed25519PrivateKey.generate()
        fake=list(self.items)
        first=fake[0]
        fake[0]=self.sign(key,"fail-root",first["payload"]["category"],
                          first["payload"]["evidence_sha256"],result="FAIL")
        roots=dict(self.keys)
        roots["fail-root"]=public(key)
        self.assertEqual(self.review(fake,roots).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_boolean_version_denied(self):
        fake=copy.deepcopy(self.items)
        fake[0]["payload"]["version"]=True
        self.assertEqual(self.review(fake).state,ReviewState.EVIDENCE_INCOMPLETE)

    def test_no_release_even_when_manually_constructed(self):
        from visitcard_release_review import ReleaseReview
        for state in ReviewState:
            review=ReleaseReview(state,())
            self.assertFalse(review.release_permitted)
            self.assertFalse(review.merge_permitted)
            self.assertFalse(review.activation_permitted)
            self.assertFalse(release_permitted(review))
