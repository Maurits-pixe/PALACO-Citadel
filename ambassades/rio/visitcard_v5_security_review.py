"""RIO VisitCard v5.0 consolidated security review — DRAFT / GO-13 HOLD.

This is a deterministic local source + operational-evidence readiness REVIEW.
It does not independently attest real deployments or authorize an action.
Unverified external controls remain hard blockers regardless of test count.
"""
from __future__ import annotations

import ast
from dataclasses import dataclass
from enum import Enum
import hashlib
from pathlib import Path
from typing import Any,Mapping

from visitcard_witness_enrollment import _canonical
from visitcard_release_review import _hex

MODULES=(
    "visitcard_verification_entrypoint.py",
    "visitcard_consumer_adapter.py",
    "visitcard_trust_provenance.py",
    "visitcard_release_review.py",
    "visitcard_release_dossier.py",
    "visitcard_dossier_handoff.py",
    "visitcard_release_transfer_audit.py",
    "visitcard_audit_checkpoint.py",
    "visitcard_replay_recovery.py",
    "visitcard_shared_replay_cas.py",
    "visitcard_shared_audit_bridge.py",
    "visitcard_pending_recovery.py",
    "visitcard_consumer_policy.py",
)
EXTERNAL_BLOCKERS=(
    "EXTERNAL_ROOT_KEY_CUSTODY_UNVERIFIED",
    "INDEPENDENT_LATEST_PIN_STORAGE_UNVERIFIED",
    "SHARED_GLOBAL_REPLAY_CAS_UNVERIFIED",
    "EXTERNAL_SIGNED_RECEIPT_SERVICE_UNVERIFIED",
    "PRODUCTION_RUNTIME_GATE_UNVERIFIED",
    "INDEPENDENT_SECURITY_ASSESSMENT_UNVERIFIED",
    "TRUSTED_TIME_AND_RECOVERY_UNVERIFIED",
)
BANNED_MODULES=frozenset({"subprocess","socket","requests","urllib","http","ftplib"})
REQUIRED_ENTRYPOINTS={
    "visitcard_consumer_adapter.py":("inspect_visitcard",),
    "visitcard_release_transfer_audit.py":("audit_release_transfer",),
    "visitcard_audit_checkpoint.py":("verify_checkpointed_audit",),
    "visitcard_replay_recovery.py":("verify_recovered_audit",),
    "visitcard_shared_replay_cas.py":("reserve_challenge","acknowledge_head"),
    "visitcard_shared_audit_bridge.py":("verify_and_reserve_shared","confirm_shared_handoff"),
    "visitcard_pending_recovery.py":("inspect_pending_session","resume_signed_acknowledgement"),
}
EXPLICIT_HOLD_FIELDS=("release_permitted","merge_permitted","activation_permitted")


class Readiness(str,Enum):
    SOURCE_BLOCKED="SOURCE_BLOCKED"
    EXTERNAL_EVIDENCE_REQUIRED="EXTERNAL_EVIDENCE_REQUIRED"


@dataclass(frozen=True)
class ReviewReport:
    state:Readiness
    blockers:tuple[str,...]
    inventory_sha256:str|None
    source_sha256:tuple[tuple[str,str],...]
    test_count:int|None
    policy:str="RIO-VISITCARD-V5.0-GO13-HOLD"
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def review_sources(root:Path,*,expected_source_sha256:Mapping[str,str],
                   test_count:Any=None)->ReviewReport:
    """Bounded offline source inventory; missing or changed files fail closed.

    Expected SHA-256s must be pinned independently of the examined files.
    This check does not inspect runtime behavior of Python dynamic dispatch,
    nor does it claim that tests ran: count is self-reported metadata only.
    """
    blockers=[]
    observed=[]
    if not isinstance(expected_source_sha256,Mapping):
        expected_source_sha256={}
        blockers.append("EXPECTED_HASH_INVENTORY_MISSING")
    if set(expected_source_sha256)!=set(MODULES):
        blockers.append("EXPECTED_HASH_INVENTORY_INCOMPLETE")
    for name in MODULES:
        path=root/name
        try:
            if not path.is_file() or path.is_symlink():
                blockers.append("SOURCE_MISSING_OR_LINK:"+name)
                continue
            data=path.read_bytes()
            if not data or len(data)>1024*1024:
                blockers.append("SOURCE_LENGTH_INVALID:"+name)
                continue
            digest=hashlib.sha256(data).hexdigest()
            observed.append((name,digest))
            expected=expected_source_sha256.get(name)
            if not _hex(expected) or expected!=digest:
                blockers.append("SOURCE_HASH_MISMATCH:"+name)
            parsed=ast.parse(data.decode("utf-8"),filename=name)
            for node in ast.walk(parsed):
                if isinstance(node,ast.Import):
                    if any(alias.name.split(".")[0] in BANNED_MODULES for alias in node.names):
                        blockers.append("NETWORK_OR_SUBPROCESS_IMPORT:"+name)
                elif isinstance(node,ast.ImportFrom):
                    if node.module and node.module.split(".")[0] in BANNED_MODULES:
                        blockers.append("NETWORK_OR_SUBPROCESS_IMPORT:"+name)
            needed=REQUIRED_ENTRYPOINTS.get(name,())
            funcs={n.name for n in parsed.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
            if set(needed).difference(funcs):
                blockers.append("EXPECTED_ENTRYPOINT_MISSING:"+name)
            # This check is intentionally narrow: dataclass fields cannot
            # grant authority by default. The runtime still needs review.
            for node in parsed.body:
                if isinstance(node,ast.ClassDef):
                    for stmt in node.body:
                        if isinstance(stmt,ast.AnnAssign) and isinstance(stmt.target,ast.Name):
                            if stmt.target.id in EXPLICIT_HOLD_FIELDS and not (
                                isinstance(stmt.value,ast.Constant) and stmt.value.value is False
                            ):
                                blockers.append("AUTHORITY_DEFAULT_NOT_FALSE:"+name)
        except (OSError,UnicodeError,SyntaxError,TypeError,ValueError):
            blockers.append("SOURCE_UNREADABLE_OR_INVALID:"+name)
    if type(test_count) is not int or test_count<1:
        blockers.append("TEST_METADATA_NOT_VERIFIED")
        test_count=None
    items=tuple(sorted(observed))
    digest=None
    try:
        digest=hashlib.sha256(_canonical({
            "version":1,"module_sha256":dict(items),"policy":"GO-13-HOLD"
        })).hexdigest()
    except (TypeError,ValueError,OverflowError):
        blockers.append("INVENTORY_CANONICALIZATION_FAILED")
    if blockers:
        return ReviewReport(Readiness.SOURCE_BLOCKED,
                            tuple(sorted(set(blockers+list(EXTERNAL_BLOCKERS)))),
                            digest,items,test_count)
    return ReviewReport(Readiness.EXTERNAL_EVIDENCE_REQUIRED,
                        EXTERNAL_BLOCKERS,digest,items,test_count)


def release_permitted(report:ReviewReport)->bool:
    return False
