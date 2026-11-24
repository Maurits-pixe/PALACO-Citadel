"""RIO v5.2 signed provenance binding for CI and independent security evidence.

Offline verification only. A pinned Ed25519 witness can attest to the
provenance CLAIM; this module does not verify GitHub OIDC, GitHub API
metadata, a live Actions runner, or a real auditor's independence.
Those checks require a separate authenticated upstream provisioner.
No merge/release permission — GO-13 HOLD.
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
from visitcard_v51_review_packet import (
    DOMAINS,PacketState,inspect_security_packet
)
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-V52-PROVENANCE-V1\x00"
SCOPE="RIO-VISITCARD-V5.2-PROVENANCE"
MAX_AGE=timedelta(hours=24)
KEYS=frozenset({
    "version","scope","category","repository","execution_ref",
    "execution_id","execution_attempt","executor_identity",
    "commit_sha","inventory_sha256","artifact_sha256","artifact_uri",
    "issued_at","expires_at","go13",
})


class ProvenanceState(str,Enum):
    PACKET_BLOCKED="PACKET_BLOCKED"
    PROVENANCE_BLOCKED="PROVENANCE_BLOCKED"
    REVIEWABLE_INFORMATIONAL="REVIEWABLE_INFORMATIONAL"


@dataclass(frozen=True)
class ProvenanceResult:
    state:ProvenanceState
    blockers:tuple[str,...]
    provenance_sha256:str|None
    packet_sha256:str|None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _timestamp(value:Any)->datetime:
    if not isinstance(value,str):
        raise ValueError("timestamp")
    parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("naive timestamp")
    return parsed.astimezone(timezone.utc)


def _signature(value:Any)->bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature format")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=value:
        raise ValueError("noncanonical signature")
    return raw


def verify_provenance_claim(
    claim:Any, pinned_signers:Mapping[str,bytes], *,
    expected_category:str,expected_repository:str,
    expected_execution_ref:str,expected_executor_identity:str,
    expected_commit_sha:str,expected_inventory_sha256:str,
    expected_artifact_sha256:str,now:datetime|None=None,
)->tuple[str,bytes]|None:
    """Return distinct pinned signer identifier + key for a valid claim."""
    try:
        if not isinstance(claim,dict) or set(claim)!={"payload","signer_id","signature"}:
            return None
        payload=claim["payload"]
        if not isinstance(payload,dict) or set(payload)!=KEYS:
            return None
        if type(payload["version"]) is not int or payload["version"]!=1:
            return None
        if payload["scope"]!=SCOPE or payload["go13"]!="HOLD":
            return None
        if expected_category not in DOMAINS or payload["category"]!=expected_category:
            return None
        if not isinstance(expected_repository,str) or not 1<=len(expected_repository)<=128:
            return None
        if not isinstance(expected_execution_ref,str) or not 1<=len(expected_execution_ref)<=256:
            return None
        if not isinstance(expected_executor_identity,str) or not 1<=len(expected_executor_identity)<=256:
            return None
        if (payload["repository"]!=expected_repository or
            payload["execution_ref"]!=expected_execution_ref or
            payload["executor_identity"]!=expected_executor_identity):
            return None
        if (not _hex(expected_commit_sha,40) or
            not _hex(expected_inventory_sha256) or not _hex(expected_artifact_sha256)):
            return None
        if (payload["commit_sha"]!=expected_commit_sha or
            payload["inventory_sha256"]!=expected_inventory_sha256 or
            payload["artifact_sha256"]!=expected_artifact_sha256 or
            payload["artifact_uri"]!="sha256:"+expected_artifact_sha256):
            return None
        if (type(payload["execution_attempt"]) is not int or
            not 1<=payload["execution_attempt"]<=100000):
            return None
        execution=payload["execution_id"]
        if not isinstance(execution,str) or not 1<=len(execution)<=128:
            return None
        if any(c not in "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_:." for c in execution):
            return None
        # CI run ID is a claimed immutable GitHub Actions number.
        # This is NOT a GitHub-authenticated check; independent
        # run provenance must be established upstream.
        if expected_category=="CI_ZERO_SKIP" and (
            not execution.isdecimal() or execution.startswith("0")
        ):
            return None
        begin=_timestamp(payload["issued_at"])
        end=_timestamp(payload["expires_at"])
        current=datetime.now(timezone.utc) if now is None else now
        if not isinstance(current,datetime) or current.utcoffset() is None:
            return None
        if not (begin<=current.astimezone(timezone.utc)<end and
                timedelta(0)<end-begin<=MAX_AGE):
            return None
        signer=claim["signer_id"]
        if not isinstance(signer,str) or not 1<=len(signer)<=128:
            return None
        public=pinned_signers.get(signer)
        if not isinstance(public,bytes) or len(public)!=32:
            return None
        Ed25519PublicKey.from_public_bytes(public).verify(
            _signature(claim["signature"]),
            DOMAIN+signer.encode("utf-8")+b"\x00"+_canonical(payload)
        )
        return signer,public
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def inspect_provenance_packet(root:Path, *,
    pinned_source_sha256:Mapping[str,str],expected_commit_sha:str,
    attestations:Any,evidence_bytes:Any,pinned_attestor_keys:Mapping[str,bytes],
    expected_inventory_sha256:str,
    provenance_claims:Any,pinned_provenance_signers:Mapping[str,bytes],
    expected_repository:str,expected_execution_context:Mapping[str,tuple[str,str]],
    now:datetime|None=None,
)->ProvenanceResult:
    """Chain existing v5.1 verified exact evidence bytes to v5.2 claims."""
    def blocked(state:ProvenanceState,reasons:Any,packet:str|None=None)->ProvenanceResult:
        return ProvenanceResult(
            state,tuple(sorted(set(tuple(reasons)+EXTERNAL_BLOCKERS))),None,packet
        )
    packet=inspect_security_packet(
        root,pinned_source_sha256=pinned_source_sha256,
        expected_commit_sha=expected_commit_sha,attestations=attestations,
        evidence_bytes=evidence_bytes,pinned_attestor_keys=pinned_attestor_keys,
        expected_inventory_sha256=expected_inventory_sha256,now=now
    )
    if packet.state!=PacketState.REVIEWABLE_INFORMATIONAL:
        return blocked(ProvenanceState.PACKET_BLOCKED,
                       tuple(b for b in packet.blockers if b not in EXTERNAL_BLOCKERS))
    if not isinstance(provenance_claims,(tuple,list)) or len(provenance_claims)!=len(DOMAINS):
        return blocked(ProvenanceState.PROVENANCE_BLOCKED,("PROVENANCE_COUNT_INVALID",),
                       packet.packet_sha256)
    if not isinstance(expected_execution_context,Mapping) or set(expected_execution_context)!=set(DOMAINS):
        return blocked(ProvenanceState.PROVENANCE_BLOCKED,("EXECUTION_CONTEXT_UNPINNED",),
                       packet.packet_sha256)
    if not isinstance(pinned_provenance_signers,Mapping):
        return blocked(ProvenanceState.PROVENANCE_BLOCKED,("PROVENANCE_SIGNERS_UNPINNED",),
                       packet.packet_sha256)
    grouped={}
    for claim in provenance_claims:
        try:
            cat=claim["payload"]["category"]
            if cat not in DOMAINS or cat in grouped:
                return blocked(ProvenanceState.PROVENANCE_BLOCKED,
                               ("DUPLICATE_OR_UNKNOWN_DOMAIN",),packet.packet_sha256)
            grouped[cat]=claim
        except (TypeError,KeyError,AttributeError):
            return blocked(ProvenanceState.PROVENANCE_BLOCKED,
                           ("MALFORMED_PROVENANCE_CLAIM",),packet.packet_sha256)
    identities=set()
    keys=set()
    claims=[]
    for category in DOMAINS:
        try:
            reference,identity=expected_execution_context[category]
            evidence=evidence_bytes[category]
            digest=hashlib.sha256(evidence).hexdigest()
            claim=grouped.get(category)
            verified=verify_provenance_claim(
                claim,pinned_provenance_signers,expected_category=category,
                expected_repository=expected_repository,
                expected_execution_ref=reference,
                expected_executor_identity=identity,
                expected_commit_sha=expected_commit_sha,
                expected_inventory_sha256=expected_inventory_sha256,
                expected_artifact_sha256=digest,now=now
            )
            if verified is None or verified[0] in identities or verified[1] in keys:
                return blocked(ProvenanceState.PROVENANCE_BLOCKED,
                               ("PROVENANCE_INVALID_OR_SIGNER_CONFLICT:"+category,),
                               packet.packet_sha256)
            identities.add(verified[0]);keys.add(verified[1]);claims.append(claim)
        except (KeyError,TypeError,ValueError,AttributeError):
            return blocked(ProvenanceState.PROVENANCE_BLOCKED,
                           ("INVALID_PROVENANCE_CONTEXT:"+category,),packet.packet_sha256)
    try:
        provenance_digest=hashlib.sha256(_canonical({
            "version":1,"policy":"RIO-VISITCARD-V5.2-GO13-HOLD",
            "packet_sha256":packet.packet_sha256,
            "claims":claims,"go13":"HOLD"
        })).hexdigest()
    except (TypeError,ValueError,OverflowError):
        return blocked(ProvenanceState.PROVENANCE_BLOCKED,
                       ("PROVENANCE_CANONICALIZATION_FAILED",),packet.packet_sha256)
    return ProvenanceResult(ProvenanceState.REVIEWABLE_INFORMATIONAL,
                            EXTERNAL_BLOCKERS,provenance_digest,packet.packet_sha256)


def release_permitted(result:ProvenanceResult)->bool:
    return False
