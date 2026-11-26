"""RIO v3.2 mandatory distinct fresh-head witness integration tests."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import base64
import copy
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_admission_anchor import VerifiedAnchor
from visitcard_anchor_custody import _receipt
from visitcard_checkpoint_witness import initialize_checkpoint_witness,attest_checkpoint
from visitcard_checkpoint_archive import initialize_archive,archive_checkpoint
from visitcard_archive_publication import initialize_publication,publish_archive_seal
from visitcard_fresh_publication_head import (
    initialize_fresh_head,retain_published_head,attest_fresh_head,challenge,DOMAIN
)
from visitcard_witness_enrollment import _canonical
from visitcard_dual_witness_verification import (
    verify_dual_witness_chain,execution_permitted,IntegratedState
)

NOW=datetime(2026,11,23,4,tzinfo=timezone.utc)
ISSUER="issuer.example"
NONCE="nonce-test"


def pub(key):
    return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)


def b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


class DualWitnessTests(unittest.TestCase):
    def setUp(self):
        self.source=sqlite3.connect(":memory:",isolation_level=None)
        self.archive=sqlite3.connect(":memory:",isolation_level=None)
        self.publisher=sqlite3.connect(":memory:",isolation_level=None)
        self.fresh_a=sqlite3.connect(":memory:",isolation_level=None)
        self.fresh_b=sqlite3.connect(":memory:",isolation_level=None)
        for db in (self.source,self.archive,self.publisher,self.fresh_a,self.fresh_b):
            self.addCleanup(db.close)
        initialize_checkpoint_witness(self.source)
        initialize_archive(self.archive)
        initialize_publication(self.publisher)
        initialize_fresh_head(self.fresh_a)
        initialize_fresh_head(self.fresh_b)
        self.custody_private=Ed25519PrivateKey.generate()
        self.witness_private=Ed25519PrivateKey.generate()
        self.archive_private=Ed25519PrivateKey.generate()
        self.publisher_private=Ed25519PrivateKey.generate()
        self.key_a=Ed25519PrivateKey.generate()
        self.key_b=Ed25519PrivateKey.generate()
        self.custody_keys={"custody":pub(self.custody_private)}
        self.witness_keys={"witness":pub(self.witness_private)}
        self.archive_keys={"archive":pub(self.archive_private)}
        self.publisher_keys={"publisher":pub(self.publisher_private)}
        self.keys_a={"fresh-a":pub(self.key_a)}
        self.keys_b={"fresh-b":pub(self.key_b)}
        self.challenge_a=challenge()
        self.challenge_b=challenge()
        signed=_receipt(
            VerifiedAnchor(ISSUER,NONCE,1,"a"*64,"anchor"),
            self.custody_private,"custody",NOW
        )
        witness=attest_checkpoint(
            self.source,signed,self.custody_keys,self.witness_private,
            "witness",now=NOW
        )
        self.assertIsNotNone(witness)
        archive_seal=archive_checkpoint(
            self.archive,witness,self.witness_keys,self.archive_private,"archive"
        )
        self.assertIsNotNone(archive_seal)
        self.published=publish_archive_seal(
            self.publisher,archive_seal,self.archive_keys,self.publisher_private,"publisher"
        )
        self.assertIsNotNone(self.published)
        self.assertTrue(retain_published_head(self.fresh_a,self.published,self.publisher_keys))
        self.assertTrue(retain_published_head(self.fresh_b,self.published,self.publisher_keys))

    def response_a(self,when=NOW):
        return attest_fresh_head(
            self.fresh_a,ISSUER,NONCE,self.challenge_a,
            self.publisher_keys,self.key_a,"fresh-a",now=when
        )

    def response_b(self,when=NOW):
        return attest_fresh_head(
            self.fresh_b,ISSUER,NONCE,self.challenge_b,
            self.publisher_keys,self.key_b,"fresh-b",now=when
        )

    def check(self,**options):
        return verify_dual_witness_chain(
            self.archive,
            self.published,
            options.get("response_a",self.response_a()),
            options.get("challenge_a",self.challenge_a),
            options.get("response_b",self.response_b()),
            options.get("challenge_b",self.challenge_b),
            issuer=ISSUER,nonce=NONCE,
            witness_keys=self.witness_keys,archive_keys=self.archive_keys,
            publisher_keys=self.publisher_keys,
            primary_signer_keys=options.get("keys_a",self.keys_a),
            secondary_signer_keys=options.get("keys_b",self.keys_b),
            now=options.get("now",NOW),
        )

    def resign_b(self,head_hash=None,count=None,signer_id="fresh-b",key=None):
        reply=self.response_b()
        reply["payload"]["seal_sha256"]=head_hash if head_hash is not None else reply["payload"]["seal_sha256"]
        reply["payload"]["event_count"]=count if count is not None else reply["payload"]["event_count"]
        reply["signer_id"]=signer_id
        private=self.key_b if key is None else key
        sig=private.sign(DOMAIN+signer_id.encode()+b"\x00"+_canonical(reply["payload"]))
        reply["signature"]=b64(sig)
        return reply

    def test_two_independent_keys_match_informational(self):
        self.assertEqual(self.check(),IntegratedState.MATCHED_INFORMATIONAL)

    def test_no_status_grants_execution(self):
        for state in IntegratedState:
            self.assertFalse(execution_permitted(state))

    def test_missing_second_response_denied(self):
        self.assertEqual(self.check(response_b={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_second_bad_signature_denied(self):
        bad=self.response_b()
        bad["signature"]="A"*86
        self.assertEqual(self.check(response_b=bad),IntegratedState.UNKNOWN_BLOCKED)

    def test_second_wrong_trust_root_denied(self):
        self.assertEqual(self.check(keys_b={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_same_challenge_denied(self):
        self.assertEqual(self.check(challenge_b=self.challenge_a),IntegratedState.UNKNOWN_BLOCKED)

    def test_second_response_replayed_against_new_challenge_denied(self):
        self.assertEqual(self.check(challenge_b=challenge()),IntegratedState.UNKNOWN_BLOCKED)

    def test_second_signature_expired_denied(self):
        old=self.response_b(when=NOW-timedelta(seconds=61))
        self.assertEqual(self.check(response_b=old),IntegratedState.UNKNOWN_BLOCKED)

    def test_one_physical_key_two_labels_denied(self):
        key=Ed25519PrivateKey.generate()
        reply_a=self.response_a()
        reply_a["signer_id"]="fresh-a"
        reply_a["signature"]=b64(key.sign(DOMAIN+b"fresh-a\x00"+_canonical(reply_a["payload"])))
        reply_b=self.resign_b(key=key)
        self.assertEqual(self.check(
            response_a=reply_a,response_b=reply_b,
            keys_a={"fresh-a":pub(key)},keys_b={"fresh-b":pub(key)}
        ),IntegratedState.UNKNOWN_BLOCKED)

    def test_same_signer_id_denied_even_if_keys_differ(self):
        changed=self.resign_b(signer_id="fresh-a")
        self.assertEqual(self.check(
            response_b=changed,keys_b={"fresh-a":pub(self.key_b)}
        ),IntegratedState.UNKNOWN_BLOCKED)

    def test_two_valid_signatures_with_different_hashes_blocked(self):
        divergent=self.resign_b(head_hash="f"*64)
        self.assertEqual(self.check(response_b=divergent),IntegratedState.FORK_BLOCKED)

    def test_different_valid_counts_are_unconfirmed(self):
        altered=self.resign_b(count=2)
        self.assertEqual(self.check(response_b=altered),IntegratedState.UNKNOWN_BLOCKED)

    def test_archive_data_missing_denied(self):
        self.archive.execute("DROP TRIGGER rio_archive_history_immutable_delete")
        self.archive.execute("DELETE FROM rio_checkpoint_archive_history")
        self.assertEqual(self.check(),IntegratedState.UNKNOWN_BLOCKED)

    def test_primary_expired_denied(self):
        old=self.response_a(when=NOW-timedelta(seconds=61))
        self.assertEqual(self.check(response_a=old),IntegratedState.UNKNOWN_BLOCKED)
