"""RIO v5.8 independently pinned GitHub API observation succession.

Cryptographic continuity protocol, NOT a remote custodian implementation.
An independently supplied latest checkpoint and signer roots are mandatory.
Verify a signed succession record against exact v5.7 observed API digests;
a local hash chain cannot independently prevent rollback without an external
durable latest pin. All outcomes: GO-13 HOLD, no activation/merge/release.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
import hashlib
from typing import Any,Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from visitcard_v57_github_api import ApiReview,ApiState
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_release_review import _hex
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-V58-API-EVIDENCE-SUCCESSION\x00"
SCOPE="RIO-VISITCARD-V5.8-API-EVIDENCE"
GENESIS=hashlib.sha256(b"PALACO-RIO-V58-API-EVIDENCE-GENESIS").hexdigest()
MAX_AGE=timedelta(minutes=15)
FIELDS=frozenset({
    "version","scope","repository","run_id","run_attempt","job_id",
    "head_sha","workflow_path","sequence","previous_sha256",
    "run_metadata_sha256","job_metadata_sha256","relationship_sha256",
    "observed_at","expires_at","go13",
})


class SuccessionState(str,Enum):
    API_BLOCKED="API_BLOCKED"
    EVIDENCE_BLOCKED="EVIDENCE_BLOCKED"
    PINNED_INFORMATIONAL="PINNED_INFORMATIONAL"


@dataclass(frozen=True)
class SuccessionReview:
    state:SuccessionState
    blockers:tuple[str,...]
    record_sha256:str|None=None
    sequence:int|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _timestamp(s:Any)->datetime:
    if not isinstance(s,str):
        raise ValueError("timestamp")
    result=datetime.fromisoformat(s.replace("Z","+00:00"))
    if result.utcoffset() is None:
        raise ValueError("timezone required")
    return result.astimezone(timezone.utc)


def _signature(value:Any)->bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=value:
        raise ValueError("noncanonical signature")
    return raw


def verify_succession_record(
    record:Any,roots:Mapping[str,bytes],*,
    api_review:ApiReview,expected_repository:str,expected_run_id:int,
    expected_run_attempt:int,expected_job_id:int,
    expected_commit_sha:str,expected_workflow_path:str,
    independently_pinned_previous_sha256:str,expected_sequence:int,
    independently_pinned_record_sha256:str,
    now:datetime|None=None,
)->SuccessionReview:
    """One signed succession step with two INDEPENDENT pinned digests."""
    def blocked(state:SuccessionState,why:str)->SuccessionReview:
        return SuccessionReview(state,tuple(sorted(set(EXTERNAL_BLOCKERS+(why,)))))
    if not isinstance(api_review,ApiReview) or api_review.state!=ApiState.API_OBSERVED_INFORMATIONAL:
        return blocked(SuccessionState.API_BLOCKED,"PREVIOUS_API_ACQUISITION_BLOCKED")
    try:
        if not isinstance(record,dict) or set(record)!={"payload","custodian_id","signature"}:
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"INVALID_RECORD")
        payload=record["payload"]
        if not isinstance(payload,dict) or set(payload)!=FIELDS:
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"INVALID_PAYLOAD")
        if (type(payload["version"]) is not int or payload["version"]!=1
            or payload["scope"]!=SCOPE or payload["go13"]!="HOLD"):
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"INVALID_POLICY")
        if (type(expected_sequence) is not int or not 1<=expected_sequence<=100000
            or type(payload["sequence"]) is not int or payload["sequence"]!=expected_sequence
            or type(expected_run_id) is not int or expected_run_id<1
            or type(expected_run_attempt) is not int or expected_run_attempt<1
            or type(expected_job_id) is not int or expected_job_id<1):
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"INVALID_SEQUENCE_OR_IDS")
        if (not isinstance(expected_repository,str) or not 1<=len(expected_repository)<=128
            or not isinstance(expected_workflow_path,str) or
            not expected_workflow_path.startswith(".github/workflows/")
            or not _hex(expected_commit_sha,40)
            or not _hex(independently_pinned_previous_sha256)
            or not _hex(independently_pinned_record_sha256)):
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"INVALID_EXTERNAL_PINS")
        if (payload["repository"]!=expected_repository
            or type(payload["run_id"]) is not int or payload["run_id"]!=expected_run_id
            or type(payload["run_attempt"]) is not int or
            payload["run_attempt"]!=expected_run_attempt
            or type(payload["job_id"]) is not int or payload["job_id"]!=expected_job_id
            or payload["head_sha"]!=expected_commit_sha
            or payload["workflow_path"]!=expected_workflow_path
            or payload["previous_sha256"]!=independently_pinned_previous_sha256):
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"PREDECESSOR_OR_SCOPE_MISMATCH")
        if (payload["run_metadata_sha256"]!=api_review.run_metadata_sha256
            or payload["job_metadata_sha256"]!=api_review.job_metadata_sha256
            or payload["relationship_sha256"]!=api_review.relationship_sha256
            or any(not _hex(x) for x in (
                api_review.run_metadata_sha256,
                api_review.job_metadata_sha256,
                api_review.relationship_sha256,
            ))):
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"API_EVIDENCE_CHANGED")
        first=_timestamp(payload["observed_at"])
        expires=_timestamp(payload["expires_at"])
        current=datetime.now(timezone.utc) if now is None else now
        if not isinstance(current,datetime) or current.utcoffset() is None:
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"INVALID_NOW")
        if not (first<=current.astimezone(timezone.utc)<expires
            and timedelta(0)<expires-first<=MAX_AGE):
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"EXPIRED_OR_FUTURE_EVIDENCE")
        ident=record["custodian_id"]
        if not isinstance(ident,str) or not 1<=len(ident)<=128:
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"INVALID_CUSTODIAN")
        public=roots.get(ident)
        if not isinstance(public,bytes) or len(public)!=32:
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"UNPINNED_CUSTODIAN")
        Ed25519PublicKey.from_public_bytes(public).verify(
            _signature(record["signature"]),
            DOMAIN+ident.encode("utf-8")+b"\x00"+_canonical(payload)
        )
        digest=hashlib.sha256(_canonical(record)).hexdigest()
        if digest!=independently_pinned_record_sha256:
            return blocked(SuccessionState.EVIDENCE_BLOCKED,"LATEST_RECORD_PIN_MISMATCH")
        return SuccessionReview(SuccessionState.PINNED_INFORMATIONAL,
                                EXTERNAL_BLOCKERS,digest,expected_sequence)
    except (TypeError,ValueError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return blocked(SuccessionState.EVIDENCE_BLOCKED,"SIGNATURE_OR_RECORD_INVALID")


def execution_permitted(result:SuccessionReview)->bool:
    return False
