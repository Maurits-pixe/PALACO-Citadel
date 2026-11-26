"""RIO v3.1 integration tests for publication receipt + fresh challenge."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import copy
import sqlite3
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from visitcard_admission_anchor import VerifiedAnchor
from visitcard_anchor_custody import _receipt
from visitcard_checkpoint_witness import initialize_checkpoint_witness, attest_checkpoint
from visitcard_checkpoint_archive import initialize_archive, archive_checkpoint
from visitcard_archive_publication import initialize_publication, publish_archive_seal
from visitcard_fresh_publication_head import initialize_fresh_head, retain_published_head, attest_fresh_head, challenge
from visitcard_integrated_verification import IntegratedState, verify_integrated_chain, execution_permitted

NOW=datetime(2026,11,23,4,tzinfo=timezone.utc)
ISSUER="issuer.example"
NONCE="nonce-test"


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.witness=sqlite3.connect(":memory:",isolation_level=None)
        self.archive=sqlite3.connect(":memory:",isolation_level=None)
        self.publisher=sqlite3.connect(":memory:",isolation_level=None)
        self.fresh=sqlite3.connect(":memory:",isolation_level=None)
        for db in (self.witness,self.archive,self.publisher,self.fresh):
            self.addCleanup(db.close)
        initialize_checkpoint_witness(self.witness)
        initialize_archive(self.archive)
        initialize_publication(self.publisher)
        initialize_fresh_head(self.fresh)
        self.custody_key=Ed25519PrivateKey.generate()
        self.witness_key=Ed25519PrivateKey.generate()
        self.archive_key=Ed25519PrivateKey.generate()
        self.publisher_key=Ed25519PrivateKey.generate()
        self.fresh_key=Ed25519PrivateKey.generate()
        pub=lambda k:k.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.custody_keys={"custody":pub(self.custody_key)}
        self.witness_keys={"witness":pub(self.witness_key)}
        self.archive_keys={"archive":pub(self.archive_key)}
        self.publisher_keys={"publisher":pub(self.publisher_key)}
        self.fresh_keys={"fresh":pub(self.fresh_key)}
        self.challenge=challenge()
        self.first=self.append(1,"a"*64)

    def append(self,count,digest,*,publish=True,retain=True):
        receipt=_receipt(VerifiedAnchor(ISSUER,NONCE,count,digest,"anchor"),self.custody_key,"custody",NOW)
        cp=attest_checkpoint(self.witness,receipt,self.custody_keys,self.witness_key,"witness",now=NOW)
        self.assertIsNotNone(cp)
        seal=archive_checkpoint(self.archive,cp,self.witness_keys,self.archive_key,"archive")
        self.assertIsNotNone(seal)
        if not publish:
            return None
        published=publish_archive_seal(self.publisher,seal,self.archive_keys,self.publisher_key,"publisher")
        self.assertIsNotNone(published)
        if retain:
            self.assertTrue(retain_published_head(self.fresh,published,self.publisher_keys))
        return published

    def fresh_response(self,challenge_value=None,at=NOW):
        return attest_fresh_head(
            self.fresh,ISSUER,NONCE,self.challenge if challenge_value is None else challenge_value,
            self.publisher_keys,self.fresh_key,"fresh",now=at,
        )

    def check(self,receipt=None,response=None,**overrides):
        return verify_integrated_chain(
            self.archive,
            self.first if receipt is None else receipt,
            self.fresh_response() if response is None else response,
            overrides.get("challenge",self.challenge),
            issuer=overrides.get("issuer",ISSUER),
            nonce=overrides.get("nonce",NONCE),
            witness_keys=overrides.get("witness_keys",self.witness_keys),
            archive_keys=overrides.get("archive_keys",self.archive_keys),
            publisher_keys=overrides.get("publisher_keys",self.publisher_keys),
            fresh_signer_keys=overrides.get("fresh_keys",self.fresh_keys),
            now=overrides.get("now",NOW),
        )

    def test_matching_chain_is_only_informational(self):
        self.assertEqual(self.check(),IntegratedState.MATCHED_INFORMATIONAL)

    def test_no_state_grants_execution(self):
        for status in IntegratedState:
            self.assertFalse(execution_permitted(status))

    def test_wrong_challenge_rejected(self):
        self.assertEqual(self.check(challenge=challenge()),IntegratedState.UNKNOWN_BLOCKED)

    def test_expired_signed_head_rejected(self):
        self.assertEqual(self.check(now=NOW+timedelta(seconds=61)),IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_fresh_signer_rejected(self):
        self.assertEqual(self.check(fresh_keys={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_archive_signer_rejected(self):
        self.assertEqual(self.check(archive_keys={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_publisher_signer_rejected(self):
        self.assertEqual(self.check(publisher_keys={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_witness_signer_rejected(self):
        self.assertEqual(self.check(witness_keys={}),IntegratedState.UNKNOWN_BLOCKED)

    def test_wrong_issuer_rejected(self):
        self.assertEqual(self.check(issuer="other"),IntegratedState.UNKNOWN_BLOCKED)

    def test_local_archive_ahead_of_witness_head_blocked(self):
        self.append(2,"b"*64,publish=False)
        self.assertEqual(self.check(),IntegratedState.LOCAL_AHEAD_UNCONFIRMED)

    def test_fresh_head_ahead_of_old_published_receipt_blocked(self):
        second=self.append(2,"b"*64)
        self.assertEqual(self.check(receipt=self.first),IntegratedState.UNKNOWN_BLOCKED)
        self.assertEqual(self.check(receipt=second),IntegratedState.MATCHED_INFORMATIONAL)

    def test_forged_receipt_unknown(self):
        bogus=copy.deepcopy(self.first)
        bogus["payload"]["seal_sha256"]="f"*64
        self.assertEqual(self.check(receipt=bogus),IntegratedState.UNKNOWN_BLOCKED)

    def test_modified_fresh_head_unknown(self):
        response=self.fresh_response()
        response["payload"]["seal_sha256"]="f"*64
        self.assertEqual(self.check(response=response),IntegratedState.UNKNOWN_BLOCKED)

    def test_missing_archived_history_blocked(self):
        self.archive.execute("DROP TRIGGER rio_archive_history_immutable_delete")
        self.archive.execute("DELETE FROM rio_checkpoint_archive_history")
        self.assertEqual(self.check(),IntegratedState.UNKNOWN_BLOCKED)

    def test_open_transaction_fail_closed(self):
        self.archive.execute("BEGIN IMMEDIATE")
        try:
            self.assertEqual(self.check(),IntegratedState.UNKNOWN_BLOCKED)
        finally:
            self.archive.rollback()
