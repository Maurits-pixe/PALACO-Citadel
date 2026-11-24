"""RIO v5.9 dual-custodian checkpoint comparison and split-view evidence.

Verifies separately signed, externally pinned custody observations and records
their divergence as a deterministic quarantine evidence digest. Neither local
memory nor one custodian's assertion is a trusted external pin source.
This is NOT a deployed independent storage/quorum service. GO-13 HOLD.
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
from visitcard_v58_api_succession import SuccessionReview,SuccessionState
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-V59-DUAL-CUSTODY\x00"
SCOPE="RIO-VISITCARD-V5.9-CHECKPOINT"
MAX_AGE=timedelta(minutes=15)
FIELDS=frozenset({
    "version","scope","repository","sequence","record_sha256",
    "previous_sha256","observed_at","expires_at","go13",
})


class CustodyState(str,Enum):
    UPSTREAM_BLOCKED="UPSTREAM_BLOCKED"
    CUSTODY_BLOCKED="CUSTODY_BLOCKED"
    SPLIT_VIEW_QUARANTINED="SPLIT_VIEW_QUARANTINED"
    MATCHED_INFORMATIONAL="MATCHED_INFORMATIONAL"


@dataclass(frozen=True)
class CustodyReview:
    state:CustodyState
    blockers:tuple[str,...]
    comparison_sha256:str|None=None
    conflict_sha256:str|None=None
    sequence:int|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _time(s:Any)->datetime:
    if not isinstance(s,str):
        raise ValueError("time")
    instant=datetime.fromisoformat(s.replace("Z","+00:00"))
    if instant.utcoffset() is None:
        raise ValueError("timezone")
    return instant.astimezone(timezone.utc)


def _signature(s:Any)->bytes:
    if not isinstance(s,str) or len(s)!=86:
        raise ValueError("signature")
    raw=base64.urlsafe_b64decode(s+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=s:
        raise ValueError("noncanonical")
    return raw


def _verified_observation(
    item:Any, roots:Mapping[str,bytes],pin:str,*,expected_repository:str,
    now:datetime|None,
)->tuple[str,bytes,dict[str,Any],str]|None:
    """Return verified custodian, public key, exact payload and record digest."""
    try:
        if not isinstance(item,dict) or set(item)!={"payload","custodian_id","signature"}:
            return None
        p=item["payload"]
        if not isinstance(p,dict) or set(p)!=FIELDS:
            return None
        if type(p["version"]) is not int or p["version"]!=1 or p["scope"]!=SCOPE:
            return None
        if p["go13"]!="HOLD" or p["repository"]!=expected_repository:
            return None
        if (type(p["sequence"]) is not int or not 1<=p["sequence"]<=100000
            or not _hex(p["record_sha256"]) or not _hex(p["previous_sha256"])):
            return None
        if not _hex(pin):
            return None
        first=_time(p["observed_at"])
        end=_time(p["expires_at"])
        instant=datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant,datetime) or instant.utcoffset() is None:
            return None
        if not (first<=instant.astimezone(timezone.utc)<end
                and timedelta(0)<end-first<=MAX_AGE):
            return None
        ident=item["custodian_id"]
        if not isinstance(ident,str) or not 1<=len(ident)<=128:
            return None
        public=roots.get(ident)
        if not isinstance(public,bytes) or len(public)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(public).verify(
            _signature(item["signature"]),
            DOMAIN+ident.encode("utf-8")+b"\x00"+_canonical(p)
        )
        digest=hashlib.sha256(_canonical(item)).hexdigest()
        if digest!=pin:
            return None
        return ident,public,p,digest
    except (TypeError,ValueError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def compare_custodian_checkpoints(
    upstream:SuccessionReview,*,observations:Any,
    pinned_custodian_keys:Mapping[str,bytes],
    independently_pinned_observation_sha256:Mapping[str,str],
    expected_custodian_ids:tuple[str,str],
    expected_repository:str,expected_previous_sha256:str,
    expected_min_sequence:int,now:datetime|None=None,
)->CustodyReview:
    """Two independently pinned observations; mismatch quarantines, never resolves."""
    def denied(state:CustodyState,reason:str,comparison:str|None=None,
               conflict:str|None=None,sequence:int|None=None)->CustodyReview:
        return CustodyReview(state,tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))),
                             comparison,conflict,sequence)
    if (not isinstance(upstream,SuccessionReview)
        or upstream.state!=SuccessionState.PINNED_INFORMATIONAL
        or not _hex(upstream.record_sha256) or type(upstream.sequence) is not int):
        return denied(CustodyState.UPSTREAM_BLOCKED,"SIGNED_SUCCESSION_UNVERIFIED")
    if (not isinstance(expected_custodian_ids,tuple) or len(expected_custodian_ids)!=2
        or any(not isinstance(x,str) or not 0<len(x)<=128 for x in expected_custodian_ids)
        or expected_custodian_ids[0]==expected_custodian_ids[1]
        or not isinstance(expected_repository,str) or not 1<=len(expected_repository)<=128
        or not _hex(expected_previous_sha256)
        or type(expected_min_sequence) is not int or expected_min_sequence<1
        or not isinstance(observations,(tuple,list)) or len(observations)!=2
        or not isinstance(pinned_custodian_keys,Mapping)
        or not isinstance(independently_pinned_observation_sha256,Mapping)
        or set(independently_pinned_observation_sha256)!=set(expected_custodian_ids)):
        return denied(CustodyState.CUSTODY_BLOCKED,"INCOMPLETE_INDEPENDENT_CUSTODY_INPUT")
    verified=[]
    for idx,ident in enumerate(expected_custodian_ids):
        item=observations[idx]
        if not isinstance(item,dict) or item.get("custodian_id")!=ident:
            return denied(CustodyState.CUSTODY_BLOCKED,"CUSTODIAN_IDENTITY_MISMATCH")
        result=_verified_observation(
            item,pinned_custodian_keys,
            independently_pinned_observation_sha256[ident],
            expected_repository=expected_repository,now=now
        )
        if result is None:
            return denied(CustodyState.CUSTODY_BLOCKED,"CUSTODIAN_SIGNATURE_OR_PIN_INVALID")
        verified.append(result)
    left,right=verified
    if left[1]==right[1]:
        return denied(CustodyState.CUSTODY_BLOCKED,"CUSTODIAN_PUBLIC_KEY_REUSED")
    a,b=left[2],right[2]
    comparison=hashlib.sha256(_canonical({
        "version":1,"scope":SCOPE,"repository":expected_repository,
        "custodians":sorted([left[0],right[0]]),
        "observation_sha256":dict(sorted([(left[0],left[3]),(right[0],right[3])])),
        "go13":"HOLD"
    })).hexdigest()
    # A valid conflict is evidence, not permission to adjudicate which peer is right.
    if (a["sequence"]!=b["sequence"]
        or a["record_sha256"]!=b["record_sha256"]
        or a["previous_sha256"]!=b["previous_sha256"]):
        conflict=hashlib.sha256(_canonical({
            "version":1,"type":"SPLIT_VIEW","comparison_sha256":comparison,
            "heads":sorted([
                {"custodian":left[0],"sequence":a["sequence"],
                 "record_sha256":a["record_sha256"],
                 "previous_sha256":a["previous_sha256"]},
                {"custodian":right[0],"sequence":b["sequence"],
                 "record_sha256":b["record_sha256"],
                 "previous_sha256":b["previous_sha256"]},
            ],key=lambda h:h["custodian"]),
            "go13":"HOLD"
        })).hexdigest()
        return denied(CustodyState.SPLIT_VIEW_QUARANTINED,
                      "SIGNED_CUSTODIAN_HEADS_DIVERGE",comparison,conflict)
    if (a["sequence"]!=upstream.sequence or a["record_sha256"]!=upstream.record_sha256
        or a["previous_sha256"]!=expected_previous_sha256
        or a["sequence"]<expected_min_sequence):
        return denied(CustodyState.CUSTODY_BLOCKED,
                      "STALE_OR_UNEXPECTED_CHECKPOINT",comparison)
    return CustodyReview(CustodyState.MATCHED_INFORMATIONAL,EXTERNAL_BLOCKERS,
                         comparison,None,a["sequence"])


def execution_permitted(result:CustodyReview)->bool:
    return False
