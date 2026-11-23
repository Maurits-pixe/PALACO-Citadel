"""RIO v4.5 signed audit checkpoint and single-use challenge gate — HOLD.

The caller must independently obtain a fresh unpredictable 32-byte challenge,
the current externally pinned checkpoint digest, and the trusted auditor
public key. The local SQLite single-use log is NOT independently durable and
can itself be rolled back. This is an offline verification contract only.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime,timedelta,timezone
from enum import Enum
import hashlib
import sqlite3
from typing import Any,Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from visitcard_release_transfer_audit import audit_release_transfer,AuditState
from visitcard_release_review import _hex
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-AUDIT-CHECKPOINT-V1\x00"
MAX_AGE=timedelta(minutes=5)


class CheckpointState(str,Enum):
    MATCHED_INFORMATIONAL="MATCHED_INFORMATIONAL"
    AUDIT_BLOCKED="AUDIT_BLOCKED"
    CHECKPOINT_BLOCKED="CHECKPOINT_BLOCKED"
    REPLAY_BLOCKED="REPLAY_BLOCKED"


@dataclass(frozen=True)
class CheckpointResult:
    state:CheckpointState
    blockers:tuple[str,...]
    checkpoint_sha256:str|None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def initialize_challenge_log(db:sqlite3.Connection)->None:
    if not isinstance(db,sqlite3.Connection) or db.in_transaction:
        raise ValueError("invalid migration boundary")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS rio_audit_consumed_challenges (
      challenge TEXT PRIMARY KEY NOT NULL,
      checkpoint_sha256 TEXT NOT NULL,
      consumed_at TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS rio_audit_challenges_no_delete
      BEFORE DELETE ON rio_audit_consumed_challenges
      BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TRIGGER IF NOT EXISTS rio_audit_challenges_no_update
      BEFORE UPDATE ON rio_audit_consumed_challenges
      BEGIN SELECT RAISE(ABORT,'immutable'); END;
    """)


