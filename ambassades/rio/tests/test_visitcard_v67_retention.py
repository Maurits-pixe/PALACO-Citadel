"""RIO v6.7 synthetic signed retention epoch and rollback tests."""
import base64
from datetime import datetime,timedelta,timezone
import hashlib
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_v65_exact_readback import ReadbackReview,ReadbackState
from visitcard_witness_enrollment import _canonical
from visitcard_v67_retention import (
    DOMAIN,SCOPE,GENESIS,RetentionState,check_retention_epoch,execution_permitted
)
NOW=datetime(2026,11,26,12,0,tzinfo=timezone.utc)


def b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


class V67RetentionTests(unittest.TestCase):
    def setUp(self):
        self.private=[Ed25519PrivateKey.generate() for _ in range(2)]
        self.ids=("offsite-archive-a","offsite-archive-b")
        self.keys={name:key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
                   for name,key in zip(self.ids,self.private)}
        # Synthetic upstream type; the v6.5 module independently validates it.
        self.upstream=ReadbackReview(ReadbackState.VERIFIED_INFORMATIONAL,(),
                                     "a"*64,2,"b"*64)
        self.minimum=NOW+timedelta(days=30)
        self.notes=[self.sign(0),self.sign(1)]
        self.pin=self.digest(self.notes,1,GENESIS)

    def sign(self,i,*,epoch=1,previous=GENESIS,evidence="a"*64,
             readback="b"*64,deadline=None,state="RETENTION_PRESENT",
             observed=NOW,expires=None,hold="HOLD",key=None):
        p={
            "version":1,"scope":SCOPE,"archive_id":self.ids[i],
            "epoch":epoch,"previous_sha256":previous,
            "evidence_sha256":evidence,"readback_sha256":readback,
            "retained_until":(self.minimum if deadline is None else deadline).isoformat(),
            "observed_at":observed.isoformat(),
            "expires_at":(NOW+timedelta(minutes=10) if expires is None else expires).isoformat(),
            "state":state,"go13":hold,
        }
        signed=(self.private[i] if key is None else key).sign(
            DOMAIN+self.ids[i].encode()+b"\x00"+_canonical(p)
        )
        return {"payload":p,"signer_id":self.ids[i],"signature":b64(signed)}

    def digest(self,notes,epoch,previous):
        return hashlib.sha256(_canonical({
            "version":1,"scope":SCOPE,"epoch":epoch,"previous_sha256":previous,
            "archives":dict(sorted(
                (x["signer_id"],hashlib.sha256(_canonical(x)).hexdigest())
                for x in notes
            )),
            "evidence_sha256":"a"*64,"readback_sha256":"b"*64,"go13":"HOLD",
        })).hexdigest()

    def check(self,**kw):
        return check_retention_epoch(
            readback=kw.get("upstream",self.upstream),
            statements=kw.get("notes",self.notes),
            pinned_archive_keys=kw.get("keys",self.keys),
            expected_archive_ids=kw.get("ids",self.ids),
            expected_epoch=kw.get("epoch",1),
            independently_pinned_previous_sha256=kw.get("previous",GENESIS),
            independently_pinned_current_sha256=kw.get("pin",self.pin),
            expected_retention_until=kw.get("minimum",self.minimum),
            now=kw.get("now",NOW),
        )

    def test_valid_synthetic_dual_retention_is_informational(self):
        r=self.check()
        self.assertEqual(r.state,RetentionState.VERIFIED_INFORMATIONAL)
        self.assertEqual(r.checkpoint_sha256,self.pin)
        self.assertFalse(r.release_permitted)

    def test_same_checkpoint_digest_is_deterministic(self):
        self.assertEqual(self.check().checkpoint_sha256,self.check().checkpoint_sha256)

    def test_next_epoch_with_external_predecessor_works(self):
        notes=[self.sign(i,epoch=2,previous=self.pin) for i in range(2)]
        r=self.check(notes=notes,epoch=2,previous=self.pin,pin=self.digest(notes,2,self.pin))
        self.assertEqual(r.state,RetentionState.VERIFIED_INFORMATIONAL)

    def test_rollback_epoch_blocks(self):
        self.assertEqual(self.check(epoch=2).state,RetentionState.RETENTION_BLOCKED)

    def test_old_predecessor_blocks(self):
        self.assertEqual(self.check(previous="f"*64).state,RetentionState.RETENTION_BLOCKED)

    def test_missing_latest_external_pin_blocks(self):
        self.assertEqual(self.check(pin="").state,RetentionState.RETENTION_BLOCKED)

    def test_wrong_latest_external_pin_blocks(self):
        self.assertEqual(self.check(pin="f"*64).state,RetentionState.RETENTION_BLOCKED)

    def test_changed_earlier_signed_retention_blocks_old_pin(self):
        notes=[self.sign(0,deadline=NOW+timedelta(days=40)),self.notes[1]]
        self.assertEqual(self.check(notes=notes).state,RetentionState.RETENTION_BLOCKED)

    def test_short_retention_creates_quarantine(self):
        notes=[self.notes[0],self.sign(1,deadline=NOW+timedelta(days=1))]
        self.assertEqual(self.check(notes=notes).state,
                         RetentionState.RETENTION_CONFLICT_QUARANTINED)

    def test_missing_object_claim_creates_quarantine(self):
        notes=[self.notes[0],self.sign(1,state="STORAGE_MISSING")]
        self.assertEqual(self.check(notes=notes).state,
                         RetentionState.RETENTION_CONFLICT_QUARANTINED)

    def test_both_missing_creates_quarantine(self):
        notes=[self.sign(i,state="STORAGE_MISSING") for i in range(2)]
        self.assertEqual(self.check(notes=notes).state,
                         RetentionState.RETENTION_CONFLICT_QUARANTINED)

    def test_missing_second_archive_blocks(self):
        self.assertEqual(self.check(notes=self.notes[:1]).state,RetentionState.RETENTION_BLOCKED)

    def test_unpinned_archive_key_blocks(self):
        self.assertEqual(self.check(keys={}).state,RetentionState.RETENTION_BLOCKED)

    def test_reused_archive_key_blocks(self):
        notes=[self.notes[0],self.sign(1,key=self.private[0])]
        keys={name:self.keys[self.ids[0]] for name in self.ids}
        self.assertEqual(self.check(notes=notes,keys=keys).state,RetentionState.RETENTION_BLOCKED)

    def test_forged_signature_blocks(self):
        notes=[self.notes[0],{**self.notes[1],"signature":"A"*86}]
        self.assertEqual(self.check(notes=notes).state,RetentionState.RETENTION_BLOCKED)

    def test_different_archive_id_blocks(self):
        self.assertEqual(self.check(ids=(self.ids[1],self.ids[0])).state,
                         RetentionState.RETENTION_BLOCKED)

    def test_wrong_evidence_digest_blocks(self):
        notes=[self.notes[0],self.sign(1,evidence="f"*64)]
        self.assertEqual(self.check(notes=notes).state,RetentionState.RETENTION_BLOCKED)

    def test_wrong_readback_fingerprint_blocks(self):
        notes=[self.notes[0],self.sign(1,readback="f"*64)]
        self.assertEqual(self.check(notes=notes).state,RetentionState.RETENTION_BLOCKED)

    def test_expired_signature_blocks(self):
        notes=[self.notes[0],self.sign(1,expires=NOW-timedelta(minutes=1))]
        self.assertEqual(self.check(notes=notes).state,RetentionState.RETENTION_BLOCKED)

    def test_future_signature_blocks(self):
        notes=[self.notes[0],self.sign(1,observed=NOW+timedelta(minutes=1))]
        self.assertEqual(self.check(notes=notes).state,RetentionState.RETENTION_BLOCKED)

    def test_long_signature_window_blocks(self):
        notes=[self.notes[0],self.sign(1,expires=NOW+timedelta(minutes=20))]
        self.assertEqual(self.check(notes=notes).state,RetentionState.RETENTION_BLOCKED)

    def test_expired_retention_deadline_blocks(self):
        self.assertEqual(self.check(now=NOW+timedelta(days=31)).state,
                         RetentionState.RETENTION_BLOCKED)

    def test_go13_not_hold_blocks(self):
        notes=[self.notes[0],self.sign(1,hold="GO")]
        self.assertEqual(self.check(notes=notes).state,RetentionState.RETENTION_BLOCKED)

    def test_boolean_epoch_blocks(self):
        self.assertEqual(self.check(epoch=True).state,RetentionState.RETENTION_BLOCKED)

    def test_upstream_not_verified_blocks(self):
        up=ReadbackReview(ReadbackState.READBACK_INCOMPLETE,(),"a"*64,1,"b"*64)
        self.assertEqual(self.check(upstream=up).state,RetentionState.UPSTREAM_BLOCKED)

    def test_upstream_unbound_digest_blocks(self):
        up=ReadbackReview(ReadbackState.VERIFIED_INFORMATIONAL,(),"invalid",2,"b"*64)
        self.assertEqual(self.check(upstream=up).state,RetentionState.UPSTREAM_BLOCKED)

    def test_no_retention_status_grants_authority(self):
        from visitcard_v67_retention import RetentionReview
        for state in RetentionState:
            r=RetentionReview(state,())
            self.assertFalse(r.release_permitted)
            self.assertFalse(r.merge_permitted)
            self.assertFalse(r.activation_permitted)
            self.assertFalse(execution_permitted(r))
