"""RIO v3.9 out-of-band trust provenance gate — DRAFT / GO-13 HOLD.

A separately pinned administrative root signs a bounded trust-manifest
fingerprint. A separately retained exact manifest SHA-256 pin protects
against accepting an obsolete but valid signature. Trust must be obtained
from an authenticated upstream administrator, never from a VisitCard proof.
No transport, HSM, immutable pin store or authorization is implemented.
"""
from __future__ import annotations

import base64
from dataclasses import fields
from datetime import datetime,timezone,timedelta
import hashlib
from types import MappingProxyType
from typing import Any,Mapping
import sqlite3

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from visitcard_verification_entrypoint import (
    VerifiedContext,ProofPackage,VerificationResult,IntegratedState,verify_visitcard
)
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-TRUST-PROVENANCE-V1\x00"
KEYRINGS=tuple(f.name for f in fields(VerifiedContext) if f.name not in ("issuer","nonce"))
MAX_LIFETIME=timedelta(days=1)


def _b64_signature(value:Any)->bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("noncanonical signature")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=value:
        raise ValueError("noncanonical signature")
    return raw


def _timestamp(value:Any)->datetime:
    if not isinstance(value,str):
        raise ValueError("timestamp")
    parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("timezone")
    return parsed.astimezone(timezone.utc)


def trust_fingerprint(trust:VerifiedContext)->str|None:
    """Canonical SHA-256 of pinned context, including every role and key ID."""
    if not isinstance(trust,VerifiedContext):
        return None
    if not isinstance(trust.issuer,str) or not trust.issuer or not isinstance(trust.nonce,str) or not trust.nonce:
        return None
    serialized={"issuer":trust.issuer,"nonce":trust.nonce}
    try:
        for role in KEYRINGS:
            keys=getattr(trust,role)
            if not isinstance(keys,Mapping) or not keys or len(keys)>128:
                return None
            if any(not isinstance(k,str) or not 0<len(k)<=128 or
                   not isinstance(v,bytes) or len(v)!=32 for k,v in keys.items()):
                return None
            serialized[role]={k:base64.urlsafe_b64encode(v).rstrip(b"=").decode("ascii")
                              for k,v in keys.items()}
        return hashlib.sha256(_canonical(serialized)).hexdigest()
    except (TypeError,ValueError,AttributeError):
        return None


def freeze_trust(trust:VerifiedContext)->VerifiedContext|None:
    """Snapshot caller-owned mappings to avoid post-check trust-root mutation."""
    if trust_fingerprint(trust) is None:
        return None
    frozen={field:MappingProxyType(dict(getattr(trust,field))) for field in KEYRINGS}
    return VerifiedContext(issuer=trust.issuer,nonce=trust.nonce,**frozen)


def verify_trust_manifest(
    manifest:Any,trust:VerifiedContext,root_keys:Mapping[str,bytes],
    *, externally_pinned_manifest_sha256:str,now:datetime|None=None
)->bool:
    """Verify exact separate pin, signature, expiry and all key roles."""
    try:
        if not isinstance(manifest,dict) or set(manifest)!={"payload","root_id","signature"}:
            return False
        p=manifest["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","issuer","nonce","epoch","trust_sha256","issued_at","expires_at"
        }:
            return False
        if type(p["version"]) is not int or p["version"]!=1:
            return False
        if type(p["epoch"]) is not int or p["epoch"]<1:
            return False
        if p["issuer"]!=trust.issuer or p["nonce"]!=trust.nonce:
            return False
        fp=trust_fingerprint(trust)
        if fp is None or p["trust_sha256"]!=fp:
            return False
        if not isinstance(externally_pinned_manifest_sha256,str) or len(externally_pinned_manifest_sha256)!=64:
            return False
        if not all(c in "0123456789abcdef" for c in externally_pinned_manifest_sha256):
            return False
        if hashlib.sha256(_canonical(manifest)).hexdigest()!=externally_pinned_manifest_sha256:
            return False
        issued=_timestamp(p["issued_at"])
        expires=_timestamp(p["expires_at"])
        current=datetime.now(timezone.utc) if now is None else now
        if not isinstance(current,datetime) or current.tzinfo is None or current.utcoffset() is None:
            return False
        if not (issued<=current.astimezone(timezone.utc)<expires and
                timedelta(0)<expires-issued<=MAX_LIFETIME):
            return False
        root_id=manifest["root_id"]
        if not isinstance(root_id,str) or not 0<len(root_id)<=128:
            return False
        root=root_keys.get(root_id)
        if not isinstance(root,bytes) or len(root)!=32:
            return False
        Ed25519PublicKey.from_public_bytes(root).verify(
            _b64_signature(manifest["signature"]),
            DOMAIN+root_id.encode("utf-8")+b"\x00"+_canonical(p)
        )
        return True
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return False


def verify_with_trust_provenance(
    archive_db:sqlite3.Connection,governance_db:sqlite3.Connection,
    custodian_db:sqlite3.Connection,*,proof:ProofPackage,trust:VerifiedContext,
    manifest:Any,independently_pinned_roots:Mapping[str,bytes],
    externally_pinned_manifest_sha256:str,now:datetime|None=None
)->VerificationResult:
    """Fail closed before v3.7 full-chain verification on invalid trust origin."""
    denied=VerificationResult(IntegratedState.UNKNOWN_BLOCKED,
                              policy="RIO-VISITCARD-V3.9-GO13-HOLD")
    if not isinstance(proof,ProofPackage) or not isinstance(trust,VerifiedContext):
        return denied
    try:
        snapshot=freeze_trust(trust)
        if snapshot is None or not verify_trust_manifest(
            manifest,snapshot,independently_pinned_roots,
            externally_pinned_manifest_sha256=externally_pinned_manifest_sha256,now=now
        ):
            return denied
        result=verify_visitcard(
            archive_db,governance_db,custodian_db,proof=proof,trust=snapshot,now=now
        )
        return VerificationResult(result.state,policy=denied.policy)
    except (ValueError,TypeError,KeyError,AttributeError,sqlite3.Error):
        return denied


def execution_permitted(result:VerificationResult)->bool:
    return False
