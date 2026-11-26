"""RIO v4.7 shared replay CAS and interrupted synchronization tests."""
import base64
import copy
import hashlib
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from visitcard_witness_enrollment import _canonical
from visitcard_shared_replay_cas import (
    DOMAIN,GENESIS,SyncState,initialize_shared_replay,read_shared_head,
    reserve_challenge,acknowledge_head,execution_permitted,
)


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class SharedReplayCASTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        path=str(Path(self.tmp.name)/"shared.sqlite")
        self.one=sqlite3.connect(path,isolation_level=None,timeout=0.2)
        self.two=sqlite3.connect(path,isolation_level=None,timeout=0.2)
        self.addCleanup(self.two.close)
        self.addCleanup(self.one.close)
        initialize_shared_replay(self.one)
        self.key=Ed25519PrivateKey.generate()
        self.roots={"external":self.key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)}
        self.challenge=b64(bytes(range(32)))
        self.checkpoint="a"*64

    def reserve(self,connection=None,challenge=None,sequence=0,head=GENESIS,pin=None):
        return reserve_challenge(
            self.one if connection is None else connection,
            challenge=self.challenge if challenge is None else challenge,
            checkpoint_sha256=self.checkpoint,
            expected_sequence=sequence,
            expected_head_sha256=head,
            externally_pinned_head_sha256=head if pin is None else pin,
        )

    def receipt(self,seq,head,key=None,custodian="external",hold="HOLD"):
        payload={"version":1,"sequence":seq,"head_sha256":head,"go13":hold}
        signature=(self.key if key is None else key).sign(
            DOMAIN+custodian.encode()+b"\x00"+_canonical(payload)
        )
        return {"payload":payload,"custodian_id":custodian,"signature":b64(signature)}

    def ack(self,result,receipt=None,pin=None,connection=None,roots=None):
        note=self.receipt(result.sequence,result.head_sha256) if receipt is None else receipt
        return acknowledge_head(
            self.two if connection is None else connection,
            receipt=note,
            pinned_custodians=self.roots if roots is None else roots,
            independently_pinned_receipt_sha256=hashlib.sha256(_canonical(note)).hexdigest()
            if pin is None else pin,
        )

    def test_genesis_matches_across_two_connections(self):
        self.assertEqual(read_shared_head(self.one),(0,GENESIS,0,GENESIS))
        self.assertEqual(read_shared_head(self.two),(0,GENESIS,0,GENESIS))

    def test_first_cas_creates_pending_receipt_not_authority(self):
        result=self.reserve()
        self.assertEqual(result.state,SyncState.PENDING_EXTERNAL_ACK)
        self.assertEqual(result.sequence,1)
        self.assertEqual(read_shared_head(self.two)[0],1)
        self.assertFalse(result.release_permitted)

    def test_second_process_using_stale_cas_is_blocked(self):
        self.assertEqual(self.reserve().state,SyncState.PENDING_EXTERNAL_ACK)
        self.assertEqual(self.reserve(connection=self.two).state,SyncState.STALE_HEAD_BLOCKED)

    def test_retry_pending_challenge_does_not_append(self):
        self.reserve()
        self.assertEqual(self.reserve(sequence=1,head=read_shared_head(self.one)[1]).state,
                         SyncState.SYNC_BLOCKED)
        self.assertEqual(read_shared_head(self.one)[0],1)

    def test_independent_head_pin_mismatch_blocks(self):
        self.assertEqual(self.reserve(pin="f"*64).state,SyncState.STALE_HEAD_BLOCKED)

    def test_invalid_challenge_blocks_without_consuming(self):
        self.assertEqual(self.reserve(challenge="abc").state,SyncState.STORE_BLOCKED)
        self.assertEqual(read_shared_head(self.one)[0],0)

    def test_receipt_acknowledgement_unblocks_following_cas(self):
        first=self.reserve()
        self.assertEqual(self.ack(first).state,SyncState.ACKNOWLEDGED_INFORMATIONAL)
        h=read_shared_head(self.one)
        self.assertEqual(h,(1,first.head_sha256,1,first.head_sha256))
        next_challenge=b64(bytes(range(32,64)))
        second=self.reserve(connection=self.two,challenge=next_challenge,
                            sequence=h[0],head=h[1])
        self.assertEqual(second.state,SyncState.PENDING_EXTERNAL_ACK)

    def test_same_challenge_rejected_after_successful_ack(self):
        first=self.reserve()
        self.ack(first)
        head=read_shared_head(self.one)
        self.assertEqual(self.reserve(sequence=head[0],head=head[1]).state,SyncState.REPLAY_BLOCKED)

    def test_missing_acknowledgement_does_not_advance(self):
        first=self.reserve()
        self.assertEqual(self.ack(first,pin="f"*64).state,SyncState.SYNC_BLOCKED)
        self.assertEqual(read_shared_head(self.one)[2],0)

    def test_recovery_after_interrupted_sync_is_idempotent(self):
        first=self.reserve()
        signed=self.receipt(first.sequence,first.head_sha256)
        self.assertEqual(self.ack(first,receipt=signed).state,SyncState.ACKNOWLEDGED_INFORMATIONAL)
        self.assertEqual(self.ack(first,receipt=signed).state,SyncState.ACKNOWLEDGED_INFORMATIONAL)

    def test_forged_external_signature_rejected(self):
        first=self.reserve()
        fake=self.receipt(first.sequence,first.head_sha256,key=Ed25519PrivateKey.generate())
        self.assertEqual(self.ack(first,receipt=fake).state,SyncState.SYNC_BLOCKED)

    def test_external_key_missing_denies_ack(self):
        first=self.reserve()
        self.assertEqual(self.ack(first,roots={}).state,SyncState.SYNC_BLOCKED)

    def test_wrong_ack_head_denied(self):
        first=self.reserve()
        forged=self.receipt(first.sequence,"b"*64)
        self.assertEqual(self.ack(first,receipt=forged).state,SyncState.STALE_HEAD_BLOCKED)

    def test_wrong_ack_sequence_denied(self):
        first=self.reserve()
        forged=self.receipt(first.sequence+1,first.head_sha256)
        self.assertEqual(self.ack(first,receipt=forged).state,SyncState.STALE_HEAD_BLOCKED)

    def test_wrong_go13_rejected(self):
        first=self.reserve()
        forged=self.receipt(first.sequence,first.head_sha256,hold="GO")
        self.assertEqual(self.ack(first,receipt=forged).state,SyncState.SYNC_BLOCKED)

    def test_corrupted_event_fails_closed(self):
        first=self.reserve()
        self.one.execute("DROP TRIGGER rio_shared_no_update")
        self.one.execute("UPDATE rio_shared_replay_events SET checkpoint_sha256=? WHERE sequence=1",
                         ("b"*64,))
        self.assertIsNone(read_shared_head(self.two))
        self.assertEqual(self.ack(first).state,SyncState.STORE_BLOCKED)

    def test_deleted_event_fails_closed(self):
        self.reserve()
        self.one.execute("DROP TRIGGER rio_shared_no_delete")
        self.one.execute("DELETE FROM rio_shared_replay_events")
        self.assertIsNone(read_shared_head(self.two))

    def test_transaction_conflict_fails_closed(self):
        self.one.execute("BEGIN IMMEDIATE")
        try:
            self.assertEqual(self.reserve(connection=self.two).state,SyncState.STORE_BLOCKED)
        finally:
            self.one.rollback()

    def test_active_caller_transaction_rejected(self):
        self.one.execute("BEGIN")
        try:
            self.assertEqual(self.reserve().state,SyncState.STORE_BLOCKED)
        finally:
            self.one.rollback()

    def test_both_successive_acknowledgements_verify(self):
        first=self.reserve()
        self.assertEqual(self.ack(first).state,SyncState.ACKNOWLEDGED_INFORMATIONAL)
        head=read_shared_head(self.one)
        next_challenge=b64(bytes(range(32,64)))
        second=self.reserve(challenge=next_challenge,sequence=head[0],head=head[1])
        self.assertEqual(second.state,SyncState.PENDING_EXTERNAL_ACK)
        self.assertEqual(self.ack(second).state,SyncState.ACKNOWLEDGED_INFORMATIONAL)
        self.assertEqual(read_shared_head(self.two)[0],2)

    def test_reinitialized_database_does_not_erase_existing_head(self):
        first=self.reserve()
        initialize_shared_replay(self.two)
        self.assertEqual(read_shared_head(self.two)[0],first.sequence)

    def test_receipt_cannot_retroactively_grant_execution(self):
        first=self.reserve()
        for result in [first,self.ack(first)]:
            self.assertFalse(result.merge_permitted)
            self.assertFalse(result.release_permitted)
            self.assertFalse(result.activation_permitted)
            self.assertFalse(execution_permitted(result))
