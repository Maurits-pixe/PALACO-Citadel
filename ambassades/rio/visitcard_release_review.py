"""RIO v4.1 verifiable release review bundle — DRAFT / GO-13 HOLD.

Every review item must bear a signature from an independently pinned review
authority and bind one exact source commit and separate immutable evidence
digest. No evidence is fetched; this module does not verify physical
independence, test the infrastructure, or grant any release authority.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-RELEASE-REVIEW-V1\x00"
REQUIRED=frozenset({
    "CI_ZERO_SKIP","EXTERNAL_CUSTODY","TRUST_PIN_DURABILITY",
    "SECURITY_REVIEW","RUNTIME_INTEGRATION",
})
MAX_LIFETIME=timedelta(days=1)


class ReviewState(str,Enum):
    EVIDENCE_INCOMPLETE="EVIDENCE_INCOMPLETE"
    READY_FOR_HUMAN_REVIEW="READY_FOR_HUMAN_REVIEW"


@dataclass(frozen=True)
class ReleaseReview:
    state: ReviewState
    missing: tuple[str,...]
    policy: str="RIO-VISITCARD-V4.1-GO13-HOLD"
    release_permitted: bool=False
    merge_permitted: bool=False
    activation_permitted: bool=False


def _hex(value:Any, size:int=64)->bool:
    return isinstance(value,str) and len(value)==size and all(c in "0123456789abcdef" for c in value)


def _time(value:Any)->datetime:
    if not isinstance(value,str):
        raise ValueError("invalid time")
    parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("naive time")
    return parsed.astimezone(timezone.utc)


def _signature(value:Any)->bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature length")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=value:
        raise ValueError("noncanonical signature")
    return raw


def verify_review_attestation(
    attestation:Any,pinned_review_keys:Mapping[str,bytes],
    *, expected_commit:str,expected_scope:str,now:datetime|None=None
)->tuple[str,str,str,bytes]|None:
    """Return (category, authority ID, evidence digest, key bytes) if signed."""
    try:
        if not isinstance(attestation,dict) or set(attestation)!={"payload","authority_id","signature"}:
            return None
        p=attestation["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","scope","commit_sha","category","evidence_sha256",
            "result","issued_at","expires_at"
        }:
            return None
        if type(p["version"]) is not int or p["version"]!=1:
            return None
        if not _hex(expected_commit,40) or p["commit_sha"]!=expected_commit:
            return None
        if not isinstance(expected_scope,str) or not 0<len(expected_scope)<=128:
            return None
        if p["scope"]!=expected_scope or p["category"] not in REQUIRED:
            return None
        if p["result"]!="PASS" or not _hex(p["evidence_sha256"]):
            return None
        issued=_time(p["issued_at"])
        expires=_time(p["expires_at"])
        instant=datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant,datetime) or instant.tzinfo is None or instant.utcoffset() is None:
            return None
        if not (issued<=instant.astimezone(timezone.utc)<expires and
                timedelta(0)<expires-issued<=MAX_LIFETIME):
            return None
        aid=attestation["authority_id"]
        if not isinstance(aid,str) or not 0<len(aid)<=128:
            return None
        public=pinned_review_keys.get(aid)
        if not isinstance(public,bytes) or len(public)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(public).verify(
            _signature(attestation["signature"]),
            DOMAIN+aid.encode("utf-8")+b"\x00"+_canonical(p)
        )
        return p["category"],aid,p["evidence_sha256"],public
    except (ValueError,TypeError,AttributeError,KeyError,OverflowError,InvalidSignature):
        return None


def assess_release_review(
    attestations:Any,
    pinned_review_keys:Mapping[str,bytes],
    *,
    expected_commit:str,
    expected_scope:str="RIO-VISITCARD-V4.1",
    now:datetime|None=None,
)->ReleaseReview:
    """A complete signed review pack is never authority to merge or deploy."""
    incomplete=ReleaseReview(ReviewState.EVIDENCE_INCOMPLETE,tuple(sorted(REQUIRED)))
    if not isinstance(attestations,(tuple,list)) or len(attestations)!=len(REQUIRED):
        return incomplete
    if not isinstance(pinned_review_keys,Mapping):
        return incomplete
    found={}
    ids=set()
    keys=set()
    hashes=set()
    for item in attestations:
        verified=verify_review_attestation(
            item,pinned_review_keys,
            expected_commit=expected_commit,expected_scope=expected_scope,now=now
        )
        if verified is None:
            return incomplete
        category,authority_id,evidence_sha,public=verified
        if category in found or authority_id in ids or public in keys or evidence_sha in hashes:
            return incomplete
        found[category]=True
        ids.add(authority_id)
        keys.add(public)
        hashes.add(evidence_sha)
    missing=tuple(sorted(REQUIRED.difference(found)))
    state=ReviewState.READY_FOR_HUMAN_REVIEW if not missing else ReviewState.EVIDENCE_INCOMPLETE
    return ReleaseReview(state,missing)


def release_permitted(review:ReleaseReview)->bool:
    """GO-13: no automatic authorization on any evidence outcome."""
    return False
