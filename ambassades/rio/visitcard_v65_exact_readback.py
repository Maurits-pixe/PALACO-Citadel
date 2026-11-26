"""RIO v6.5 exact-byte dual archive read-back review — GO-13 HOLD.

Checks challenge-bound v6.4 signed storage-status claims and then requests
the original incident evidence bytes from both archive read-back adapters.
Bytes must match the verified v6.0 canonical SQLite record byte-for-byte.
The callback is a trusted integration boundary, NOT authenticated remote
transport or independent external retention proof. No authority granted.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import hashlib
import sqlite3
from typing import Any,Callable,Mapping

from visitcard_release_review import _hex
from visitcard_v60_incident_ledger import _chain,MAX_PAYLOAD
from visitcard_v61_archive_receipts import _chain_receipts
from visitcard_v64_archive_status import (
    StorageState,inspect_archive_storage,_base64,
)
from visitcard_v5_security_review import EXTERNAL_BLOCKERS

MAX_READBACK=MAX_PAYLOAD


class ReadbackState(str,Enum):
    UPSTREAM_BLOCKED="UPSTREAM_BLOCKED"
    READBACK_INCOMPLETE="READBACK_INCOMPLETE"
    READBACK_CONFLICT_QUARANTINED="READBACK_CONFLICT_QUARANTINED"
    VERIFIED_INFORMATIONAL="VERIFIED_INFORMATIONAL"


@dataclass(frozen=True)
class ReadbackReview:
    state:ReadbackState
    blockers:tuple[str,...]
    evidence_sha256:str|None=None
    archive_count:int=0
    verification_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def inspect_exact_archive_readback(db:sqlite3.Connection,*,
    pinned_custodian_keys:Mapping[str,bytes],
    pinned_archive_keys:Mapping[str,bytes],
    archive_ids:tuple[str,str],incident_sequence:int,
    independently_pinned_incident_head_sha256:str,
    expected_receipt_sequence:int,
    independently_pinned_receipt_head_sha256:str,
    challenge:str,
    fetch_status:Callable[[dict[str,Any]],Any],
    fetch_evidence:Callable[[dict[str,Any]],Any],
    now:Any=None,
)->ReadbackReview:
    """Read back both archive objects only after verified signed status.

    Require a pinned local snapshot again before byte comparison, so caller
    cannot replace the local file unnoticed between status and readback.
    A fresh cryptographically random challenge is caller responsibility.
    """
    def deny(state:ReadbackState,reason:str,count:int=0,
             evidence:str|None=None)->ReadbackReview:
        return ReadbackReview(
            state,tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))),
            evidence,count,
        )
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or not callable(fetch_status) or not callable(fetch_evidence)
        or _base64(challenge) is None
        or not isinstance(archive_ids,tuple) or len(archive_ids)!=2
        or archive_ids[0]==archive_ids[1]
        or type(incident_sequence) is not int or incident_sequence<1
        or type(expected_receipt_sequence) is not int or expected_receipt_sequence<1
        or not _hex(independently_pinned_incident_head_sha256)
        or not _hex(independently_pinned_receipt_head_sha256)):
        return deny(ReadbackState.UPSTREAM_BLOCKED,"INVALID_READBACK_INPUT")
    upstream=inspect_archive_storage(
        db,pinned_custodian_keys=pinned_custodian_keys,
        pinned_archive_keys=pinned_archive_keys,
        archive_ids=archive_ids,incident_sequence=incident_sequence,
        independently_pinned_incident_head_sha256=independently_pinned_incident_head_sha256,
        expected_receipt_sequence=expected_receipt_sequence,
        independently_pinned_receipt_head_sha256=independently_pinned_receipt_head_sha256,
        challenge=challenge,fetch_status=fetch_status,now=now,
    )
    if upstream.state!=StorageState.VERIFIED_INFORMATIONAL:
        return deny(ReadbackState.UPSTREAM_BLOCKED,
                    "SIGNED_ARCHIVE_STORAGE_STATUS_NOT_VERIFIED")
    try:
        db.execute("BEGIN")
        incident=_chain(db,pinned_custodian_keys)
        receipts=_chain_receipts(db,pinned_archive_keys)
        row=db.execute("""SELECT conflict_sha256,evidence_json FROM
            rio_v60_incident_events WHERE sequence=?""",
            (incident_sequence,)).fetchone()
        if (incident!=(incident_sequence,independently_pinned_incident_head_sha256)
            or receipts!=(expected_receipt_sequence,
                          independently_pinned_receipt_head_sha256,incident_sequence)
            or row is None or len(row)!=2 or not _hex(row[0])
            or not isinstance(row[1],str)):
            db.rollback()
            return deny(ReadbackState.UPSTREAM_BLOCKED,"PINNED_EVIDENCE_HEAD_CHANGED")
        original=row[1].encode("utf-8")
        conflict=row[0]
        db.rollback()
        if not 0<len(original)<=MAX_READBACK:
            return deny(ReadbackState.UPSTREAM_BLOCKED,"INVALID_ORIGINAL_BYTES")
        digest=hashlib.sha256(original).hexdigest()
        if digest!=upstream.evidence_sha256:
            return deny(ReadbackState.UPSTREAM_BLOCKED,"STATUS_AND_BYTES_MISMATCH")
        count=0
        for archive in archive_ids:
            request={
                "version":1,"archive_id":archive,
                "challenge":challenge,"incident_sequence":incident_sequence,
                "incident_head_sha256":independently_pinned_incident_head_sha256,
                "conflict_sha256":conflict,"evidence_sha256":digest,
                "max_bytes":MAX_READBACK,"go13":"HOLD",
            }
            try:
                retrieved=fetch_evidence(request)
            except Exception:
                return deny(ReadbackState.READBACK_INCOMPLETE,
                            "ARCHIVE_READBACK_UNAVAILABLE",count,digest)
            if type(retrieved) is not bytes or not 0<len(retrieved)<=MAX_READBACK:
                return deny(ReadbackState.READBACK_INCOMPLETE,
                            "ARCHIVE_READBACK_MISSING_OR_OVERSIZED",count,digest)
            if retrieved!=original:
                return deny(ReadbackState.READBACK_CONFLICT_QUARANTINED,
                            "ARCHIVE_BYTES_DIVERGE_FROM_ORIGINAL",count,digest)
            count+=1
        verification=hashlib.sha256(
            b"PALACO-RIO-V65-EXACT-READBACK\x00"+
            archive_ids[0].encode()+b"\x00"+archive_ids[1].encode()+b"\x00"+
            challenge.encode()+b"\x00"+
            bytes.fromhex(upstream.verification_sha256)+
            bytes.fromhex(digest)
        ).hexdigest()
        return ReadbackReview(ReadbackState.VERIFIED_INFORMATIONAL,
                              EXTERNAL_BLOCKERS,digest,2,verification)
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return deny(ReadbackState.UPSTREAM_BLOCKED,"READBACK_INSPECTION_FAILED")


def execution_permitted(result:ReadbackReview)->bool:
    return False
