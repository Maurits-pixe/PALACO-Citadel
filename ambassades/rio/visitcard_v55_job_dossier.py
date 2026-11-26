"""RIO VisitCard v5.5 signed job metadata and contiguous log evidence dossier.

Offline, fail-closed verification only. All job metadata remains a claim
signed by an independently pinned observer, not a direct GitHub API response.
No runtime authorization is possible. GO-13 HOLD.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
import hashlib
from pathlib import Path
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from visitcard_release_review import _hex
from visitcard_v54_log_custody import LogState, inspect_log_custody_packet, MAX_LOG
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-V55-JOB-CONTINUITY-V1\x00"
SCOPE="RIO-VISITCARD-V5.5-JOB-CONTINUITY"
MAX_SEGMENTS=128
MAX_AGE=timedelta(minutes=15)
FIELDS=frozenset({
    "version", "scope", "repository", "run_id", "run_attempt", "job_id",
    "head_sha", "workflow_sha", "job_status", "job_conclusion",
    "log_sha256", "log_size_bytes", "segments", "observed_at",
    "expires_at", "go13",
})
SEGMENT_FIELDS=frozenset({"index", "offset", "size_bytes", "sha256", "previous_sha256"})
ZERO="0"*64


class JobState(str,Enum):
    UPSTREAM_BLOCKED="UPSTREAM_BLOCKED"
    JOB_DOSSIER_BLOCKED="JOB_DOSSIER_BLOCKED"
    REVIEWABLE_INFORMATIONAL="REVIEWABLE_INFORMATIONAL"


@dataclass(frozen=True)
class JobReview:
    state:JobState
    blockers:tuple[str,...]
    dossier_sha256:str|None
    log_sha256:str|None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _signature(s:Any)->bytes:
    if not isinstance(s,str) or len(s)!=86:
        raise ValueError("signature length")
    raw=base64.urlsafe_b64decode(s+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=s:
        raise ValueError("noncanonical signature")
    return raw


def _time(s:Any)->datetime:
    if not isinstance(s,str):
        raise ValueError("timestamp")
    t=datetime.fromisoformat(s.replace("Z","+00:00"))
    if t.utcoffset() is None:
        raise ValueError("timezone required")
    return t.astimezone(timezone.utc)


def verify_job_dossier(
    dossier:Any,pinned_job_observers:Mapping[str,bytes],*,
    expected_repository:str,expected_run_id:str,
    expected_run_attempt:int,expected_job_id:str,
    expected_commit_sha:str,expected_workflow_sha:str,
    log_bytes:Any,now:datetime|None=None,
)->str|None:
    """Check signed job claim against every ordered byte of the original log."""
    try:
        if type(log_bytes) is not bytes or not 0<len(log_bytes)<=MAX_LOG:
            return None
        if not isinstance(dossier,dict) or set(dossier)!={"payload","observer_id","signature"}:
            return None
        p=dossier["payload"]
        if not isinstance(p,dict) or set(p)!=FIELDS:
            return None
        if type(p["version"]) is not int or p["version"]!=1 or p["scope"]!=SCOPE:
            return None
        if p["go13"]!="HOLD" or p["job_status"]!="completed" or p["job_conclusion"]!="success":
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
        if not _hex(expected_commit_sha,40) or not _hex(expected_workflow_sha,40):
            return None
        if (p["repository"]!=expected_repository or p["run_id"]!=expected_run_id
            or p["job_id"]!=expected_job_id
            or type(p["run_attempt"]) is not int
            or p["run_attempt"]!=expected_run_attempt
            or p["head_sha"]!=expected_commit_sha
            or p["workflow_sha"]!=expected_workflow_sha):
            return None
        if (type(p["log_size_bytes"]) is not int
            or p["log_size_bytes"]!=len(log_bytes)
            or p["log_sha256"]!=hashlib.sha256(log_bytes).hexdigest()):
            return None
        segments=p["segments"]
        if not isinstance(segments,list) or not 1<=len(segments)<=MAX_SEGMENTS:
            return None
        previous=ZERO
        offset=0
        for i,part in enumerate(segments):
            if not isinstance(part,dict) or set(part)!=SEGMENT_FIELDS:
                return None
            if (type(part["index"]) is not int or part["index"]!=i
                or type(part["offset"]) is not int or part["offset"]!=offset
                or type(part["size_bytes"]) is not int or part["size_bytes"]<1
                or part["previous_sha256"]!=previous):
                return None
            end=offset+part["size_bytes"]
            if end>len(log_bytes):
                return None
            fragment=log_bytes[offset:end]
            if part["sha256"]!=hashlib.sha256(fragment).hexdigest():
                return None
            previous=part["sha256"]
            offset=end
        if offset!=len(log_bytes):
            return None
        observed=_time(p["observed_at"])
        expires=_time(p["expires_at"])
        instant=datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant,datetime) or instant.utcoffset() is None:
            return None
        instant=instant.astimezone(timezone.utc)
        if not (observed<=instant<expires and timedelta(0)<expires-observed<=MAX_AGE):
            return None
        observer=dossier["observer_id"]
        if not isinstance(observer,str) or not 1<=len(observer)<=128:
            return None
        pub=pinned_job_observers.get(observer)
        if not isinstance(pub,bytes) or len(pub)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(pub).verify(
            _signature(dossier["signature"]),
            DOMAIN+observer.encode()+b"\x00"+_canonical(p)
        )
        return hashlib.sha256(_canonical(dossier)).hexdigest()
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def inspect_job_evidence(root:Path,*,
    pinned_source_sha256:Mapping[str,str],expected_commit_sha:str,
    attestations:Any,evidence_bytes:Any,pinned_attestor_keys:Mapping[str,bytes],
    expected_inventory_sha256:str,provenance_claims:Any,
    pinned_provenance_signers:Mapping[str,bytes],
    expected_repository:str,expected_execution_context:Mapping[str,tuple[str,str]],
    observation:Any,pinned_run_observers:Mapping[str,bytes],
    expected_workflow_sha:str,expected_branch:str,expected_run_attempt:int,
    acquisition_receipt:Any,pinned_collectors:Mapping[str,bytes],
    expected_job_id:str,log_bytes:Any,
    job_dossier:Any,pinned_job_observers:Mapping[str,bytes],
    now:datetime|None=None,
)->JobReview:
    """Recheck v5.4 first, then independently signed job-and-segment dossier."""
    def denied(state:JobState,reason:str)->JobReview:
        return JobReview(state,tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))),None,None)
    upstream=inspect_log_custody_packet(
        root,pinned_source_sha256=pinned_source_sha256,
        expected_commit_sha=expected_commit_sha,
        attestations=attestations,evidence_bytes=evidence_bytes,
        pinned_attestor_keys=pinned_attestor_keys,
        expected_inventory_sha256=expected_inventory_sha256,
        provenance_claims=provenance_claims,pinned_provenance_signers=pinned_provenance_signers,
        expected_repository=expected_repository,
        expected_execution_context=expected_execution_context,
        observation=observation,pinned_run_observers=pinned_run_observers,
        expected_workflow_sha=expected_workflow_sha,expected_branch=expected_branch,
        expected_run_attempt=expected_run_attempt,
        acquisition_receipt=acquisition_receipt,pinned_collectors=pinned_collectors,
        expected_job_id=expected_job_id,log_bytes=log_bytes,now=now,
    )
    if upstream.state!=LogState.REVIEWABLE_INFORMATIONAL:
        return denied(JobState.UPSTREAM_BLOCKED,"UPSTREAM_LOG_CUSTODY_INVALID")
    try:
        run_id=observation["payload"]["run_id"]
        digest=verify_job_dossier(
            job_dossier,pinned_job_observers,
            expected_repository=expected_repository,expected_run_id=run_id,
            expected_run_attempt=expected_run_attempt,expected_job_id=expected_job_id,
            expected_commit_sha=expected_commit_sha,
            expected_workflow_sha=expected_workflow_sha,log_bytes=log_bytes,now=now,
        )
        if digest is None:
            return denied(JobState.JOB_DOSSIER_BLOCKED,"JOB_METADATA_OR_LOG_SEGMENTS_INVALID")
        signer_pub=pinned_job_observers.get(job_dossier["observer_id"])
        prior=[pinned_run_observers.get(observation["observer_id"]),
               pinned_collectors.get(acquisition_receipt["collector_id"])]
        if signer_pub in prior:
            return denied(JobState.JOB_DOSSIER_BLOCKED,"JOB_OBSERVER_KEY_NOT_DISTINCT")
        return JobReview(JobState.REVIEWABLE_INFORMATIONAL,EXTERNAL_BLOCKERS,
                         digest,upstream.log_sha256)
    except (TypeError,KeyError,AttributeError,ValueError):
        return denied(JobState.JOB_DOSSIER_BLOCKED,"JOB_CONTEXT_INVALID")


def execution_permitted(result:JobReview)->bool:
    return False
