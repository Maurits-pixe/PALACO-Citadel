"""RIO VisitCard v5.3 signed GitHub run-observation contract — GO-13 HOLD.

Only checks an independently pinned observer's Ed25519 signature over a
GitHub Actions metadata OBSERVATION. It does not fetch GitHub APIs, validate
GitHub OIDC JWTs, prove the observer actually queried GitHub, or authenticate
the runner. Real GitHub-authenticated input must be provisioned separately.
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

from visitcard_release_review import _hex
from visitcard_witness_enrollment import _canonical
from visitcard_v52_provenance import inspect_provenance_packet,ProvenanceState
from visitcard_v5_security_review import EXTERNAL_BLOCKERS

DOMAIN=b"PALACO-RIO-V53-GITHUB-RUN-OBSERVATION\x00"
SCOPE="RIO-VISITCARD-V5.3-RUN-OBSERVATION"
MAX_AGE=timedelta(minutes=15)
FIELDS=frozenset({
    "version","scope","repository","workflow_path","event","head_branch",
    "run_id","run_attempt","run_status","run_conclusion",
    "head_sha","workflow_sha","run_url","artifact_sha256",
    "checked_at","expires_at","go13",
})


class RunState(str,Enum):
    PROVENANCE_BLOCKED="PROVENANCE_BLOCKED"
    RUN_OBSERVATION_BLOCKED="RUN_OBSERVATION_BLOCKED"
    REVIEWABLE_INFORMATIONAL="REVIEWABLE_INFORMATIONAL"


@dataclass(frozen=True)
class RunReview:
    state:RunState
    blockers:tuple[str,...]
    verified_observation_sha256:str|None
    provenance_sha256:str|None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _timestamp(value:Any)->datetime:
    if not isinstance(value,str):
        raise ValueError("invalid timestamp")
    when=datetime.fromisoformat(value.replace("Z","+00:00"))
    if when.utcoffset() is None:
        raise ValueError("naive timestamp")
    return when.astimezone(timezone.utc)


def _sig(value:Any)->bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature length")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode()!=value:
        raise ValueError("noncanonical signature")
    return raw


def verify_signed_run_observation(
    observation:Any,keys:Mapping[str,bytes],*,
    expected_repository:str,expected_workflow_path:str,
    expected_branch:str,expected_run_id:str,
    expected_run_attempt:int,expected_commit_sha:str,
    expected_workflow_sha:str,expected_artifact_sha256:str,
    now:datetime|None=None,
)->str|None:
    """Require signed exact GitHub metadata from a separately pinned observer."""
    try:
        if not isinstance(observation,dict) or set(observation)!={"payload","observer_id","signature"}:
            return None
        p=observation["payload"]
        if not isinstance(p,dict) or set(p)!=FIELDS:
            return None
        if type(p["version"]) is not int or p["version"]!=1 or p["scope"]!=SCOPE:
            return None
        if p["go13"]!="HOLD" or p["event"] not in ("push","pull_request"):
            return None
        if p["run_status"]!="completed" or p["run_conclusion"]!="success":
            return None
        if not isinstance(expected_repository,str) or not 1<=len(expected_repository)<=128:
            return None
        if not isinstance(expected_workflow_path,str) or not expected_workflow_path.startswith(".github/workflows/"):
            return None
        if not isinstance(expected_branch,str) or not 1<=len(expected_branch)<=128:
            return None
        if (p["repository"]!=expected_repository or
            p["workflow_path"]!=expected_workflow_path or
            p["head_branch"]!=expected_branch):
            return None
        if (not isinstance(expected_run_id,str) or not expected_run_id.isascii() or
            not expected_run_id.isdecimal() or expected_run_id.startswith("0")):
            return None
        if p["run_id"]!=expected_run_id:
            return None
        if (type(expected_run_attempt) is not int or expected_run_attempt<1 or
            type(p["run_attempt"]) is not int or p["run_attempt"]!=expected_run_attempt):
            return None
        if (not _hex(expected_commit_sha,40) or not _hex(expected_workflow_sha,40) or
            not _hex(expected_artifact_sha256)):
            return None
        if (p["head_sha"]!=expected_commit_sha or
            p["workflow_sha"]!=expected_workflow_sha or
            p["artifact_sha256"]!=expected_artifact_sha256):
            return None
        if p["run_url"]!=(
            "https://github.com/"+expected_repository+"/actions/runs/"+expected_run_id
        ):
            return None
        issued=_timestamp(p["checked_at"])
        expires=_timestamp(p["expires_at"])
        current=datetime.now(timezone.utc) if now is None else now
        if not isinstance(current,datetime) or current.utcoffset() is None:
            return None
        current=current.astimezone(timezone.utc)
        if not (issued<=current<expires and timedelta(0)<expires-issued<=MAX_AGE):
            return None
        observer=observation["observer_id"]
        if not isinstance(observer,str) or not 1<=len(observer)<=128:
            return None
        pub=keys.get(observer)
        if not isinstance(pub,bytes) or len(pub)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(pub).verify(
            _sig(observation["signature"]),
            DOMAIN+observer.encode()+b"\x00"+_canonical(p)
        )
        return hashlib.sha256(_canonical(observation)).hexdigest()
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def inspect_run_bound_provenance(root:Path,*,
    pinned_source_sha256:Mapping[str,str],expected_commit_sha:str,
    attestations:Any,evidence_bytes:Any,pinned_attestor_keys:Mapping[str,bytes],
    expected_inventory_sha256:str,provenance_claims:Any,
    pinned_provenance_signers:Mapping[str,bytes],
    expected_repository:str,expected_execution_context:Mapping[str,tuple[str,str]],
    observation:Any,pinned_run_observers:Mapping[str,bytes],
    expected_workflow_sha:str,expected_branch:str,expected_run_attempt:int,
    now:datetime|None=None,
)->RunReview:
    """Link v5.2 verified CI evidence bytes and claim to pinned run observation."""
    def blocked(state:RunState,reason:str,provenance:str|None=None)->RunReview:
        return RunReview(state,tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))),None,provenance)
    provenance=inspect_provenance_packet(
        root,pinned_source_sha256=pinned_source_sha256,
        expected_commit_sha=expected_commit_sha,attestations=attestations,
        evidence_bytes=evidence_bytes,pinned_attestor_keys=pinned_attestor_keys,
        expected_inventory_sha256=expected_inventory_sha256,
        provenance_claims=provenance_claims,
        pinned_provenance_signers=pinned_provenance_signers,
        expected_repository=expected_repository,
        expected_execution_context=expected_execution_context,
        now=now
    )
    if provenance.state!=ProvenanceState.REVIEWABLE_INFORMATIONAL:
        return blocked(RunState.PROVENANCE_BLOCKED,"SIGNED_PROVENANCE_INVALID")
    try:
        ci=[c for c in provenance_claims if c["payload"]["category"]=="CI_ZERO_SKIP"]
        if len(ci)!=1 or not isinstance(evidence_bytes,Mapping):
            return blocked(RunState.RUN_OBSERVATION_BLOCKED,"CI_PROVENANCE_MISSING",
                           provenance.provenance_sha256)
        p=ci[0]["payload"]
        expected_reference=expected_execution_context["CI_ZERO_SKIP"][0]
        if (p["execution_ref"]!=expected_reference or
            type(p["execution_attempt"]) is not int or
            p["execution_attempt"]!=expected_run_attempt):
            return blocked(RunState.RUN_OBSERVATION_BLOCKED,"RUN_ATTEMPT_DIVERGES",
                           provenance.provenance_sha256)
        digest=hashlib.sha256(evidence_bytes["CI_ZERO_SKIP"]).hexdigest()
        verified=verify_signed_run_observation(
            observation,pinned_run_observers,
            expected_repository=expected_repository,
            expected_workflow_path=expected_reference,
            expected_branch=expected_branch,
            expected_run_id=p["execution_id"],
            expected_run_attempt=expected_run_attempt,
            expected_commit_sha=expected_commit_sha,
            expected_workflow_sha=expected_workflow_sha,
            expected_artifact_sha256=digest,now=now
        )
        if verified is None:
            return blocked(RunState.RUN_OBSERVATION_BLOCKED,"RUN_METADATA_NOT_AUTHENTICATED",
                           provenance.provenance_sha256)
        return RunReview(RunState.REVIEWABLE_INFORMATIONAL,EXTERNAL_BLOCKERS,
                         verified,provenance.provenance_sha256)
    except (TypeError,KeyError,AttributeError,ValueError):
        return blocked(RunState.RUN_OBSERVATION_BLOCKED,"RUN_CONTEXT_MALFORMED",
                       provenance.provenance_sha256)


def execution_permitted(result:RunReview)->bool:
    return False