def _canonical_sig(text:Any)->bytes:
    if not isinstance(text,str) or len(text)!=86:
        raise ValueError("signature")
    raw=base64.urlsafe_b64decode(text+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=text:
        raise ValueError("noncanonical")
    return raw


def _timestamp(text:Any)->datetime:
    if not isinstance(text,str):
        raise ValueError("timestamp")
    when=datetime.fromisoformat(text.replace("Z","+00:00"))
    if when.utcoffset() is None:
        raise ValueError("naive timestamp")
    return when.astimezone(timezone.utc)


def verify_checkpoint(
    checkpoint:Any,keys:Mapping[str,bytes],*,
    expected_commit:str,expected_dossier_sha256:str,
    expected_latest_receipt_sha256:str,
    expected_challenge:str,
    externally_pinned_checkpoint_sha256:str,
    now:datetime|None=None
)->str|None:
    """Return bound checkpoint digest after validating every signed field."""
    try:
        if not isinstance(checkpoint,dict) or set(checkpoint)!={"payload","auditor_id","signature"}:
            return None
        p=checkpoint["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","commit_sha","dossier_sha256","latest_receipt_sha256",
            "challenge","issued_at","expires_at","audit_state","go13"
        }:
            return None
        if type(p["version"]) is not int or p["version"]!=1:
            return None
        if p["audit_state"]!="MATCHED_INFORMATIONAL" or p["go13"]!="HOLD":
            return None
        if not (_hex(expected_commit,40) and _hex(expected_dossier_sha256) and
                _hex(expected_latest_receipt_sha256)):
            return None
        if (p["commit_sha"]!=expected_commit or
            p["dossier_sha256"]!=expected_dossier_sha256 or
            p["latest_receipt_sha256"]!=expected_latest_receipt_sha256):
            return None
        if not isinstance(expected_challenge,str):
            return None
        raw=base64.urlsafe_b64decode(expected_challenge+"==")
        if (len(raw)!=32 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=expected_challenge
            or p["challenge"]!=expected_challenge):
            return None
        started=_timestamp(p["issued_at"])
        expires=_timestamp(p["expires_at"])
        current=datetime.now(timezone.utc) if now is None else now
        if not isinstance(current,datetime) or current.utcoffset() is None:
            return None
        current=current.astimezone(timezone.utc)
        if not (started<=current<expires and timedelta(0)<expires-started<=MAX_AGE):
            return None
        auditor=checkpoint["auditor_id"]
        if not isinstance(auditor,str) or not 0<len(auditor)<=128:
            return None
        public=keys.get(auditor)
        if not isinstance(public,bytes) or len(public)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(public).verify(
            _canonical_sig(checkpoint["signature"]),
            DOMAIN+auditor.encode()+b"\x00"+_canonical(p)
        )
        digest=hashlib.sha256(_canonical(checkpoint)).hexdigest()
        if not _hex(externally_pinned_checkpoint_sha256) or digest!=externally_pinned_checkpoint_sha256:
            return None
        return digest
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def verify_checkpointed_audit(
    challenge_log:sqlite3.Connection,*,
    dossier_manifest:Any,dossier_manifest_sha256:Any,evidence_bytes:Any,
    pinned_review_keys:Mapping[str,bytes],receipts:Any,
    pinned_custodians:Mapping[str,bytes],
    independently_pinned_latest_receipt_sha256:str,
    expected_commit_sha:str,
    checkpoint:Any,
    pinned_auditor_keys:Mapping[str,bytes],
    expected_challenge:str,
    independently_pinned_checkpoint_sha256:str,
    now:datetime|None=None
)->CheckpointResult:
    """Run v4.4 then verify signed checkpoint and atomically consume nonce."""
    def denied(state:CheckpointState,reason:str)->CheckpointResult:
        return CheckpointResult(state,(reason,),None)
    if not isinstance(challenge_log,sqlite3.Connection) or challenge_log.in_transaction:
        return denied(CheckpointState.REPLAY_BLOCKED,"CHALLENGE_STORE_UNAVAILABLE")
    try:
        audit=audit_release_transfer(
            dossier_manifest=dossier_manifest,
            dossier_manifest_sha256=dossier_manifest_sha256,
            evidence_bytes=evidence_bytes,pinned_review_keys=pinned_review_keys,
            receipts=receipts,pinned_custodians=pinned_custodians,
            independently_pinned_latest_receipt_sha256=independently_pinned_latest_receipt_sha256,
            expected_commit_sha=expected_commit_sha,now=now
        )
        if audit.state!=AuditState.MATCHED_INFORMATIONAL:
            return CheckpointResult(
                CheckpointState.AUDIT_BLOCKED,
                audit.blockers or ("UNDERLYING_AUDIT_FAILED",),None,
            )
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
            return denied(CheckpointState.CHECKPOINT_BLOCKED,"CHECKPOINT_INVALID_OR_STALE")
        # Single-use within the local SQLite transaction boundary. Lost
        # database state or concurrent global verifiers need external CAS.
        challenge_log.execute("BEGIN IMMEDIATE")
        try:
            challenge_log.execute(
                """INSERT INTO rio_audit_consumed_challenges
                   (challenge,checkpoint_sha256,consumed_at) VALUES (?,?,?)""",
                (expected_challenge,digest,datetime.now(timezone.utc).isoformat())
            )
            challenge_log.commit()
        except sqlite3.Error:
            challenge_log.rollback()
            return denied(CheckpointState.REPLAY_BLOCKED,"CHALLENGE_ALREADY_USED_OR_STORE_FAILED")
        return CheckpointResult(CheckpointState.MATCHED_INFORMATIONAL,(),digest)
    except (sqlite3.Error,TypeError,ValueError,AttributeError):
        if challenge_log.in_transaction:
            challenge_log.rollback()
        return denied(CheckpointState.REPLAY_BLOCKED,"CHALLENGE_STORE_FAILED")


def execution_permitted(result:CheckpointResult)->bool:
    return False
