"""RIO v4.6 externally pinned replay-log recovery gate — DRAFT / GO-13 HOLD.

A separately signed snapshot of the local consumed-challenge ledger must be
pinned out-of-band and match the exact current local rows before any audit.
A single BEGIN IMMEDIATE covers snapshot comparison and consumption. After
consumption, a *new* external snapshot is required for the next operation.
The module does not provide an external custodian, independent pin storage,
or cross-device globally atomic compare-and-swap.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime,timezone
from enum import Enum
import hashlib
import sqlite3
from typing import Any,Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from visitcard_release_review import _hex
from visitcard_witness_enrollment import _canonical
from visitcard_release_transfer_audit import audit_release_transfer,AuditState
from visitcard_audit_checkpoint import verify_checkpoint

DOMAIN=b"PALACO-RIO-REPLAY-HIGHWATER-V1\x00"
MAX_ROWS=100000


class RecoveryState(str,Enum):
    MATCHED_INFORMATIONAL="MATCHED_INFORMATIONAL"
    RECOVERY_BLOCKED="RECOVERY_BLOCKED"
    AUDIT_BLOCKED="AUDIT_BLOCKED"
    CHECKPOINT_BLOCKED="CHECKPOINT_BLOCKED"
    REPLAY_BLOCKED="REPLAY_BLOCKED"


@dataclass(frozen=True)
class RecoveryResult:
    state:RecoveryState
    blockers:tuple[str,...]
    checkpoint_sha256:str|None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _canonical_signature(value:Any)->bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=value:
        raise ValueError("noncanonical signature")
    return raw


def replay_log_head(db:sqlite3.Connection)->tuple[int,str]|None:
    """Hash the exact ordered challenge rows, without trusting stored metadata."""
    try:
        rows=db.execute(
            """SELECT challenge,checkpoint_sha256,consumed_at
               FROM rio_audit_consumed_challenges ORDER BY rowid"""
        ).fetchall()
        if len(rows)>MAX_ROWS:
            return None
        for challenge,checkpoint,consumed in rows:
            if not isinstance(challenge,str) or not isinstance(consumed,str) or not _hex(checkpoint):
                return None
            raw=base64.urlsafe_b64decode(challenge+"==")
            if len(raw)!=32 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=challenge:
                return None
            parsed=datetime.fromisoformat(consumed.replace("Z","+00:00"))
            if parsed.utcoffset() is None:
                return None
        digest=hashlib.sha256(_canonical(rows)).hexdigest()
        return len(rows),digest
    except (sqlite3.Error,TypeError,ValueError,OverflowError,AttributeError):
        return None


def verify_replay_highwater(
    snapshot:Any,roots:Mapping[str,bytes],*,
    expected_scope:str,expected_commit:str,expected_local_head:tuple[int,str],
    externally_pinned_snapshot_sha256:str
)->bool:
    """Signed monotonic row count + digest; latest pin supplied independently."""
    try:
        if not isinstance(snapshot,dict) or set(snapshot)!={"payload","custodian_id","signature"}:
            return False
        p=snapshot["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","scope","commit_sha","sequence","log_sha256","go13"
        }:
            return False
        if type(p["version"]) is not int or p["version"]!=1 or p["go13"]!="HOLD":
            return False
        if not isinstance(expected_scope,str) or not 0<len(expected_scope)<=128:
            return False
        if p["scope"]!=expected_scope or not _hex(expected_commit,40) or p["commit_sha"]!=expected_commit:
            return False
        count,digest=expected_local_head
        if type(p["sequence"]) is not int or p["sequence"]!=count or not 0<=count<=MAX_ROWS:
            return False
        if not _hex(digest) or p["log_sha256"]!=digest:
            return False
        custodian=snapshot["custodian_id"]
        if not isinstance(custodian,str) or not 0<len(custodian)<=128:
            return False
        public=roots.get(custodian)
        if not isinstance(public,bytes) or len(public)!=32:
            return False
        Ed25519PublicKey.from_public_bytes(public).verify(
            _canonical_signature(snapshot["signature"]),
            DOMAIN+custodian.encode()+b"\x00"+_canonical(p)
        )
        signed_hash=hashlib.sha256(_canonical(snapshot)).hexdigest()
        return _hex(externally_pinned_snapshot_sha256) and signed_hash==externally_pinned_snapshot_sha256
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return False


def verify_recovered_audit(
    challenge_log:sqlite3.Connection,*,
    snapshot:Any,
    pinned_recovery_custodians:Mapping[str,bytes],
    independently_pinned_snapshot_sha256:str,
    scope:str,
    dossier_manifest:Any,dossier_manifest_sha256:Any,evidence_bytes:Any,
    pinned_review_keys:Mapping[str,bytes],receipts:Any,
    pinned_custodians:Mapping[str,bytes],
    independently_pinned_latest_receipt_sha256:str,
    expected_commit_sha:str,
    checkpoint:Any,pinned_auditor_keys:Mapping[str,bytes],
    expected_challenge:str,independently_pinned_checkpoint_sha256:str,
    now:datetime|None=None
)->RecoveryResult:
    """One local SQLite transaction: compare pinned head then consume challenge."""
    def denied(state:RecoveryState,why:str)->RecoveryResult:
        return RecoveryResult(state,(why,),None)
    if not isinstance(challenge_log,sqlite3.Connection) or challenge_log.in_transaction:
        return denied(RecoveryState.RECOVERY_BLOCKED,"CHALLENGE_STORE_NOT_IDLE")
    try:
        challenge_log.execute("BEGIN IMMEDIATE")
        head=replay_log_head(challenge_log)
        if head is None or not verify_replay_highwater(
            snapshot,pinned_recovery_custodians,expected_scope=scope,
            expected_commit=expected_commit_sha,expected_local_head=head,
            externally_pinned_snapshot_sha256=independently_pinned_snapshot_sha256
        ):
            return denied(RecoveryState.RECOVERY_BLOCKED,"LOCAL_LOG_AND_EXTERNAL_HEAD_DIVERGE")
        audit=audit_release_transfer(
            dossier_manifest=dossier_manifest,dossier_manifest_sha256=dossier_manifest_sha256,
            evidence_bytes=evidence_bytes,pinned_review_keys=pinned_review_keys,
            receipts=receipts,pinned_custodians=pinned_custodians,
            independently_pinned_latest_receipt_sha256=independently_pinned_latest_receipt_sha256,
            expected_commit_sha=expected_commit_sha,now=now
        )
        if audit.state!=AuditState.MATCHED_INFORMATIONAL:
            return denied(RecoveryState.AUDIT_BLOCKED,"UNDERLYING_AUDIT_INVALID")
        digest=verify_checkpoint(
            checkpoint,pinned_auditor_keys,
            expected_commit=expected_commit_sha,
            expected_dossier_sha256=audit.dossier_sha256,
            expected_latest_receipt_sha256=audit.latest_receipt_sha256,
            expected_challenge=expected_challenge,
            externally_pinned_checkpoint_sha256=independently_pinned_checkpoint_sha256,
            now=now
        )
        if digest is None:
            return denied(RecoveryState.CHECKPOINT_BLOCKED,"AUDIT_CHECKPOINT_INVALID")
        challenge_log.execute(
            """INSERT INTO rio_audit_consumed_challenges
               (challenge,checkpoint_sha256,consumed_at) VALUES (?,?,?)""",
            (expected_challenge,digest,datetime.now(timezone.utc).isoformat())
        )
        challenge_log.commit()
        return RecoveryResult(RecoveryState.MATCHED_INFORMATIONAL,(),digest)
    except (sqlite3.Error,ValueError,TypeError,AttributeError,OverflowError):
        return denied(RecoveryState.REPLAY_BLOCKED,"CHALLENGE_COMMIT_FAILED")
    finally:
        if isinstance(challenge_log,sqlite3.Connection) and challenge_log.in_transaction:
            challenge_log.rollback()


def execution_permitted(result:RecoveryResult)->bool:
    return False
