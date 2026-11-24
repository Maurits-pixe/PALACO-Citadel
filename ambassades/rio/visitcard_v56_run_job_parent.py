"""RIO VisitCard v5.6 signed parent-run / job-membership evidence.

OFFLINE validation of a separately signed observation. A valid signature
does NOT authenticate the underlying GitHub API call, OIDC identity or
observer's independence. A trusted external acquisition service is still
required. DRAFT / GO-13 HOLD; no release authority.
"""
from __future__ import annotations

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
from visitcard_v55_job_dossier import JobState,inspect_job_evidence,_signature,_time
from visitcard_v5_security_review import EXTERNAL_BLOCKERS

DOMAIN=b"PALACO-RIO-V56-RUN-JOB-PARENT-V1\x00"
SCOPE="RIO-VISITCARD-V5.6-RUN-JOB-PARENT"
FIELDS=frozenset({
    "version","scope","repository","workflow_path","branch","run_id",
    "run_attempt","head_sha","workflow_sha","job_id",
    "job_run_id","job_run_attempt","job_status","job_conclusion",
    "job_dossier_sha256","log_sha256","run_metadata_sha256",
    "job_metadata_sha256","retrieved_at","expires_at","go13",
})
MAX_AGE=timedelta(minutes=15)


class ParentState(str,Enum):
    UPSTREAM_BLOCKED="UPSTREAM_BLOCKED"
    PARENT_LINK_BLOCKED="PARENT_LINK_BLOCKED"
    REVIEWABLE_INFORMATIONAL="REVIEWABLE_INFORMATIONAL"


