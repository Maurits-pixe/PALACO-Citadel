"""RIO v4.3 offline dossier handoff-chain contract — DRAFT / GO-13 HOLD.

Each receiving custodian signs a content-addressed receipt linked to the
preceding receipt. The verifier requires an OUT-OF-BAND independently retained
latest receipt hash; a self-contained chain cannot attest its own freshness.
Does not upload, deliver, store independently, or grant authority.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from visitcard_witness_enrollment import _canonical
from visitcard_release_review import _hex

DOMAIN=b"PALACO-RIO-DOSSIER-TRANSFER-V1\x00"
ZERO="0"*64
MAX_CHAIN=128


@dataclass(frozen=True)
class TransferAssessment:
    state:str
    blockers:tuple[str,...]
    last_receipt_sha256:str|None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _time(value:Any)->datetime:
    if not isinstance(value,str):
        raise ValueError("timestamp")
    parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
    if parsed.utcoffset() is None:
        raise ValueError("naive timestamp")
    return parsed.astimezone(timezone.utc)


def _signature(value:Any)->bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature format")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=value:
        raise ValueError("noncanonical signature")
    return raw


def transfer_receipt_digest(receipt:Any)->str|None:
    try:
        if not isinstance(receipt,dict) or set(receipt)!={"payload","custodian_id","signature"}:
            return None
        return hashlib.sha256(_canonical(receipt)).hexdigest()
    except (ValueError,TypeError,OverflowError):
        return None


def verify_transfer_receipt(
    receipt:Any,
    pinned_custodians:Mapping[str,bytes],
    *,
    expected_dossier_sha256:str,
    expected_commit_sha:str,
    expected_sequence:int,
    expected_previous_sha256:str,
    now:datetime|None=None
)->str|None:
    """Verify an exact signed handoff to a separately pinned receiving key."""
    try:
        if not isinstance(receipt,dict) or set(receipt)!={"payload","custodian_id","signature"}:
            return None
        p=receipt["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","commit_sha","dossier_sha256","sequence",
            "previous_receipt_sha256","received_at","go13"
        }:
            return None
        if type(p["version"]) is not int or p["version"]!=1 or p["go13"]!="HOLD":
            return None
        if not _hex(expected_commit_sha,40) or p["commit_sha"]!=expected_commit_sha:
            return None
        if not _hex(expected_dossier_sha256) or p["dossier_sha256"]!=expected_dossier_sha256:
            return None
        if type(expected_sequence) is not int or not 1<=expected_sequence<=MAX_CHAIN:
            return None
        if type(p["sequence"]) is not int or p["sequence"]!=expected_sequence:
            return None
        if not _hex(expected_previous_sha256) or p["previous_receipt_sha256"]!=expected_previous_sha256:
            return None
        received=_time(p["received_at"])
        current=datetime.now(timezone.utc) if now is None else now
        if not isinstance(current,datetime) or current.utcoffset() is None:
            return None
        # Offline receipt time is evidence of a signer claim, not trusted time.
        if received>current.astimezone(timezone.utc):
            return None
        custodian=receipt["custodian_id"]
        if not isinstance(custodian,str) or not 0<len(custodian)<=128:
            return None
        key=pinned_custodians.get(custodian)
        if not isinstance(key,bytes) or len(key)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(key).verify(
            _signature(receipt["signature"]),
            DOMAIN+custodian.encode()+b"\x00"+_canonical(p)
        )
        return transfer_receipt_digest(receipt)
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def verify_dossier_handoff(
    receipts:Any,
    pinned_custodians:Mapping[str,bytes],
    *,
    expected_dossier_sha256:str,
    expected_commit_sha:str,
    independently_pinned_latest_receipt_sha256:str,
    now:datetime|None=None
)->TransferAssessment:
    """Fail closed on missing, reordered or rolled-back receipt histories."""
    def denied(reason:str)->TransferAssessment:
        return TransferAssessment("BLOCKED",(reason,),None)
    if not isinstance(receipts,(tuple,list)) or not 1<=len(receipts)<=MAX_CHAIN:
        return denied("CHAIN_MISSING_OR_OVERSIZED")
    if not isinstance(pinned_custodians,Mapping) or not pinned_custodians:
        return denied("UNPINNED_CUSTODIANS")
    if not _hex(independently_pinned_latest_receipt_sha256):
        return denied("LATEST_HEAD_NOT_INDEPENDENTLY_PINNED")
    previous=ZERO
    seen_ids=set()
    seen_keys=set()
    for index,receipt in enumerate(receipts,1):
        digest=verify_transfer_receipt(
            receipt,pinned_custodians,expected_dossier_sha256=expected_dossier_sha256,
            expected_commit_sha=expected_commit_sha,expected_sequence=index,
            expected_previous_sha256=previous,now=now,
        )
        if digest is None:
            return denied("INVALID_OR_DISCONTINUOUS_RECEIPT")
        cid=receipt["custodian_id"]
        key=pinned_custodians[cid]
        if cid in seen_ids or key in seen_keys:
            return denied("CUSTODIAN_INDEPENDENCE_CLAIM_CONFLICT")
        seen_ids.add(cid)
        seen_keys.add(key)
        previous=digest
    if previous!=independently_pinned_latest_receipt_sha256:
        return denied("STALE_OR_SUBSTITUTED_LATEST_HEAD")
    return TransferAssessment("CHAIN_MATCHED_INFORMATIONAL",(),previous)


def execution_permitted(result:TransferAssessment)->bool:
    return False
