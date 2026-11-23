"""RIO v4.2 deterministic release dossier and evidence integrity — DRAFT / HOLD.

Offline review artifact only. Never synthesizes attestations or implies
independent custody. Evidence bytes are supplied by the reviewer; the
module verifies digest binding and produces a reproducible canonical
manifest. A complete dossier is not an approval or deployment permit.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
import hashlib
from typing import Any,Mapping

from visitcard_release_review import (
    REQUIRED,ReviewState,assess_release_review,_hex
)
from visitcard_witness_enrollment import _canonical

SCOPE="RIO-VISITCARD-V4.1"
POLICY="RIO-VISITCARD-V4.2-GO13-HOLD"
MAX_ARTIFACT_SIZE=4*1024*1024


class DossierState(str,Enum):
    INCOMPLETE_BLOCKED="INCOMPLETE_BLOCKED"
    READY_FOR_HUMAN_REVIEW="READY_FOR_HUMAN_REVIEW"


@dataclass(frozen=True)
class DossierAssessment:
    state:DossierState
    blockers:tuple[str,...]
    manifest:dict[str,Any]|None
    manifest_sha256:str|None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False
    policy:str=POLICY


def _artifact_entry(category:str,data:bytes)->dict[str,Any]:
    digest=hashlib.sha256(data).hexdigest()
    return {
        "category":category,
        "uri":"sha256:"+digest,
        "sha256":digest,
        "size_bytes":len(data),
    }


def build_release_dossier(
    *,
    commit_sha:str,
    attestations:Any,
    evidence_bytes:Any,
    pinned_review_keys:Mapping[str,bytes],
    scope:str=SCOPE,
    now:datetime|None=None,
)->DossierAssessment:
    """Audit exact bytes, signatures and all five domains before recording.

    On ANY error: no manifest, explicit sorted blockers and permanent HOLD.
    Reviewer-provided bytes are not fetched or claimed to be independently
    authenticated beyond their signed digest. No external trust is fabricated.
    """
    blockers=[]
    if not _hex(commit_sha,40):
        blockers.append("INVALID_COMMIT_SHA")
    if not isinstance(scope,str) or not 0<len(scope)<=128:
        blockers.append("INVALID_SCOPE")
    if not isinstance(pinned_review_keys,Mapping) or not pinned_review_keys:
        blockers.append("UNPINNED_REVIEW_KEYS")
    if not isinstance(evidence_bytes,Mapping):
        blockers.extend("EVIDENCE_MISSING:"+cat for cat in sorted(REQUIRED))
        evidence_bytes={}
    if not isinstance(attestations,(list,tuple)):
        blockers.append("ATTESTATIONS_MISSING")
        attestations=[]
    att_by_cat={}
    for item in attestations:
        try:
            p=item["payload"]
            category=p["category"]
            if not isinstance(category,str) or category not in REQUIRED:
                blockers.append("ATTESTATION_UNRECOGNIZED")
                continue
            if category in att_by_cat:
                blockers.append("ATTESTATION_DUPLICATE:"+category)
            else:
                att_by_cat[category]=item
        except (KeyError,TypeError,AttributeError):
            blockers.append("ATTESTATION_MALFORMED")
    if len(attestations)!=len(REQUIRED):
        blockers.append("ATTESTATION_COUNT_MISMATCH")

    entries=[]
    for category in sorted(REQUIRED):
        item=att_by_cat.get(category)
        if item is None:
            blockers.append("ATTESTATION_MISSING:"+category)
        data=evidence_bytes.get(category)
        if type(data) is not bytes or not 0<len(data)<=MAX_ARTIFACT_SIZE:
            blockers.append("EVIDENCE_MISSING_OR_INVALID:"+category)
            continue
        entry=_artifact_entry(category,data)
        entries.append(entry)
        if item is None:
            continue
        try:
            signed_digest=item["payload"]["evidence_sha256"]
            if signed_digest!=entry["sha256"]:
                blockers.append("EVIDENCE_DIGEST_MISMATCH:"+category)
        except (KeyError,TypeError,AttributeError):
            blockers.append("ATTESTATION_MALFORMED:"+category)

    if isinstance(evidence_bytes,Mapping):
        try:
            if set(evidence_bytes)!=REQUIRED:
                blockers.append("EVIDENCE_CATEGORY_MISMATCH")
        except (TypeError,ValueError):
            blockers.append("EVIDENCE_CATEGORY_MISMATCH")

    if (not isinstance(commit_sha,str) or not _hex(commit_sha,40) or
        not isinstance(scope,str) or not 0<len(scope)<=128):
        review_state=ReviewState.EVIDENCE_INCOMPLETE
    else:
        review_state=assess_release_review(
            attestations,pinned_review_keys,expected_commit=commit_sha,
            expected_scope=scope,now=now
        ).state
    if review_state!=ReviewState.READY_FOR_HUMAN_REVIEW:
        blockers.append("SIGNED_RELEASE_REVIEW_INCOMPLETE")

    if blockers:
        return DossierAssessment(
            DossierState.INCOMPLETE_BLOCKED,tuple(sorted(set(blockers))),None,None
        )
    # Build a portable, deterministic checksum index. The accompanying bytes
    # must be retained externally; the index is not evidence availability.
    manifest={
        "version":1,"policy":POLICY,"scope":scope,
        "commit_sha":commit_sha,"go13":"HOLD",
        "artifacts":entries,
        "review_attestations":[att_by_cat[k] for k in sorted(REQUIRED)],
        "release_permitted":False,"merge_permitted":False,
        "activation_permitted":False,
    }
    try:
        digest=hashlib.sha256(_canonical(manifest)).hexdigest()
    except (ValueError,TypeError,AttributeError,OverflowError):
        return DossierAssessment(
            DossierState.INCOMPLETE_BLOCKED,("MANIFEST_CANONICALIZATION_FAILED",),None,None
        )
    return DossierAssessment(
        DossierState.READY_FOR_HUMAN_REVIEW,(),manifest,digest
    )


def validate_release_dossier(
    manifest:Any,manifest_sha256:Any,evidence_bytes:Any,
    pinned_review_keys:Mapping[str,bytes], *,
    expected_commit:str,now:datetime|None=None
)->DossierAssessment:
    """Recompute the entire signed, byte-verified dossier and exact hash."""
    denied=DossierAssessment(DossierState.INCOMPLETE_BLOCKED,
                             ("DOSSIER_INTEGRITY_FAILED",),None,None)
    try:
        if not isinstance(manifest,dict) or set(manifest)!={
            "version","policy","scope","commit_sha","go13",
            "artifacts","review_attestations","release_permitted",
            "merge_permitted","activation_permitted"
        }:
            return denied
        if (type(manifest["version"]) is not int or manifest["version"]!=1 or
            manifest["policy"]!=POLICY or manifest["go13"]!="HOLD" or
            manifest["commit_sha"]!=expected_commit or
            any(manifest[field] is not False for field in (
                "release_permitted","merge_permitted","activation_permitted"
            ))):
            return denied
        if not _hex(manifest_sha256) or hashlib.sha256(_canonical(manifest)).hexdigest()!=manifest_sha256:
            return denied
        reconstructed=build_release_dossier(
            commit_sha=expected_commit,scope=manifest["scope"],
            attestations=manifest["review_attestations"],evidence_bytes=evidence_bytes,
            pinned_review_keys=pinned_review_keys,now=now
        )
        if (reconstructed.state!=DossierState.READY_FOR_HUMAN_REVIEW or
            reconstructed.manifest_sha256!=manifest_sha256 or
            reconstructed.manifest!=manifest):
            return denied
        return reconstructed
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError):
        return denied


def execution_permitted(assessment:DossierAssessment)->bool:
    return False