@dataclass(frozen=True)
class ParentReview:
    state:ParentState
    blockers:tuple[str,...]
    relationship_sha256:str|None
    job_dossier_sha256:str|None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def verify_parent_link(link:Any,roots:Mapping[str,bytes],*,
    expected_repository:str,expected_workflow_path:str,
    expected_branch:str,expected_run_id:str,expected_run_attempt:int,
    expected_job_id:str,expected_commit_sha:str,expected_workflow_sha:str,
    expected_job_dossier_sha256:str,expected_log_sha256:str,
    run_metadata:Any,job_metadata:Any,now:datetime|None=None,
)->str|None:
    """Require exact signed parent association plus two byte-pinned snapshots."""
    try:
        if not isinstance(link,dict) or set(link)!={"payload","observer_id","signature"}:
            return None
        p=link["payload"]
        if not isinstance(p,dict) or set(p)!=FIELDS:
            return None
        if type(p["version"]) is not int or p["version"]!=1 or p["scope"]!=SCOPE or p["go13"]!="HOLD":
            return None
        if (p["job_status"]!="completed" or p["job_conclusion"]!="success"):
            return None
        if not isinstance(expected_repository,str) or not 1<=len(expected_repository)<=128:
            return None
        if (not isinstance(expected_workflow_path,str) or
            not expected_workflow_path.startswith(".github/workflows/") or
            not isinstance(expected_branch,str) or not 1<=len(expected_branch)<=128):
            return None
        for value in (expected_run_id,expected_job_id):
            if (not isinstance(value,str) or not value.isascii() or
                not value.isdecimal() or value.startswith("0")):
                return None
        if type(expected_run_attempt) is not int or not 1<=expected_run_attempt<=100000:
            return None
        if (not _hex(expected_commit_sha,40) or not _hex(expected_workflow_sha,40)
            or not _hex(expected_job_dossier_sha256) or not _hex(expected_log_sha256)):
            return None
        if (p["repository"]!=expected_repository
            or p["workflow_path"]!=expected_workflow_path
            or p["branch"]!=expected_branch
            or p["run_id"]!=expected_run_id
            or p["job_id"]!=expected_job_id
            or p["job_run_id"]!=expected_run_id
            or type(p["run_attempt"]) is not int
            or type(p["job_run_attempt"]) is not int
            or p["run_attempt"]!=expected_run_attempt
            or p["job_run_attempt"]!=expected_run_attempt
            or p["head_sha"]!=expected_commit_sha
            or p["workflow_sha"]!=expected_workflow_sha
            or p["job_dossier_sha256"]!=expected_job_dossier_sha256
            or p["log_sha256"]!=expected_log_sha256):
            return None
        if not isinstance(run_metadata,dict) or not isinstance(job_metadata,dict):
            return None
        if (set(run_metadata)!={"id","run_attempt","head_sha","status","conclusion","repository"}
            or set(job_metadata)!={"id","run_id","run_attempt","status","conclusion"}):
            return None
        if (type(run_metadata["id"]) is not int or str(run_metadata["id"])!=expected_run_id
            or type(run_metadata["run_attempt"]) is not int
            or run_metadata["run_attempt"]!=expected_run_attempt
            or run_metadata["head_sha"]!=expected_commit_sha
            or run_metadata["repository"]!=expected_repository
            or run_metadata["status"]!="completed"
            or run_metadata["conclusion"]!="success"
            or type(job_metadata["id"]) is not int
            or str(job_metadata["id"])!=expected_job_id
            or type(job_metadata["run_id"]) is not int
            or str(job_metadata["run_id"])!=expected_run_id
            or type(job_metadata["run_attempt"]) is not int
            or job_metadata["run_attempt"]!=expected_run_attempt
            or job_metadata["status"]!="completed"
            or job_metadata["conclusion"]!="success"):
            return None
        if (p["run_metadata_sha256"]!=hashlib.sha256(_canonical(run_metadata)).hexdigest()
            or p["job_metadata_sha256"]!=hashlib.sha256(_canonical(job_metadata)).hexdigest()):
            return None
        issued=_time(p["retrieved_at"])
        expires=_time(p["expires_at"])
        instant=datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant,datetime) or instant.utcoffset() is None:
            return None
        if not (issued<=instant.astimezone(timezone.utc)<expires
            and timedelta(0)<expires-issued<=MAX_AGE):
            return None
        observer=link["observer_id"]
        if not isinstance(observer,str) or not 1<=len(observer)<=128:
            return None
        public=roots.get(observer)
        if not isinstance(public,bytes) or len(public)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(public).verify(
            _signature(link["signature"]),
            DOMAIN+observer.encode()+b"\x00"+_canonical(p)
        )
        return hashlib.sha256(_canonical(link)).hexdigest()
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def inspect_parent_evidence(root:Path,*,
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
    parent_link:Any,pinned_parent_observers:Mapping[str,bytes],
    run_metadata:Any,job_metadata:Any,now:datetime|None=None,
)->ParentReview:
    def blocked(state:ParentState,reason:str,dossier:str|None=None)->ParentReview:
        return ParentReview(state,tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))),None,dossier)
    previous=inspect_job_evidence(
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
        expected_job_id=expected_job_id,log_bytes=log_bytes,
        job_dossier=job_dossier,pinned_job_observers=pinned_job_observers,now=now
    )
    if previous.state!=JobState.REVIEWABLE_INFORMATIONAL:
        return blocked(ParentState.UPSTREAM_BLOCKED,"JOB_DOSSIER_INVALID")
    try:
        digest=verify_parent_link(
            parent_link,pinned_parent_observers,
            expected_repository=expected_repository,
            expected_workflow_path=expected_execution_context["CI_ZERO_SKIP"][0],
            expected_branch=expected_branch,
            expected_run_id=observation["payload"]["run_id"],
            expected_run_attempt=expected_run_attempt,
            expected_job_id=expected_job_id,
            expected_commit_sha=expected_commit_sha,
            expected_workflow_sha=expected_workflow_sha,
            expected_job_dossier_sha256=previous.dossier_sha256,
            expected_log_sha256=previous.log_sha256,
            run_metadata=run_metadata,job_metadata=job_metadata,now=now
        )
        if digest is None:
            return blocked(ParentState.PARENT_LINK_BLOCKED,"PARENT_RUN_JOB_MISMATCH",
                           previous.dossier_sha256)
        public=pinned_parent_observers.get(parent_link["observer_id"])
        prior=(
            pinned_run_observers.get(observation["observer_id"]),
            pinned_collectors.get(acquisition_receipt["collector_id"]),
            pinned_job_observers.get(job_dossier["observer_id"]),
        )
        if public in prior:
            return blocked(ParentState.PARENT_LINK_BLOCKED,"PARENT_OBSERVER_KEY_REUSED",
                           previous.dossier_sha256)
        return ParentReview(ParentState.REVIEWABLE_INFORMATIONAL,
                            EXTERNAL_BLOCKERS,digest,previous.dossier_sha256)
    except (KeyError,TypeError,AttributeError,ValueError):
        return blocked(ParentState.PARENT_LINK_BLOCKED,"PARENT_LINK_CONTEXT_INVALID",
                       previous.dossier_sha256)


def execution_permitted(result:ParentReview)->bool:
    return False
