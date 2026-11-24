"""RIO v5.4 source-byte CI log custody contract, GO-13 HOLD.

This is OFFLINE verification of separately signed acquisition receipts and
the original log bytes. A signed acquisition claim does NOT itself prove an
authenticated GitHub API/TLS session, GitHub OIDC, or native GitHub artifact
attestation. Upstream trusted acquisition remains an external prerequisite.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime,timedelta,timezone
from enum import Enum
import hashlib
from pathlib import Path
from typing import Any,Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from visitcard_witness_enrollment import _canonical
from visitcard_release_review import _hex
from visitcard_v53_github_run import RunState,inspect_run_bound_provenance
from visitcard_v5_security_review import EXTERNAL_BLOCKERS

DOMAIN=b"PALACO-RIO-V54-LOG-ACQUISITION\x00"
SCOPE="RIO-VISITCARD-V5.4-LOG-ACQUISITION"
MAX_LOG=8*1024*1024
MAX_AGE=timedelta(minutes=15)
FIELDS=frozenset({
    "version","scope","repository","run_id","run_attempt","job_id",
    "workflow_sha","head_sha","log_sha256","log_size_bytes",
    "retrieval_method","retrieved_at","expires_at","go13",
})


class LogState(str,Enum):
    RUN_BLOCKED="RUN_BLOCKED"
    ACQUISITION_BLOCKED="ACQUISITION_BLOCKED"
    REVIEWABLE_INFORMATIONAL="REVIEWABLE_INFORMATIONAL"


@dataclass(frozen=True)
class LogReview:
    state:LogState
    blockers:tuple[str,...]
    log_sha256:str|None
    acquisition_sha256:str|None
    observation_sha256:str|None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _signature(value:Any)->bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature length")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=value:
        raise ValueError("noncanonical signature")
    return raw


def _timestamp(value:Any)->datetime:
    if not isinstance(value,str):
        raise ValueError("timestamp")
    t=datetime.fromisoformat(value.replace("Z","+00:00"))
    if t.utcoffset() is None:
        raise ValueError("timezone mandatory")
    return t.astimezone(timezone.utc)


def verify_acquisition_receipt(receipt:Any,keys:Mapping[str,bytes],*,
    expected_repository:str,expected_run_id:str,expected_run_attempt:int,
    expected_job_id:str,expected_workflow_sha:str,expected_commit_sha:str,
    log_bytes:Any,now:datetime|None=None,
)->str|None:
    """Verify exact signed retrieval claim against actual bounded byte buffer."""
    try:
        if type(log_bytes) is not bytes or not 0<len(log_bytes)<=MAX_LOG:
            return None
        if not isinstance(receipt,dict) or set(receipt)!={"payload","collector_id","signature"}:
            return None
        p=receipt["payload"]
        if not isinstance(p,dict) or set(p)!=FIELDS:
            return None
        if type(p["version"]) is not int or p["version"]!=1 or p["scope"]!=SCOPE:
            return None
        if p["go13"]!="HOLD":
            return None
        if p["retrieval_method"]!="GITHUB_ACTIONS_JOB_LOGS_API":
            return None
        if not isinstance(expected_repository,str) or not 1<=len(expected_repository)<=128:
            return None
        if (not isinstance(expected_run_id,str) or not expected_run_id.isascii()
            or not expected_run_id.isdecimal() or expected_run_id.startswith("0")):
            return None
        if (not isinstance(expected_job_id,str) or not expected_job_id.isascii()
            or not expected_job_id.isdecimal() or expected_job_id.startswith("0")):
            return None
        if type(expected_run_attempt) is not int or expected_run_attempt<1:
            return None
        if not _hex(expected_workflow_sha,40) or not _hex(expected_commit_sha,40):
            return None
        if (p["repository"]!=expected_repository or p["run_id"]!=expected_run_id
            or p["job_id"]!=expected_job_id
            or type(p["run_attempt"]) is not int
            or p["run_attempt"]!=expected_run_attempt
            or p["workflow_sha"]!=expected_workflow_sha
            or p["head_sha"]!=expected_commit_sha):
            return None
        if type(p["log_size_bytes"]) is not int or p["log_size_bytes"]!=len(log_bytes):
            return None
        if p["log_sha256"]!=hashlib.sha256(log_bytes).hexdigest():
            return None
        first=_timestamp(p["retrieved_at"])
        expires=_timestamp(p["expires_at"])
        current=datetime.now(timezone.utc) if now is None else now
        if not isinstance(current,datetime) or current.utcoffset() is None:
            return None
        current=current.astimezone(timezone.utc)
        if not (first<=current<expires and timedelta(0)<expires-first<=MAX_AGE):
            return None
        collector=receipt["collector_id"]
        if not isinstance(collector,str) or not 1<=len(collector)<=128:
            return None
        pub=keys.get(collector)
        if not isinstance(pub,bytes) or len(pub)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(pub).verify(
            _signature(receipt["signature"]),
            DOMAIN+collector.encode()+b"\x00"+_canonical(p)
        )
        return hashlib.sha256(_canonical(receipt)).hexdigest()
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def inspect_log_custody_packet(root:Path,*,
    pinned_source_sha256:Mapping[str,str],expected_commit_sha:str,
    attestations:Any,evidence_bytes:Any,pinned_attestor_keys:Mapping[str,bytes],
    expected_inventory_sha256:str,provenance_claims:Any,
    pinned_provenance_signers:Mapping[str,bytes],
    expected_repository:str,expected_execution_context:Mapping[str,tuple[str,str]],
    observation:Any,pinned_run_observers:Mapping[str,bytes],
    expected_workflow_sha:str,expected_branch:str,expected_run_attempt:int,
    acquisition_receipt:Any,pinned_collectors:Mapping[str,bytes],
    expected_job_id:str,log_bytes:Any,
    now:datetime|None=None,
)->LogReview:
    """Verify v5.3 provenance first; link job logs to exact observed run."""
    def denied(state:LogState,reason:str,obs:str|None=None)->LogReview:
        return LogReview(state,tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))),
                         None,None,obs)
    run=inspect_run_bound_provenance(
        root,pinned_source_sha256=pinned_source_sha256,
        expected_commit_sha=expected_commit_sha,attestations=attestations,
        evidence_bytes=evidence_bytes,pinned_attestor_keys=pinned_attestor_keys,
        expected_inventory_sha256=expected_inventory_sha256,
        provenance_claims=provenance_claims,
        pinned_provenance_signers=pinned_provenance_signers,
        expected_repository=expected_repository,
        expected_execution_context=expected_execution_context,
        observation=observation,pinned_run_observers=pinned_run_observers,
        expected_workflow_sha=expected_workflow_sha,
        expected_branch=expected_branch,
        expected_run_attempt=expected_run_attempt,now=now
    )
    if run.state!=RunState.REVIEWABLE_INFORMATIONAL:
        return denied(LogState.RUN_BLOCKED,"UPSTREAM_GITHUB_OBSERVATION_BLOCKED")
    try:
        run_id=observation["payload"]["run_id"]
        digest=verify_acquisition_receipt(
            acquisition_receipt,pinned_collectors,
            expected_repository=expected_repository,expected_run_id=run_id,
            expected_run_attempt=expected_run_attempt,
            expected_job_id=expected_job_id,expected_workflow_sha=expected_workflow_sha,
            expected_commit_sha=expected_commit_sha,log_bytes=log_bytes,now=now
        )
        if digest is None:
            return denied(LogState.ACQUISITION_BLOCKED,
                          "UNAUTHENTICATED_OR_CHANGED_LOG_BYTES",
                          run.verified_observation_sha256)
        # The run observer and log collector must not use the same public key.
        observer_id=observation["observer_id"]
        collector_id=acquisition_receipt["collector_id"]
        observer_pub=pinned_run_observers.get(observer_id)
        collector_pub=pinned_collectors.get(collector_id)
        if observer_pub==collector_pub:
            return denied(LogState.ACQUISITION_BLOCKED,
                          "RUN_OBSERVER_AND_COLLECTOR_NOT_SEPARATE",
                          run.verified_observation_sha256)
        return LogReview(LogState.REVIEWABLE_INFORMATIONAL,EXTERNAL_BLOCKERS,
                         hashlib.sha256(log_bytes).hexdigest(),digest,
                         run.verified_observation_sha256)
    except (TypeError,KeyError,AttributeError):
        return denied(LogState.ACQUISITION_BLOCKED,"LOG_CONTEXT_INVALID",
                      run.verified_observation_sha256)


def execution_permitted(result:LogReview)->bool:
    return False
