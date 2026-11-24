"""RIO v6.4 independent archive-status challenge/response verification.

Verifies two independently keyed Ed25519 archive status claims against the
original v6.0 incident evidence and a caller-provided fresh 32-byte challenge.
A signed STORAGE_VERIFIED claim is informational, NOT physical proof that
bytes are durable offsite. No real archive services provisioned; GO-13 HOLD.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime,timedelta,timezone
from enum import Enum
import hashlib
import sqlite3
from typing import Any,Callable,Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from visitcard_release_review import _hex
from visitcard_v60_incident_ledger import _chain
from visitcard_v61_archive_receipts import _chain_receipts
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-V64-ARCHIVE-STATUS-V1\x00"
SCOPE="RIO-VISITCARD-V6.4-ARCHIVE-STATUS"
MAX_AGE=timedelta(minutes=5)
FIELDS=frozenset({
    "version","scope","archive_id","challenge","handoff_id",
    "incident_sequence","incident_head_sha256","conflict_sha256",
    "evidence_sha256","storage_state","verified_at","expires_at","go13",
})


class StorageState(str,Enum):
    BLOCKED="BLOCKED"
    PARTIAL_QUARANTINED="PARTIAL_QUARANTINED"
    CONFLICT_QUARANTINED="CONFLICT_QUARANTINED"
    VERIFIED_INFORMATIONAL="VERIFIED_INFORMATIONAL"


@dataclass(frozen=True)
class StorageReview:
    state:StorageState
    blockers:tuple[str,...]
    evidence_sha256:str|None=None
    verification_sha256:str|None=None
    verified_archives:int=0
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _base64(value:Any)->bytes|None:
    try:
        if not isinstance(value,str) or len(value)!=43:
            return None
        data=base64.urlsafe_b64decode(value+"==")
        if len(data)!=32 or base64.urlsafe_b64encode(data).rstrip(b"=").decode()!=value:
            return None
        return data
    except (ValueError,TypeError):
        return None


def _timestamp(value:Any)->datetime:
    if not isinstance(value,str):
        raise ValueError("timestamp")
    x=datetime.fromisoformat(value.replace("Z","+00:00"))
    if x.utcoffset() is None:
        raise ValueError("timezone")
    return x.astimezone(timezone.utc)


def verify_storage_status(statement:Any,keys:Mapping[str,bytes],*,
    expected_archive_id:str,expected_challenge:str,
    expected_handoff_id:str,expected_incident_sequence:int,
    expected_incident_head_sha256:str,expected_conflict_sha256:str,
    expected_evidence_sha256:str,now:datetime|None=None,
)->bool:
    """Verify one signed, challenge-bound, fresh remote storage-status claim."""
    try:
        if not isinstance(statement,dict) or set(statement)!={"payload","signer_id","signature"}:
            return False
        p=statement["payload"]
        if not isinstance(p,dict) or set(p)!=FIELDS:
            return False
        if (type(p["version"]) is not int or p["version"]!=1
            or p["scope"]!=SCOPE or p["go13"]!="HOLD"
            or p["storage_state"]!="STORAGE_VERIFIED"):
            return False
        if (not isinstance(expected_archive_id,str) or not expected_archive_id
            or type(expected_incident_sequence) is not int
            or expected_incident_sequence<1
            or _base64(expected_challenge) is None
            or not all(_hex(x) for x in (
                expected_handoff_id,expected_incident_head_sha256,
                expected_conflict_sha256,expected_evidence_sha256
            ))):
            return False
        for key,expected in (
            ("archive_id",expected_archive_id),("challenge",expected_challenge),
            ("handoff_id",expected_handoff_id),
            ("incident_sequence",expected_incident_sequence),
            ("incident_head_sha256",expected_incident_head_sha256),
            ("conflict_sha256",expected_conflict_sha256),
            ("evidence_sha256",expected_evidence_sha256)
        ):
            if p[key]!=expected or (key=="incident_sequence" and type(p[key]) is not int):
                return False
        timestamp=_timestamp(p["verified_at"])
        expiry=_timestamp(p["expires_at"])
        current=datetime.now(timezone.utc) if now is None else now
        if not isinstance(current,datetime) or current.utcoffset() is None:
            return False
        if not (timestamp<=current.astimezone(timezone.utc)<expiry
                and timedelta(0)<expiry-timestamp<=MAX_AGE):
            return False
        signer=statement["signer_id"]
        if signer!=expected_archive_id or not isinstance(keys,Mapping):
            return False
        public=keys.get(signer)
        if not isinstance(public,bytes) or len(public)!=32:
            return False
        signature=statement["signature"]
        if not isinstance(signature,str) or len(signature)!=86:
            return False
        raw=base64.urlsafe_b64decode(signature+"==")
        if (len(raw)!=64 or
            base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=signature):
            return False
        Ed25519PublicKey.from_public_bytes(public).verify(
            raw,DOMAIN+signer.encode()+b"\x00"+_canonical(p)
        )
        return True
    except (TypeError,ValueError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return False


def inspect_archive_storage(db:sqlite3.Connection,*,
    pinned_custodian_keys:Mapping[str,bytes],
    pinned_archive_keys:Mapping[str,bytes],
    archive_ids:tuple[str,str],incident_sequence:int,
    independently_pinned_incident_head_sha256:str,
    expected_receipt_sequence:int,
    independently_pinned_receipt_head_sha256:str,
    challenge:str,
    fetch_status:Callable[[dict[str,Any]],Any],
    now:datetime|None=None,
)->StorageReview:
    """Cross-check immutable local incident/outbox/receipt chains with two claims.

    All DB state is read in a consistent snapshot, then archive callbacks run
    outside the DB transaction. Callback failures do not authorize anything.
    """
    def deny(state:StorageState,reason:str,count:int=0,evidence:str|None=None)->StorageReview:
        return StorageReview(state,tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))),
                             evidence,None,count)
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or not callable(fetch_status) or _base64(challenge) is None
        or not isinstance(archive_ids,tuple) or len(archive_ids)!=2
        or archive_ids[0]==archive_ids[1]
        or not isinstance(pinned_archive_keys,Mapping)
        or not isinstance(pinned_custodian_keys,Mapping)
        or any(not isinstance(x,str) or not x for x in archive_ids)
        or pinned_archive_keys.get(archive_ids[0])==pinned_archive_keys.get(archive_ids[1])
        or type(incident_sequence) is not int or incident_sequence<1
        or type(expected_receipt_sequence) is not int or expected_receipt_sequence<1
        or not _hex(independently_pinned_incident_head_sha256)
        or not _hex(independently_pinned_receipt_head_sha256)):
        return deny(StorageState.BLOCKED,"INVALID_STATUS_TRUST_INPUT")
    try:
        db.execute("BEGIN")
        incident=_chain(db,pinned_custodian_keys)
        receipts=_chain_receipts(db,pinned_archive_keys)
        if (incident!=(incident_sequence,independently_pinned_incident_head_sha256)
            or receipts is None
            or receipts[0]!=expected_receipt_sequence
            or receipts[1]!=independently_pinned_receipt_head_sha256
            or receipts[2]!=incident_sequence):
            db.rollback()
            return deny(StorageState.BLOCKED,"ARCHIVE_OR_INCIDENT_HEAD_UNVERIFIED")
        row=db.execute("""SELECT conflict_sha256,evidence_json
            FROM rio_v60_incident_events WHERE sequence=?""",(incident_sequence,)).fetchone()
        if row is None or not _hex(row[0]) or not isinstance(row[1],str):
            db.rollback()
            return deny(StorageState.BLOCKED,"INCIDENT_EVIDENCE_MISSING")
        conflict,evidence_json=row
        evidence_sha=hashlib.sha256(evidence_json.encode()).hexdigest()
        entries=db.execute("""SELECT archive_id,handoff_id,request_json
            FROM rio_v62_outbox WHERE incident_sequence=?""",(incident_sequence,)).fetchall()
        if len(entries)!=2 or set(x[0] for x in entries)!=set(archive_ids):
            db.rollback()
            return deny(StorageState.BLOCKED,"HANDOFF_OUTBOX_INCOMPLETE")
        from visitcard_v62_handoff import _request,_id
        ids={}
        for name,hid,request_json in entries:
            expected=_request(incident_sequence,independently_pinned_incident_head_sha256,
                              conflict,name)
            if (hid!=_id(expected) or not isinstance(request_json,str)
                or request_json.encode()!=_canonical(expected)):
                db.rollback()
                return deny(StorageState.BLOCKED,"HANDOFF_OUTBOX_CHANGED")
            ids[name]=hid
            ack=db.execute("SELECT receipt_json FROM rio_v62_ack WHERE handoff_id=?",
                           (hid,)).fetchone()
            if ack is None:
                db.rollback()
                return deny(StorageState.BLOCKED,"ARCHIVE_ACK_NOT_RECORDED")
        db.rollback()
        results=[]
        for name in archive_ids:
            try:
                reply=fetch_status({
                    "archive_id":name,"challenge":challenge,
                    "handoff_id":ids[name],
                    "incident_sequence":incident_sequence,
                    "incident_head_sha256":independently_pinned_incident_head_sha256,
                    "conflict_sha256":conflict,"evidence_sha256":evidence_sha,
                    "go13":"HOLD"
                })
            except Exception:
                results.append((name,None))
                continue
            valid=verify_storage_status(
                reply,pinned_archive_keys,expected_archive_id=name,
                expected_challenge=challenge,expected_handoff_id=ids[name],
                expected_incident_sequence=incident_sequence,
                expected_incident_head_sha256=independently_pinned_incident_head_sha256,
                expected_conflict_sha256=conflict,expected_evidence_sha256=evidence_sha,
                now=now
            )
            results.append((name,reply if valid else None))
        verified=sum(value is not None for _,value in results)
        if verified!=2:
            return deny(StorageState.PARTIAL_QUARANTINED,
                        "MISSING_OR_UNVERIFIED_STORAGE_STATUS",verified,evidence_sha)
        digest=hashlib.sha256(_canonical({
            "version":1,"scope":SCOPE,"challenge":challenge,
            "statements":dict(sorted((name,hashlib.sha256(_canonical(reply)).hexdigest())
                                     for name,reply in results)),
            "incident_sequence":incident_sequence,
            "evidence_sha256":evidence_sha,"go13":"HOLD",
        })).hexdigest()
        return StorageReview(StorageState.VERIFIED_INFORMATIONAL,
                             EXTERNAL_BLOCKERS,evidence_sha,digest,2)
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return deny(StorageState.BLOCKED,"ARCHIVE_STATUS_INSPECTION_FAILED")


def execution_permitted(result:StorageReview)->bool:
    return False
