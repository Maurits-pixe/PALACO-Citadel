"""RIO v3.3 independently pinned governance attestations — DRAFT/GO-13 HOLD.

Verifies *claims* that two fresh-head signer keys belong to distinct
administrative/custody/failure domains, backed by TWO independently pinned
administrator Ed25519 signatures. This does not inspect real infrastructure,
operator identity or key custody: claims require external human audit.
NO trust-key enrollment, authority assignment, automatic deployment, or access.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-GOVERNANCE-ATTESTATION-V1\x00"
MAX_WINDOW=timedelta(days=1)


@dataclass(frozen=True)
class GovernanceClaim:
    signer_id: str
    signer_key_sha256: str
    operator_id: str
    custody_domain: str
    failure_domain: str
    authority_id: str


def _sig(value: Any) -> bytes:
    if not isinstance(value,str) or len(value)!=86:
        raise ValueError("signature format")
    raw=base64.urlsafe_b64decode(value+"==")
    if len(raw)!=64 or base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")!=value:
        raise ValueError("noncanonical signature")
    return raw


def _timestamp(value: Any) -> datetime:
    if not isinstance(value,str):
        raise ValueError("timestamp type")
    result=datetime.fromisoformat(value.replace("Z","+00:00"))
    if result.tzinfo is None or result.utcoffset() is None:
        raise ValueError("timestamp zone")
    return result.astimezone(timezone.utc)


def verify_governance_claim(
    evidence: Any,
    pinned_authorities: Mapping[str, bytes],
    *,
    expected_issuer: str,
    signer_id: str,
    signer_public_key: bytes,
    now: datetime | None = None,
) -> GovernanceClaim | None:
    """Verify a one-day administrative claim without trusting it as ground truth."""
    try:
        if not isinstance(evidence,dict) or set(evidence)!={"payload","authority_id","signature"}:
            return None
        payload=evidence["payload"]
        fields={"version","issuer","signer_id","signer_key_sha256",
                "operator_id","custody_domain","failure_domain",
                "issued_at","expires_at"}
        if not isinstance(payload,dict) or set(payload)!=fields:
            return None
        if type(payload["version"]) is not int or payload["version"]!=1:
            return None
        if not isinstance(expected_issuer,str) or not 0<len(expected_issuer)<=128:
            return None
        if payload["issuer"]!=expected_issuer or payload["signer_id"]!=signer_id:
            return None
        if not isinstance(signer_public_key,bytes) or len(signer_public_key)!=32:
            return None
        digest=hashlib.sha256(signer_public_key).hexdigest()
        if payload["signer_key_sha256"]!=digest:
            return None
        if not isinstance(signer_id,str) or not 0<len(signer_id)<=128:
            return None
        for field in ("operator_id","custody_domain","failure_domain"):
            value=payload[field]
            if not isinstance(value,str) or not 0<len(value)<=128:
                return None
        aid=evidence["authority_id"]
        if not isinstance(aid,str) or not 0<len(aid)<=128:
            return None
        key=pinned_authorities.get(aid)
        if not isinstance(key,bytes) or len(key)!=32:
            return None
        instant=datetime.now(timezone.utc) if now is None else now
        if not isinstance(instant,datetime) or instant.tzinfo is None or instant.utcoffset() is None:
            return None
        issued=_timestamp(payload["issued_at"])
        expires=_timestamp(payload["expires_at"])
        instant=instant.astimezone(timezone.utc)
        if not (issued<=instant<expires and timedelta(0)<expires-issued<=MAX_WINDOW):
            return None
        Ed25519PublicKey.from_public_bytes(key).verify(
            _sig(evidence["signature"]),
            DOMAIN+aid.encode("utf-8")+b"\x00"+_canonical(payload)
        )
        return GovernanceClaim(signer_id,digest,payload["operator_id"],
                               payload["custody_domain"],payload["failure_domain"],aid)
    except (ValueError,TypeError,KeyError,AttributeError,OverflowError,InvalidSignature):
        return None


def verify_governance_separation(
    primary_evidence: Any, secondary_evidence: Any,
    primary_authorities: Mapping[str,bytes],
    secondary_authorities: Mapping[str,bytes],
    *,
    expected_issuer: str,
    primary_signer_id: str,
    secondary_signer_id: str,
    primary_public_key: bytes,
    secondary_public_key: bytes,
    now: datetime | None = None,
) -> bool:
    """Require claims with distinct authority keys, operators, custody and domains."""
    first=verify_governance_claim(
        primary_evidence,primary_authorities,expected_issuer=expected_issuer,
        signer_id=primary_signer_id,signer_public_key=primary_public_key,now=now
    )
    second=verify_governance_claim(
        secondary_evidence,secondary_authorities,expected_issuer=expected_issuer,
        signer_id=secondary_signer_id,signer_public_key=secondary_public_key,now=now
    )
    if first is None or second is None:
        return False
    a=primary_authorities.get(first.authority_id)
    b=secondary_authorities.get(second.authority_id)
    return bool(
        first.signer_id!=second.signer_id
        and first.signer_key_sha256!=second.signer_key_sha256
        and first.authority_id!=second.authority_id
        and isinstance(a,bytes) and isinstance(b,bytes) and a!=b
        and first.operator_id!=second.operator_id
        and first.custody_domain!=second.custody_domain
        and first.failure_domain!=second.failure_domain
    )
