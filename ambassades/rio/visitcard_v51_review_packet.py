"""RIO VisitCard v5.1 independently verifiable security review packet.

Offline-only: source, CI and external review artifacts must be provided as
actual bytes and carry separately pinned Ed25519 attestations. Test fixtures
are synthetic; matching evidence remains informational. GO-13 HOLD.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
import hashlib
from pathlib import Path
from typing import Any, Mapping

from visitcard_v5_security_review import (
    MODULES, EXTERNAL_BLOCKERS, Readiness, review_sources
)
from visitcard_release_review import verify_review_attestation, _hex
from visitcard_witness_enrollment import _canonical

SCOPE="RIO-VISITCARD-V5.1-SECURITY-REVIEW"
DOMAINS=("CI_ZERO_SKIP","SECURITY_REVIEW")
MAX_EVIDENCE=4*1024*1024


class PacketState(str,Enum):
    SOURCE_BLOCKED="SOURCE_BLOCKED"
    ATTESTATIONS_BLOCKED="ATTESTATIONS_BLOCKED"
    REVIEWABLE_INFORMATIONAL="REVIEWABLE_INFORMATIONAL"


@dataclass(frozen=True)
class PacketResult:
    state:PacketState
    blockers:tuple[str,...]
    packet_sha256:str|None
    source_inventory_sha256:str|None
    policy:str="RIO-VISITCARD-V5.1-GO13-HOLD"
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def inspect_security_packet(
    root:Path, *,
    pinned_source_sha256:Mapping[str,str],
    expected_commit_sha:str,
    attestations:Any,
    evidence_bytes:Any,
    pinned_attestor_keys:Mapping[str,bytes],
    expected_inventory_sha256:str,
    now:datetime|None=None
)->PacketResult:
    """Bind exact bytes, signed audit/CI evidence and source inventory.

    Caller must obtain source pins and auditor keys independently, and must
    verify that the claimed commit is the one actually checked out. A matching
    packet never verifies external infrastructure or grants authorization.
    """
    def denied(state:PacketState,blockers:list[str],inventory:str|None=None)->PacketResult:
        return PacketResult(state,tuple(sorted(set(blockers+list(EXTERNAL_BLOCKERS)))),
                            None,inventory)
    if not _hex(expected_commit_sha,40):
        return denied(PacketState.SOURCE_BLOCKED,["INVALID_COMMIT"])
    # v5 source inventory does not self-provision baseline hashes.
    report=review_sources(root,expected_source_sha256=pinned_source_sha256,test_count=1)
    if report.state!=Readiness.EXTERNAL_EVIDENCE_REQUIRED:
        extras=[b for b in report.blockers if b not in EXTERNAL_BLOCKERS]
        return denied(PacketState.SOURCE_BLOCKED,extras,report.inventory_sha256)
    if not _hex(expected_inventory_sha256) or report.inventory_sha256!=expected_inventory_sha256:
        return denied(PacketState.SOURCE_BLOCKED,["SOURCE_INVENTORY_PIN_MISMATCH"],
                      report.inventory_sha256)

    problems=[]
    if not isinstance(attestations,(tuple,list)) or len(attestations)!=len(DOMAINS):
        problems.append("ATTESTATION_COUNT_INVALID")
        attestations=[]
    if not isinstance(evidence_bytes,Mapping) or set(evidence_bytes)!=set(DOMAINS):
        problems.append("EVIDENCE_DOMAIN_MISMATCH")
        evidence_bytes={}
    if not isinstance(pinned_attestor_keys,Mapping):
        problems.append("ATTESTOR_KEYS_UNAVAILABLE")
        pinned_attestor_keys={}
    grouped={}
    for att in attestations:
        try:
            domain=att["payload"]["category"]
            if domain not in DOMAINS or domain in grouped:
                problems.append("ATTESTATION_DOMAIN_DUPLICATED_OR_UNKNOWN")
            else:
                grouped[domain]=att
        except (KeyError,TypeError,AttributeError):
            problems.append("MALFORMED_ATTESTATION")
    pinned_ids=set()
    pinned_values=set()
    digests=set()
    entries=[]
    for domain in DOMAINS:
        evidence=evidence_bytes.get(domain)
        att=grouped.get(domain)
        if type(evidence) is not bytes or not 0<len(evidence)<=MAX_EVIDENCE:
            problems.append("EVIDENCE_MISSING_OR_INVALID:"+domain)
            continue
        actual=hashlib.sha256(evidence).hexdigest()
        entries.append({"domain":domain,"sha256":actual,"size_bytes":len(evidence)})
        if att is None:
            problems.append("ATTESTATION_MISSING:"+domain)
            continue
        verified=verify_review_attestation(
            att,pinned_attestor_keys,expected_commit=expected_commit_sha,
            expected_scope=SCOPE,now=now
        )
        if verified is None or verified[0]!=domain or verified[2]!=actual:
            problems.append("SIGNATURE_OR_EVIDENCE_BINDING_INVALID:"+domain)
            continue
        _,aid,signature_digest,pub=verified
        if aid in pinned_ids or pub in pinned_values or signature_digest in digests:
            problems.append("INDEPENDENT_ATTESTOR_CONFLICT")
        pinned_ids.add(aid)
        pinned_values.add(pub)
        digests.add(signature_digest)
    if problems:
        return denied(PacketState.ATTESTATIONS_BLOCKED,problems,report.inventory_sha256)
    packet={
        "version":1,"policy":"RIO-VISITCARD-V5.1-GO13-HOLD",
        "commit_sha":expected_commit_sha,"inventory_sha256":report.inventory_sha256,
        "evidence":entries,"attestations":[grouped[d] for d in DOMAINS],
        "release_permitted":False,"go13":"HOLD"
    }
    try:
        digest=hashlib.sha256(_canonical(packet)).hexdigest()
    except (ValueError,TypeError,OverflowError):
        return denied(PacketState.ATTESTATIONS_BLOCKED,["PACKET_CANONICALIZATION_INVALID"],
                      report.inventory_sha256)
    return PacketResult(PacketState.REVIEWABLE_INFORMATIONAL,
                        EXTERNAL_BLOCKERS,digest,report.inventory_sha256)


def release_permitted(result:PacketResult)->bool:
    return False
