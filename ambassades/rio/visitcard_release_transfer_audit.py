"""RIO v4.4 atomic audit decision across byte-verified dossier and signed handoff.

Read-only offline verification: the verified v4.2 dossier SHA is the ONLY
input accepted as the expected v4.3 handoff digest. No authorization,
independent custody, network transfer, or actual release is performed.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Mapping

from visitcard_release_dossier import (
    DossierState, validate_release_dossier,
)
from visitcard_dossier_handoff import verify_dossier_handoff


class AuditState(str,Enum):
    DOSSIER_BLOCKED="DOSSIER_BLOCKED"
    TRANSFER_BLOCKED="TRANSFER_BLOCKED"
    MATCHED_INFORMATIONAL="MATCHED_INFORMATIONAL"


@dataclass(frozen=True)
class AuditResult:
    state:AuditState
    blockers:tuple[str,...]
    dossier_sha256:str|None
    latest_receipt_sha256:str|None
    policy:str="RIO-VISITCARD-V4.4-GO13-HOLD"
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def audit_release_transfer(
    *,
    dossier_manifest:Any,
    dossier_manifest_sha256:Any,
    evidence_bytes:Any,
    pinned_review_keys:Mapping[str,bytes],
    receipts:Any,
    pinned_custodians:Mapping[str,bytes],
    independently_pinned_latest_receipt_sha256:str,
    expected_commit_sha:str,
    now:datetime|None=None,
)->AuditResult:
    """Reject any discrepancy before returning non-authorizing MATCHED."""
    dossier=validate_release_dossier(
        dossier_manifest,dossier_manifest_sha256,evidence_bytes,
        pinned_review_keys,expected_commit=expected_commit_sha,now=now,
    )
    if dossier.state!=DossierState.READY_FOR_HUMAN_REVIEW or dossier.manifest_sha256 is None:
        reasons=dossier.blockers or ("DOSSIER_INTEGRITY_FAILED",)
        return AuditResult(AuditState.DOSSIER_BLOCKED,reasons,None,None)
    handoff=verify_dossier_handoff(
        receipts,pinned_custodians,
        expected_dossier_sha256=dossier.manifest_sha256,
        expected_commit_sha=expected_commit_sha,
        independently_pinned_latest_receipt_sha256=independently_pinned_latest_receipt_sha256,
        now=now,
    )
    if handoff.state!="CHAIN_MATCHED_INFORMATIONAL":
        return AuditResult(
            AuditState.TRANSFER_BLOCKED,
            handoff.blockers or ("TRANSFER_INTEGRITY_FAILED",),
            dossier.manifest_sha256,None,
        )
    return AuditResult(
        AuditState.MATCHED_INFORMATIONAL,(),
        dossier.manifest_sha256,handoff.last_receipt_sha256,
    )


def execution_permitted(result:AuditResult)->bool:
    return False
