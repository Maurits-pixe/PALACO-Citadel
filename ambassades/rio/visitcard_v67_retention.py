"""RIO v6.7 signed retention checkpoints and periodic readback continuity.

This verifier processes two separately signed archive RETENTION_PRESENT claims
bound to a previously verified v6.5 exact-byte readback fingerprint, epoch,
retention deadline and caller-supplied independent predecessor pin. It does
NOT schedule scans, prove external physical retention, or persist latest pins.
GO-13 DRAFT/HOLD/DENY. No activation path.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime,timedelta,timezone
from enum import Enum
import hashlib
from typing import Any,Mapping
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from visitcard_release_review import _hex
from visitcard_v65_exact_readback import ReadbackReview,ReadbackState
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-V67-ARCHIVE-RETENTION\x00"
SCOPE="RIO-VISITCARD-V6.7-RETENTION"
GENESIS=hashlib.sha256(b"PALACO-RIO-V67-RETENTION-GENESIS").hexdigest()
MAX_WINDOW=timedelta(minutes=15)
FIELDS=frozenset({
    "version","scope","archive_id","epoch","previous_sha256",
    "evidence_sha256","readback_sha256","retained_until",
    "observed_at","expires_at","state","go13"
})


class RetentionState(str,Enum):
    UPSTREAM_BLOCKED="UPSTREAM_BLOCKED"
    RETENTION_BLOCKED="RETENTION_BLOCKED"
    RETENTION_CONFLICT_QUARANTINED="RETENTION_CONFLICT_QUARANTINED"
    VERIFIED_INFORMATIONAL="VERIFIED_INFORMATIONAL"


@dataclass(frozen=True)
class RetentionReview:
    state:RetentionState
    blockers:tuple[str,...]
    epoch:int|None=None
    checkpoint_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _time(value:Any)->datetime:
    if not isinstance(value,str):
        raise ValueError("time")
    result=datetime.fromisoformat(value.replace("Z","+00:00"))
    if result.utcoffset() is None:
        raise ValueError("timezone")
    return result.astimezone(timezone.utc)


def _sig(value:Any)->bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=value:
        raise ValueError("noncanonical signature")
    return raw


def check_retention_epoch(*,readback:ReadbackReview,
    statements:Any,pinned_archive_keys:Mapping[str,bytes],
    expected_archive_ids:tuple[str,str],expected_epoch:int,
    independently_pinned_previous_sha256:str,
    independently_pinned_current_sha256:str,
    expected_retention_until:datetime,now:datetime|None=None,
)->RetentionReview:
    """Require independent predecessor/current checkpoint pins (never self-pin).

    Signed conflicts are quarantined; malformed or missing proof is blocked.
    The caller must independently protect and monotonically update both pins.
    """
    def deny(state:RetentionState,code:str)->RetentionReview:
        return RetentionReview(state,tuple(sorted(set(EXTERNAL_BLOCKERS+(code,)))))
    if (not isinstance(readback,ReadbackReview)
        or readback.state!=ReadbackState.VERIFIED_INFORMATIONAL
        or readback.archive_count!=2
        or not _hex(readback.evidence_sha256)
        or not _hex(readback.verification_sha256)):
        return deny(RetentionState.UPSTREAM_BLOCKED,"V65_READBACK_NOT_VERIFIED")
    if (not isinstance(statements,(list,tuple)) or len(statements)!=2
        or not isinstance(expected_archive_ids,tuple) or len(expected_archive_ids)!=2
        or any(not isinstance(x,str) or not 1<=len(x)<=128 for x in expected_archive_ids)
        or expected_archive_ids[0]==expected_archive_ids[1]
        or not isinstance(pinned_archive_keys,Mapping)
        or type(expected_epoch) is not int or not 1<=expected_epoch<=1000000
        or not _hex(independently_pinned_previous_sha256)
        or not _hex(independently_pinned_current_sha256)
        or not isinstance(expected_retention_until,datetime)
        or expected_retention_until.utcoffset() is None):
        return deny(RetentionState.RETENTION_BLOCKED,"INVALID_RETENTION_PINS_OR_SCOPE")
    current=datetime.now(timezone.utc) if now is None else now
    if not isinstance(current,datetime) or current.utcoffset() is None:
        return deny(RetentionState.RETENTION_BLOCKED,"UNTRUSTED_CLOCK")
    current=current.astimezone(timezone.utc)
    minimum=expected_retention_until.astimezone(timezone.utc)
    if minimum<=current:
        return deny(RetentionState.RETENTION_BLOCKED,"RETENTION_DEADLINE_ALREADY_PASSED")
    valid=[]
    try:
        for expected_id,statement in zip(expected_archive_ids,statements):
            if (not isinstance(statement,dict)
                or set(statement)!={"payload","signer_id","signature"}
                or statement["signer_id"]!=expected_id):
                return deny(RetentionState.RETENTION_BLOCKED,"MISSING_ARCHIVE_SIGNATURE")
            p=statement["payload"]
            if not isinstance(p,dict) or set(p)!=FIELDS:
                return deny(RetentionState.RETENTION_BLOCKED,"INVALID_RETENTION_PAYLOAD")
            if (type(p["version"]) is not int or p["version"]!=1
                or p["scope"]!=SCOPE or p["go13"]!="HOLD"
                or p["archive_id"]!=expected_id
                or type(p["epoch"]) is not int or p["epoch"]!=expected_epoch
                or p["previous_sha256"]!=independently_pinned_previous_sha256
                or p["evidence_sha256"]!=readback.evidence_sha256
                or p["readback_sha256"]!=readback.verification_sha256):
                return deny(RetentionState.RETENTION_BLOCKED,"RETENTION_LINEAGE_MISMATCH")
            start=_time(p["observed_at"])
            expiry=_time(p["expires_at"])
            deadline=_time(p["retained_until"])
            if (not start<=current<expiry or not timedelta(0)<expiry-start<=MAX_WINDOW
                or deadline<=current):
                return deny(RetentionState.RETENTION_BLOCKED,"STALE_OR_EXPIRED_RETENTION")
            pub=pinned_archive_keys.get(expected_id)
            if not isinstance(pub,bytes) or len(pub)!=32:
                return deny(RetentionState.RETENTION_BLOCKED,"ARCHIVE_KEY_NOT_PINNED")
            Ed25519PublicKey.from_public_bytes(pub).verify(
                _sig(statement["signature"]),
                DOMAIN+expected_id.encode("utf-8")+b"\x00"+_canonical(p)
            )
            valid.append((expected_id,p,pub,statement))
        if valid[0][2]==valid[1][2]:
            return deny(RetentionState.RETENTION_BLOCKED,"ARCHIVE_KEY_REUSE")
        if any(item[1]["state"]!="RETENTION_PRESENT"
               or _time(item[1]["retained_until"])<minimum for item in valid):
            return deny(RetentionState.RETENTION_CONFLICT_QUARANTINED,
                        "SIGNED_ARCHIVE_RETENTION_INSUFFICIENT")
        checkpoint=hashlib.sha256(_canonical({
            "version":1,"scope":SCOPE,"epoch":expected_epoch,
            "previous_sha256":independently_pinned_previous_sha256,
            "archives":dict(sorted(
                (i[0],hashlib.sha256(_canonical(i[3])).hexdigest()) for i in valid
            )),
            "evidence_sha256":readback.evidence_sha256,
            "readback_sha256":readback.verification_sha256,"go13":"HOLD",
        })).hexdigest()
        if checkpoint!=independently_pinned_current_sha256:
            return deny(RetentionState.RETENTION_BLOCKED,"INDEPENDENT_LATEST_PIN_MISMATCH")
        return RetentionReview(RetentionState.VERIFIED_INFORMATIONAL,
                               EXTERNAL_BLOCKERS,expected_epoch,checkpoint)
    except (TypeError,ValueError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return deny(RetentionState.RETENTION_BLOCKED,"INVALID_SIGNED_RETENTION")


def execution_permitted(result:RetentionReview)->bool:
    return False
